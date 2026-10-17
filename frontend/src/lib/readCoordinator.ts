export type ReadDiagnostic={
  rpcMethod:'gen_call';
  contractMethod:string;
  kind:'rate-limit'|'provider-unavailable'|'timeout'|'unsupported-method'|'contract-error'|'unknown';
  code?:number|string;
  httpStatus?:number;
  retryAfterSeconds?:number;
  attempts:number;
  message:string;
  lastSuccessfulReadAt?:number;
  confirmedDataDisplayed?:boolean;
};

export class ReadRequestError extends Error{
  diagnostic:ReadDiagnostic;
  constructor(diagnostic:ReadDiagnostic){
    super(diagnostic.message);
    this.name='ReadRequestError';
    this.diagnostic=diagnostic;
  }
}

export class ReadRequestCancelled extends Error{
  constructor(){super('Superseded read was not started');this.name='ReadRequestCancelled'}
}

export const isReadRequestCancelled=(error:unknown):error is ReadRequestCancelled=>error instanceof ReadRequestCancelled;

type CoordinatorOptions={
  concurrency?:number;
  maxRetries?:number;
  baseDelayMs?:number;
  maxDelayMs?:number;
  sleep?:(milliseconds:number)=>Promise<void>;
  now?:()=>number;
  onDiagnostic?:(diagnostic:ReadDiagnostic)=>void;
  onRetry?:(diagnostic:ReadDiagnostic)=>void;
};
type RequestOptions={priority?:number;isCurrent?:()=>boolean};
type Task<T>={key:string;contractMethod:string;operation:(attempt:number)=>Promise<T>;resolve:(value:T)=>void;reject:(error:unknown)=>void;priority:number;order:number;isCurrent?:()=>boolean};

const wait=(milliseconds:number)=>new Promise<void>(resolve=>setTimeout(resolve,milliseconds));
const textParts=(value:unknown):string[]=>{
  const parts:string[]=[];const queue:unknown[]=[value];const seen=new Set<object>();
  while(queue.length&&parts.length<24){
    const current=queue.shift();
    if(typeof current==='string'){parts.push(current);continue}
    if(!current||typeof current!=='object'||seen.has(current))continue;
    seen.add(current);
    const candidate=current as Record<string,unknown>;
    for(const key of ['message','details','shortMessage','reason'])if(typeof candidate[key]==='string')parts.push(candidate[key] as string);
    for(const key of ['cause','error','response','body'])if(candidate[key])queue.push(candidate[key]);
    if(candidate.data&&typeof candidate.data==='object')queue.push(candidate.data);
  }
  return parts;
};
const numeric=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&/^-?\d+(?:\.\d+)?$/.test(value)?Number(value):undefined;
const findNumber=(value:unknown,keys:string[]):number|undefined=>{
  const queue:unknown[]=[value];const seen=new Set<object>();
  while(queue.length){
    const current=queue.shift();
    if(!current||typeof current!=='object'||seen.has(current))continue;
    seen.add(current);const candidate=current as Record<string,unknown>;
    for(const key of keys){const found=numeric(candidate[key]);if(found!==undefined)return found}
    for(const key of ['cause','error','data','response','body','headers'])if(candidate[key])queue.push(candidate[key]);
  }
  return undefined;
};
const findCode=(value:unknown):number|string|undefined=>{
  const queue:unknown[]=[value];const seen=new Set<object>();
  while(queue.length){const current=queue.shift();if(!current||typeof current!=='object'||seen.has(current))continue;seen.add(current);const candidate=current as Record<string,unknown>;for(const key of ['code','errorCode']){const found=candidate[key];if(typeof found==='number'&&Number.isFinite(found))return found;if(typeof found==='string'&&found){const converted=numeric(found);return converted??found}}for(const key of ['cause','error','data','response','body'])if(candidate[key])queue.push(candidate[key])}
  return undefined;
};
const sanitize=(value:string)=>value.replace(/0x[0-9a-f]{40,}/gi,'0x…').replace(/\s+/g,' ').slice(0,180);
export function diagnoseReadError(contractMethod:string,error:unknown,attempts:number,retryAfterSeconds?:number):ReadDiagnostic{
  const parts=textParts(error);const text=parts.join(' | ');
  const code=findCode(error);
  const httpStatus=findNumber(error,['status','statusCode','httpStatus']);
  const retry=findNumber(error,['retry_after_seconds','retryAfterSeconds','retry-after','retryAfter'])??retryAfterSeconds;
  const rate=code===-32029||httpStatus===429||/rate limit|too many requests|\b429\b|retry_after_seconds/i.test(text);
  const timeout=String(code??'').toUpperCase()==='ETIMEDOUT'||/timed out|timeout|deadline exceeded/i.test(text);
  const unsupported=/method not found|unsupported method|not supported by this provider/i.test(text);
  const contract=/execution reverted|revert|invalid argument|invalid params|method not found|contract error/i.test(text);
  const provider=httpStatus===408||httpStatus===502||httpStatus===503||httpStatus===504||/failed to fetch|fetch failed|networkerror|network error|load failed|econnreset|econnrefused|enotfound|socket hang up|\b503\b|\b502\b|\b504\b/i.test(text);
  const kind=rate?'rate-limit':timeout?'timeout':unsupported?'unsupported-method':contract?'contract-error':provider?'provider-unavailable':'unknown';
  return {rpcMethod:'gen_call',contractMethod,kind,code,httpStatus,retryAfterSeconds:retry,attempts,message:sanitize(text||'Studionet read failed')};
}
export function isTransientReadDiagnostic(diagnostic:ReadDiagnostic):boolean{
  // readContractWithTimeout cannot cancel the SDK promise underneath it. Do
  // not start another request while that timed-out request may still be in
  // flight; the UI can be refreshed explicitly once the provider recovers.
  const code=String(diagnostic.code??'').toUpperCase();
  return (diagnostic.kind==='rate-limit'||diagnostic.kind==='provider-unavailable')&&code!=='ETIMEDOUT'&&!/timed out|timeout/i.test(diagnostic.message);
}

export class ReadCoordinator{
  private readonly concurrency:number;
  private readonly maxRetries:number;
  private readonly baseDelayMs:number;
  private readonly maxDelayMs:number;
  private readonly sleep:(milliseconds:number)=>Promise<void>;
  private readonly now:()=>number;
  private readonly onDiagnostic?:(diagnostic:ReadDiagnostic)=>void;
  private readonly onRetry?:(diagnostic:ReadDiagnostic)=>void;
  private active=0;
  private queue:Task<unknown>[]=[];
  private inflight=new Map<string,Promise<unknown>>();
  private backoffUntil=0;
  private nextOrder=0;
  constructor(options:CoordinatorOptions={}){
    this.concurrency=Math.max(1,Math.floor(options.concurrency??3));
    this.maxRetries=Math.max(0,Math.floor(options.maxRetries??2));
    this.baseDelayMs=Math.max(100,options.baseDelayMs??750);
    this.maxDelayMs=Math.max(this.baseDelayMs,options.maxDelayMs??30000);
    this.sleep=options.sleep??wait;this.now=options.now??Date.now;this.onDiagnostic=options.onDiagnostic;this.onRetry=options.onRetry;
  }
  request<T>(key:string,contractMethod:string,operation:(attempt:number)=>Promise<T>,options:RequestOptions={}):Promise<T>{
    const current=this.inflight.get(key);if(current)return current as Promise<T>;
    if(options.isCurrent&&!options.isCurrent())return Promise.reject(new ReadRequestCancelled());
    const promise=new Promise<T>((resolve,reject)=>{this.queue.push({key,contractMethod,operation,resolve:resolve as (value:unknown)=>void,reject,priority:options.priority??0,order:this.nextOrder++,isCurrent:options.isCurrent});this.pump()});
    this.inflight.set(key,promise as Promise<unknown>);
    promise.finally(()=>this.inflight.delete(key)).catch(()=>{});
    return promise;
  }
  private pump(){
    this.queue.sort((a,b)=>b.priority-a.priority||a.order-b.order);
    while(this.active<this.concurrency&&this.queue.length){
      const task=this.queue.shift()!;
      if(task.isCurrent&&!task.isCurrent()){task.reject(new ReadRequestCancelled());continue}
      this.active++;
      void this.execute(task).then(task.resolve,task.reject).finally(()=>{this.active--;this.pump()});
    }
  }
  private async execute(task:Task<unknown>):Promise<unknown>{
    let attempts=0;let retryAt=0;
    while(true){
      if(task.isCurrent&&!task.isCurrent())throw new ReadRequestCancelled();
      const waitFor=Math.max(0,(retryAt||this.backoffUntil)-this.now());if(waitFor)await this.sleep(waitFor);
      if(task.isCurrent&&!task.isCurrent())throw new ReadRequestCancelled();
      attempts++;
      try{return await task.operation(attempts)}catch(error){
        if(task.isCurrent&&!task.isCurrent())throw new ReadRequestCancelled();
        const diagnostic=diagnoseReadError(task.contractMethod,error,attempts);
        this.onDiagnostic?.(diagnostic);
        if(!isTransientReadDiagnostic(diagnostic)||attempts>this.maxRetries)throw new ReadRequestError(diagnostic);
        this.onRetry?.(diagnostic);
        const serverDelay=(diagnostic.retryAfterSeconds??0)*1000;
        const exponential=this.baseDelayMs*2**(attempts-1);
        const delay=Math.min(this.maxDelayMs,Math.max(serverDelay,exponential));
        // Reserve the next retry slot globally. If several reads fail on the
        // same rate-limit response they wait in sequence instead of waking
        // together and creating another burst.
        retryAt=Math.max(this.backoffUntil,this.now())+delay;
        this.backoffUntil=retryAt;
      }
    }
  }
}

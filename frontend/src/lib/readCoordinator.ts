export type ReadDiagnostic={
  rpcMethod:'gen_call';
  contractMethod:string;
  kind:'rate-limit'|'provider-unavailable'|'contract-error'|'unknown';
  code?:number|string;
  httpStatus?:number;
  retryAfterSeconds?:number;
  attempts:number;
  message:string;
};

export class ReadRequestError extends Error{
  diagnostic:ReadDiagnostic;
  constructor(diagnostic:ReadDiagnostic){
    super(diagnostic.message);
    this.name='ReadRequestError';
    this.diagnostic=diagnostic;
  }
}

type CoordinatorOptions={
  concurrency?:number;
  maxRetries?:number;
  baseDelayMs?:number;
  maxDelayMs?:number;
  sleep?:(milliseconds:number)=>Promise<void>;
  now?:()=>number;
  onDiagnostic?:(diagnostic:ReadDiagnostic)=>void;
};
type Task<T>={key:string;contractMethod:string;operation:(attempt:number)=>Promise<T>;resolve:(value:T)=>void;reject:(error:unknown)=>void};

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
    for(const key of ['cause','error'])if(candidate[key])queue.push(candidate[key]);
    if(candidate.data&&typeof candidate.data==='object')queue.push(candidate.data);
  }
  return parts;
};
const numeric=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:typeof value==='string'&&/^\d+$/.test(value)?Number(value):undefined;
const findNumber=(value:unknown,keys:string[]):number|undefined=>{
  const queue:unknown[]=[value];const seen=new Set<object>();
  while(queue.length){
    const current=queue.shift();
    if(!current||typeof current!=='object'||seen.has(current))continue;
    seen.add(current);const candidate=current as Record<string,unknown>;
    for(const key of keys){const found=numeric(candidate[key]);if(found!==undefined)return found}
    for(const key of ['cause','error','data'])if(candidate[key])queue.push(candidate[key]);
  }
  return undefined;
};
const sanitize=(value:string)=>value.replace(/0x[0-9a-f]{40,}/gi,'0x…').replace(/\s+/g,' ').slice(0,180);
export function diagnoseReadError(contractMethod:string,error:unknown,attempts:number,retryAfterSeconds?:number):ReadDiagnostic{
  const parts=textParts(error);const text=parts.join(' | ');
  const code=findNumber(error,['code','errorCode']);
  const httpStatus=findNumber(error,['status','statusCode','httpStatus']);
  const retry=findNumber(error,['retry_after_seconds','retryAfterSeconds'])??retryAfterSeconds;
  const rate=code===-32029||httpStatus===429||/rate limit|too many requests|\b429\b|retry_after_seconds/i.test(text);
  const provider=httpStatus===408||httpStatus===502||httpStatus===503||httpStatus===504||/failed to fetch|fetch failed|networkerror|load failed|timed out|timeout|etimedout|\b503\b|\b502\b|\b504\b/i.test(text);
  const contract=/execution reverted|revert|invalid argument|invalid params|method not found|contract error/i.test(text);
  return {rpcMethod:'gen_call',contractMethod,kind:rate?'rate-limit':provider?'provider-unavailable':contract?'contract-error':'unknown',code,httpStatus,retryAfterSeconds:retry,attempts,message:sanitize(text||'Studionet read failed')};
}
export function isTransientReadDiagnostic(diagnostic:ReadDiagnostic):boolean{return diagnostic.kind==='rate-limit'||diagnostic.kind==='provider-unavailable'}

export class ReadCoordinator{
  private readonly concurrency:number;
  private readonly maxRetries:number;
  private readonly baseDelayMs:number;
  private readonly maxDelayMs:number;
  private readonly sleep:(milliseconds:number)=>Promise<void>;
  private readonly now:()=>number;
  private readonly onDiagnostic?:(diagnostic:ReadDiagnostic)=>void;
  private active=0;
  private queue:Task<unknown>[]=[];
  private inflight=new Map<string,Promise<unknown>>();
  private backoffUntil=0;
  constructor(options:CoordinatorOptions={}){
    this.concurrency=Math.max(1,Math.floor(options.concurrency??3));
    this.maxRetries=Math.max(0,Math.floor(options.maxRetries??2));
    this.baseDelayMs=Math.max(100,options.baseDelayMs??750);
    this.maxDelayMs=Math.max(this.baseDelayMs,options.maxDelayMs??30000);
    this.sleep=options.sleep??wait;this.now=options.now??Date.now;this.onDiagnostic=options.onDiagnostic;
  }
  request<T>(key:string,contractMethod:string,operation:(attempt:number)=>Promise<T>):Promise<T>{
    const current=this.inflight.get(key);if(current)return current as Promise<T>;
    const promise=new Promise<T>((resolve,reject)=>{this.queue.push({key,contractMethod,operation,resolve:resolve as (value:unknown)=>void,reject});this.pump()});
    this.inflight.set(key,promise as Promise<unknown>);
    promise.finally(()=>this.inflight.delete(key)).catch(()=>{});
    return promise;
  }
  private pump(){
    while(this.active<this.concurrency&&this.queue.length){
      const task=this.queue.shift()!;this.active++;
      void this.execute(task).then(task.resolve,task.reject).finally(()=>{this.active--;this.pump()});
    }
  }
  private async execute(task:Task<unknown>):Promise<unknown>{
    let attempts=0;let retryAt=0;
    while(true){
      const waitFor=Math.max(0,(retryAt||this.backoffUntil)-this.now());if(waitFor)await this.sleep(waitFor);
      attempts++;
      try{return await task.operation(attempts)}catch(error){
        const diagnostic=diagnoseReadError(task.contractMethod,error,attempts);
        this.onDiagnostic?.(diagnostic);
        if(!isTransientReadDiagnostic(diagnostic)||attempts>this.maxRetries)throw new ReadRequestError(diagnostic);
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

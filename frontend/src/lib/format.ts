export const WEI=10n**18n;
export function toWei(amount:string):bigint {
  if(!/^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/.test(amount)) throw new Error('Enter a valid GEN amount (up to 18 decimals)');
  const [whole,fraction='']=amount.split('.');
  return BigInt(whole)*WEI+BigInt((fraction+'0'.repeat(18)).slice(0,18));
}
export function fromWei(raw:unknown):string {
  const wei=BigInt(String(raw??0));
  const f=(wei%WEI).toString().padStart(18,'0').replace(/0+$/,'');
  return (wei/WEI).toString()+(f?'.'+f.slice(0,4):'');
}
export function remaining(unix:unknown):string {
  const ms=Number(unix)*1000-Date.now();
  if (!Number.isFinite(ms)) return 'Unknown';
  if(ms<=0) return 'Deadline passed';
  const min=Math.ceil(ms/60000);
  return min>=60?Math.floor(min/60)+'h '+(min%60)+'m':min+'m';
}
export const short=(wallet:string)=>wallet?wallet.slice(0,6)+'…'+wallet.slice(-4):'';
export const safeJson=(value:unknown)=>JSON.stringify(value,(_,v)=>typeof v==='bigint'?v.toString():v,2);
function errorParts(value:unknown):string[]{
 const parts:string[]=[];
 const queue:unknown[]=[value];
 const seen=new Set<object>();
 while(queue.length&&parts.length<24){
  const current=queue.shift();
  if(typeof current==='string'){parts.push(current);continue}
  if(!current||typeof current!=='object')continue;
  if(seen.has(current))continue;
  seen.add(current);
  const candidate=current as Record<string,unknown>;
  for(const key of ['message','details','shortMessage','reason'])if(typeof candidate[key]==='string')parts.push(candidate[key] as string);
  for(const key of ['cause','error'])if(candidate[key])queue.push(candidate[key]);
  if(candidate.data&&typeof candidate.data==='object')queue.push(candidate.data);
 }
 return parts;
}
export const errorText=(value:unknown)=>{
 const candidate=value as any;
 const parts=errorParts(value);
 const details=parts.join(' | ');
 const code=candidate?.code??candidate?.cause?.code??candidate?.cause?.cause?.code;
 const retry=Number(candidate?.cause?.data?.retry_after_seconds??candidate?.data?.retry_after_seconds??candidate?.cause?.cause?.data?.retry_after_seconds);
 if(code===-32029||/rate limit exceeded|too many requests|\b429\b|retry_after_seconds/i.test(details)){
  const wait=Number.isFinite(retry)&&retry>0?` Try again in ${Math.ceil(retry)} seconds.`:' Try again shortly.';
  return 'Studionet RPC rate limit reached.'+wait+' No transaction was submitted.';
 }
 if(/user rejected|rejected the request|denied the request/i.test(details))return 'Wallet request rejected. No transaction was submitted.';
 if(/failed to fetch|fetch failed|networkerror|load failed/i.test(details))return 'Studionet RPC is temporarily unavailable. Retry the read shortly. No transaction was submitted.';
 if(value instanceof Error)return value.message||value.name;
 if(typeof value==='string')return value;
 const encoded=safeJson(value);
 return encoded&&encoded!=='{}'?encoded:String(value);
};

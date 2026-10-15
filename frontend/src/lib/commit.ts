/** Browser commit hash MUST match ClauseBid._hash byte-for-byte. */
export type RevealPackage={auctionId:string;chainId:string;contract:string;seller:string;priceWei:string;terms:string;salt:string;digest:string};
const enc=new TextEncoder();
function packed(parts:string[]):Uint8Array{
  const chunks=parts.map(p=>{const v=enc.encode(p);const len=enc.encode(String(v.byteLength)+':');const res=new Uint8Array(len.length+v.length);res.set(len);res.set(v,len.length);return res;});
  const result=new Uint8Array(chunks.reduce((n,c)=>n+c.length,0));let o=0;
  for(const c of chunks){result.set(c,o);o+=c.length;}return result;
}
export async function digestBid(b:Omit<RevealPackage,'digest'>):Promise<string>{
  const message=packed(['clausebid/commit/v1',b.chainId,b.contract.toLowerCase(),b.auctionId,b.seller.toLowerCase(),b.priceWei,b.terms,b.salt]);
  const bytes=await crypto.subtle.digest('SHA-256',message.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(bytes),v=>v.toString(16).padStart(2,'0')).join('');
}
export function freshSalt():string {
  const bytes=crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');
}
export function saveReveal(item:RevealPackage):void {
  localStorage.setItem('clausebid:reveal:'+item.contract+':'+item.auctionId+':'+item.seller.toLowerCase(),JSON.stringify(item));
}
export function loadReveal(contract:string,auctionId:string,seller:string):RevealPackage|null{
  const saved=localStorage.getItem('clausebid:reveal:'+contract+':'+auctionId+':'+seller.toLowerCase());
  if(!saved)return null;try{return JSON.parse(saved) as RevealPackage;}catch{return null;}
}
export function downloadReveal(item:RevealPackage){
  const url=URL.createObjectURL(new Blob([JSON.stringify(item,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=url;a.download='clausebid-reveal-'+item.auctionId+'.json';a.click();URL.revokeObjectURL(url);
}

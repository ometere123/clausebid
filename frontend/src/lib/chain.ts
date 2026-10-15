import {createClient,isSuccessful} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {safeJson} from './format';
export const CONTRACT=(import.meta.env.VITE_CLAUSEBID_ADDRESS||'').trim().toLowerCase();
export const CHAIN_ID=61999;
type Provider={request:(x:{method:string;params?:unknown[]})=>Promise<unknown>};
declare global { interface Window {ethereum?:Provider;} }
type Write={functionName:string;args?:unknown[];value?:bigint};
const asAddr=()=>{if(!/^0x[0-9a-f]{40}$/.test(CONTRACT))throw new Error('VITE_CLAUSEBID_ADDRESS must be a deployed 0x address');return CONTRACT as `0x${string}`;};
const reader:any=createClient({chain:studionet});
export function decodeContractValue(raw:any):any {
  if(raw instanceof Map)return Object.fromEntries(Array.from(raw.entries(),([k,v])=>[String(k),decodeContractValue(v)]));
  if(Array.isArray(raw))return raw.map(decodeContractValue);
  if(raw && typeof raw==='object' && !(raw instanceof Uint8Array) && !(raw instanceof Date))
    return Object.fromEntries(Object.entries(raw).map(([k,v])=>[k,decodeContractValue(v)]));
  return raw;
}
export async function read(functionName:string,args:unknown[]=[]):Promise<any>{
  return decodeContractValue(await reader.readContract({address:asAddr(),functionName,args}));
}
export async function connectWallet():Promise<string>{
  const p=window.ethereum;
  if(!p)throw new Error('Install or enable an injected EIP-1193 wallet. MetaMask Snaps are not supported.');
  const accounts=await p.request({method:'eth_requestAccounts'}) as string[];
  if(!Array.isArray(accounts)||!accounts[0])throw new Error('No wallet account available');
  const chainHex=await p.request({method:'eth_chainId'}) as string;
  const desired='0x'+CHAIN_ID.toString(16);
  if(String(chainHex).toLowerCase()!==desired){
    try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:desired}]});}
    catch(err){
      const code=(err as {code?:number}).code;
      if(code!==4902)throw err;
      await p.request({method:'wallet_addEthereumChain',params:[{
        chainId:desired,chainName:'GenLayer Studionet',
        rpcUrls:['https://studio.genlayer.com/api'],nativeCurrency:{name:'GEN',symbol:'GEN',decimals:18}
      }]});
    }
  }
  return accounts[0].toLowerCase();
}
export type Tracked={hash:string;action:string;phase:string;timestamp:number;detail?:string};
const TXKEY='clausebid:pending';
export function track(item:Tracked){
  const list=tracked();localStorage.setItem(TXKEY,JSON.stringify([item,...list.filter(x=>x.hash!==item.hash)].slice(0,30)));
  window.dispatchEvent(new Event('clausebid:transactions'));
}
export function tracked():Tracked[]{try{return JSON.parse(localStorage.getItem(TXKEY)||'[]');}catch{return [];}}
export async function write(account:string,w:Write,onChange?:(s:string)=>void):Promise<string>{
  const provider=window.ethereum;if(!provider)throw new Error('EIP-1193 wallet not found');
  await connectWallet();
  const client:any=createClient({chain:studionet,account:account as `0x${string}`,provider:provider as any});
  await client.connect('studionet');
  const call={address:asAddr(),functionName:w.functionName,args:w.args??[],...(w.value!==undefined?{value:w.value}:{})};
  onChange?.('Estimating transaction fees');
  const fees=await client.estimateTransactionFeesForWrite(call);
  onChange?.('Awaiting wallet signature');
  const hash:string=await client.writeContract({...call,fees:{distribution:fees.distribution,feeValue:fees.feeValue}});
  track({hash,action:w.functionName,phase:'submitted',timestamp:Date.now()});
  onChange?.('Submitted '+hash+'. Waiting for actual GenLayer finalization');
  try{
    const receipt=await client.waitForFinalization({hash});
    const success=isSuccessful(receipt);
    track({hash,action:w.functionName,phase:success?'finalized-success':'finalized-failed',timestamp:Date.now(),detail:safeJson(receipt).slice(0,2000)});
    if(!success)throw new Error('Finalized transaction did not execute successfully: '+hash);
  }catch(error){
    track({hash,action:w.functionName,phase:'inspect-finality',timestamp:Date.now(),detail:String(error)});
    throw new Error('Transaction '+hash+' requires inspection. Do NOT resubmit blindly. '+String(error));
  }
  return hash;
}
export async function refreshTx(hash:string):Promise<void>{
  const result:any=await reader.waitForFinalization({hash});
  const success=isSuccessful(result);
  const old=tracked().find(t=>t.hash===hash);
  track({hash,action:old?.action||'unknown',phase:success?'finalized-success':'finalized-failed',timestamp:Date.now(),detail:safeJson(result).slice(0,2000)});
}

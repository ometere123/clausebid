import {createClient} from 'genlayer-js';
export function isSuccessful(receipt:any):boolean {
  const finalized=String(receipt?.statusName??'').toUpperCase()==='FINALIZED' || Number(receipt?.status)===7;
  const leader=Array.isArray(receipt?.consensus_data?.leader_receipt)
    ? receipt.consensus_data.leader_receipt.find((x:any)=>x?.mode==='leader')
    : undefined;
  const execution=String(receipt?.txExecutionResultName??receipt?.executionStatus??'').toUpperCase()==='FINISHED_WITH_RETURN'
    || (Number(receipt?.result)===6 && String(leader?.execution_result??'').toUpperCase()==='SUCCESS');
  return finalized && execution;
}
import {studionet} from 'genlayer-js/chains';
import {safeJson,errorText} from './format';
export const CONTRACT=(import.meta.env.VITE_CLAUSEBID_ADDRESS||'').trim();
export const CHAIN_ID=61999;
export type Eip1193Provider={
  request:(x:{method:string;params?:unknown[]})=>Promise<unknown>;
  on?:(event:string, listener:(...args:unknown[])=>void)=>void;
  removeListener?:(event:string, listener:(...args:unknown[])=>void)=>void;
};
declare global { interface Window {ethereum?:Eip1193Provider;} }
type Write={functionName:string;args?:unknown[];value?:bigint};
const asAddr=()=>{if(!/^0x[0-9a-fA-F]{40}$/.test(CONTRACT))throw new Error('VITE_CLAUSEBID_ADDRESS must be a deployed 0x address');return CONTRACT as `0x${string}`;};
const provider=()=>{if(!window.ethereum)throw new Error('Install or enable an injected EIP-1193 wallet.');return window.ethereum as Eip1193Provider;};
const desiredChain=()=>`0x${CHAIN_ID.toString(16)}`;
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
  const p=provider();
  const accounts=await p.request({method:'eth_requestAccounts'}) as string[];
  if(!Array.isArray(accounts)||!accounts[0])throw new Error('No wallet account available');
  const chainHex=await p.request({method:'eth_chainId'}) as string;
  const desired=desiredChain();
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
  const confirmedChain=await p.request({method:'eth_chainId'}) as string;
  if(String(confirmedChain).toLowerCase()!==desired)throw new Error('Wallet is not connected to Studionet chain 61999.');
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
  const injected=provider();
  const connected=await connectWallet();
  if(connected.toLowerCase()!==account.toLowerCase()){
    throw new Error('Active wallet changed. Reload the selected wallet before signing.');
  }
  const client:any=createClient({chain:studionet,account:account as `0x${string}`,provider:injected as any});
  // The pinned SDK's connect helper probes GenLayer Snaps. Browser wallets in
  // this application are injected EIP-1193 providers (including Rabby), and
  // do not need or expose Snap APIs. connectWallet() above has already checked
  // and switched to chain 61999, so calling the helper here would fail before
  // the wallet can display the actual transaction approval prompt.
  const call={address:asAddr(),functionName:w.functionName,args:w.args??[],value:w.value??0n};
  // genlayer-js@1.1.8 estimates the consensus transaction internally and
  // passes the native value through to the contract. There is no
  // estimateTransactionFeesForWrite/writeContract({ fees }) API in the pinned
  // SDK; using that shape silently breaks every wallet write at runtime.
  onChange?.('Preparing transaction and protocol fee estimate');
  onChange?.('Awaiting wallet signature');
  const hash:string=await client.writeContract(call);
  track({hash,action:w.functionName,phase:'submitted',timestamp:Date.now()});
  onChange?.('Submitted '+hash+'. Waiting for actual GenLayer finalization');
  try{
    const receipt=await client.waitForTransactionReceipt({hash,status:'FINALIZED',interval:3000,retries:120});
    const success=isSuccessful(receipt);
    track({hash,action:w.functionName,phase:success?'finalized-success':'finalized-failed',timestamp:Date.now(),detail:safeJson(receipt).slice(0,2000)});
    if(!success)throw new Error('Finalized transaction did not execute successfully: '+hash);
  }catch(error){
    track({hash,action:w.functionName,phase:'inspect-finality',timestamp:Date.now(),detail:errorText(error)});
    throw new Error('Transaction '+hash+' requires inspection. Do NOT resubmit blindly. '+errorText(error));
  }
  return hash;
}
export async function refreshTx(hash:string):Promise<void>{
  const result:any=await reader.waitForTransactionReceipt({hash,status:'FINALIZED',interval:3000,retries:120});
  const success=isSuccessful(result);
  const old=tracked().find(t=>t.hash===hash);
  track({hash,action:old?.action||'unknown',phase:success?'finalized-success':'finalized-failed',timestamp:Date.now(),detail:safeJson(result).slice(0,2000)});
}

export function subscribeWallet(onAccounts:(accounts:string[])=>void,onChain:(chain:string)=>void,onDisconnect:()=>void):()=>void{
  const p=window.ethereum;
  if(!p?.on)return()=>{};
  const accounts=(...args:unknown[])=>onAccounts(Array.isArray(args[0])?(args[0] as string[]):[]);
  const chain=(...args:unknown[])=>onChain(String(args[0]??''));
  const disconnect=()=>onDisconnect();
  p.on('accountsChanged',accounts);p.on('chainChanged',chain);p.on('disconnect',disconnect);
  return()=>{p.removeListener?.('accountsChanged',accounts);p.removeListener?.('chainChanged',chain);p.removeListener?.('disconnect',disconnect)};
}

export type ParsedReceipt={hash?:string;from?:string;to?:string;status:string;execution:string;messages:unknown[];result?:unknown};
export function parseReceipt(detail?:string):ParsedReceipt|null{
  if(!detail)return null;
  try{
    const value=JSON.parse(detail) as any;
    const leader=Array.isArray(value?.consensus_data?.leader_receipt)
      ? value.consensus_data.leader_receipt.find((x:any)=>x?.mode==='leader')
      : undefined;
    return {hash:value?.hash,from:value?.from_address,to:value?.to_address,status:String(value?.statusName??value?.status??'UNKNOWN'),execution:String(value?.txExecutionResultName??leader?.execution_result??value?.executionStatus??'UNKNOWN'),messages:Array.isArray(value?.messages)?value.messages:[],result:value?.result};
  }catch{return null;}
}

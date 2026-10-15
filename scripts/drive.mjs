#!/usr/bin/env node
/**
 * ClauseBid five-wallet Studionet scenario driver.
 * Run with Node 22: node --env-file=.env scripts/drive.mjs <command>
 * No hidden wait / no test-only contract shortcuts. All commands are real writes.
 * All private keys and reveal salts remain in environment/untracked local state.
 */
import {createClient,createAccount} from 'genlayer-js';
import {Wallet} from 'ethers';
const isSuccessful=(r)=>{
 const finalized=String(r?.statusName??'').toUpperCase()==='FINALIZED' || Number(r?.status)===7;
 const leader=Array.isArray(r?.consensus_data?.leader_receipt)?r.consensus_data.leader_receipt.find(x=>x?.mode==='leader'):undefined;
 const execution=String(r?.txExecutionResultName??r?.executionStatus??'').toUpperCase()==='FINISHED_WITH_RETURN'
  || (Number(r?.result)===6 && String(leader?.execution_result??'').toUpperCase()==='SUCCESS');
 return finalized && execution;
};
import {studionet} from 'genlayer-js/chains';
import {createHash,randomBytes} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const RPC='https://studio.genlayer.com/api';
const ADDRESS=process.env.CLAUSEBID_CONTRACT_ADDRESS?.trim();
if(!ADDRESS||!/^0x[0-9a-fA-F]{40}$/.test(ADDRESS))throw Error('Set CLAUSEBID_CONTRACT_ADDRESS to the source-verified Studionet contract');
const DOMAIN_ADDRESS=ADDRESS.toLowerCase();
const KEYS=['BUYER_PRIVATE_KEY','SELLER_A_PRIVATE_KEY','SELLER_B_PRIVATE_KEY','SELLER_C_PRIVATE_KEY','SELLER_D_PRIVATE_KEY'];
const ACCOUNT_NAMES=['CLAUSEBID_BUYER_ACCOUNT','CLAUSEBID_SELLER_A_ACCOUNT','CLAUSEBID_SELLER_B_ACCOUNT','CLAUSEBID_SELLER_C_ACCOUNT','CLAUSEBID_SELLER_D_ACCOUNT'];
const DEFAULT_ACCOUNTS=['praest-deployer','clausebid-seller-a','clausebid-seller-b','clausebid-seller-c','clausebid-seller-d'];
const keystoreDir=process.env.CLAUSEBID_KEYSTORE_DIR ?? path.join(process.env.USERPROFILE ?? '', '.genlayer', 'keystores');
const keystorePassword=process.env.CLAUSEBID_KEYSTORE_PASSWORD;
async function loadAccount(index){
 const key=process.env[KEYS[index]];
 if(key){
  if(!/^0x[0-9a-fA-F]{64}$/.test(key))throw Error('Invalid '+KEYS[index]);
  return createAccount(key);
 }
 const name=process.env[ACCOUNT_NAMES[index]] ?? DEFAULT_ACCOUNTS[index];
 if(!keystorePassword)throw Error('Missing '+KEYS[index]+' or CLAUSEBID_KEYSTORE_PASSWORD for '+name);
 const file=path.join(keystoreDir,name+'.json');
 if(!fs.existsSync(file))throw Error('Missing keystore for '+name+': '+file);
 const encrypted=fs.readFileSync(file,'utf8');
 const wallet=await Wallet.fromEncryptedJson(encrypted,keystorePassword);
 return createAccount(wallet.privateKey);
}
const wallets=await Promise.all(KEYS.map((_,index)=>loadAccount(index)));
const clients=wallets.map(account=>createClient({chain:studionet,account}));
const FILE='evidence/session.local.json';
const state=fs.existsSync(FILE)?JSON.parse(fs.readFileSync(FILE,'utf8')):{contract:ADDRESS,chain:61999,history:[],reveal:{}};
if(state.contract&&state.contract.toLowerCase()!==ADDRESS.toLowerCase()||state.chain!==61999)throw Error('Session file binds a different contract or chain');
const persist=()=>{fs.mkdirSync(path.dirname(FILE),{recursive:true});fs.writeFileSync(FILE,JSON.stringify(state,null,2),{mode:0o600})};
const id=()=>{if(!state.auctionId)throw Error('Run create first');return Number(state.auctionId)};
const U=10n**18n;
const clauses=[
 'Deliver exactly three complete descriptions of approved products.',
 'Each description must state a six-month warranty without contradiction.',
 'Each description must include an SEO title.',
 'All required components must be included in the quoted all-in GEN price.',
];
const reference='Demo facts: Product A, B, C each have exactly a six-month warranty. No lifetime warranty. SEO title mandatory for each. Public fictional products only.';
const bids=[
 {price:18n,terms:'Three descriptions for 18 GEN. SEO titles are excluded from this price.'},
 {price:25n,terms:'At 25 GEN all-in: exactly three complete descriptions, each with accurate six-month warranty and individual SEO title. No exclusions or extra charges.'},
 {price:22n,terms:'Three descriptions and warranties for 22 GEN, but SEO titles require an additional 5 GEN.'},
 {price:28n,terms:'Exactly three complete descriptions, six-month warranty text and SEO titles all included for 28 GEN all-in, no extra fees.'},
];
function packed(parts){return Buffer.concat(parts.map(v=>{const b=Buffer.from(String(v),'utf8');return Buffer.concat([Buffer.from(String(b.length)+':'),b])}))}
function commitment(auction,seller,price,terms,salt){
 const domain=['clausebid/commit/v1','61999',DOMAIN_ADDRESS,String(auction),seller.toLowerCase(),String(price),terms,salt];
 return createHash('sha256').update(packed(domain)).digest('hex');
}
async function read(method,args=[]){return clients[0].readContract({address:ADDRESS,functionName:method,args})}
function safe(v){return JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x)}
async function send(who,method,args=[],value,wait=true){
 const client=clients[who];
 const call={address:ADDRESS,functionName:method,args,...(value===undefined?{}:{value})};
 console.log('Initiating:',KEYS[who],method,'deposit_wei='+String(value??0n));
 const hash=await client.writeContract({...call,value:value??0n});
 const entry={wallet:KEYS[who],method,hash,submittedAt:new Date().toISOString(),state:'submitted'};
 state.history.push(entry);
 persist();
 if(!wait){console.log('Queued without blocking subsequent participants:',hash);return hash;}
 console.log('GenLayer tx ID:',hash,'waiting for FINALIZED + execution success');
 const receipt=await client.waitForTransactionReceipt({hash,status:'FINALIZED',interval:3000,retries:120});
 const ok=isSuccessful(receipt);
 entry.state=ok?'finalized-success':'finalized-failed';
 entry.result=safe(receipt).slice(0,1500);
 persist();
 if(!ok)throw Error('Finalized but failed. Inspect hash and state BEFORE retry: '+hash);
 console.log('Finalized execution success:',hash);
 return hash;
}
const cmd=process.argv[2]||'help';
if(cmd==='create'){
 if(state.auctionId)throw Error('Auction already in session; use new local session after separately settling the old one');
 const previous=state.history.find(x=>x.method==='create_procurement'&&x.state==='finalized-success');
 if(previous){
  state.auctionId=Number(await read('get_count'));persist();
  console.log('Recovered auction from finalized create:',id());
  process.exit(0);
 }
 await send(0,'create_procurement',['Three product descriptions',reference,...clauses,35n*U],35n*U);
 state.auctionId=Number(await read('get_count'));persist();
 console.log('Auction ID:',id());
}else if(cmd==='commit-all'){
 const a=await read('get_procurement',[id()]);
 const bond=BigInt(a.bond);
 const pending=[];
 for(let n=0;n<4;n++){
  const seller=wallets[n+1].address.toLowerCase();const salt=randomBytes(32).toString('hex');
  const price=bids[n].price*U;
  const digest=commitment(id(),seller,price,bids[n].terms,salt);
  state.reveal[seller]={auctionId:id(),seller,price:String(price),terms:bids[n].terms,salt,digest};persist();
  pending.push(send(n+1,'commit_bid',[id(),digest],bond,false));
 }
 await Promise.all(pending);
 console.log('All four commitments submitted. KEEP evidence/session.local.json SECRET until reveal.');
}else if(cmd==='reveal-all'){
 const pending=[];
 for(let n=0;n<4;n++){
  const o=state.reveal[wallets[n+1].address.toLowerCase()];
  if(!o)throw Error('Missing original saved commitment for seller '+(n+1));
  pending.push(send(n+1,'reveal_bid',[id(),BigInt(o.price),o.terms,o.salt],undefined,false));
 }
 await Promise.all(pending);
}else if(cmd==='evaluate-all'){
 const a=await read('get_procurement',[id()]);
 const jobs=[];
 for(let n=0;n<Number(a.bidder_count);n++){
  const seller=await read('get_seller',[id(),n]);
  const o=await read('get_offer',[id(),seller]);
  if(o.revealed&&o.verdict==='REVEALED')jobs.push({who:n+1<5?n+1:0,seller});
 }
 // A review reservation must be finalized before its consensus call is
 // submitted; otherwise independent transactions can be reordered and the
 // evaluator may execute against the pre-reservation state.
 await Promise.all(jobs.map(x=>send(x.who,'begin_bid_review',[id(),x.seller])));
 await Promise.all(jobs.map(x=>send(x.who,'evaluate_bid',[id(),x.seller])));
}else if(cmd==='award'){
 await send(0,'finalize_award',[id()]);
}else if(cmd==='deliver'){
 const a=await read('get_procurement',[id()]);
 const idx=wallets.findIndex(x=>x.address.toLowerCase()===String(a.winner).toLowerCase());
 if(idx<1)throw Error('No demo wallet won this auction');
 const text=[
 'PRODUCT A — SEO TITLE: Product A customer guide. Full description: Product A has a six-month warranty and the approved product facts.',
 'PRODUCT B — SEO TITLE: Product B customer guide. Full description: Product B has a six-month warranty and the approved product facts.',
 'PRODUCT C — SEO TITLE: Product C customer guide. Full description: Product C has a six-month warranty and the approved product facts.',
 ].join('\n\n');
 await send(idx,'submit_delivery',[id(),text]);
}else if(cmd==='dispute'){
 await send(0,'dispute_delivery',[id()]);
}else if(cmd==='review'){
 await send(2,'begin_delivery_review',[id()]);
 await send(2,'review_delivery',[id()]);
}else if(cmd==='accept'){
 await send(0,'accept_delivery',[id()]);
}else if(cmd==='expire'){
 await send(4,'expire_delivery',[id()]);
}else if(cmd==='claim-all'){
 for(let n=0;n<5;n++){
  const due=BigInt(await read('get_credit',[wallets[n].address.toLowerCase()]));
  if(due>0n){console.log(KEYS[n], 'claiming',String(due),'wei');await send(n,'claim')}
 }
 console.log('Claim writes are not payout evidence: verify recipient GEN balance and finalized external-message receipts.');
}else if(cmd==='verify-pending'){
 for(const entry of state.history.filter(x=>x.state==='submitted'||x.state==='finalized-failed')){
  console.log('Checking previously submitted transaction',entry.hash);
  const result=await clients[0].waitForTransactionReceipt({hash:entry.hash,status:'FINALIZED',interval:3000,retries:120});
  entry.state=isSuccessful(result)?'finalized-success':'finalized-failed';
  entry.result=safe(result).slice(0,1500);persist();
  console.log(entry.state,entry.hash);
 }
}else if(cmd==='inspect'){
 console.log('Auction',id(),safe(await read('get_procurement',[id()])));
 const a=await read('get_procurement',[id()]);
 for(let i=0;i<Number(a.bidder_count);i++){
  const s=await read('get_seller',[id(),i]);console.log('Offer',i,s,safe(await read('get_offer',[id(),s])));
 }
 for(let i=0;i<5;i++)console.log('Credit',KEYS[i],String(await read('get_credit',[wallets[i].address.toLowerCase()])));
 console.log('Economy',safe(await read('get_economy')));
 console.log('Recorded writes',state.history.length);
}else{
 console.log('Commands: create, commit-all, reveal-all, evaluate-all, verify-pending, award, deliver, dispute, review, accept, expire, claim-all, inspect');
 console.log('Use real wall-clock windows, NEVER warp hosted Studionet. No command changes network time.');
}

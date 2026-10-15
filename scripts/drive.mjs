#!/usr/bin/env node
/**
 * ClauseBid five-wallet Studionet scenario driver.
 * Run with Node 22: node --env-file=.env scripts/drive.mjs <command>
 * No hidden wait / no test-only contract shortcuts. All commands are real writes.
 * All private keys and reveal salts remain in environment/untracked local state.
 */
import {createClient,createAccount,isSuccessful} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {createHash,randomBytes} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const RPC='https://studio.genlayer.com/api';
const ADDRESS=process.env.CLAUSEBID_CONTRACT_ADDRESS?.toLowerCase();
if(!ADDRESS||!/^0x[0-9a-f]{40}$/.test(ADDRESS))throw Error('Set CLAUSEBID_CONTRACT_ADDRESS to the source-verified Studionet contract');
const KEYS=['BUYER_PRIVATE_KEY','SELLER_A_PRIVATE_KEY','SELLER_B_PRIVATE_KEY','SELLER_C_PRIVATE_KEY','SELLER_D_PRIVATE_KEY'];
const wallets=KEYS.map(key=>{const priv=process.env[key];if(!priv||!/^0x[0-9a-fA-F]{64}$/.test(priv))throw Error('Missing/invalid '+key);return createAccount(priv)});
const clients=wallets.map(account=>createClient({chain:studionet,account}));
const FILE='evidence/session.local.json';
const state=fs.existsSync(FILE)?JSON.parse(fs.readFileSync(FILE,'utf8')):{contract:ADDRESS,chain:61999,history:[],reveal:{}};
if(state.contract!==ADDRESS||state.chain!==61999)throw Error('Session file binds a different contract or chain');
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
 const domain=['clausebid/commit/v1','61999',ADDRESS,String(auction),seller.toLowerCase(),String(price),terms,salt];
 return createHash('sha256').update(packed(domain)).digest('hex');
}
async function read(method,args=[]){return clients[0].readContract({address:ADDRESS,functionName:method,args})}
function safe(v){return JSON.stringify(v,(_,x)=>typeof x==='bigint'?x.toString():x)}
async function send(who,method,args=[],value){
 const client=clients[who];
 const call={address:ADDRESS,functionName:method,args,...(value===undefined?{}:{value})};
 const estimate=await client.estimateTransactionFeesForWrite(call);
 console.log('Initiating:',KEYS[who],method,'deposit_wei='+String(value??0n));
 const hash=await client.writeContract({...call,fees:{distribution:estimate.distribution,feeValue:estimate.feeValue}});
 state.history.push({wallet:KEYS[who],method,hash,submittedAt:new Date().toISOString(),state:'submitted'});
 persist();
 console.log('GenLayer tx ID:',hash,'waiting for FINALIZED + execution success');
 const receipt=await client.waitForFinalization({hash});
 const ok=isSuccessful(receipt);
 state.history.at(-1).state=ok?'finalized-success':'finalized-failed';
 state.history.at(-1).result=safe(receipt).slice(0,1500);
 persist();
 if(!ok)throw Error('Finalized but failed. Inspect hash and state BEFORE retry: '+hash);
 console.log('Finalized execution success:',hash);
 return hash;
}
const cmd=process.argv[2]||'help';
if(cmd==='create'){
 if(state.auctionId)throw Error('Auction already in session; use new local session after separately settling the old one');
 await send(0,'create_procurement',['Three product descriptions',reference,...clauses,35n*U],35n*U);
 state.auctionId=Number(await read('get_count'));persist();
 console.log('Auction ID:',id());
}else if(cmd==='commit-all'){
 const a=await read('get_procurement',[id()]);
 const bond=BigInt(a.bond);
 for(let n=0;n<4;n++){
  const seller=wallets[n+1].address.toLowerCase();const salt=randomBytes(32).toString('hex');
  const price=bids[n].price*U;
  const digest=commitment(id(),seller,price,bids[n].terms,salt);
  state.reveal[seller]={auctionId:id(),seller,price:String(price),terms:bids[n].terms,salt,digest};persist();
  await send(n+1,'commit_bid',[id(),digest],bond);
 }
 console.log('All four commitments submitted. KEEP evidence/session.local.json SECRET until reveal.');
}else if(cmd==='reveal-all'){
 for(let n=0;n<4;n++){
  const o=state.reveal[wallets[n+1].address.toLowerCase()];
  if(!o)throw Error('Missing original saved commitment for seller '+(n+1));
  await send(n+1,'reveal_bid',[id(),BigInt(o.price),o.terms,o.salt]);
 }
}else if(cmd==='evaluate-all'){
 const a=await read('get_procurement',[id()]);
 for(let n=0;n<Number(a.bidder_count);n++){
  const seller=await read('get_seller',[id(),n]);
  const o=await read('get_offer',[id(),seller]);
  if(o.revealed&&o.verdict==='REVEALED')await send(n+1<5?n+1:0,'evaluate_bid',[id(),seller]);
 }
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
 console.log('Commands: create, commit-all, reveal-all, evaluate-all, award, deliver, dispute, review, accept, expire, claim-all, inspect');
 console.log('Use real wall-clock windows, NEVER warp hosted Studionet. No command changes network time.');
}

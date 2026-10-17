#!/usr/bin/env node
/**
 * Resumable live negative-path runner for the source-verified Studionet
 * deployment. It uses only the five encrypted CLI wallets and real elapsed
 * chain time. The local state file contains salts and full receipts and is
 * ignored by Git. The public evidence file contains addresses, hashes,
 * receipt summaries, state snapshots, and balance readbacks only.
 *
 * Commands:
 *   start   create the seven CLI scenarios and submit timely commitments
 *   run     progress every scenario until terminal or explicitly blocked
 *   status  print live state without submitting writes
 *   resume  alias for run
 *
 * Required environment:
 *   CLAUSEBID_CONTRACT_ADDRESS
 *   CLAUSEBID_KEYSTORE_PASSWORD (or the five *_PRIVATE_KEY variables)
 */
import {createClient,createAccount} from 'genlayer-js';
import {Wallet} from 'ethers';
import {studionet} from 'genlayer-js/chains';
import {createHash,randomBytes} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const ADDRESS=process.env.CLAUSEBID_CONTRACT_ADDRESS?.trim();
if(!ADDRESS||!/^0x[0-9a-fA-F]{40}$/.test(ADDRESS))throw Error('Set CLAUSEBID_CONTRACT_ADDRESS to the source-verified Studionet contract');
const CHAIN_ID=61999;
const DOMAIN_ADDRESS=ADDRESS.toLowerCase();
const U=10n**18n;
const GEN=U;
const WINDOW=1800;
const REVIEW_GRACE=1800;
const KEYS=['BUYER_PRIVATE_KEY','SELLER_A_PRIVATE_KEY','SELLER_B_PRIVATE_KEY','SELLER_C_PRIVATE_KEY','SELLER_D_PRIVATE_KEY'];
const ACCOUNT_NAMES=['CLAUSEBID_BUYER_ACCOUNT','CLAUSEBID_SELLER_A_ACCOUNT','CLAUSEBID_SELLER_B_ACCOUNT','CLAUSEBID_SELLER_C_ACCOUNT','CLAUSEBID_SELLER_D_ACCOUNT'];
const DEFAULT_ACCOUNTS=['praest-deployer','clausebid-seller-a','clausebid-seller-b','clausebid-seller-c','clausebid-seller-d'];
const keystoreDir=process.env.CLAUSEBID_KEYSTORE_DIR ?? path.join(process.env.USERPROFILE ?? '', '.genlayer', 'keystores');
const password=process.env.CLAUSEBID_KEYSTORE_PASSWORD;
const LOCAL_FILE=process.env.CLAUSEBID_NEGATIVE_STATE ?? 'evidence/live-negative.local.json';
const PUBLIC_FILE=process.env.CLAUSEBID_NEGATIVE_EVIDENCE ?? 'evidence/studionet/live-negative.json';
const SOURCE_SHA='18b3f3e8812986848a23d68bfa5eb2fc47d5601e94c6cabd909091073cd5a8f4';

async function loadAccount(index){
 const key=process.env[KEYS[index]];
 if(key){
  if(!/^0x[0-9a-fA-F]{64}$/.test(key))throw Error('Invalid '+KEYS[index]);
  return createAccount(key);
 }
 const name=process.env[ACCOUNT_NAMES[index]] ?? DEFAULT_ACCOUNTS[index];
 if(!password)throw Error('Missing '+KEYS[index]+' or CLAUSEBID_KEYSTORE_PASSWORD for '+name);
 const file=path.join(keystoreDir,name+'.json');
 if(!fs.existsSync(file))throw Error('Missing keystore for '+name+': '+file);
 const wallet=await Wallet.fromEncryptedJson(fs.readFileSync(file,'utf8'),password);
 return createAccount(wallet.privateKey);
}

const wallets=await Promise.all(KEYS.map((_,index)=>loadAccount(index)));
const clients=wallets.map(account=>createClient({chain:studionet,account}));
const names=['buyer','sellerA','sellerB','sellerC','sellerD'];
const addresses=wallets.map(wallet=>wallet.address.toLowerCase());
const readClient=clients[0];
const READ_TIMEOUT_MS=15000;
const RPC_GAP_MS=8000;
let lastRpcAt=0;
let rpcTail=Promise.resolve();
async function withReadTimeout(label,operation){
 let timer;
 try{return await Promise.race([operation(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('Studionet read timed out: '+label),{code:'ETIMEDOUT'})),READ_TIMEOUT_MS)})])}
 finally{if(timer)clearTimeout(timer)}
}
async function rpc(label,operation,{retryRead=false}={}){
 const run=rpcTail.then(async()=>{
  const maxAttempts=retryRead?2:1;
  for(let attempt=0;attempt<maxAttempts;attempt++){
   const gap=RPC_GAP_MS-(Date.now()-lastRpcAt);
   if(gap>0)await sleep(gap);
   try{const result=await operation();lastRpcAt=Date.now();return result}
   catch(error){
    lastRpcAt=Date.now();
    const text=String(error)+' '+JSON.stringify(error?.cause??'');
    // A provider-wide hourly quota will not recover during a short retry
    // window. Stop immediately and let the resumable runner preserve a
    // truthful BLOCKED state instead of spending more requests on a known
    // outage. Only the bounded transient read classes below are retryable.
    if(!retryRead||/requests per hour|hourly rate limit|rate limit exceeded.*hour/i.test(text))throw error;
    const transient=/rate limit|retry_after_seconds|-32029|\b429\b|\b408\b|\b502\b|\b503\b|\b504\b|failed to fetch|fetch failed|timed out|timeout|etimedout/i.test(text);
    if(!transient||attempt===maxAttempts-1)throw error;
    const match=text.match(/retry_after_seconds[^0-9]*(\d+)/i);
    const delay=Math.min(60000,Math.max(5000,((match?Number(match[1]):15)+1)*1000));
    console.log('Studionet rate limit while',label,'waiting',delay,'ms');
    await sleep(delay);
   }
  }
 });
 rpcTail=run.catch(()=>{});
 return run;
}
const clauses=[
 'Deliver one bounded digital-text artifact for the negative-path verification run.',
 'The artifact must include the approved facts without contradiction.',
 'The artifact must be public text and no more than 6000 characters.',
 'All required components must be included in the all-in GEN price.',
];
const reference='Approved public facts: this is a bounded public-text verification artifact; all four frozen clauses and details are public test facts.';
const compliantTerms=clauses.map((clause,index)=>`Clause ${index+1} accepted exactly: ${clause}`).join(' ');
const nonCompliantTerms='I exclude clause 4 and require extra payment for required components, so this offer is not all-in and is not compliant.';

const defaultState={
 version:1,network:'studionet',chainId:CHAIN_ID,contract:ADDRESS,sourceSha256:SOURCE_SHA,
 startedAt:null,updatedAt:null,scenarios:{},transactions:{},errors:[]
};
const state=fs.existsSync(LOCAL_FILE)?JSON.parse(fs.readFileSync(LOCAL_FILE,'utf8')):structuredClone(defaultState);
if(state.contract&&state.contract.toLowerCase()!==ADDRESS.toLowerCase())throw Error('Negative state binds a different contract');
if(state.chainId&&state.chainId!==CHAIN_ID)throw Error('Negative state binds a different chain');
state.contract=ADDRESS;state.chainId=CHAIN_ID;state.sourceSha256=SOURCE_SHA;
const persist=()=>{
 state.updatedAt=new Date().toISOString();
 fs.mkdirSync(path.dirname(LOCAL_FILE),{recursive:true});
 fs.writeFileSync(LOCAL_FILE,JSON.stringify(state,null,2),{mode:0o600});
 fs.mkdirSync(path.dirname(PUBLIC_FILE),{recursive:true});
 fs.writeFileSync(PUBLIC_FILE,JSON.stringify(publicEvidence(),null,2));
};
const safe=(value)=>JSON.stringify(value,(_,item)=>typeof item==='bigint'?item.toString():item);
const nowMs=()=>Date.now();
const nowIso=()=>new Date().toISOString();
const sleep=(ms)=>new Promise(resolve=>setTimeout(resolve,ms));
const hasSuccess=(receipt)=>{
 const finalized=String(receipt?.statusName??'').toUpperCase()==='FINALIZED'||Number(receipt?.status)===7;
 const leader=Array.isArray(receipt?.consensus_data?.leader_receipt)?receipt.consensus_data.leader_receipt.find(x=>x?.mode==='leader'):undefined;
 const execution=String(receipt?.txExecutionResultName??receipt?.executionStatus??'').toUpperCase()==='FINISHED_WITH_RETURN'
  ||(Number(receipt?.result)===6&&String(leader?.execution_result??'').toUpperCase()==='SUCCESS');
 return finalized&&execution;
};
const leaderExecution=(receipt)=>{
 const leader=Array.isArray(receipt?.consensus_data?.leader_receipt)?receipt.consensus_data.leader_receipt.find(x=>x?.mode==='leader'):undefined;
 return String(leader?.execution_result??receipt?.txExecutionResultName??receipt?.executionStatus??'UNKNOWN');
};
const receiptSummary=(receipt,transaction,triggered)=>({
  status:receipt?.statusName??receipt?.status??null,result:receipt?.result??null,
  txExecutionResultName:receipt?.txExecutionResultName??null,leaderExecution:leaderExecution(receipt),
  chainId:CHAIN_ID,contract:ADDRESS,transactionHash:transaction?.hash??null,
  messages:Array.isArray(transaction?.messages)?transaction.messages.map(message=>({
    messageType:message?.messageType??null,recipient:message?.recipient??null,value:message?.value??null,
    onAcceptance:message?.onAcceptance??null,saltNonce:message?.saltNonce??null,
  })):[],triggeredTransactionIds:Array.isArray(triggered)?triggered:[],
});

function packed(parts){return Buffer.concat(parts.map(value=>{const bytes=Buffer.from(String(value),'utf8');return Buffer.concat([Buffer.from(String(bytes.length)+':'),bytes])}));}
function commitment(auction,seller,price,terms,salt){
 const domain=['clausebid/commit/v1',String(CHAIN_ID),DOMAIN_ADDRESS,String(auction),seller.toLowerCase(),String(price),terms,salt];
 return createHash('sha256').update(packed(domain)).digest('hex');
}
async function read(method,args=[]){return rpc('read '+method,()=>withReadTimeout(method,()=>readClient.readContract({address:ADDRESS,functionName:method,args})),{retryRead:true});}
async function tryRead(method,args=[]){try{return await read(method,args)}catch{return null}}
async function nativeBalance(address){
 try{return String(await rpc('balance',()=>withReadTimeout('balance',()=>readClient.getBalance({address})),{retryRead:true}));}catch{}
 try{
  const result=await rpc('eth_getBalance',()=>withReadTimeout('eth_getBalance',()=>readClient.request({method:'eth_getBalance',params:[address,'latest']})),{retryRead:true});
  return String(BigInt(result));
 }catch{return null}
}
async function economy(){return read('get_economy');}
function uniqueAddresses(values){return Array.from(new Set(values.filter(value=>/^0x[0-9a-fA-F]{40}$/.test(String(value??''))).map(value=>String(value).toLowerCase())))}
function focusAddresses(item,procurement,extra=[]){return uniqueAddresses([procurement?.buyer,item?.buyer,item?.commit?.seller,item?.participants?.seller,...extra])}
async function compactState(item,includeBalances=false){
 const auctionId=item.auctionId;const procurement=await read('get_procurement',[auctionId]);
 const offers=[];
 for(let position=0;position<Number(procurement.bidder_count);position++){
  const seller=await read('get_seller',[auctionId,position]);
  offers.push({position,seller,offer:await read('get_offer',[auctionId,seller])});
 }
 const focused=focusAddresses(item,procurement,offers.map(entry=>entry.seller));
 const credits={};
 for(const address of focused)credits[address]=String(await read('get_credit',[address]));
 const result={capturedAt:nowIso(),procurement,offers,credits,economy:await economy()};
 if(includeBalances){
  result.nativeBalances={};
  for(const address of [...focused,ADDRESS.toLowerCase()])result.nativeBalances[address]=await nativeBalance(address);
 }
 return result;
}
async function economySnapshot(item,includeBalances=false,extra=[]){
 const focused=focusAddresses(item,null,extra);const result={capturedAt:nowIso(),economy:await economy(),credits:{}};
 for(const address of focused)result.credits[address]=String(await read('get_credit',[address]));
 if(includeBalances){result.nativeBalances={};for(const address of [...focused,ADDRESS.toLowerCase()])result.nativeBalances[address]=await nativeBalance(address)}
 return result;
}
function scenario(name){
 const value=state.scenarios[name];
 if(!value)throw Error('Unknown scenario '+name);
 return value;
}
function publicTx(tx){return {
 key:tx.key,wallet:tx.wallet,address:tx.address,method:tx.method,hash:tx.hash??null,
 submittedAt:tx.submittedAt??null,finalizedAt:tx.finalizedAt??null,expected:tx.expected,
 observed:tx.observed,receipt:tx.receipt??null,error:tx.error??null,
 };}
function publicEvidence(){
 const output={network:'studionet',chainId:CHAIN_ID,rpc:'https://studio.genlayer.com/api',contract:ADDRESS,sourceSha256:SOURCE_SHA,
  generatedAt:state.updatedAt,runner:'scripts/live-negative.mjs',realElapsedTime:true,noAutomaticTransferRetry:true,
  scenarios:{}};
 for(const [name,item] of Object.entries(state.scenarios)){
  output.scenarios[name]={name,kind:item.kind,auctionId:item.auctionId??null,buyer:item.buyer??null,participants:item.participants??null,
   expected:item.expected,observed:item.observed??null,status:item.status??'IN_PROGRESS',deadlines:item.deadlines??null,
   before:item.before??null,after:item.after??null,balanceSnapshots:item.balanceSnapshots??[],entitlements:item.entitlements??[],
   transactions:Object.values(item.transactionKeys??{}).map(key=>publicTx(state.transactions[key])).filter(Boolean),
   notes:item.notes??[],errors:item.errors??[]};
 }
 output.errors=state.errors;return output;
}
function ensureScenario(name,kind,expected,participants){
 if(!state.scenarios[name])state.scenarios[name]={name,kind,expected,participants,status:'IN_PROGRESS',transactionKeys:{},notes:[],errors:[],balanceSnapshots:[],entitlements:[]};
 return state.scenarios[name];
}
function recordError(item,message){item.errors.push({at:nowIso(),message});state.errors.push({scenario:item.name,at:nowIso(),message});persist();}
async function transactionDetails(hash,includeTrace=false,includeMessages=false){
 const receipt=await rpc('receipt '+hash,()=>readClient.waitForTransactionReceipt({hash,status:'FINALIZED',interval:8000,retries:120}),{retryRead:true});
 let transaction=null,triggered=[];
 if(includeMessages){
  try{transaction=await rpc('transaction '+hash,()=>readClient.getTransaction({hash}),{retryRead:true})}catch{}
  try{triggered=await rpc('triggered '+hash,()=>readClient.getTriggeredTransactionIds({hash}),{retryRead:true})}catch{}
 }
 let trace=null;
 if(includeTrace){try{trace=await rpc('trace '+hash,()=>readClient.debugTraceTransaction({hash,round:0}),{retryRead:true})}catch{}}
 return {receipt,transaction,triggered,trace};
}
async function tx(item,key,who,method,args=[],value=0n,expected='SUCCESS'){
 const existingKey=item.transactionKeys[key];
 if(existingKey){
  const existing=state.transactions[existingKey];
  if(existing?.finalizedAt)return existing;
  if(existing?.observed==='SUBMISSION_ERROR'||(existing&&!existing.hash)){
   throw Error('Submission outcome unavailable for '+method+'; the persisted write has no finalized receipt. Inspect the provider before any manual retry.');
  }
  if(existing?.hash){
   const details=await transactionDetails(existing.hash,expected==='FAILURE',existing.method==='claim');
   existing.finalizedAt=nowIso();existing.receipt=receiptSummary(details.receipt,details.transaction,details.triggered);existing.trace=details.trace??null;
   existing.observed=hasSuccess(details.receipt)?'SUCCESS':'FAILURE';persist();
   if(expected==='SUCCESS'&&existing.observed!=='SUCCESS')throw Error('Previously submitted transaction finalized unsuccessfully: '+existing.hash);
   if(expected==='FAILURE'&&existing.observed==='SUCCESS')throw Error('Expected failure unexpectedly succeeded: '+existing.hash);
   return existing;
  }
 }
 const txKey=item.name+':'+key;
 const entry={key:txKey,wallet:names[who],address:addresses[who],method,expected,submittedAt:nowIso(),hash:null,finalizedAt:null,observed:null,receipt:null,error:null};
 state.transactions[txKey]=entry;item.transactionKeys[key]=txKey;persist();
 let hash;
 try{hash=await rpc('write '+method,()=>clients[who].writeContract({address:ADDRESS,functionName:method,args,value}));entry.hash=hash;persist()}
 catch(error){entry.error=String(error);entry.observed='SUBMISSION_ERROR';persist();throw Error('Submission outcome unavailable for '+method+': '+String(error))}
 const details=await transactionDetails(hash,expected==='FAILURE',method==='claim');
 entry.finalizedAt=nowIso();entry.receipt=receiptSummary(details.receipt,details.transaction,details.triggered);entry.trace=details.trace??null;entry.observed=hasSuccess(details.receipt)?'SUCCESS':'FAILURE';persist();
 if(expected==='SUCCESS'&&entry.observed!=='SUCCESS')throw Error('Finalized but failed: '+hash);
 if(expected==='FAILURE'&&entry.observed==='SUCCESS')throw Error('Expected failure unexpectedly succeeded: '+hash);
 return entry;
}
async function markState(item,label,includeBalances=false){
 const snapshot=await compactState(item,includeBalances);
 if(label==='before')item.before=snapshot;else item.after=snapshot;
 if(includeBalances)item.balanceSnapshots.push({label,...snapshot});
 persist();return snapshot;
}
async function setTerminal(item,status,observed){
 item.status=status;item.observed=observed;await markState(item,'after',true);persist();
}
async function claim(item,who,label){
 const due=BigInt(await read('get_credit',[addresses[who]]));
 if(due===0n)return null;
 const before=await economySnapshot(item,true,[addresses[who]]);item.balanceSnapshots.push({label:label+':before',...before});persist();
 const result=await tx(item,label,who,'claim',[],0n,'SUCCESS');
 const after=await economySnapshot(item,true,[addresses[who]]);item.balanceSnapshots.push({label:label+':after',...after});
 item.entitlements.push({beneficiary:addresses[who],amountWei:String(due),claimTransaction:result.hash,observed:'DISPATCHED_PENDING_EXTERNAL_SETTLEMENT'});persist();return result;
}
async function createAuction(item){
 if(item.auctionId)return;
 if(!item.before)item.before=await economySnapshot(item,false,[addresses[0]]);
 const result=await tx(item,'create',0,'create_procurement',[item.title,reference,...clauses,5n*U],5n*U,'SUCCESS');
 item.auctionId=Number(await read('get_count'));item.buyer=addresses[0];
 item.deadlines=await read('get_procurement',[item.auctionId]);
 await markState(item,'after',false);persist();
 console.log('Created',item.name,'auction',item.auctionId,result.hash);
}
async function commit(item,who,price,terms){
 if(!item.commit){
  const auction=item.auctionId;const seller=addresses[who];const salt=randomBytes(32).toString('hex');const priceWei=price*U;
  const digest=commitment(auction,seller,priceWei,terms,salt);
  item.commit={who,seller,priceWei:String(priceWei),terms,salt,digest};persist();
 }
 if(!item.commitTransaction){
  const procurement=await read('get_procurement',[item.auctionId]);
  const result=await tx(item,'commit',item.commit.who,'commit_bid',[item.auctionId,item.commit.digest],BigInt(procurement.bond),'SUCCESS');
  item.participants={...(item.participants??{}),seller:item.commit.seller};item.commitTransaction=result.hash;persist();
 }
}
async function reveal(item){
 if(item.kind==='unrevealed'||item.revealTransaction)return;
 const row=item.commit;const result=await tx(item,'reveal',row.who,'reveal_bid',[item.auctionId,BigInt(row.priceWei),row.terms,row.salt],0n,'SUCCESS');
 item.revealTransaction=result.hash;persist();
}
async function ensureReview(item){
 const offer=await read('get_offer',[item.auctionId,item.commit.seller]);
 if(offer.verdict==='REVIEWING'){item.reviewReservation=item.reviewReservation??'EXISTING_REVIEW_RESERVATION';persist();return;}
 if(offer.verdict==='COMPLIANT'||offer.verdict==='NONCOMPLIANT'||offer.verdict==='UNCERTAIN')return;
 if(offer.verdict==='REVEALED'){
  const result=await tx(item,'begin-review',item.commit.who,'begin_bid_review',[item.auctionId,item.commit.seller],0n,'SUCCESS');item.reviewReservation=result.hash;persist();
 }
}
const isConsensusDisagreement=(entry)=>entry?.observed==='FAILURE'&&Number(entry?.receipt?.status)===7&&Number(entry?.receipt?.result)===7&&String(entry?.receipt?.leaderExecution??'').toUpperCase()==='SUCCESS';
const lastMethodTransaction=(item,method)=>Object.values(item.transactionKeys??{}).map(key=>state.transactions[key]).filter(entry=>entry?.method===method).at(-1);
async function evaluate(item){
 const attempt=(item.evaluationAttempts??0)+1;if(attempt>6)throw Error('Bid review did not reach agreement after six finalized attempts');
 const key='evaluate-'+attempt;
 try{
  const result=await tx(item,key,item.commit.who,'evaluate_bid',[item.auctionId,item.commit.seller],0n,'SUCCESS');item.evaluation=result.hash;item.evaluationAttempts=attempt;item.nextRetryAt=0;item.bidVerdict=await read('get_offer',[item.auctionId,item.commit.seller]);persist();return true;
 }catch(error){
  const entry=state.transactions[item.transactionKeys[key]];
  if(!isConsensusDisagreement(entry))throw error;
  item.evaluationAttempts=attempt;item.nextRetryAt=Math.floor(Date.now()/1000)+30;item.notes.push({at:nowIso(),note:'Bid review finalized without successful consensus; retry '+attempt+' recorded',transaction:entry.hash});persist();return false;
 }
}
async function award(item){
 const result=await tx(item,'award',4,'finalize_award',[item.auctionId],0n,'SUCCESS');item.award=result.hash;item.awardState=await read('get_procurement',[item.auctionId]);persist();
}
const compliantText='Public artifact: Product A, Product B and Product C are described with the approved facts, every required component is included in the all-in price, and the text is bounded and public.';
const defectiveText='A partial draft is provided. Some approved facts and required components remain to be confirmed later, and excluded components may cost extra.';
const uncertainText='This public draft describes a possible artifact and references the approved facts, but the exact scope, required components and all-in pricing are intentionally left unresolved for buyer confirmation.';
async function submit(item,text){
 const result=await tx(item,'delivery-'+(item.deliveryCount??0),item.commit.who,'submit_delivery',[item.auctionId,text],0n,'SUCCESS');item.deliveryCount=(item.deliveryCount??0)+1;item.delivery=result.hash;persist();
}
async function dispute(item){const result=await tx(item,'dispute-'+(item.deliveryCount??0),0,'dispute_delivery',[item.auctionId],0n,'SUCCESS');item.dispute=result.hash;persist()}
async function beginDeliveryReview(item){
 const result=await tx(item,'delivery-review-begin-'+(item.deliveryCount??0),4,'begin_delivery_review',[item.auctionId],0n,'SUCCESS');item.deliveryReviewReservation=result.hash;persist();
}
async function reviewDelivery(item){
 const attempt=(item.deliveryReviewAttempts??0)+1;if(attempt>6)throw Error('Delivery review did not reach agreement after six finalized attempts');
 const key='delivery-review-'+(item.deliveryCount??0)+'-'+attempt;
 try{
  const result=await tx(item,key,4,'review_delivery',[item.auctionId],0n,'SUCCESS');item.deliveryReviewAttempts=attempt;item.nextRetryAt=0;item.deliveryVerdict=await read('get_delivery_verdict',[item.auctionId,item.deliveryCount]);item.lastDeliveryDecision=result.hash;item.deliveryState=await read('get_procurement',[item.auctionId]);persist();return item.deliveryState.status;
 }catch(error){
  const entry=state.transactions[item.transactionKeys[key]];
  if(!isConsensusDisagreement(entry))throw error;
  item.deliveryReviewAttempts=attempt;item.nextRetryAt=Math.floor(Date.now()/1000)+30;item.notes.push({at:nowIso(),note:'Delivery review finalized without successful consensus; retry '+attempt+' recorded',transaction:entry.hash});persist();return null;
 }
}
async function blockUnexpectedBidVerdict(item){
 const verdict=String(item.bidVerdict?.verdict??'UNKNOWN');
 item.status='BLOCKED';item.observed='BID_REVIEW_FAIL_CLOSED';
 item.notes.push({at:nowIso(),note:'Live bid review finalized without the COMPLIANT verdict required by this scenario; no award or downstream economic action was submitted.',verdict,transaction:item.evaluation??null});
 await markState(item,'after',false);persist();
}
async function expire(item){const result=await tx(item,'expire',4,'expire_delivery',[item.auctionId],0n,'SUCCESS');item.expire=result.hash;persist()}
async function accept(item){const result=await tx(item,'accept',0,'accept_delivery',[item.auctionId],0n,'SUCCESS');item.accept=result.hash;persist()}
async function expectedFailure(item,key,who,method,args=[],value=0n){return tx(item,key,who,method,args,value,'FAILURE')}
function deadlinePassed(row,field,extra=0){return Math.floor(Date.now()/1000)>=Number(row[field])+extra}
const hasReveal=(item)=>Boolean(item.revealTransaction||item.reveal);
async function progressUnrevealed(item){
 const row=await read('get_procurement',[item.auctionId]);
 if(!item.finalize&&deadlinePassed(row,'reveal_end')){await markState(item,'before',false);item.finalize=(await tx(item,'finalize',4,'finalize_award',[item.auctionId],0n,'SUCCESS')).hash;persist()}
 if(item.finalize&&!item.unauthorized){await expectedFailure(item,'unauthorized',1,'claim');item.unauthorized=true;persist()}
 if(item.finalize&&!item.buyerClaim){const result=await claim(item,0,'buyer-claim');item.buyerClaim=result?.hash??null;persist()}
 if(item.buyerClaim&&!item.duplicate){await expectedFailure(item,'duplicate',0,'claim');item.duplicate=true;await setTerminal(item,'PASS','NO_AWARD_BOND_FORFEITURE_AND_SINGLE_USE_CLAIM');}
}
async function progressNoAward(item){
 const row=await read('get_procurement',[item.auctionId]);
 if(!hasReveal(item)&&deadlinePassed(row,'commit_end'))await reveal(item);
 if(!item.reviewReservation&&hasReveal(item)&&deadlinePassed(row,'reveal_end'))await ensureReview(item);
 if(!item.evaluation&&item.reviewReservation&&deadlinePassed(row,'reveal_end'))await evaluate(item);
 if(item.evaluation&&item.bidVerdict?.verdict==='COMPLIANT')return blockUnexpectedBidVerdict(item);
 if(item.evaluation&&!item.finalize){const result=await tx(item,'finalize',4,'finalize_award',[item.auctionId],0n,'SUCCESS');item.finalize=result.hash;item.finalizeState=await read('get_procurement',[item.auctionId]);persist()}
 if(item.finalize&&!item.buyerClaim){const result=await claim(item,0,'buyer-claim');item.buyerClaim=result?.hash??null;persist()}
 if(item.buyerClaim)await setTerminal(item,'PASS','NO_COMPLIANT_OFFER_BUYER_REFUND');
}
async function progressDeliveryDefault(item){
 const row=await read('get_procurement',[item.auctionId]);
 if(!hasReveal(item)&&deadlinePassed(row,'commit_end')){await reveal(item)}
 if(!item.reviewReservation&&hasReveal(item)&&deadlinePassed(row,'reveal_end'))await ensureReview(item);
 if(!item.evaluation&&item.reviewReservation&&deadlinePassed(row,'reveal_end'))await evaluate(item);
 if(!item.award&&item.evaluation&&item.bidVerdict?.verdict==='COMPLIANT')await award(item);
 if(item.award&&!item.delivery&&deadlinePassed(item.awardState,'delivery_due'))await expire(item);
 if(item.expire&&!item.buyerClaim){const result=await claim(item,0,'buyer-claim');item.buyerClaim=result?.hash??null;persist()}
 if(item.buyerClaim)await setTerminal(item,'PASS','SELLER_DELIVERY_DEFAULT_BUYER_RECOVERY');
}
async function progressBuyerPass(item){
 const row=await read('get_procurement',[item.auctionId]);
 if(!hasReveal(item)&&deadlinePassed(row,'commit_end'))await reveal(item);
 if(!item.reviewReservation&&hasReveal(item)&&deadlinePassed(row,'reveal_end'))await ensureReview(item);
 if(!item.evaluation&&item.reviewReservation&&deadlinePassed(row,'reveal_end'))await evaluate(item);
 if(!item.award&&item.evaluation&&item.bidVerdict?.verdict==='COMPLIANT')await award(item);
 if(item.award&&!item.delivery)await submit(item,compliantText);
 if(item.delivery&&!item.dispute)await dispute(item);
 if(item.dispute&&!item.deliveryReviewReservation)await beginDeliveryReview(item);
 if(item.deliveryReviewReservation&&!item.lastDeliveryDecision){const decision=await reviewDelivery(item);if(decision==='SETTLED')item.pass=true}
 if(item.pass&&!item.sellerClaim){const result=await claim(item,item.commit.who,'seller-claim');item.sellerClaim=result?.hash??null;persist()}
 if(item.pass&&!item.buyerClaim){const result=await claim(item,0,'buyer-claim');item.buyerClaim=result?.hash??null;persist()}
 if(item.sellerClaim&&item.buyerClaim)await setTerminal(item,'PASS','BUYER_REFUSAL_INDEPENDENT_PASS_SELLER_PAYMENT');
}
async function progressCorrectionDefault(item){
 const row=await read('get_procurement',[item.auctionId]);
 if(!hasReveal(item)&&deadlinePassed(row,'commit_end'))await reveal(item);
 if(!item.reviewReservation&&hasReveal(item)&&deadlinePassed(row,'reveal_end'))await ensureReview(item);
 if(!item.evaluation&&item.reviewReservation&&deadlinePassed(row,'reveal_end'))await evaluate(item);
 if(!item.award&&item.evaluation&&item.bidVerdict?.verdict==='COMPLIANT')await award(item);
 if(item.award&&!item.delivery)await submit(item,defectiveText);
 if(item.delivery&&!item.dispute)await dispute(item);
 if(item.dispute&&!item.deliveryReviewReservation)await beginDeliveryReview(item);
 if(item.deliveryReviewReservation&&!item.lastDeliveryDecision){
  const decision=await reviewDelivery(item);
  if(item.deliveryState?.status==='DEFAULTED'){item.defaulted=true}
  else if(item.deliveryState?.status==='CORRECTION')item.correction=true;
 }
 if(item.correction&&!item.defaulted&&item.deliveryCount<3){item.dispute=null;item.deliveryReviewReservation=null;item.lastDeliveryDecision=null;item.correction=false;await submit(item,defectiveText)}
 if(item.defaulted&&!item.buyerClaim){const result=await claim(item,0,'buyer-claim');item.buyerClaim=result?.hash??null;persist()}
 if(item.buyerClaim)await setTerminal(item,'PASS','TWO_CORRECTIONS_FAIL_SELLER_DEFAULT');
}
async function progressUncertain(item){
 const row=await read('get_procurement',[item.auctionId]);
 if(!hasReveal(item)&&deadlinePassed(row,'commit_end'))await reveal(item);
 if(!item.reviewReservation&&hasReveal(item)&&deadlinePassed(row,'reveal_end'))await ensureReview(item);
 if(!item.evaluation&&item.reviewReservation&&deadlinePassed(row,'reveal_end'))await evaluate(item);
 if(!item.award&&item.evaluation&&item.bidVerdict?.verdict==='COMPLIANT')await award(item);
 if(item.award&&!item.delivery)await submit(item,uncertainText);
 if(item.delivery&&!item.dispute)await dispute(item);
 if(item.dispute&&!item.deliveryReviewReservation)await beginDeliveryReview(item);
 if(item.deliveryReviewReservation&&!item.lastDeliveryDecision){
  await reviewDelivery(item);
  const rowAfter=item.deliveryState??await read('get_procurement',[item.auctionId]);
  if(rowAfter.status==='UNWOUND')item.unwound=true;
  else {item.notes.push({at:nowIso(),note:'Live validator outcome was not UNKNOWN; neutral-unwind path was not reproduced.'});item.fallback=true}
 }
 if(item.fallback&&!item.cleanup&&deadlinePassed(await read('get_procurement',[item.auctionId]),'delivery_due')){await expire(item);item.cleanup=true}
 if(item.unwound&&!item.buyerClaim){const result=await claim(item,0,'buyer-claim');item.buyerClaim=result?.hash??null;persist()}
 if(item.unwound&&!item.sellerClaim){const result=await claim(item,item.commit.who,'seller-claim');item.sellerClaim=result?.hash??null;persist()}
 if(item.buyerClaim&&item.sellerClaim)await setTerminal(item,'PASS','UNCERTAIN_DELIVERY_NEUTRAL_UNWIND');
 if(item.cleanup&&item.fallback)await setTerminal(item,'BLOCKED','LIVE_PROVIDER_DID_NOT_RETURN_UNKNOWN_NEUTRAL_UNWIND');
}
async function progressReservedTimely(item){
 const row=await read('get_procurement',[item.auctionId]);
 if(!hasReveal(item)&&deadlinePassed(row,'commit_end'))await reveal(item);
 if(!item.reviewReservation&&hasReveal(item)&&deadlinePassed(row,'reveal_end'))await ensureReview(item);
 if(!item.evaluation&&item.reviewReservation&&deadlinePassed(row,'review_end',5))await evaluate(item);
 if(!item.award&&item.evaluation&&item.bidVerdict?.verdict==='COMPLIANT')await award(item);
 if(item.award&&!item.delivery)await submit(item,compliantText);
 if(item.delivery&&!item.accept)await accept(item);
 if(item.accept&&!item.sellerClaim){const result=await claim(item,item.commit.who,'seller-claim');item.sellerClaim=result?.hash??null;persist()}
 if(item.accept&&!item.buyerClaim){const result=await claim(item,0,'buyer-claim');item.buyerClaim=result?.hash??null;persist()}
 if(item.sellerClaim&&item.buyerClaim)await setTerminal(item,'PASS','TIMELY_RESERVED_REVIEW_FINALIZED_AFTER_ORDINARY_DEADLINE');
}
async function progressReservedStale(item){
 const row=await read('get_procurement',[item.auctionId]);
 if(!hasReveal(item)&&deadlinePassed(row,'commit_end'))await reveal(item);
 if(!item.reviewReservation&&hasReveal(item)&&deadlinePassed(row,'reveal_end'))await ensureReview(item);
 if(!item.cancel&&item.reviewReservation&&deadlinePassed(row,'review_end',REVIEW_GRACE+5)){
  await markState(item,'before',false);const result=await tx(item,'cancel',4,'cancel_bid_review',[item.auctionId,item.commit.seller],0n,'SUCCESS');item.cancel=result.hash;persist()
 }
 if(item.cancel&&!item.finalize){const result=await tx(item,'finalize',4,'finalize_award',[item.auctionId],0n,'SUCCESS');item.finalize=result.hash;persist()}
 if(item.finalize&&!item.buyerClaim){const result=await claim(item,0,'buyer-claim');item.buyerClaim=result?.hash??null;persist()}
 if(item.buyerClaim&&!item.sellerClaim){const result=await claim(item,item.commit.who,'seller-claim');item.sellerClaim=result?.hash??null;persist()}
 if(item.buyerClaim&&item.sellerClaim)await setTerminal(item,'PASS','STALE_RESERVED_REVIEW_CANCELLED_AFTER_GRACE_NO_AWARD');
}
async function recoverMissedReview(item){
 if(item.cleanup||item.reviewReservation||!['correction-default','uncertain'].includes(item.kind)||item.status!=='BLOCKED')return;
 const row=await read('get_procurement',[item.auctionId]);
 if(!item.finalize){
  if(row.status!=='BIDDING'||!deadlinePassed(row,'review_end'))return;
  item.notes.push({at:nowIso(),note:'The intended review window was missed by the live scheduler. Recovering the auction through the contract no-award path; this does not count as the intended delivery scenario.'});
  await markState(item,'before',false);
  const result=await tx(item,'cleanup-finalize',4,'finalize_award',[item.auctionId],0n,'SUCCESS');item.finalize=result.hash;persist();
 }
 if(!item.buyerClaim){const claimResult=await claim(item,0,'cleanup-buyer-claim');item.buyerClaim=claimResult?.hash??null;persist()}
 const sellerCredit=BigInt(await read('get_credit',[addresses[item.commit.who]]));
 if(!item.sellerClaim&&sellerCredit>0n){const claimResult=await claim(item,item.commit.who,'cleanup-seller-claim');item.sellerClaim=claimResult?.hash??null;persist()}
 // An unrevealed commitment forfeits its bond to the buyer, so the seller
 // has no claim to consume. A revealed no-award offer must have its bond
 // claim resolved before cleanup is marked complete.
 const sellerResolved=Boolean(item.sellerClaim)||sellerCredit===0n;
 if(item.buyerClaim&&sellerResolved){item.cleanup=true;await setTerminal(item,'BLOCKED','MISSED_REVIEW_WINDOW_RECOVERED_NO_AWARD')}
}
async function progress(item){
 if(item.status!=='IN_PROGRESS'&&item.status!=='RUNNING')return;
 if(item.kind!=='unrevealed'&&hasReveal(item)&&!item.reviewReservation&&deadlinePassed(item.deadlines,'review_end')){
  item.status='BLOCKED';item.notes.push({at:nowIso(),note:'Review reservation was not made before the ordinary cutoff; no late reservation or financial retry was submitted.'});persist();return;
 }
 item.status='RUNNING';persist();
 if(item.kind==='unrevealed')return progressUnrevealed(item);
 if(item.kind==='no-award')return progressNoAward(item);
 if(item.evaluation&&item.bidVerdict&&item.bidVerdict.verdict!=='COMPLIANT')return blockUnexpectedBidVerdict(item);
 if(item.kind==='delivery-default')return progressDeliveryDefault(item);
 if(item.kind==='buyer-pass')return progressBuyerPass(item);
 if(item.kind==='correction-default')return progressCorrectionDefault(item);
 if(item.kind==='uncertain')return progressUncertain(item);
 if(item.kind==='reserved-timely')return progressReservedTimely(item);
 if(item.kind==='reserved-stale')return progressReservedStale(item);
 throw Error('No progress handler for '+item.kind);
}
function reviveConsensusDisagreements(){
 let changed=false;
 for(const item of Object.values(state.scenarios)){
  if(item.status!=='BLOCKED')continue;
  const bidFailure=lastMethodTransaction(item,'evaluate_bid');
  const deliveryFailure=lastMethodTransaction(item,'review_delivery');
  if(!item.evaluation&&item.reviewReservation&&isConsensusDisagreement(bidFailure)){
   item.status='IN_PROGRESS';item.evaluationAttempts=1;item.nextRetryAt=Math.floor(Date.now()/1000);item.notes.push({at:nowIso(),note:'Resumed after a recorded MAJORITY_DISAGREE bid review; no economic transition occurred.'});changed=true;
  }else if(!item.lastDeliveryDecision&&item.deliveryReviewReservation&&isConsensusDisagreement(deliveryFailure)){
   item.status='IN_PROGRESS';item.deliveryReviewAttempts=1;item.nextRetryAt=Math.floor(Date.now()/1000);item.notes.push({at:nowIso(),note:'Resumed after a recorded MAJORITY_DISAGREE delivery review; no economic transition occurred.'});changed=true;
  }
 }
 if(changed)persist();
}
const specs=[
 {name:'unrevealed-bond',kind:'unrevealed',title:'Live negative unrevealed bond',expected:'No award; unrevealed seller bond forfeited; buyer refund; unauthorized and duplicate claims fail',who:1,price:1n,terms:'The all-in offer is committed but intentionally not revealed.'},
 {name:'delivery-default',kind:'delivery-default',title:'Live negative delivery default',expected:'Compliant award followed by seller delivery expiry and buyer recovery',who:2,price:2n,terms:'All four frozen obligations are included in the all-in 2 GEN offer.'},
 {name:'buyer-refusal-pass',kind:'buyer-pass',title:'Live negative buyer refusal pass',expected:'Buyer dispute followed by independent PASS and seller payment',who:3,price:2n,terms:'All four frozen obligations are included in the all-in 2 GEN offer.'},
 {name:'correction-default',kind:'correction-default',title:'Live negative correction exhaustion',expected:'Three material failures produce seller default and buyer recovery',who:4,price:2n,terms:'All four frozen obligations are included in the all-in 2 GEN offer.'},
 {name:'uncertain-unwind',kind:'uncertain',title:'Live negative uncertain delivery',expected:'Independent UNKNOWN fulfillment decision produces neutral unwind',who:1,price:2n,terms:'All four frozen obligations are included in the all-in 2 GEN offer.'},
 {name:'reserved-timely',kind:'reserved-timely',title:'Live negative timely reserved review',expected:'Review reserved before cutoff finalizes after ordinary deadline without expiry',who:2,price:2n,terms:'All four frozen obligations are included in the all-in 2 GEN offer.'},
 {name:'reserved-stale',kind:'reserved-stale',title:'Live negative stale reserved review',expected:'Unresolved review cancels only after grace, then no-award credits settle',who:3,price:2n,terms:'All four frozen obligations are included in the all-in 2 GEN offer.'},
 {name:'delivery-default-retry',kind:'delivery-default',title:'Live negative delivery default retry batch',expected:'Compliant award followed by seller delivery expiry and buyer recovery',who:2,price:2n,terms:'All four frozen obligations are included in the all-in 2 GEN offer.'},
 {name:'buyer-refusal-pass-retry',kind:'buyer-pass',title:'Live negative buyer refusal pass retry batch',expected:'Buyer dispute followed by independent PASS and seller payment',who:3,price:2n,terms:'All four frozen obligations are included in the all-in 2 GEN offer.'},
 {name:'correction-default-retry',kind:'correction-default',title:'Live negative correction exhaustion retry batch',expected:'Three material failures produce seller default and buyer recovery',who:4,price:2n,terms:'All four frozen obligations are included in the all-in 2 GEN offer.'},
 {name:'uncertain-unwind-retry',kind:'uncertain',title:'Live negative uncertain delivery retry batch',expected:'Independent UNKNOWN fulfillment decision produces neutral unwind',who:1,price:2n,terms:'All four frozen obligations are included in the all-in 2 GEN offer.'},
 {name:'reserved-timely-retry',kind:'reserved-timely',title:'Live negative timely reserved review retry batch',expected:'Review reserved before cutoff finalizes after ordinary deadline without expiry',who:2,price:2n,terms:'All four frozen obligations are included in the all-in 2 GEN offer.'},
 {name:'reserved-stale-retry',kind:'reserved-stale',title:'Live negative stale reserved review retry batch',expected:'Unresolved review cancels only after grace, then no-award credits settle',who:3,price:2n,terms:'All four frozen obligations are included in the all-in 2 GEN offer.'},
 {name:'no-compliant-refund',kind:'no-award',title:'Live negative no compliant offer refund',expected:'Non-compliant offer is rejected and buyer receives a full budget refund',who:1,price:2n,terms:nonCompliantTerms},
 {name:'delivery-default-compliant',kind:'delivery-default',title:'Live negative compliant seller delivery default',expected:'Compliant seller wins, misses delivery, and buyer recovers the reserved price and bond',who:2,price:2n,terms:compliantTerms},
 {name:'buyer-refusal-pass-compliant',kind:'buyer-pass',title:'Live negative buyer refusal independent pass',expected:'Buyer dispute is followed by independent PASS and seller payment',who:3,price:2n,terms:compliantTerms},
 {name:'correction-default-compliant',kind:'correction-default',title:'Live negative correction exhaustion compliant seller',expected:'Two correction opportunities fail and seller defaults with buyer recovery',who:4,price:2n,terms:compliantTerms},
 {name:'uncertain-unwind-compliant',kind:'uncertain',title:'Live negative uncertain delivery neutral unwind',expected:'Uncertain delivery produces a neutral unwind',who:1,price:2n,terms:compliantTerms},
 {name:'reserved-timely-compliant',kind:'reserved-timely',title:'Live negative timely reserved compliant review',expected:'Reserved review survives the ordinary deadline and successful delivery settles',who:2,price:2n,terms:compliantTerms},
 {name:'reserved-stale-compliant',kind:'reserved-stale',title:'Live negative stale reserved compliant review',expected:'Stale unresolved review cancels only after grace and neutral recovery settles',who:3,price:2n,terms:compliantTerms},
 {name:'correction-default-compliant-live2',kind:'correction-default',title:'Live negative correction exhaustion second batch',expected:'Two correction opportunities fail and seller defaults with buyer recovery',who:4,price:2n,terms:compliantTerms},
 {name:'uncertain-unwind-compliant-live2',kind:'uncertain',title:'Live negative uncertain delivery second batch',expected:'Uncertain delivery produces a neutral unwind',who:1,price:2n,terms:compliantTerms},
];
async function start(){
 if(!state.startedAt)state.startedAt=nowIso();
 for(const spec of specs){
  const item=ensureScenario(spec.name,spec.kind,spec.expected,{seller:addresses[spec.who],wallet:names[spec.who]});
  item.title=spec.title;item.specWho=spec.who;item.specPrice=String(spec.price);item.specTerms=spec.terms;
  if(!item.auctionId)await createAuction(item);
  if(!item.commit)await commit(item,spec.who,spec.price,spec.terms);
  persist();
 }
 console.log('Started',specs.length,'CLI negative scenarios. Run `run` to progress by on-chain deadlines.');
}
async function status(){
 for(const item of Object.values(state.scenarios)){
  if(item.auctionId){const row=await tryRead('get_procurement',[item.auctionId]);console.log(JSON.stringify({name:item.name,auctionId:item.auctionId,status:item.status,live:row?.status,deadlines:row?{commit_end:row.commit_end,reveal_end:row.reveal_end,review_end:row.review_end,delivery_due:row.delivery_due,response_due:row.response_due,delivery_review_end:row.delivery_review_end}:null,observed:item.observed??null,transactions:Object.values(item.transactionKeys??{}).map(k=>state.transactions[k]?.hash).filter(Boolean)}))}
 }
 console.log(JSON.stringify({updatedAt:state.updatedAt,errors:state.errors},null,2));
}
function nextWakeSeconds(item){
 const now=Math.floor(Date.now()/1000);const row=item.deadlines??{};
 const until=(timestamp,extra=0)=>Math.max(1,Number(timestamp||0)+extra-now+1);
 if(Number(item.nextRetryAt||0)>now)return until(item.nextRetryAt);
 if(item.kind==='unrevealed'){
  if(!item.finalize)return until(row.reveal_end);
  if(!item.unauthorized||!item.buyerClaim||!item.duplicate)return 1;
  return 1;
 }
 if(!hasReveal(item))return until(row.commit_end);
 if(!item.reviewReservation)return until(row.reveal_end);
 if(!item.evaluation){
  if(item.kind==='reserved-timely')return until(row.review_end,5);
  if(item.kind==='reserved-stale')return until(row.review_end,REVIEW_GRACE+5);
  return 1;
 }
 if(!item.award&&item.bidVerdict?.verdict==='COMPLIANT')return 1;
 if(item.kind==='delivery-default'){
  if(!item.expire)return until(item.awardState?.delivery_due);
  return 1;
 }
 if(item.kind==='buyer-pass'||item.kind==='correction-default'||item.kind==='uncertain')return 1;
 if(item.kind==='reserved-timely'){
  if(!item.award)return 1;
  return item.accept?1:until(row.review_end,5);
 }
 if(item.kind==='reserved-stale'){
  if(!item.cancel)return until(row.review_end,REVIEW_GRACE+5);
  return 1;
 }
 return 30;
}
async function run(){
 if(!state.startedAt||Object.keys(state.scenarios).length<specs.length)await start();
 reviveConsensusDisagreements();
 for(const item of Object.values(state.scenarios)){
  try{await recoverMissedReview(item)}catch(error){recordError(item,String(error));console.log('RECOVERY BLOCKED',item.name,String(error))}
 }
 while(Object.values(state.scenarios).some(item=>item.status==='IN_PROGRESS'||item.status==='RUNNING')){
  let progressMade=false;
  const active=Object.values(state.scenarios).filter(item=>item.status==='IN_PROGRESS'||item.status==='RUNNING').sort((left,right)=>{
   // Reserve newly due reviews before spending the provider window on an
   // older disagreement retry. Missing this write would permanently lose the
   // reservation opportunity even though the scenario itself is still live.
   const urgency=(item)=>{
    const row=item.deadlines??{};
    if(item.kind!=='unrevealed'&&hasReveal(item)&&!item.reviewReservation&&deadlinePassed(row,'reveal_end'))return 0;
    if(item.reviewReservation&&!item.evaluation&&deadlinePassed(row,'review_end'))return 1;
    return 2;
   };
   return urgency(left)-urgency(right)||nextWakeSeconds(left)-nextWakeSeconds(right);
  });
  for(const item of active){
   try{const before=item.status;await progress(item);progressMade=progressMade||before!==item.status||Boolean(item.updatedAt)}
   catch(error){item.status='BLOCKED';recordError(item,String(error));console.log('BLOCKED',item.name,String(error))}
  }
  persist();
  if(Object.values(state.scenarios).every(item=>item.status!=='IN_PROGRESS'&&item.status!=='RUNNING'))break;
   if(!progressMade){
    const active=Object.values(state.scenarios).filter(item=>item.status==='IN_PROGRESS'||item.status==='RUNNING');
    const delay=Math.min(300,Math.max(5,Math.min(...active.map(nextWakeSeconds))));
    console.log('Waiting for real Studionet deadlines; next check in '+delay+' seconds.');await sleep(delay*1000)
   }
 }
 console.log('Negative runner reached terminal states.');
}

const command=process.argv[2]??'status';
if(command==='start')await start();
else if(command==='run'||command==='resume')await run();
else if(command==='status')await status();
else throw Error('Use start, run, resume, or status');

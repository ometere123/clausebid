#!/usr/bin/env node
/**
 * Build a publishable, deployment-scoped archive from the current contract.
 * The input session files may contain salts, so this script deliberately
 * copies only hashes, public state, receipts, messages and balance readbacks.
 * It never submits a transaction and never retries a value transfer.
 */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';

const ADDRESS=process.env.CLAUSEBID_CONTRACT_ADDRESS?.trim();
if(!ADDRESS||!/^0x[0-9a-fA-F]{40}$/.test(ADDRESS))throw Error('Set CLAUSEBID_CONTRACT_ADDRESS');
const OUTPUT=process.env.CLAUSEBID_ARCHIVE_OUTPUT??'evidence/studionet/live-demo-configurable.json';
const AUCTION_ID=Number(process.env.CLAUSEBID_LIFECYCLE_AUCTION_ID??9);
const files=(process.env.CLAUSEBID_EVIDENCE_FILES??'evidence/session.configurable.min2.local.json,evidence/studionet/live-negative-configurable-batch1.json,evidence/live-negative-configurable-batch1.local.json,evidence/live-negative-configurable-batch2.local.json,evidence/studionet/live-negative-configurable-batch2.json')
 .split(',').map(value=>value.trim()).filter(Boolean);
const client=createClient({chain:studionet});
const read=(functionName,args=[])=>client.readContract({address:ADDRESS,functionName,args});
const json=(value)=>JSON.stringify(value,(_,item)=>typeof item==='bigint'?item.toString():item);
const address=(value)=>String(value??'').toLowerCase();
const txHashes=new Set();
const txMeta=new Map();
function collect(value){
 if(!value)return;
 if(Array.isArray(value)){for(const item of value)collect(item);return}
 if(typeof value!=='object')return;
 if(String(value.method??'')==='claim'&&value.hash) {txHashes.add(String(value.hash));txMeta.set(String(value.hash),value)}
 if(value.transactions&&typeof value.transactions==='object')collect(Object.values(value.transactions));
 if(value.history)collect(value.history);
 if(value.scenarios)collect(Object.values(value.scenarios));
 if(value.transactions&&Array.isArray(value.transactions))collect(value.transactions);
}
for(const file of files){if(fs.existsSync(file)){try{collect(JSON.parse(fs.readFileSync(file,'utf8')))}catch{}}}
async function receiptFor(hash){
 try{return await client.waitForTransactionReceipt({hash,status:'FINALIZED',interval:1000,retries:1})}
 catch{return txMeta.get(hash)?.receipt??null}
}
async function transactionFor(hash){
 try{return await client.getTransaction({hash})}catch{return txMeta.get(hash)?.receipt??null}
}
function leaderExecution(receipt){
 const leader=Array.isArray(receipt?.consensus_data?.leader_receipt)?receipt.consensus_data.leader_receipt.find(x=>x?.mode==='leader'):undefined;
 return String(leader?.execution_result??receipt?.leaderExecution??receipt?.txExecutionResultName??receipt?.executionStatus??'UNKNOWN');
}
function messagesOf(transaction){return Array.isArray(transaction?.messages)?transaction.messages.map(message=>({
 messageType:message?.messageType??null,recipient:message?.recipient??message?.to??null,
 valueWei:String(message?.valueWei??message?.value??''),onAcceptance:message?.onAcceptance??null,
 saltNonce:message?.saltNonce??null,
})):[]}
const sourceSha256=createHash('sha256').update(fs.readFileSync('contracts/clausebid.py')).digest('hex');
const economy=await read('get_economy');
const count=Number(economy.claims??0);
const claims=[];
const usedClaimTransactions=new Set();
for(let index=0;index<count;index++){
 const record=await read('get_claim',[index]);
 const beneficiary=String(record.beneficiary);
 const amountWei=String(record.amount);
 let matched=null;
 for(const hash of txHashes){
  if(matched||usedClaimTransactions.has(hash))continue;
  const transaction=txMeta.get(hash)?.receipt??await transactionFor(hash);
  const messages=messagesOf(transaction);
  if(messages.some(message=>address(message.recipient)===address(beneficiary)&&message.valueWei===amountWei)){
   matched={hash,transaction,messages};
   usedClaimTransactions.add(hash);
  }
 }
 const receipt=matched?await receiptFor(matched.hash):null;
 claims.push({index,beneficiary,amountWei,status:String(record.status),transaction:matched?.hash??null,
   receipt:receipt?{chainId:61999,contract:ADDRESS,status:receipt.status??null,result:receipt.result??null,leaderExecution:leaderExecution(receipt)}:null,
   messages:matched?.messages??[],
   recipientBalanceAfterWei:String(await client.getBalance({address:beneficiary})),
   balanceEvidence:'POST_READBACK_ONLY',
   externalSettlement:'DISPATCHED_PENDING_EXTERNAL_SETTLEMENT'});
}
const procurement=await read('get_procurement',[AUCTION_ID]);
const lifecycleComplete=['SETTLED','NO_AWARD','DEFAULTED','UNWOUND'].includes(String(procurement.status));
const offers=[];
for(let position=0;position<Number(procurement.bidder_count);position++){
 const seller=await read('get_seller',[AUCTION_ID,position]);
 offers.push({position,seller,offer:await read('get_offer',[AUCTION_ID,seller])});
}
const lifecycleTransactions=[];
for(const file of files){
 if(!file.includes('session'))continue;
 try{const value=JSON.parse(fs.readFileSync(file,'utf8'));for(const item of value.history??[]){
  if(item.hash)lifecycleTransactions.push({method:item.method,hash:item.hash,wallet:item.wallet,submittedAt:item.submittedAt,state:item.state});
 }}catch{}
}
const recipientBalancesAfterWeiByBeneficiary={};
for(const claim of claims)recipientBalancesAfterWeiByBeneficiary[address(claim.beneficiary)]=claim.recipientBalanceAfterWei;
const matchedClaimTransactions=claims.map(claim=>claim.transaction).filter(Boolean);
const output={network:'studionet',chainId:61999,contract:ADDRESS,sourceSha256,
 generatedAt:new Date().toISOString(),status:lifecycleComplete?'COMPLETE':'IN_PROGRESS',auctionId:AUCTION_ID,
 lifecycle:{procurement,offers,transactions:lifecycleTransactions},
 transactions:{claims:claims.map(claim=>({index:claim.index,beneficiary:claim.beneficiary,amountWei:claim.amountWei,transaction:claim.transaction,status:claim.status})),claimReceiptSummaries:claims.filter(claim=>claim.transaction&&claim.receipt).map(claim=>({transaction:claim.transaction,...claim.receipt,...(claim.messages[0]?{messageType:claim.messages[0].messageType,recipient:claim.messages[0].recipient,valueWei:claim.messages[0].valueWei,onAcceptance:claim.messages[0].onAcceptance}: {})})),claimDetails:claims},
 claimMapping:{totalClaimRecords:claims.length,matchedClaims:matchedClaimTransactions.length,uniqueParentTransactions:new Set(matchedClaimTransactions).size,unmatchedClaimIndices:claims.filter(claim=>!claim.transaction).map(claim=>claim.index)},
 settlement:{claims:claims.length,dispatchedWei:String(economy.dispatched_wei),outstandingWei:String(economy.outstanding_wei),contractBalanceWei:String(economy.contract_balance_wei),recipientBalancesAfterWeiByBeneficiary,childAcceptance:'UNAVAILABLE',ambiguousTransferRetried:false},
 finalState:{economy,procurement,offers},
 note:'All transaction mappings require the current chain, contract, beneficiary and amount. Recipient balances are post-claim readbacks only; the pinned SDK did not expose child acceptance.'};
fs.mkdirSync(path.dirname(OUTPUT),{recursive:true});fs.writeFileSync(OUTPUT,json(output)+'\n');
console.log(JSON.stringify({output,contract:ADDRESS,claimCount:claims.length,matchedClaims:claims.filter(claim=>claim.transaction).length},null,2));

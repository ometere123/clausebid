import replacementRun from '../../../evidence/studionet/live-demo-replacement.json';
import historicalRun from '../../../evidence/studionet/live-demo.json';

export type DeploymentIdentity={
  network:string;
  chainId:number;
  contract:string;
  auctionId:number;
  label:'current'|'historical';
};

export type ArchivedClaimEvidence={
  claimIndex:number;
  identity:string;
  deployment:DeploymentIdentity;
  beneficiary:string;
  amountWei:string;
  parentTransaction:string;
  parentReceipt:{
    chainId:number;
    contract:string;
    status:number;
    result:number;
    leaderExecution:string;
    messageType:string;
    recipient:string;
    valueWei:string;
    onAcceptance:boolean;
  }|null;
  recipientBalanceAfterWei:string|null;
  balanceEvidence:'POST_READBACK_ONLY'|'UNAVAILABLE';
  externalSettlement:'DISPATCHED_PENDING_EXTERNAL_SETTLEMENT';
  sourcePath:string;
};

export type ContractClaimLike={beneficiary:string;amount:unknown;status?:string};
export type EvidenceDeployment={chainId:number;contract:string;auctionId:number};

const normalizeAddress=(value:unknown)=>String(value??'').toLowerCase();
const amount=(value:unknown)=>String(value??'');
const identity=(chainId:number,contract:string,beneficiary:string,amountWei:string)=>
  `${chainId}:${normalizeAddress(contract)}:${normalizeAddress(beneficiary)}:${amountWei}`;

export const CURRENT_DEPLOYMENT:DeploymentIdentity={
  network:replacementRun.network,
  chainId:replacementRun.chainId,
  contract:replacementRun.contract,
  auctionId:replacementRun.auctionId,
  label:'current',
};
export const HISTORICAL_DEPLOYMENT:DeploymentIdentity={
  network:historicalRun.network,
  chainId:historicalRun.chainId,
  contract:historicalRun.contract,
  auctionId:historicalRun.auctionId,
  label:'historical',
};

type ReplacementClaim=typeof replacementRun.transactions.claims[number];
type ReplacementReceipt=typeof replacementRun.transactions.claimReceiptSummaries[number];
const receiptByHash=new Map<string,ReplacementReceipt>(replacementRun.transactions.claimReceiptSummaries.map(x=>[x.transaction.toLowerCase(),x]));
const balanceByBeneficiary=new Map<string,string>(Object.entries(replacementRun.settlement.recipientBalancesAfterWeiByBeneficiary).map(([k,v])=>[k.toLowerCase(),String(v)]));

const makeCurrentClaim=(claim:ReplacementClaim,claimIndex:number):ArchivedClaimEvidence=>{
  const receipt=receiptByHash.get(claim.transaction.toLowerCase());
  const verifiedReceipt=receipt&&
    receipt.chainId===CURRENT_DEPLOYMENT.chainId&&
    normalizeAddress(receipt.contract)===normalizeAddress(CURRENT_DEPLOYMENT.contract)&&
    normalizeAddress(receipt.recipient)===normalizeAddress(claim.beneficiary)&&
    String(receipt.valueWei)===String(claim.amountWei)&&
    receipt.status===7&&receipt.result===6&&receipt.leaderExecution==='SUCCESS'
      ? {chainId:receipt.chainId,contract:receipt.contract,status:receipt.status,result:receipt.result,leaderExecution:receipt.leaderExecution,messageType:receipt.messageType,recipient:receipt.recipient,valueWei:receipt.valueWei,onAcceptance:receipt.onAcceptance}
      : null;
  return {
    claimIndex,
    identity:identity(CURRENT_DEPLOYMENT.chainId,CURRENT_DEPLOYMENT.contract,claim.beneficiary,claim.amountWei),
    deployment:CURRENT_DEPLOYMENT,
    beneficiary:claim.beneficiary,
    amountWei:claim.amountWei,
    parentTransaction:claim.transaction,
    parentReceipt:verifiedReceipt,
    recipientBalanceAfterWei:balanceByBeneficiary.get(normalizeAddress(claim.beneficiary))??null,
    balanceEvidence:balanceByBeneficiary.has(normalizeAddress(claim.beneficiary))?'POST_READBACK_ONLY':'UNAVAILABLE',
    externalSettlement:'DISPATCHED_PENDING_EXTERNAL_SETTLEMENT',
    sourcePath:'evidence/studionet/live-demo-replacement.json',
  };
};

const historicalClaims=Array.isArray(historicalRun.transactions.claims)?historicalRun.transactions.claims:[];
export const CURRENT_CLAIMS:ArchivedClaimEvidence[]=replacementRun.transactions.claims.map((claim,claimIndex)=>makeCurrentClaim(claim,claimIndex));
export const HISTORICAL_CLAIMS:ArchivedClaimEvidence[]=historicalClaims.map((claim:any,claimIndex)=>({
  claimIndex,
  identity:identity(HISTORICAL_DEPLOYMENT.chainId,HISTORICAL_DEPLOYMENT.contract,claim.beneficiary,claim.amountWei),
  deployment:HISTORICAL_DEPLOYMENT,
  beneficiary:claim.beneficiary,
  amountWei:String(claim.amountWei),
  parentTransaction:String(claim.transaction),
  parentReceipt:null,
  recipientBalanceAfterWei:null,
  balanceEvidence:'UNAVAILABLE',
  externalSettlement:'DISPATCHED_PENDING_EXTERNAL_SETTLEMENT',
  sourcePath:'evidence/studionet/live-demo.json',
}));

/**
 * Match a contract claim to evidence only inside the explicitly selected
 * deployment archive. Deployment, beneficiary and amount are always required;
 * the optional record index is only a secondary guard for a specific rendered
 * immutable record and is never used on its own.
 */
export function matchArchivedClaim(claim:ContractClaimLike,deployment:EvidenceDeployment,archive:ArchivedClaimEvidence[]=CURRENT_CLAIMS,claimIndex?:number):ArchivedClaimEvidence|null{
  if(deployment.chainId!==CURRENT_DEPLOYMENT.chainId||normalizeAddress(deployment.contract)!==normalizeAddress(CURRENT_DEPLOYMENT.contract))return null;
  const key=identity(deployment.chainId,deployment.contract,claim.beneficiary,amount(claim.amount));
  return archive.find(item=>item.deployment.label==='current'&&(claimIndex===undefined||item.claimIndex===claimIndex)&&item.identity===key&&
    item.deployment.chainId===deployment.chainId&&
    normalizeAddress(item.deployment.contract)===normalizeAddress(deployment.contract)&&
    normalizeAddress(item.beneficiary)===normalizeAddress(claim.beneficiary)&&
    item.amountWei===amount(claim.amount))??null;
}

export function claimIdentity(claim:ContractClaimLike,deployment:EvidenceDeployment=CURRENT_DEPLOYMENT,claimIndex?:number){
  const base=identity(deployment.chainId,deployment.contract,claim.beneficiary,amount(claim.amount));
  return claimIndex===undefined?base:`${base}:record-${claimIndex}`;
}

export function verifiedReceiptFor(claim:ContractClaimLike,deployment:EvidenceDeployment=CURRENT_DEPLOYMENT){
  return matchArchivedClaim(claim,deployment)?.parentReceipt??null;
}

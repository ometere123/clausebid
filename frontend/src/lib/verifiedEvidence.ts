import deploymentManifest from '../../../evidence/studionet/deployment.json';
import currentRun from '../../../evidence/studionet/live-demo-configurable.json';
import supersededRun from '../../../evidence/studionet/live-demo-replacement.json';
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
  parentTransaction:string|null;
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
const identity=(chainId:number,contract:string,beneficiary:string,amountWei:string,claimIndex?:number)=>
  `${chainId}:${normalizeAddress(contract)}:${normalizeAddress(beneficiary)}:${amountWei}`+
  (claimIndex===undefined?'':`:record-${claimIndex}`);

export const CURRENT_DEPLOYMENT:DeploymentIdentity={
  network:deploymentManifest.network,
  chainId:deploymentManifest.chainId,
  contract:deploymentManifest.contractAddress,
  auctionId:Number((currentRun as any).auctionId??0),
  label:'current',
};
export const SUPERSEDED_DEPLOYMENT:DeploymentIdentity={
  network:supersededRun.network,
  chainId:supersededRun.chainId,
  contract:supersededRun.contract,
  auctionId:supersededRun.auctionId,
  label:'historical',
};
export const HISTORICAL_DEPLOYMENT:DeploymentIdentity={
  network:historicalRun.network,
  chainId:historicalRun.chainId,
  contract:historicalRun.contract,
  auctionId:historicalRun.auctionId,
  label:'historical',
};

type CurrentClaim={beneficiary:string;amountWei:string;transaction:string|null};
type CurrentReceipt={transaction:string;chainId:number;contract:string;status:number;result:number;leaderExecution:string;messageType:string;recipient:string;valueWei:string;onAcceptance:boolean};
const currentClaims=Array.isArray((currentRun as any).transactions?.claims)?(currentRun as any).transactions.claims as CurrentClaim[]:[];
const currentReceipts=Array.isArray((currentRun as any).transactions?.claimReceiptSummaries)?(currentRun as any).transactions.claimReceiptSummaries as CurrentReceipt[]:[];
const receiptByHash=new Map<string,CurrentReceipt>(currentReceipts.map(x=>[String(x.transaction).toLowerCase(),x]));
const balanceByBeneficiary=new Map<string,string>(Object.entries((currentRun as any).settlement?.recipientBalancesAfterWeiByBeneficiary??{}).map(([k,v])=>[k.toLowerCase(),String(v)]));
const supersededBalances=Object.entries((supersededRun as any).settlement?.recipientBalancesAfterWeiByBeneficiary??{});
const supersededBalance=(beneficiary:string)=>{
  const found=supersededBalances.find(([address])=>normalizeAddress(address)===normalizeAddress(beneficiary));
  return found?String(found[1]):null;
};

const makeCurrentClaim=(claim:CurrentClaim,claimIndex:number):ArchivedClaimEvidence=>{
  const receipt=claim.transaction?receiptByHash.get(claim.transaction.toLowerCase()):undefined;
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
    identity:identity(CURRENT_DEPLOYMENT.chainId,CURRENT_DEPLOYMENT.contract,claim.beneficiary,claim.amountWei,claimIndex),
    deployment:CURRENT_DEPLOYMENT,
    beneficiary:claim.beneficiary,
    amountWei:claim.amountWei,
    parentTransaction:claim.transaction??null,
    parentReceipt:verifiedReceipt,
    recipientBalanceAfterWei:balanceByBeneficiary.get(normalizeAddress(claim.beneficiary))??null,
    balanceEvidence:balanceByBeneficiary.has(normalizeAddress(claim.beneficiary))?'POST_READBACK_ONLY':'UNAVAILABLE',
    externalSettlement:'DISPATCHED_PENDING_EXTERNAL_SETTLEMENT',
    sourcePath:'evidence/studionet/live-demo-configurable.json',
  };
};

const historicalClaims=Array.isArray(historicalRun.transactions.claims)?historicalRun.transactions.claims:[];
export const CURRENT_CLAIMS:ArchivedClaimEvidence[]=String((currentRun as any).contract??'').toLowerCase()===normalizeAddress(CURRENT_DEPLOYMENT.contract)
  ? currentClaims.map((claim,claimIndex)=>makeCurrentClaim(claim,claimIndex)) : [];
export const SUPERSEDED_CLAIMS:ArchivedClaimEvidence[]=supersededRun.transactions.claims.map((claim,claimIndex)=>({
  claimIndex,
  identity:identity(SUPERSEDED_DEPLOYMENT.chainId,SUPERSEDED_DEPLOYMENT.contract,claim.beneficiary,claim.amountWei,claimIndex),
  deployment:SUPERSEDED_DEPLOYMENT,
  beneficiary:claim.beneficiary,
  amountWei:claim.amountWei,
  parentTransaction:claim.transaction,
  parentReceipt:null,
  recipientBalanceAfterWei:supersededBalance(claim.beneficiary),
  balanceEvidence:supersededBalance(claim.beneficiary)?'POST_READBACK_ONLY':'UNAVAILABLE',
  externalSettlement:'DISPATCHED_PENDING_EXTERNAL_SETTLEMENT',
  sourcePath:'evidence/studionet/live-demo-replacement.json',
}));
export const HISTORICAL_CLAIMS:ArchivedClaimEvidence[]=historicalClaims.map((claim:any,claimIndex)=>({
  claimIndex,
  identity:identity(HISTORICAL_DEPLOYMENT.chainId,HISTORICAL_DEPLOYMENT.contract,claim.beneficiary,claim.amountWei,claimIndex),
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
  const matches=archive.filter(item=>item.deployment.label==='current'&&
    (claimIndex===undefined||item.claimIndex===claimIndex)&&
    identity(item.deployment.chainId,item.deployment.contract,item.beneficiary,item.amountWei)===key&&
    item.deployment.chainId===deployment.chainId&&
    normalizeAddress(item.deployment.contract)===normalizeAddress(deployment.contract)&&
    normalizeAddress(item.beneficiary)===normalizeAddress(claim.beneficiary)&&
    item.amountWei===amount(claim.amount));
  // Without the immutable record index, an ambiguous tuple is unavailable,
  // never silently attributed to the first matching claim.
  return claimIndex===undefined?(matches.length===1?matches[0]??null:null):matches[0]??null;
}

export function claimIdentity(claim:ContractClaimLike,deployment:EvidenceDeployment=CURRENT_DEPLOYMENT,claimIndex?:number){
  return identity(deployment.chainId,deployment.contract,claim.beneficiary,amount(claim.amount),claimIndex);
}

export function verifiedReceiptFor(claim:ContractClaimLike,deployment:EvidenceDeployment=CURRENT_DEPLOYMENT){
  return matchArchivedClaim(claim,deployment)?.parentReceipt??null;
}

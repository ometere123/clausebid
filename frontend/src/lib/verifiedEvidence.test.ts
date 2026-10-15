import {describe,expect,it} from 'vitest';
import {CURRENT_CLAIMS,CURRENT_DEPLOYMENT,HISTORICAL_CLAIMS,HISTORICAL_DEPLOYMENT,claimIdentity,matchArchivedClaim} from './verifiedEvidence';

describe('deployment-scoped claim evidence',()=>{
  it('loads current claims from the replacement archive with independently matched receipts',()=>{
    expect(CURRENT_DEPLOYMENT.contract).toBe('0x24f95ED58fcfa4e339C504fF388A922347757515');
    expect(CURRENT_DEPLOYMENT.chainId).toBe(61999);
    expect(CURRENT_CLAIMS).toHaveLength(5);
    for(const claim of CURRENT_CLAIMS){
      expect(claim.sourcePath).toBe('evidence/studionet/live-demo-replacement.json');
      expect(claim.parentReceipt?.contract.toLowerCase()).toBe(CURRENT_DEPLOYMENT.contract.toLowerCase());
      expect(claim.parentReceipt?.recipient.toLowerCase()).toBe(claim.beneficiary.toLowerCase());
      expect(claim.parentReceipt?.valueWei).toBe(claim.amountWei);
      expect(claim.parentReceipt?.status).toBe(7);
      expect(claim.parentReceipt?.result).toBe(6);
    }
  });

  it('does not attribute a superseded claim to the replacement deployment',()=>{
    const historical=HISTORICAL_CLAIMS[0];
    const historicalClaim={beneficiary:historical.beneficiary,amount:historical.amountWei};
    expect(HISTORICAL_DEPLOYMENT.contract).toBe('0x9c70a987A6875F0B0128AEf16C57F4998F778827');
    expect(claimIdentity(historicalClaim,HISTORICAL_DEPLOYMENT)).not.toBe(claimIdentity(historicalClaim,CURRENT_DEPLOYMENT));
    expect(matchArchivedClaim(historicalClaim,CURRENT_DEPLOYMENT,HISTORICAL_CLAIMS)).toBeNull();
    expect(matchArchivedClaim(historicalClaim,HISTORICAL_DEPLOYMENT,HISTORICAL_CLAIMS)).toBeNull();
    expect(CURRENT_CLAIMS.some(claim=>claim.parentTransaction===historical.parentTransaction)).toBe(false);
  });

  it('matches by deployment, beneficiary and amount rather than claim position',()=>{
    const current=CURRENT_CLAIMS[2];
    const currentClaim={beneficiary:current.beneficiary,amount:current.amountWei};
    expect(matchArchivedClaim(currentClaim,CURRENT_DEPLOYMENT)?.parentTransaction).toBe(current.parentTransaction);
    expect(matchArchivedClaim({...currentClaim,amount:'1'},CURRENT_DEPLOYMENT)).toBeNull();
    expect(matchArchivedClaim({...currentClaim,beneficiary:'0x0000000000000000000000000000000000000001'},CURRENT_DEPLOYMENT)).toBeNull();
  });
});

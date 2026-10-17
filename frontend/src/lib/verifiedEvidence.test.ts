import {describe,expect,it} from 'vitest';
import {CURRENT_CLAIMS,CURRENT_DEPLOYMENT,HISTORICAL_CLAIMS,HISTORICAL_DEPLOYMENT,SUPERSEDED_CLAIMS,SUPERSEDED_DEPLOYMENT,claimIdentity,matchArchivedClaim} from './verifiedEvidence';

describe('deployment-scoped claim evidence',()=>{
  it('loads current claims only from the configurable deployment archive',()=>{
    expect(CURRENT_DEPLOYMENT.contract).toBe('0xD20Fc1C6b029c4FF4E2c64E8A8e2F6B91eCa161b');
    expect(CURRENT_DEPLOYMENT.chainId).toBe(61999);
    expect(CURRENT_CLAIMS.length).toBeGreaterThanOrEqual(5);
    expect(CURRENT_CLAIMS.some(claim=>claim.parentReceipt)).toBe(true);
    for(const claim of CURRENT_CLAIMS){
      expect(claim.sourcePath).toBe('evidence/studionet/live-demo-configurable.json');
      if(claim.parentReceipt){
        expect(claim.parentReceipt.contract.toLowerCase()).toBe(CURRENT_DEPLOYMENT.contract.toLowerCase());
        expect(claim.parentReceipt.recipient.toLowerCase()).toBe(claim.beneficiary.toLowerCase());
        expect(claim.parentReceipt.valueWei).toBe(claim.amountWei);
        expect(claim.parentReceipt.status).toBe(7);
        expect(claim.parentReceipt.result).toBe(6);
      }else{
        expect(claim.balanceEvidence==='UNAVAILABLE'||claim.parentTransaction===null).toBe(true);
      }
    }
  });

  it('does not attribute a superseded claim to the replacement deployment',()=>{
    const historical=SUPERSEDED_CLAIMS[0];
    const historicalClaim={beneficiary:historical.beneficiary,amount:historical.amountWei};
    expect(SUPERSEDED_DEPLOYMENT.contract).toBe('0x24f95ED58fcfa4e339C504fF388A922347757515');
    expect(HISTORICAL_DEPLOYMENT.contract).toBe('0x9c70a987A6875F0B0128AEf16C57F4998F778827');
    expect(claimIdentity(historicalClaim,SUPERSEDED_DEPLOYMENT)).not.toBe(claimIdentity(historicalClaim,CURRENT_DEPLOYMENT));
    expect(matchArchivedClaim(historicalClaim,CURRENT_DEPLOYMENT,HISTORICAL_CLAIMS)).toBeNull();
    expect(matchArchivedClaim(historicalClaim,CURRENT_DEPLOYMENT,SUPERSEDED_CLAIMS)).toBeNull();
    expect(CURRENT_CLAIMS.some(claim=>claim.parentTransaction===historical.parentTransaction)).toBe(false);
  });

  it('matches by deployment, beneficiary and amount rather than claim position',()=>{
    const current=CURRENT_CLAIMS[2];
    const currentClaim={beneficiary:current.beneficiary,amount:current.amountWei};
    expect(matchArchivedClaim(currentClaim,CURRENT_DEPLOYMENT,undefined,current.claimIndex)?.parentTransaction).toBe(current.parentTransaction);
    expect(matchArchivedClaim(currentClaim,CURRENT_DEPLOYMENT,undefined,current.claimIndex+1)).toBeNull();
    expect(matchArchivedClaim({...currentClaim,amount:'1'},CURRENT_DEPLOYMENT)).toBeNull();
    expect(matchArchivedClaim({...currentClaim,beneficiary:'0x0000000000000000000000000000000000000001'},CURRENT_DEPLOYMENT)).toBeNull();
  });

  it('never reuses one parent transaction for two immutable claim records',()=>{
    const parents=CURRENT_CLAIMS.map(claim=>claim.parentTransaction).filter((hash):hash is string=>Boolean(hash));
    expect(new Set(parents).size).toBe(parents.length);
  });
});

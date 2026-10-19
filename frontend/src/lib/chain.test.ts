import {describe,expect,it} from 'vitest';
import {MAX_UNSETTLED_READS,readContractWithTimeout} from './chain';

describe('bounded SDK read timeout recovery',()=>{
  it('recovers after one permanently hung request and caps further overlap',async()=>{
    await expect(readContractWithTimeout(()=>new Promise<unknown>(()=>{}),{timeoutMs:5,drainGraceMs:2})).rejects.toMatchObject({code:'ETIMEDOUT'});

    let recoveredCalls=0;
    await expect(readContractWithTimeout(async()=>{recoveredCalls++;return 'recovered'},{timeoutMs:20,drainGraceMs:2})).resolves.toBe('recovered');
    expect(recoveredCalls).toBe(1);

    await expect(readContractWithTimeout(()=>new Promise<unknown>(()=>{}),{timeoutMs:5,drainGraceMs:2})).rejects.toMatchObject({code:'ETIMEDOUT'});
    let blockedCalls=0;
    await expect(readContractWithTimeout(async()=>{blockedCalls++;return 'must not start'},{timeoutMs:20,drainGraceMs:2})).rejects.toMatchObject({code:'EREADRECOVERY'});
    expect(blockedCalls).toBe(0);
    expect(MAX_UNSETTLED_READS).toBe(2);
  });
});

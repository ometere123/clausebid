import {describe,expect,it} from 'vitest';
import {ReadCoordinator,ReadRequestError} from './readCoordinator';

const rpcError=(status:number,message:string)=>Object.assign(new Error(message),{status});

describe('ReadCoordinator',()=>{
 it('deduplicates identical reads and never exceeds the configured concurrency',async()=>{
  let active=0;let peak=0;let calls=0;
  const coordinator=new ReadCoordinator({concurrency:2,sleep:async()=>{}});
  const operation=async()=>{calls++;active++;peak=Math.max(peak,active);await new Promise(resolve=>setTimeout(resolve,5));active--;return 'confirmed'};
  const results=await Promise.all([coordinator.request('same','get_procurement',operation),coordinator.request('same','get_procurement',operation),coordinator.request('other','get_procurement',operation)]);
  expect(results).toEqual(['confirmed','confirmed','confirmed']);expect(calls).toBe(2);expect(peak).toBeLessThanOrEqual(2);
 });
 it('retries HTTP 429 and 503 reads with bounded backoff, then recovers',async()=>{
  let calls=0;let delays=0;
  const coordinator=new ReadCoordinator({concurrency:1,maxRetries:2,baseDelayMs:10,maxDelayMs:50,sleep:async(ms)=>{delays+=ms}});
  const result=await coordinator.request('recover','get_economy',async()=>{calls++;if(calls===1)throw Object.assign(rpcError(429,'Too Many Requests'),{retry_after_seconds:0.01});if(calls===2)throw rpcError(503,'Service unavailable');return {outstanding_wei:'0'}});
  expect(result).toEqual({outstanding_wei:'0'});expect(calls).toBe(3);expect(delays).toBeGreaterThanOrEqual(20);
 });
 it('serializes concurrent retry slots after a shared rate limit',async()=>{
  let clock=0;const delays:number[]=[];const attempts=new Map<string,number>();
  const coordinator=new ReadCoordinator({concurrency:2,maxRetries:1,baseDelayMs:100,maxDelayMs:1000,now:()=>clock,sleep:async ms=>{delays.push(ms);clock+=ms}});
  const operation=(key:string)=>async()=>{const count=(attempts.get(key)??0)+1;attempts.set(key,count);if(count===1)throw rpcError(429,'Too many requests');return key};
  await Promise.all([coordinator.request('first','get_count',operation('first')),coordinator.request('second','get_count',operation('second'))]);
  expect(delays).toEqual([100,100]);
 });
 it('does not retry contract errors and exposes safe diagnostics',async()=>{
  let calls=0;const diagnostics:any[]=[];
  const coordinator=new ReadCoordinator({onDiagnostic:d=>diagnostics.push(d),sleep:async()=>{}});
  await expect(coordinator.request('revert','get_credit',async()=>{calls++;throw Object.assign(new Error('execution reverted: 0x1234567890abcdef1234567890abcdef12345678'),{code:3})})).rejects.toBeInstanceOf(ReadRequestError);
  expect(calls).toBe(1);expect(diagnostics[0]).toMatchObject({kind:'contract-error',contractMethod:'get_credit',rpcMethod:'gen_call'});expect(diagnostics[0].message).not.toContain('0x1234567890abcdef');
 });
 it('keeps partial reads usable and retries only the failed item',async()=>{
  const coordinator=new ReadCoordinator({concurrency:2,maxRetries:1,baseDelayMs:1,sleep:async()=>{}});
  const results=await Promise.allSettled([
   coordinator.request('auction-1','get_procurement',async()=>({title:'one'})),
   coordinator.request('auction-2','get_procurement',async()=>{throw rpcError(503,'temporary provider outage')})
  ]);
  expect(results[0]).toMatchObject({status:'fulfilled',value:{title:'one'}});expect(results[1].status).toBe('rejected');
 });
});

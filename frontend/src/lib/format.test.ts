import {describe,it,expect} from 'vitest';
import {errorText,fromWei,toWei,WEI} from './format';
describe('GEN wei',()=>{
 it('uses precise integer math',()=>{expect(toWei('12.5')).toBe(12n*WEI+WEI/2n);expect(fromWei(10n*WEI)).toBe('10')});
 it('does not allow exponent/negative or more than 18 decimals',()=>{
  expect(()=>toWei('-1')).toThrow();expect(()=>toWei('1e3')).toThrow();expect(()=>toWei('1.1234567890123456789')).toThrow();
 });
});
it('explains Studionet RPC rate limits without hiding wallet errors',()=>{
 expect(errorText({code:-32029,cause:{data:{retry_after_seconds:21}}})).toContain('Try again in 21 seconds');
 expect(errorText(new Error('User rejected wallet connection'))).toContain('rejected');
 expect(errorText(new Error('User rejected the request. Details: User rejected transaction signature Version: viem@2.57.7'))).toBe('Wallet request rejected. No transaction was submitted.');
});
it('does not expose a viem transport wrapper for a transient read failure',()=>{
 expect(errorText(new Error('An unknown RPC error occurred. Details: Failed to fetch Version: viem@2.57.7'))).toBe('Studionet RPC is temporarily unavailable. Retry the read shortly. No transaction was submitted.');
});

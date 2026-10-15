import {describe,expect,it} from 'vitest';
import {transactionExplorerUrl} from './explorer';

describe('Studionet transaction explorer links',()=>{
 it('builds a direct transaction URL without changing the hash',()=>{
  const hash='0x'+'a'.repeat(64);
  expect(transactionExplorerUrl(hash)).toBe(`https://explorer-studio.genlayer.com/tx/${hash}`);
 });
});

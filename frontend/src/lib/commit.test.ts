import {describe,it,expect} from 'vitest';
import {digestBid} from './commit';
describe('cross-language commit vectors',()=>{
 it('hashes the same byte-prefixed fields as the Python contract',async()=>{
  const value=await digestBid({auctionId:'7',chainId:'61999',contract:'0x'+'1'.repeat(40),
    seller:'0x'+'2'.repeat(40),priceWei:'25000000000000000000',
    terms:'Three products, all SEO, all warranties.',salt:'a'.repeat(64)});
  expect(value).toBe('173d22dc5b3b72c6952ec17b81d28177634e6bd5610c667029bfa2086a3712a2');
 });
 it('binds bidder and exact offer text',async()=>{
  const base={auctionId:'7',chainId:'61999',contract:'0x'+'1'.repeat(40),seller:'0x'+'2'.repeat(40),
    priceWei:'25000000000000000000',terms:'Three products, all SEO, all warranties.',salt:'a'.repeat(64)};
  expect(await digestBid(base)).not.toBe(await digestBid({...base,terms:base.terms+' '}));
  expect(await digestBid(base)).not.toBe(await digestBid({...base,chainId:'61997'}));
 });
});

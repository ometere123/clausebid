/**
 * Public, immutable evidence copied from evidence/studionet/live-demo.json.
 * This is an archive label, not a live balance oracle. The UI always shows
 * current contract claim records separately and never treats this archive as
 * permission to claim or retry a payment.
 */
export const VERIFIED_CLAIMS:Record<string,{hash:string;beneficiary:string;amountWei:string;recipientBalanceAfterWei:string}>= {
  '0': {hash:'0xcdceeab4794f3b4395a1f037591c4f1e0eb0e1a0cfa8268d9c9661dfc519304c',beneficiary:'0x0d5540e0ad4b92aa0ad4e5f1b8cd645ee1e363e7',amountWei:'10000000000000000000',recipientBalanceAfterWei:'16999999999999999992'},
  '1': {hash:'0x5752a5cff405c37de509413b2886eb4149b10e4199807a18e7b89b13ee9e4a79',beneficiary:'0x4ca776be78b091374c608ae16f023ca70164ecbe',amountWei:'1750000000000000000',recipientBalanceAfterWei:'2000000000000000002'},
  '2': {hash:'0xc7f45a5765e159ccf192f2956a158c818ce877415024e5e93a70c886c5546182',beneficiary:'0x275c7029516e6b1b7f56fbf970c816bfc6e793d5',amountWei:'26750000000000000000',recipientBalanceAfterWei:'27000000000000000002'},
  '3': {hash:'0x119488ec0e54b445a1ea1ca254cf068aa3a8e21ee925d9d4f092a1d533d65275',beneficiary:'0x2a9f27986ce895f5d5912a2833526c9b39009bbc',amountWei:'1750000000000000000',recipientBalanceAfterWei:'2000000000000000002'},
  '4': {hash:'0xf178ce0a72e734c42e6e2cf106c1d5842da7c307f92253063daccf05b24b811b',beneficiary:'0xc43b93e999531b4ac0737e4e7f4ebb087422b067',amountWei:'1750000000000000000',recipientBalanceAfterWei:'2000000000000000002'},
};

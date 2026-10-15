#!/usr/bin/env node
/** Source/deployment comparison. This never deploys or spends GEN. */
import {createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const expected=process.env.CLAUSEBID_CONTRACT_ADDRESS;
if(!expected||!/^0x[0-9a-fA-F]{40}$/.test(expected))throw Error('Set CLAUSEBID_CONTRACT_ADDRESS');
const local=readFileSync('contracts/clausebid.py','utf8');
const digest=x=>createHash('sha256').update(x).digest('hex');
const c=createClient({chain:studionet});
// genlayer-js@1.1.8 expects the address directly. Passing `{address}` is
// interpreted as an object-valued RPC identifier by the pinned client.
const actual=await c.getContractCode(expected);
const schema=await c.getContractSchema(expected);
if(!actual)throw Error('No deployed code returned. Do not claim deployment success.');
const equal=digest(Buffer.from(String(actual)))===digest(Buffer.from(local));
const result={network:'studionet',chainId:61999,contract:expected,sourceSha256:digest(local),retrievedCodeSha256:digest(String(actual)),exactSourceMatch:equal,methodCount:schema?.methods&&typeof schema.methods==='object'?Object.keys(schema.methods).length:null,checkedAt:new Date().toISOString()};
mkdirSync('evidence/studionet',{recursive:true});
writeFileSync('evidence/studionet/source-verification.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
if(!equal)throw Error('STOP: deployed source differs from repository contract');

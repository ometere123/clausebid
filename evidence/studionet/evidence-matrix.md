# ClauseBid evidence matrix

This index separates deterministic Direct Mode regression evidence from hosted
Studionet consensus and transfer evidence. Direct Mode uses `vm.warp()` and
mocked semantic responses; it never proves live validator independence or native
GEN settlement.

## Current configurable deployment

| Claim | Evidence | Finalized transaction |
|---|---|---|
| Current source is deployed exactly | `scripts/preflight.mjs`; `source-verification.json` | `0x586ee807c33b94b58363ddff16d19f8141375a5309d0e5c5c78ed1a4c438be7c` — FINALIZED, MAJORITY_AGREE, leader SUCCESS; address `0xD20Fc1C6b029c4FF4E2c64E8A8e2F6B91eCa161b`; source SHA256 `85939c9191661b34ec16a5d37a0d6ee1ad1ccb562ac066dec8b843c01879e241` |
| Buyer-configurable timing is validated | `tests/direct/test_variable_timing.py`; 16 boundary, cap, independent-duration, deadline-anchor, multi-auction and overflow tests | Direct Mode only; hosted minimum and default schedule storage are recorded below |
| Read pressure is bounded without financial-write retries | `frontend/src/lib/readCoordinator.test.ts` covers deduplication, concurrency, 429/503 backoff, partial reads, recovery, diagnostics and timeout non-overlap; Playwright covers page-specific read graphs | No live transaction is claimed for this deterministic frontend property |

The previous `0x24f95...7515` deployment and the earlier `0x9c70...8827`
deployment remain explicit historical records in `deployment.json` and their
deployment-scoped evidence files. No procurement or credit is migrated.

## Current configurable-contract live verification

The following rows are populated only from finalized transactions against
`0xD20Fc1C6b029c4FF4E2c64E8A8e2F6B91eCa161b`. A row remains `PENDING` or
`BLOCKED` until its runner archive contains the finalized receipt, before/after
state and accounting required by the claim.

| Claim | Test/readback | Finalized transaction |
|---|---|---|
| Minimum schedule is stored on-chain | `scripts/drive.mjs` live minimum run, auction #1: 600-second commitment, 1200-second reveal, 1800-second total and derived fields | Create `0x589f0a5c4e361d0306d803ae2ebe5b719ede539bd6ba429a0f43b7d41f29864f`; four commitments `0x5f27e80ff35b7261dab398c97e0d9db52815de65c343b72afd146f8fa3077bdd`, `0x07da5a2eb77b4103695f5c67284e52fd4357819c32aabfa879da64cdb8663396`, `0xd5973328d2831e17887637db3e13f6df99fbfbe6304cb508512891c467fce156`, `0x2c31c49e86d22d9c549830214930114cab185758f32d7fad7c756f79fc5e67af`; all finalized successfully |
| New-contract no-award and claim-safety paths | `live-negative-configurable-batch1.json`, auctions #2 and #3, real elapsed time; both archives include before/after economy, claim entitlements, recipient readbacks and strict expected-failure checks | #2 unrevealed bond: create `0xc937229c86b87627606fd7d2b1492d8f9a4a287830b659fd6ce9387f9606aaa9`, commit `0xbd33670480813cbbc7c1307577b5ee90fa09db1c87c8319ef0535f762f4b988e`, finalize `0x6879bc8bfda14ef22363ba9bfd6bf46d59169164c7fef81f55852ccafbf832c9`, unauthorized claim failed `0xbf4d5a269928dadc81dc93706b3699387219b3b7e4e4af7b963f0206a17e1b87`, buyer claim `0xfc04f61f9288ab7a37dd79af05e02c7d4661b6a57cdb4dafcf70b60e19a3d15b`, duplicate failed `0x56c1912e72bfeb9d04e58289895d42a3e791c1a0917ba2a323c3d583f42739d4`; #3 noncompliant refund: reveal `0x7c6501c6eb43c56c3c5afa737ab14453e36687da2a775e3c10c9c441eb27532e`, review `0x72b2553c636f5051e232b041ac6a71a7e7fa281d2d7244eae38905d9a879c42c`, no-award `0xe14b6e396c6658544d545b1aece4c115b98cc17e3b5682ca06284ffb405db7a4`, buyer claim `0xbd9a172d38bc09bee1336294b25235b11c1b81c8f38ab6be27020c64f4c42c04` |
| New-contract correction exhaustion | `live-negative-configurable-batch2.json`, auction #5, real elapsed time | PASS: correction attempt 3 ended `DEFAULTED`; buyer recovery claim `0x509492ed4b46b31f3d2269ed6def3112dddd8d0bacf1dae8b294d754c3fdcaae`; the archive contains all three defective deliveries, substantive review receipts, before/after liabilities and bond forfeiture |
| New-contract uncertain delivery | `live-negative-configurable-batch2.json`, auction #6, real elapsed time | BLOCKED accurately: three finalized delivery-review attempts did not produce an `UNKNOWN` consensus result; the runner used the defined fallback default and recorded buyer recovery `0x4f2cc9f47b107656fcf23458214d24a409f83fbd997c855d1b8aa3561e864c7e` without retrying a transfer |
| Current-contract five-wallet minimum lifecycle | `live-demo-configurable.json`, auction #9, four seller wallets and buyer | PASS: auction 9 reached `SETTLED`; the 18 GEN noncompliant offer was excluded, the unresolved 22 GEN review was cancelled only after grace, the 25 GEN compliant offer won, delivery was accepted and current-deployment claim records were archived. Create `0xb0e75c05a1dd720824836e867140da5389f18aad6c3a8c2bc8bc9003e4f1e55a`; reservation `0xc53ba1078c0c13a14a0e2963cfb5b1b2e75dec4a918a8e1192c4ee67523a03d0`; cancellation `0x465e7164fdde95d992f2e32620c8377b7a1a64fb0aab135a18981bcd142e378b`; award `0xc2abf1df0cd2cca8c42c88b7a75bd4a47c10cecbdd7b977608c9dea1b752023d`; delivery `0xde561ab49cc333ec5985138864ffb4f94c9e04afffe2e788215f60bc582b56ee`; acceptance `0x3a1bb9991a265ae5db3cab035e9501028cfd6adc80a4c3704392add974c4d680`. |
| Current configurable-contract claim conservation | `live-demo-configurable.json` archive and `archive-configurable.mjs` | PASS for contract-side accounting: 19 immutable claim records, 128 GEN dispatched, 119 GEN outstanding and 119 GEN contract balance. The archive enforces one unique parent transaction per immutable claim record and preserves emitted beneficiary/value fields. Child acceptance is unavailable through the pinned SDK, so records remain `DISPATCHED_PENDING_EXTERNAL_SETTLEMENT`; post-claim balances are not presented as deltas because the replacement run did not capture a complete pre-run snapshot. |
| New-contract delivery default and buyer recovery | `live-negative-configurable-batch3.json`, auction #10 | PASS: award `0x4739c3f3a24ec475315b15f97d58e75aeb0616bdf8f5f830b2d8725c04fca2ef`, expiry `0x0667280e9af7f4fec0ce7b79f8c71b65d2a8215ecae1c6efa1b959f72116d7a4`, buyer claim `0xcf13582dbbc307359b1498c1b72ccde6de23b6247d545814e4171be2c3844fa8`; final `DEFAULTED`. |
| New-contract buyer refusal and independent PASS | `live-negative-configurable-batch3.json`, auction #11 | PASS: dispute `0xd5aacd09c4ca0b6bd0cf35b4e47d06ca980d88dd407cce5c2755ae590023e0be`, review reservation `0x80490b5dcc75e6ca2c3a033016dbcc5da3adddaf4845229b5d2f76f8afef84a3`, review `0x607a3693e9c75d346d9e62c3c02c1559992b1830ab79767b61cebd4b6e71a8a9`, seller claim `0x9dad285f1040cc54f49c0782ccd95ddecb8255b4bd3e4bfd07a9ddc8bca5d47e`; buyer aggregate claim parent `0x2b4bc2c5099529c4f662fadb6452efbb918b28824921e6d2eb9d9852e0ece214` emitted 6 GEN while this scenario entitlement was 3 GEN. |
| New-contract timely review deadline protection | `live-negative-configurable-batch3.json`, auction #12 | PASS: acceptance `0x225a2f7c7b80e70eaaa56fd2f4cfb99e54fbc3265ed9d216880025ee3798b155`; review finalized after the ordinary deadline without a timeout settlement. Seller aggregate claim parent `0x9a87e9b7edb9bab0bbc63c47485153379147f2d5fbb79d517ae99698e5b0fe0d` emitted 29.25 GEN and buyer aggregate claim parent `0x3e6514d5036d2a5e0b26289ff21ace3d4a46962fc4c74bb19f85eb807e7b375b` emitted 13 GEN. The expected scenario entitlements were 2.5 and 3 GEN respectively; both aggregate amounts are preserved as aggregate wallet claims, not standalone auction transfers. |
| New-contract stale review cancellation | `live-negative-configurable-batch3.json`, auction #13 | PASS: cancellation `0x7a436d36259d733ea8109f3d9791625d3e56a93d2466025dca746f69c76b7a65`, no-award `0xbfb11f2833d9ad0548ed409f1e1d15f91d230809248d6d743811f07bf37bdabd`, buyer claim `0xf529ee81e704671bfb6bdbea0c3f6699a8c55bb983bb3ed663217928bc5cac32` and seller bond claim `0x7f7b58c1b87656e7d466bfd027760e517e96cba92e4f3b6604f4f9e93b33cb22`. |

## Historical funded hosted demonstration on 0x24f95...

This five-wallet run is preserved as historical evidence for the superseded
fixed-duration deployment. It is not evidence for the configurable address.

| Claim | Test/readback | Finalized transaction |
|---|---|---|
| Replacement funded procurement and four immutable clauses | `live-demo-replacement.json` create, commitment and funding records | Create `0xcb4562c632a0356cf2ab98a087bae81afc3b6c5d39a0f216d24c41ed3abf0378`; four commitment hashes in the replacement evidence |
| Exact reveals and deadline enforcement | Four finalized reveal receipts; early review calls rejected before `reveal_end` | Reveal hashes and early-rejection hashes in `live-demo-replacement.json` |
| Substantive eligibility rejects exclusions and conditional pricing | Per-clause statuses and quotes in replacement evidence | Bid evaluation hashes `0xe629d8d4a53707b23c0d4e49bc8417a8d51c2d42050c7fe35674f0ff1ffccaab`, `0xecdc313324a7ea17b3e0749b81477b19b3c740356703bf269f15628f0cce7fc`, `0x7506e20aa9fd822afac243d91be896614fa9dcf65df9a2e1d14f11f7dcde3c4a`, `0xcfe8067bb1b8e04e0ce3218ab8f8d5e4c08354d6809289d7fd231ad9f315965b` |
| Deterministic lowest compliant winner | Final state winner and 25 GEN price | `0x507e913eadf27aae7bebf5a780a538a41a745aac17103a95dfc7d21a639e401d` |
| Defective delivery, neutral review recovery, correction and acceptance | Two attempts; review disagreement receipts and final PASS path | Defect `0xba3ba452edadb75e2f10a50d3b0d521d4fc5107c9c479f3c6c4ac0b290cf3707`; final review `0xf70fc91ae02617880e005ff24c57eaa1d0a0099d7e883e523f4229e310b410df`; corrected delivery `0x06106bac5a7dfddadc3c94c554d44170238281a8093e75db0bd59a89d148a475`; acceptance `0xbc96fc914c9fc81fb9da582f3ce0a89f51981fe73df6deb80abd4c78623205f5` |
| Replacement claim liabilities are conserved | Five immutable claims; economy after settlement | Five claim hashes and exact beneficiaries/amounts in `live-demo-replacement.json`; `outstandingWei=0`, `dispatchedWei=42 GEN`, `contractBalanceWei=0` |
| Native GEN outbound messages and recipient readbacks | Parent receipts, message values and post-claim account reads | Same five replacement claim parents; child acceptance was not exposed by the pinned SDK |
| Duplicate claim fails without a second entitlement | Finalized failed duplicate claim receipt; claims remain five | `0x82619bb2c32e601451980c893ef7d56db655bd334c8a334c9df02d5fef0f73c0` |

## Historical genuine Chrome funding evidence on 0x24f95...

The Convert-profile Chrome run is separate from the fixture Playwright suite
and from the CLI-wallet lifecycle. It proves a real injected EIP-1193 wallet
write and live reads against the superseded fixed-duration address.

| Claim | Evidence | Finalized transaction |
|---|---|---|
| Browser wallet can fund a live procurement | `frontend-verification.json`: wallet `0xfcef...522f`, chain 61999, 5 GEN value, count 4 to 5, procurement #5 in `BIDDING` | `0xdd3cfc7253300469c78efc0c8ae4b43d9dd92d952a7ecf9f85654a7b01198d87`, status 7, result 6, leader SUCCESS |
| Procurement #5 has a permissionless no-award refund path | Live readback: 0 bids, buyer credit 5 GEN after `0x8d83c4213cdf6dc77d6b7f005d728000459abe323f564144697887c570d93d5f` | Buyer claim remains unsubmitted in the browser evidence; no payout hash is inferred |

## Historical automated multi-wallet Studionet negative scenarios on 0x24f95...

These are real elapsed-time CLI-wallet runs against the superseded deployment,
not Direct Mode or fixture evidence. Each row is backed by the complete
sanitized receipt/state/balance archive in `live-negative.json`. Claim rows
remain `DISPATCHED_PENDING_EXTERNAL_SETTLEMENT` unless a child acceptance
receipt is independently exposed by the pinned SDK.

| Economic claim | Auction and observed result | Finalized transaction evidence |
|---|---|---|
| No compliant offer refunds the buyer | #19, `PASS`, `NO_COMPLIANT_OFFER_BUYER_REFUND` | Evaluation `0x08b6f45cd1973382d9ff6d328bc8dd2dd7c1251eedf5b05be085aa11686e1e21`; no-award `0xc6028ae602a846b512d05de23f500460b009e51e418dd39add525fd8b12fc785`; buyer claim `0xce4d22b6356b929392d29dcc0c7ee0ea60699ca9275193df6fc181bc60747e6e` for 5 GEN |
| Unrevealed bond is forfeited and claims are single-use | #6, `PASS`, `NO_AWARD_BOND_FORFEITURE_AND_SINGLE_CLAIM` | Commit `0xed190ab8ff7566c111de57250916acef03336c9e7429b2d9c5c753e28f31f013`; no-award `0xf70230c02a6af50b8189e6c69d4c6ab36ce559f063a73f79890bde0217e26bc0`; unauthorized claim failed `0x7df1d68bcf21180ca66a48790e5f3987301fafc3e980813fc20c8dca46017772`; buyer claim `0x4b159f6491a4730b2dbb3fddd682e7273679da7e86e34b9ef9630cecac4cd434` for 5.5 GEN; duplicate failed `0x074ae33cf590617654a36030cd40edf5e65d43d4e22690edb50ca75502db1541` |
| Seller delivery expiry recovers buyer liabilities | #20, `PASS`, `SELLER_DELIVERY_DEFAULT_BUYER_RECOVERY` | Compliant evaluation `0xb12c8212edd0bedfdb13316916fe978c81925f594bc3354cc12514620a7e40de`; award `0x5c311478cd62fa3e68e155a80ad0154e6149097e5037de7b379292c49c53f72e`; expiry `0x04a6bf984712fd4b3a418057d5ad0a4b9c88520f3b5bb27c2f542da490cb1848`; buyer claim `0x90a3a7373b6f8745962f5744473dd901fe41199b24c28119e35dc03f198bac64` for 2.5 GEN |
| Buyer refusal cannot prevent an independent PASS settlement | #21, `PASS`, `BUYER_REFUSAL_INDEPENDENT_PASS_SELLER_PAYMENT` | Delivery review `0x86d44df717a20dd1a0a133f28704dd5c4c361a90655fc632914b72bf92083d02`; seller claim `0xf6c42b9b07a0f966b8b52c4051ada074537ed4ef6aafb572ee690a2ed1f42ee8`; buyer claim `0xb0f5805dec4f8144948794e3294e8e74d4557957946aec1b47e96597e947d9db` |
| A timely reserved review survives the ordinary deadline | #24, `PASS`, `TIMELY_RESERVED_REVIEW_FINALIZED_AFTER_ORDINARY_DEADLINE` | Reservation `0x6d2b4817bc98a97e8653c1fd91156e9dec45fc25359f8cc1ba17f81cdc39b014`; evaluation `0xf4ec0b1930f87f313f2d1434028dd12d7c3fa630f7b06ba0d226e76c87b589d6`; acceptance `0x6ff439cf7f13c307a572d83b8429169040675831fb472dbb2af77d5da93542a7`; claims `0xd5e0978d928e0b3defd09b1502ac201052b75331f70337bc35752955f0ddf713`, `0x3545a8c2035c80697e6b47a8fc72397873e6b5df5242312c91c2397b84bbd70c` |
| A stale reserved review cancels only after grace | #25, `PASS`, `STALE_RESERVED_REVIEW_CANCELLED_AFTER_GRACE_NO_AWARD` | Cancellation `0x8fb20ba89e4c9cb1dacf04221f3879daa10dcc5292714c363d7669dd3aa821a0`; no-award `0xbf86f112f3c40509468e1167592ca3ddbcf2dd8f077e3538ba70010ebf4f2367`; claims `0xdcfde1000784ee2f18b4d63f1d75f9b61b58f979f498b53cc7e8909be2b83400`, `0x733a70401b2cb99587f138936650a52f3cda47a6f768629c8d1c992956b4ff4b` |
| Failed live reveal is recovered without resubmission | #26 and #27, `BLOCKED` intended correction/uncertain paths; both reveal parents finalized with `leaderExecution: ERROR` and no state transition | #26 reveal `0x6778ebbc87c70b1669c777170f30310388f16ba10d8b9a74eacd5931c8604a0c`; #27 reveal `0xe46755a5ced058e4fe65c036e455c1851d25f5d11222cd4fd80079b8961d99d0`; subsequent no-award and buyer-only recovery claims are recorded in `live-negative.json` |

These two historical `BLOCKED` scenarios were caused by late submission in the
live test runner, not an established Studionet provider failure. For #26, the
reveal deadline was 2026-10-17 05:11:44 UTC but its transaction was submitted
at 05:36:08 UTC. For #27, the deadline was 05:14:57 UTC and submission was
at 05:37:03 UTC. Both finalized without an accepted reveal. They therefore do
not prove the intended correction-exhaustion or neutral-unwind lifecycles.
Direct Mode covers those paths, and the later configurable-contract archive
separately proves correction exhaustion in auction #5. The hosted runner did
not resubmit either finalized failed reveal.

### Consensus recheck

`consensus-investigation.json` is a receipt-level recheck, not a claim that
every validator's private model text is available. The two bid-review retry
receipts and all nineteen defective-delivery attempts finalized as
`MAJORITY_DISAGREE`; none created a state transition. The final delivery PASS
receipt converged in one round with three agreeing validators. Studionet's
pinned receipt schema did not expose a settled protocol-fee amount or a
separate finalization timestamp, so both remain explicitly unavailable.

### Superseded funded demonstration

The following rows preserve the original five-wallet run on the superseded
source-verified deployment. It remains historical evidence, not current-address
evidence.

| Claim | Test/readback | Finalized transaction |
|---|---|---|
| Funded procurement and four immutable clauses | `live-demo.json` funding and create receipt | `0x07435b10111c647c0a9273c9aa5afe3688914cdc3c02763d6ec693cb4d367ee5` |
| Early reveals fail closed | `live-demo.json.transactions.earlyRevealRejected` | Four hashes recorded in the evidence JSON |
| Conditional pricing and exclusions are noncompliant | `live-demo.json.validatorFindings` | Bid review hashes `0x4deb7c1f38fe793b0f811974f59b449266db11a42645d5d6eddf756236eb364e`, `0xe6932fbc61a3403c6e9a578521e3dc9165378d4fc0bccb087d1004c3d753f476`, `0xf70bba561ede658afb32e646c1a25bf40d80eeccca6fe301d5a9c718695bd4d2` |
| Cheapest compliant winner is selected deterministically | Award state and winner readback | `0x043b91b96f527866faf9224d44cf2f4c44b82553cfae7561138606a9a7ff8311` |
| Defective delivery is rejected and corrected | Delivery verdicts and attempt count | `0xd3d7d798015dfa72c762c1d2e5834fe4c176e8a2479937fbbcec84ca32dac491`, `0x149f2048fcad2205e668af0d7e5dda4976d02d95a45e2e945503ee4ca10c69e1`, acceptance `0x78c7d4e34d30e51d96107f19cfd25c4cb40326cae63525ef94e2dd8b39e4123f` |
| Five immutable claim beneficiaries and amounts are conserved | `live-demo.json.finalState.economy` and claim records | Claim hashes are listed in `live-demo.json.transactions.claims` |
| Native GEN reached intended wallets | Recipient balance readbacks after each claim | Same five claim parent hashes; no child acceptance receipt was exposed by the pinned SDK |
| Duplicate claim is rejected | State unchanged after receipt inspection | `0x678b1e99cfaf80f817ea20f1d581cf6db6555275188ad84dac202921b047f625` |

## Direct Mode adversarial coverage

`tests/direct/test_state_machine.py` covers wrong value, wrong network, duplicate
commitment, six concurrent bids, slot limit, corrupted reveal/salt, no-award
accounting, deterministic ties, unreviewed offers, reserved-review races,
post-cutoff timely review, delivery review races, unauthorized winner selection,
late buyer acceptance, buyer refusal/PASS, two corrections then default,
seller delivery default, neutral unwind, immutable beneficiary and duplicate
claim behavior. `tests/direct/test_clausebid.py` covers independent semantic
re-evaluation, malicious material leader proposals, fabricated evidence and
prompt-injection-as-evidence behavior.

These tests have no hosted transaction hash by design. The latest local result
was `25 passed`; the CI run is the authoritative reproducible result.

## Settlement interpretation

Each claim is consumed before its outbound EOA message is emitted. A finalized
parent receipt and an emitted message are not silently promoted to child
acceptance. The evidence keeps the contract record at
`DISPATCHED_PENDING_EXTERNAL_SETTLEMENT` and separately records recipient
balance deltas. Ambiguous transfers are not retried.

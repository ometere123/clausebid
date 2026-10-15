# ClauseBid evidence matrix

This index separates deterministic Direct Mode regression evidence from hosted
Studionet consensus and transfer evidence. Direct Mode uses `vm.warp()` and
mocked semantic responses; it never proves live validator independence or native
GEN settlement.

## Current deployment

| Claim | Evidence | Finalized transaction |
|---|---|---|
| Current source is deployed exactly | `scripts/preflight.mjs`; `source-verification.json` | `0x3e2cfa63e81b509cda9297ebe48d60516c5370682a8c0458d94d773d2bf7e408` — FINALIZED, MAJORITY_AGREE, leader SUCCESS |
| Buyer response deadline is enforced | `tests/direct/test_state_machine.py::test_buyer_cannot_accept_after_response_window`; replacement run accepted within the response deadline | `0xbc96fc914c9fc81fb9da582f3ce0a89f51981fe73df6deb80abd4c78623205f5` |

## Funded hosted demonstration

The replacement-address run is the current release evidence. The superseded
run remains archived below for provenance and comparison.

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
was `27 passed`; the CI run is the authoritative reproducible result.

## Settlement interpretation

Each claim is consumed before its outbound EOA message is emitted. A finalized
parent receipt and an emitted message are not silently promoted to child
acceptance. The evidence keeps the contract record at
`DISPATCHED_PENDING_EXTERNAL_SETTLEMENT` and separately records recipient
balance deltas. Ambiguous transfers are not retried.

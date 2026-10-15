# ClauseBid evidence matrix

This index separates deterministic Direct Mode regression evidence from hosted
Studionet consensus and transfer evidence. Direct Mode uses `vm.warp()` and
mocked semantic responses; it never proves live validator independence or native
GEN settlement.

## Current deployment

| Claim | Evidence | Finalized transaction |
|---|---|---|
| Current source is deployed exactly | `scripts/preflight.mjs`; `source-verification.json` | `0x3e2cfa63e81b509cda9297ebe48d60516c5370682a8c0458d94d773d2bf7e408` — FINALIZED, MAJORITY_AGREE, leader SUCCESS |
| Buyer response deadline is enforced | `tests/direct/test_state_machine.py::test_buyer_cannot_accept_after_response_window` | New current deployment above; no funded auction has been run on the replacement yet |

## Funded hosted demonstration

The following rows are the preserved five-wallet run on the superseded source-
verified deployment. It remains valid historical evidence for the unchanged
auction, consensus, accounting and outbound-message paths; the replacement was
necessary only for the late buyer-acceptance defect documented in the manifest.

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

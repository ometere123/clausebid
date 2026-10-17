# Studionet evidence archive

Never invent addresses, transaction hashes, validator votes, CI results, or recipient balances.

For a new deployment or hosted run, archive:
- contract source SHA256 and fetched deployed source SHA256;
- deployed address and finalized deploy receipt with execution success;
- finalized create, commit, reveal, review, award, delivery, accept/dispute, refund and claim receipts;
- per-clause consensus outputs and independently checked malicious-leader scenario;
- beneficiary wallet pre/post balances and proof of actual EOA transfer;
- no-award, unrevealed-bond, default and timeout recoveries;
- frontend screenshots/video showing real EIP-1193 writes and failure handling;
- CI run references and full tool versions.

`session.local.json` holds reveal secrets and is excluded from git. Never publish it.

Verified release artifacts:

- `studionet/deployment.json` records the current source-verified deployment and its explicit prior-deployment history.
- `studionet/source-verification.json` records the retrieved-code SHA-256 comparison.
- `studionet/live-demo.json` records the historical five-wallet auction on the superseded address.
- `studionet/live-demo-replacement.json` records the replacement-address five-wallet auction, real deadline timing, substantive findings, review disagreements and retries, correction flow, claims, emitted messages and recipient balance readbacks.
- `studionet/live-demo-configurable.json` records the current configurable-contract minimum-duration lifecycle and is deployment-scoped to `0xD20Fc1C6b029c4FF4E2c64E8A8e2F6B91eCa161b`. It does not reuse claims from either prior address. Its status is `COMPLETE`: auction 9 reached `SETTLED`, and the archive records 19 current-deployment claim records, unique parent transaction mappings, emitted messages and post-claim recipient reads.
- `studionet/consensus-investigation.json` records the independently re-fetched disagreement receipts, vote patterns, rounds, quorum-cancellation evidence, unavailable fee/timing fields and the one-round PASS convergence.
- `studionet/live-negative.json` records the historical replacement-address run. Configurable-contract runs are archived separately as `live-negative-configurable-*.json` so the two deployments cannot be conflated. Their ignored companions contain salts and full private execution state and must never be published.
- `studionet/frontend-verification.json` records the production bundle binding, Vercel deployment and the strict separation between fixture browser tests and the genuine Convert-profile wallet funding/read verification. It does not claim a browser claim settlement that was not submitted.
- `studionet/evidence-matrix.md` maps security/economic claims to exact tests and finalized hosted transactions, and labels historical evidence from the superseded address.

The frontend read-resilience implementation is covered by the coordinator unit
tests and the production Chrome check. It limits `gen_call` concurrency,
deduplicates identical reads, caches only deployment-scoped confirmed values,
retries transient provider failures a bounded number of times, and serializes
retry slots after rate-limit responses. Timed-out SDK reads are not retried
because the pinned SDK does not expose cancellation and a second request could
overlap the first. Contract reverts and all financial writes are single-attempt
operations. The Create screen has no read-dependent load, so unrelated
marketplace, credit, economy and claim failures cannot block procurement
preparation.

The configurable-contract batch archives are deployment-scoped and record
automated multi-wallet Studionet integration testing. Batch 1 records PASS
results for no-compliant refund, unrevealed-bond forfeiture, unauthorized claim
rejection and duplicate-claim rejection. Batch 2 records PASS for correction
exhaustion and seller default. Its uncertain-delivery scenario is explicitly
`BLOCKED`: three finalized delivery-review attempts did not produce an
`UNKNOWN` result, so the runner did not mislabel an ordinary fallback default
as neutral unwind. Batch 3 records PASS results for delivery default and buyer
recovery (auction 10), buyer refusal followed by independent PASS and seller
payment (auction 11), a timely reserved review that remained protected through
its ordinary deadline (auction 12), and stale reserved-review cancellation
after grace with no award (auction 13). The timely and buyer-refusal buyer
credits were consumed by wallet-level aggregate claims. The archive records
the exact parent message amounts and the scenario entitlement separately; no
second claim was submitted.

The credits ledger is wallet-level rather than auction-level. A single valid
claim can therefore consume credit accumulated by that wallet across multiple
settled procurements. Batch 3 records this as
`CONSUMED_IN_AGGREGATED_CLAIM` with both the expected scenario entitlement and
the actual emitted message amount. It is not evidence of a standalone
per-auction transfer. The configurable archive reports 128 GEN dispatched,
119 GEN outstanding and a matching 119 GEN contract balance. Child-message
acceptance is not exposed by the pinned SDK, so claim records remain
`DISPATCHED_PENDING_EXTERNAL_SETTLEMENT` even where a recipient balance read
is available.

The replacement claim parent receipts expose outbound message records and exact
beneficiaries/values. The replacement archive also records post-claim recipient
balance reads; because no pre-run snapshot was captured for that run, those
reads are not presented as an independently measured balance delta. Studionet
did not expose a separate child acceptance receipt through the pinned SDK;
claim records therefore remain `DISPATCHED_PENDING_EXTERNAL_SETTLEMENT` rather
than being promoted to a stronger status by assumption.

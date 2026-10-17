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
- `studionet/consensus-investigation.json` records the independently re-fetched disagreement receipts, vote patterns, rounds, quorum-cancellation evidence, unavailable fee/timing fields and the one-round PASS convergence.
- `studionet/live-negative.json` records the historical replacement-address run. A configurable-contract run is archived separately after execution so the two deployments cannot be conflated. Its ignored companion contains salts and full private execution state and must never be published.
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

The current `live-negative.json` archive records PASS hosted scenarios for
no-compliant refund, delivery default recovery, buyer refusal followed by
independent PASS, timely reserved review after cutoff, and stale review
cancellation after grace. The bounded correction and uncertain follow-up
auctions reached finalized reveal parents with `leaderExecution: ERROR`; the
runner preserved those failures and recovered the locked auctions through
no-award claims without treating them as successful delivery demonstrations.

The replacement claim parent receipts expose outbound message records and exact
beneficiaries/values. The replacement archive also records post-claim recipient
balance reads; because no pre-run snapshot was captured for that run, those
reads are not presented as an independently measured balance delta. Studionet
did not expose a separate child acceptance receipt through the pinned SDK;
claim records therefore remain `DISPATCHED_PENDING_EXTERNAL_SETTLEMENT` rather
than being promoted to a stronger status by assumption.

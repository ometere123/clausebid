# Studionet evidence archive

Never invent addresses, transaction hashes, validator votes, CI results, or recipient balances.

The final deployment operator should add:
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

- `studionet/deployment.json` records the single source-verified deployment.
- `studionet/source-verification.json` records the retrieved-code SHA-256 comparison.
- `studionet/live-demo.json` records the five-wallet auction, validator findings, rejected/retried consensus transactions, correction flow, claims, emitted messages and recipient balance readbacks.
- `studionet/evidence-matrix.md` maps security/economic claims to exact tests and finalized hosted transactions, and labels historical evidence from the superseded address.

The claim parent receipts expose outbound message records and the recipient balance readbacks prove the native-GEN deltas. Studionet did not expose a separate child acceptance receipt through the pinned SDK; claim records therefore remain `DISPATCHED_PENDING_EXTERNAL_SETTLEMENT` rather than being promoted to a stronger status by assumption.

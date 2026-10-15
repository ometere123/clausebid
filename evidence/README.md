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

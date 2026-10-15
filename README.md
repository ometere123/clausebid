# CLAUSEBID

Clause-aware, bonded, escrow-funded reverse procurement for **public, bounded digital text** on GenLayer.

**Architecture:** one Python Intelligent Contract, one React/Vite static frontend with seven screens. **Network:** stable Studionet, chain 61999, RPC `https://studio.genlayer.com/api`. **Currency:** native Studionet GEN. No backend, oracle, database or operator override.

## Status

This repository is a **source implementation awaiting GenVM lint/Direct Mode/Studionet compatibility testing and end-to-end deployment verification**. An attractive interface, downloaded code, and compiled Python are not evidence of a valid live contract. No claim of a deployed contract or proven recipient payout is made.

## Contract behavior

1. Buyer creates four immutable requirements and reference facts, deposits 5–100 GEN.
2. Sellers each deposit a refundable 5%-of-budget bond (0.5–5 GEN) and commit a SHA-256 hash binding network, contract, auction, wallet, price, terms and a 32-byte random salt.
3. After a 10-minute commit period, sellers reveal original bids during a 20-minute reveal period.
4. For the next 30 minutes, anyone can initiate per-bid compliance assessments; GenLayer validators independently re-evaluate all four material requirements.
5. After all revealed offers are reviewed or the review cutoff passes, deterministic code awards the lowest-price COMPLIANT bid. Ties go to the earliest commitment.
6. Winner submits public text within 30 minutes. Buyer may accept within 10 minutes; otherwise seller can request consensus review. Two 20-minute corrections are available for material defects.
7. Seller claims successful escrow payment + bond. Losing revealed bidders reclaim bonds; buyer claims unspent budget. Default/no-award/unwind paths allocate liabilities deterministically.
8. Every claim is single-use. Outbound transfers to EOAs emit on finalization; ambiguous failed transfers **must not** be blindly retried.

## Development

```sh
npm install                       # repository-local genlayer@0.39.1
python3.12 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
genvm-lint check contracts/clausebid.py
pytest tests/direct/ -v
npm install --prefix frontend
npm run build --prefix frontend
npm run test --prefix frontend
```

Copy `frontend/.env.example` to `frontend/.env`, then populate **an actual verified contract address** after deployment. Run `npm run dev --prefix frontend`.

Only connect an injected EIP-1193 wallet to Studionet. Private keys used by CLI scripts stay in ignored `.env` files. Contract writes require separate protocol fees; escrow value must not be treated as payment for protocol fees.

## Real network handoff

The deployment operator must first verify the exact Python dependency header against pinned CLI 0.39.1; execute full GenVM lint and Direct Mode tests; fix runtime/storage/schema discrepancies; run fee and semantic-convergence profiling; test every economic path with five separate wallets; deploy with source hash and transcript; verify each decision's FINALIZED + FINISHED_WITH_RETURN outcome and the external native GEN recipient transfer; and publish the frontend only after successful contract-read/write validation.

Do not accept a finality flag without execution success. Do not turn timed-out review transactions into automatic approvals. Direct Mode mocks are not external validator evidence. A failed outbound value message does not automatically restore money. There is no privileged administrator rescue path.

## Time control

Application phase durations derive from the single `WINDOW=1800` constant: 10-minute commit, 20-minute reveal and 30-minute review/delivery/recovery. The underlying chain's consensus/appeal/finalization periods are **not controlled by this variable**. Do not change the master window for a deployment with unsettled procurements.

## Auditing boundaries

The product relies on the buyer's frozen product facts and signed offers; it does not authenticate real-world product truth, originality or confidentiality. All text is public. Bounded wallets are not unique human identities. Genuine uncertainty can unwind a delivery, and rejected text may have already been read by the buyer.

## Public API

`create_procurement`, `commit_bid`, `reveal_bid`, `evaluate_bid`, `finalize_award`, `submit_delivery`, `accept_delivery`, `dispute_delivery`, `review_delivery`, `expire_delivery`, `claim`. Reads: `get_procurement`, `get_offer`, `get_seller`, `get_credit`, `get_economy`, `get_count`.

## Source references

- [GenLayer storage](https://docs.genlayer.com/developers/intelligent-contracts/storage)
- [Equivalence principle](https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle)
- [Payable value transfers](https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers)
- [Studionet transactions](https://docs.genlayer.com/developers/decentralized-applications/writing-data)
- [Direct Mode](https://docs.genlayer.com/developers/intelligent-contracts/testing)

**Note:** CLI-driven funded demonstration and final deployment/evidence will be completed and documented after verification, not fabricated in this repository.

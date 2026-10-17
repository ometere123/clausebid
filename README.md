# CLAUSEBID

Clause-aware, bonded, escrow-funded reverse procurement for **public, bounded digital text** on GenLayer.

**Architecture:** one Python Intelligent Contract, one React/Vite static frontend with seven screens. **Network:** stable Studionet, chain 61999, RPC `https://studio.genlayer.com/api`. **Currency:** native Studionet GEN. No backend, oracle, database or operator override.

## Status

The source implementation is pinned to the required Studionet toolchain and is exercised by GenVM lint, Direct Mode state-machine tests, commitment-vector tests, frontend unit tests, and Playwright browser tests. Live deployment and payout claims are recorded only in `evidence/studionet/` after receipt and recipient-balance verification; Direct Mode and the Playwright fixture harness are not presented as live validator or transfer evidence.

## Contract behavior

1. Buyer creates four immutable requirements and reference facts, deposits 5–100 GEN.
2. Sellers each deposit a refundable 5%-of-budget bond (0.5–5 GEN) and commit a SHA-256 hash binding network, contract, auction, wallet, price, terms and a 32-byte random salt.
3. At publication the buyer chooses whole-second commitment and reveal durations. Commitment is 600–172800 seconds, reveal is 1200–345600 seconds, and their total is at most 518400 seconds. The contract freezes the schedule with the funded procurement; the buyer cannot change it later. The UI defaults to 24 hours + 48 hours and the minimum 10-minute + 20-minute schedule is available for accelerated Studionet verification.
4. After the reveal period, anyone can reserve each revealed bid for the procurement-specific eligibility window. GenLayer validators independently re-evaluate all four material requirements. A reserved review may finalize after the application cutoff; an unresolved reservation cannot be bypassed until its explicit per-procurement grace period expires.
5. After all revealed offers are reviewed, or after the cutoff plus review grace, deterministic code awards the lowest-price COMPLIANT bid. Ties go to the earliest commitment. Unresolved reservations fail closed.
6. Winner submits public text within the frozen delivery window. Buyer may accept within the frozen response window; otherwise any keeper can reserve an independent fulfillment review. Two corrections are available for material defects within the frozen correction window. A review reserved before its deadline is protected from expiry races; a stale reservation can be cancelled after its per-procurement grace period.
7. Seller claims successful escrow payment + bond. Losing revealed bidders reclaim bonds; buyer claims unspent budget. Default/no-award/unwind paths allocate liabilities deterministically.
8. Every claim is single-use. Outbound transfers to EOAs emit on finalization; ambiguous failed transfers **must not** be blindly retried.

## Development

```sh
npm ci                            # repository-local genlayer@0.39.1 and genlayer-js@1.1.8
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --require-hashes -r requirements.lock
genvm-lint check contracts/clausebid.py --json
python -m pytest -q tests
npm ci --prefix frontend
npm run build --prefix frontend
npm run test --prefix frontend
```

Copy `frontend/.env.example` to `frontend/.env`, then populate **an actual verified contract address** after deployment. Run `npm run dev --prefix frontend`.

Only connect an injected EIP-1193 wallet to Studionet. Private keys used by CLI scripts stay in ignored `.env` files. The driver also supports the repository-local encrypted CLI keystores through `CLAUSEBID_KEYSTORE_PASSWORD`; it never writes private keys to the repository. Contract writes require separate protocol fees; escrow value must not be treated as payment for protocol fees.

The browser subscribes to `accountsChanged`, `chainChanged` and `disconnect`, and silently restores an already-authorized account with `eth_accounts` after reload without opening a signing prompt. The Disconnect wallet control clears only ClauseBid's local session; injected-wallet authorization remains under the wallet's own controls, so a refresh may restore that account. Locally tracked transaction hashes are restored after reload, and a parent receipt is never presented as an external payout receipt. The claim explorer keys archived receipts by chain, deployment, beneficiary and amount; the superseded deployment is retained only as historical evidence. Read traffic uses one shared coordinator with three concurrent slots, identical-read deduplication, deployment-scoped confirmed-data caching, and at most two transient retries with exponential and retry-after backoff. Concurrent retries reserve staggered slots after a rate-limit response. Create performs no contract reads; Marketplace and Home load only procurement records; My dashboard loads wallet-relevant activity and that wallet's credit; Audit Explorer loads claim history. Read diagnostics retain only the RPC method, contract method, sanitized provider code/status, retry count and a bounded message. A read failure in an optional area preserves confirmed cards and shows a specific warning. Studionet read-rate-limit responses are shown as unavailable rather than fabricated state. Financial writes and contract reverts are never retried by the read coordinator. The Playwright suite uses an explicitly test-only `VITE_E2E_FIXTURE=true` synthetic contract-state harness for recovery/error UI; production builds never set that flag. The deployed URL is separately checked against the real Studionet binding. The production bundle and genuine-wallet verification status are recorded in `evidence/studionet/frontend-verification.json`.

## Live evidence

Use the repository-local CLI entry point, never a globally installed version:

```sh
node node_modules/genlayer/dist/index.js network set studionet
node node_modules/genlayer/dist/index.js network info
node node_modules/genlayer/dist/index.js deploy --contract contracts/clausebid.py
node scripts/preflight.mjs
node --env-file=.env scripts/drive.mjs inspect
```

The driver queues independent wallet submissions during the short commitment window, records every transaction ID in the ignored `evidence/session.local.json`, and requires `FINALIZED` plus a successful leader execution/return in the pinned SDK receipt before treating a write as successful. On Studionet, `genlayer-js@1.1.8` exposes the execution result through the consensus leader receipt rather than always populating `txExecutionResultName`. `claim` finality is still not payout evidence: inspect the immutable claim record, outbound message/child receipt, and recipient balance delta.

For local encrypted CLI accounts, set `CLAUSEBID_KEYSTORE_PASSWORD` only in the calling shell and use the default account names (`praest-deployer`, `clausebid-seller-a` through `clausebid-seller-d`). Do not place that password or keystore contents in Git. The five-wallet driver uses real elapsed Studionet time; it does not warp the hosted chain.

The resumable negative-path runner uses the same five encrypted CLI accounts and
real elapsed time. It persists private salts and full receipts only in the
ignored `evidence/live-negative.local.json`; the publishable summaries are
written to `evidence/studionet/live-negative.json`.

```powershell
$env:CLAUSEBID_CONTRACT_ADDRESS='0x24f95ED58fcfa4e339C504fF388A922347757515'
$env:CLAUSEBID_KEYSTORE_PASSWORD='set only in this shell'
node scripts/live-negative.mjs start
node scripts/live-negative.mjs resume
node scripts/live-negative.mjs status
```

`resume` is safe to run after interruption. It records finalized parent
receipts, successful or failed execution, state snapshots, entitlement values,
and pre/post native-balance reads. Reads are serialized with bounded spacing;
only transient reads may retry, and an in-flight or hashless write is preserved
as `SUBMISSION_ERROR` instead of being resubmitted. It never retries an
ambiguous claim or outbound value transfer. The runner's hosted results are
automated multi-wallet Studionet integration testing, not Direct Mode or mocked
consensus evidence. Its finite scenarios include no-award refund, unrevealed
bonds, delivery recovery, buyer refusal, correction exhaustion, neutral
unwind, timely reserved reviews and stale review cancellation.

The current replacement-deployment archive contains PASS runs for no-compliant
refund, delivery default recovery, buyer refusal followed by independent PASS,
timely reserved review after cutoff, and stale reserved-review cancellation.
Two bounded follow-up correction/uncertain attempts reached finalized reveal
transactions with `leaderExecution: ERROR`; they were not retried, and their
no-award recovery is recorded as blocked provider evidence rather than a claim
that the intended delivery paths succeeded. See
`evidence/studionet/live-negative.json` and the evidence matrix for the exact
hashes and balance snapshots.

Do not accept a finality flag without execution success. Do not turn timed-out review transactions into automatic approvals. Direct Mode mocks are not external validator evidence. A failed outbound value message does not automatically restore money. There is no privileged administrator rescue path.

## Time control

Each procurement freezes its own schedule at funding. The contract accepts commitment durations from 600 seconds (10 minutes) through 172800 seconds (48 hours), reveal durations from 1200 seconds (20 minutes) through 345600 seconds (96 hours), and a combined total from 1800 seconds through 518400 seconds (144 hours). The frontend defaults to 86400 + 172800 seconds (24 + 48 hours), while the live accelerated runner explicitly selects 600 + 1200 seconds.

From `T = commit_seconds + reveal_seconds`, the contract derives eligibility review, delivery, bid-review grace, delivery review and delivery-review grace as `min(T, 72 hours)`, buyer response as `min(T // 3, 24 hours)`, and each correction as `min((2 * T) // 3, 48 hours)`. Phase deadlines are anchored to the actual on-chain start of that phase: publication, reveal close, award, delivery submission, buyer response/review, or correction decision as applicable. These values are immutable per procurement and are read from `get_procurement`; they are not frontend timers.

The underlying chain's consensus/appeal/finalization periods are not controlled by application durations. A timely reserved review may finalize after its application deadline; expiry and cancellation cannot create a contradictory economic outcome while that reservation remains in flight. Direct Mode uses `vm.warp()` to prove long schedules; hosted Studionet uses real elapsed time.

## Auditing boundaries

The product relies on the buyer's frozen product facts and signed offers; it does not authenticate real-world product truth, originality or confidentiality. All text is public. Bounded wallets are not unique human identities. Genuine uncertainty can unwind a delivery, and rejected text may have already been read by the buyer.

## Public API

`create_procurement`, `commit_bid`, `reveal_bid`, `begin_bid_review`, `evaluate_bid`, `cancel_bid_review`, `finalize_award`, `submit_delivery`, `accept_delivery`, `dispute_delivery`, `begin_delivery_review`, `review_delivery`, `expire_delivery`, `claim`. Reads: `get_procurement`, `get_offer`, `get_seller`, `get_credit`, `get_claim`, `get_delivery_attempt`, `get_delivery_verdict`, `get_economy`, `get_count`.

## Source references

- [GenLayer storage](https://docs.genlayer.com/developers/intelligent-contracts/storage)
- [Equivalence principle](https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle)
- [Payable value transfers](https://docs.genlayer.com/developers/intelligent-contracts/features/value-transfers)
- [Studionet transactions](https://docs.genlayer.com/developers/decentralized-applications/writing-data)
- [Direct Mode](https://docs.genlayer.com/developers/intelligent-contracts/testing)

Deployment-specific addresses, source hashes, receipts, and recipient readbacks belong in `evidence/studionet/`; absent evidence is reported as absent rather than inferred from a finalized parent transaction.

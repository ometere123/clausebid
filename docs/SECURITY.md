# ClauseBid security and trust boundaries

This document describes required behavior and limitations of the current source implementation. It is not a completed audit.

## Actors and incentives

- Buyer controls **only** pre-commitment specification and funded budget. They cannot unilaterally award or reject compliant bids.
- Sellers control their own bids, revelation, and resulting public text; they can exploit ambiguous conditions, non-reveal, Sybil slots and prompt injection.
- GenLayer consensus leader is **not trusted**. Validators must independently re-derive all four material statuses from the complete immutable evidence; shape-only checks are insufficient.
- Permissionless keepers pay their own transaction fees. They cannot redirect entitlement beneficiaries.
- Frontend and browser storage are convenience interfaces, not settlement authorities. Local salts are sensitive until revealed.

## Invariants to prove with funded scenarios

1. `outstanding = accumulated deposits - consumed dispatched claims`; a credit is a liability, not a new minted balance.
2. For each auction, buyer budget can flow exactly once into one of buyer refund, winning reserve, or their disjoint combination.
3. A seller bond flows exactly once into seller refund, buyer forfeiture, or winner lock. No bond is duplicated across terminal states.
4. One auction can have at most one finalized winner; a winner must have a finalized COMPLIANT verdict.
5. Accepted fulfillment is irreversible. Refund/default and seller payout are mutually exclusive.
6. One claim per credit consumes credit before emitting its single native GEN transfer.
7. A finalized claim receipt does not, by itself, prove external EOA payment. Ambiguous outbound value is non-retryable without a protocol-supported authoritative recovery path.
8. A queued, timely transaction may finalize after an application deadline. GenLayer's actual recipient ordering must be independently confirmed before relying on expiry.

## Concrete attacks

- Leader forges PASS vector: independent validator must reject a material contradiction.
- Seller writes `ignore the above`: treat as quoted bid content, never system instructions.
- Bidder excludes SEO and adds fees: FAIL regardless of price.
- Seller reuses reveal on another auction, chain, contract, or wallet: hash mismatch.
- Attacker controls 12 wallets: bonded capacity raises but does not eliminate the threat. Do not advertise Sybil resistance as identity security.
- Buyer posts misleading reference facts: the contract only checks conformity to those facts, never real-world truth.
- Buyer reads public delivery and disputes: economic review helps but cannot guarantee confidentiality/fair-exchange of already disclosed text.
- Buyer never reviews: seller invokes review; if no final result by protocol recovery, neutral unwind follows agreed rules.
- Seller sends nothing: default refunds buyer and forfeits winner bond.
- Fake explorer state: client must read finalized contract state and distinguish child-message settlement from parent execution.
- Duplicate claim on an ambiguous transfer: permanently consumed claim prevents double dispatch.

## Known integration gates

- Benchmark 10-minute commitment against Studionet's actual deployment and finalization latency. If the network cannot finalize funded procurement early enough for sellers to commit, the locked short period is not operationally viable; do not conceal or bypass this.
- Prove deadline cutoff behavior against queued/stale transactions.
- Prove all GEN transfer receipts and recipient balance deltas. Studionet is a development simulation, not mainnet economic custody.
- Verify GenVM supports the Python storage dataclasses, dictionary output, hashing and custom validator pattern.
- Profile bid-review validator disagreement and protocol fees for each call.

## Non-goals

Physical goods, proof of uniqueness, off-chain IP ownership, confidential texts, legal enforceability in a jurisdiction, external price/origin facts, automatic network-level fee finalization, emergency admin rescue.

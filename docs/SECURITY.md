# ClauseBid security and trust boundaries

This document records the source audit boundary, enforced invariants, and evidence still required for live Studionet settlement. It does not treat lint or Direct Mode as proof of live validator independence or recipient payment.

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
9. An auction award cannot finalize while any revealed offer is in `REVIEWING`; a delivery unwind cannot finalize while fulfillment is in `REVIEWING_DELIVERY` before the explicit grace period.
10. Each dispatched claim has a sequential immutable record containing its beneficiary, amount, and pending external-settlement status. The record is not a promise that the recipient has already received GEN.

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

## Live verification gates

- Benchmark the selected commitment and reveal schedule against Studionet's actual deployment and finalization latency. The contract accepts 10-minute/20-minute minimums for accelerated testing and 24-hour/48-hour defaults for normal procurement; if a short schedule cannot finalize funded writes before their application phase closes, record the timing evidence and use a longer schedule rather than bypassing the contract.
- Prove deadline cutoff behavior against queued/stale transactions.
- Prove all GEN transfer receipts and recipient balance deltas. Studionet is a development simulation, not mainnet economic custody.
- Verify the deployed GenVM supports the Python storage dataclasses, dictionary output, hashing and custom validator pattern.
- Profile bid-review validator disagreement and protocol fees for each call.

Every deployment record is immutable evidence. When the configurable contract is
deployed, its manifest must retain the prior `0x24f95...7515` deployment and its
unsettled obligations as historical provenance; no old procurement or GEN credit
is migrated automatically. New procurements use only the source-verified
configurable address.

## Non-goals

Physical goods, proof of uniqueness, off-chain IP ownership, confidential texts, legal enforceability in a jurisdiction, external price/origin facts, automatic network-level fee finalization, emergency admin rescue.

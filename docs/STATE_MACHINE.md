# ClauseBid state machine

```text
BIDDING
  reveal complete -> begin_bid_review -> evaluate_bid
    (per seller: REVEALED -> REVIEWING -> COMPLIANT/NONCOMPLIANT/UNCERTAIN)
  review reservation past procurement-specific cutoff + grace -> cancel_bid_review -> UNCERTAIN
  all reviews finalized, or cutoff + grace -> finalize_award
    no compliant bids => NO_AWARD (buyer budget refunded, revealed bonds returned, unrevealed bonds forfeited)
    at least one eligible => AWARDED (lowest price, earliest commitment tie)
AWARDED
  seller submits before due => AWAITING_BUYER
  seller misses deadline => DEFAULTED
AWAITING_BUYER
  buyer accepts => SETTLED
  buyer disputes in response window => REVIEW
  buyer silent past response window => begin_delivery_review -> REVIEWING_DELIVERY
  recovery deadline passes => UNWOUND
REVIEW
  begin_delivery_review -> REVIEWING_DELIVERY
REVIEWING_DELIVERY
  consensus: PASS => SETTLED
             FAIL => CORRECTION (if attempts remain) else DEFAULTED
             UNKNOWN => UNWOUND
  reservation past review deadline + grace => expire_delivery => UNWOUND
  recovery deadline passes => UNWOUND
CORRECTION
  seller resubmits within the frozen correction window => AWAITING_BUYER
  deadline expires => DEFAULTED
SETTLED / NO_AWARD / DEFAULTED / UNWOUND
  terminal; credits can be claimed by immutable beneficiaries
```

No "admin arbitrator" and no off-chain mutable scoreboard. Contract timestamps derive from the pinned transaction timestamp, not the validator wall clock. Network consensus status and application states must always be distinguished.

## Per-procurement timing

`create_procurement` accepts `commit_seconds` and `reveal_seconds` and stores both values plus every derived duration. The contract enforces commitment 600–172800 seconds, reveal 1200–345600 seconds, and total 1800–518400 seconds. The default UI schedule is 86400 + 172800 seconds. For `T = commit_seconds + reveal_seconds`:

- eligibility review, delivery, bid-review grace, delivery review and delivery-review grace are `min(T, 259200)`;
- buyer response is `min(T // 3, 86400)`;
- each correction is `min((2 * T) // 3, 172800)`.

Commitment and reveal deadlines start at publication and commitment close respectively. Delivery starts at award, buyer response starts at each delivery submission, delivery review starts at response expiry or dispute, and correction starts at each failed review. A queued transaction that reserved a review before its cutoff remains protected while that review is `REVIEWING`; cancellation is permitted only after the stored grace period.

Commitment hashing: SHA-256 of the concatenation of eight UTF-8 fields, each prefixed by its decimal UTF-8 byte length and `:`. Fields: `clausebid/commit/v1`, chain ID, lower-case contract address, auction ID, lower-case seller, wei price, exact offer terms, 64-character salt. The browser and script implementations must match.

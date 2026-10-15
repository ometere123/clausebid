# ClauseBid state machine

```text
BIDDING
  reveal complete -> evaluate_bid (per seller: REVEALED -> COMPLIANT/NONCOMPLIANT/UNCERTAIN)
  finalized set or cutoff -> finalize_award
    no compliant bids => NO_AWARD (buyer budget refunded, revealed bonds returned, unrevealed bonds forfeited)
    at least one eligible => AWARDED (lowest price, earliest commitment tie)
AWARDED
  seller submits before due => AWAITING_BUYER
  seller misses deadline => DEFAULTED
AWAITING_BUYER
  buyer accepts => SETTLED
  buyer disputes in response window => REVIEW
  buyer silent past response window => seller calls review_delivery
  recovery deadline passes => UNWOUND
REVIEW
  consensus: PASS => SETTLED
             FAIL => CORRECTION (if attempts remain) else DEFAULTED
             UNKNOWN => UNWOUND
  recovery deadline passes => UNWOUND
CORRECTION
  seller resubmits within 20 min => AWAITING_BUYER
  deadline expires => DEFAULTED
SETTLED / NO_AWARD / DEFAULTED / UNWOUND
  terminal; credits can be claimed by immutable beneficiaries
```

No "admin arbitrator" and no off-chain mutable scoreboard. Contract timestamps derive from the pinned transaction timestamp, not the validator wall clock. Network consensus status and application states must always be distinguished.

Commitment hashing: SHA-256 of the concatenation of eight UTF-8 fields, each prefixed by its decimal UTF-8 byte length and `:`. Fields: `clausebid/commit/v1`, chain ID, lower-case contract address, auction ID, lower-case seller, wei price, exact offer terms, 64-character salt. The browser and script implementations must match.

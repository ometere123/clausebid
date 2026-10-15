"""State-machine and economic regression tests for the funded contract.

These tests exercise deterministic transitions and the validator boundary in
Direct Mode. They intentionally do not treat Direct Mode as live validator or
recipient-settlement evidence; that evidence belongs in the Studionet transcript.
"""

import json

import pytest


GEN = 10**18
T0 = "2026-01-01T00:00:00Z"


def _addr(account):
    if isinstance(account, bytes):
        return "0x" + account.hex()
    return str(account).lower()


def _create(vm, deploy, buyer, budget=20 * GEN):
    vm._chain_id = 61999
    vm.warp(T0)
    contract = deploy("contracts/clausebid.py")
    vm.sender = buyer
    vm.value = budget
    auction_id = contract.create_procurement(
        "Bounded copy procurement",
        "Approved product facts; public fictional scope.",
        "Provide exactly three complete descriptions.",
        "State the approved warranty for each description.",
        "Include an SEO title for every description.",
        "All required components are included in the all-in price.",
        budget,
    )
    vm.value = 0
    return contract, int(auction_id)


def _commit(vm, contract, auction_id, seller, price, terms, salt="a" * 64):
    digest = contract._hash(auction_id, _addr(seller), price, terms, salt)
    vm.sender = seller
    vm.value = int(contract.get_procurement(auction_id).bond)
    contract.commit_bid(auction_id, digest)
    vm.value = 0
    return digest


def _reveal(vm, contract, auction_id, seller, price, terms, salt="a" * 64):
    vm.sender = seller
    contract.reveal_bid(auction_id, price, terms, salt)


def _open_reveal(vm):
    vm.warp("2026-01-01T00:10:01Z")


def _open_review(vm):
    vm.warp("2026-01-01T00:30:01Z")


def _classify(vm, contract, statuses):
    vm.clear_mocks()
    vm.mock_llm(
        r".*independently applying an immutable procurement rulebook.*",
        json.dumps({"statuses": statuses, "quotes": [""] * 4}),
    )


def _evaluate(vm, contract, auction_id, seller):
    contract.begin_bid_review(auction_id, _addr(seller))
    return contract.evaluate_bid(auction_id, _addr(seller))


def _credit_total(contract, wallets, auction_id=None):
    # A caller may only read their own credit in production, so verify the
    # expected beneficiaries individually instead of relying on storage access.
    return sum(int(contract.get_credit(_addr(wallet))) for wallet in wallets)


def test_create_requires_exact_funding_and_freezes_four_clauses(direct_vm, direct_deploy, direct_alice):
    direct_vm._chain_id = 61999
    contract = direct_deploy("contracts/clausebid.py")
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("deposit must equal budget"):
        direct_vm.value = 19 * GEN
        contract.create_procurement(
            "Title", "Reference", "R1", "R2", "R3", "R4", 20 * GEN
        )
    direct_vm.value = 20 * GEN
    auction_id = contract.create_procurement(
        "Title", "Reference", "R1", "R2", "R3", "R4", 20 * GEN
    )
    row = contract.get_procurement(auction_id)
    assert row.title == "Title"
    assert [row.r1, row.r2, row.r3, row.r4] == ["R1", "R2", "R3", "R4"]
    assert int(row.budget) == 20 * GEN


def test_writes_reject_non_studionet_domain(direct_vm, direct_deploy, direct_alice):
    contract = direct_deploy("contracts/clausebid.py")
    direct_vm.sender = direct_alice
    direct_vm._chain_id = 61997
    direct_vm.value = 20 * GEN
    with direct_vm.expect_revert("wrong network"):
        contract.create_procurement("Title", "Reference", "R1", "R2", "R3", "R4", 20 * GEN)


def test_wrong_bond_duplicate_and_slot_limit(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_owner, direct_accounts):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice)
    seller = direct_accounts[0]
    digest = contract._hash(auction_id, _addr(seller), GEN, "offer", "a" * 64)
    direct_vm.sender = seller
    direct_vm.value = 1
    with direct_vm.expect_revert("incorrect bidder bond"):
        contract.commit_bid(auction_id, digest)
    direct_vm.value = int(contract.get_procurement(auction_id).bond)
    contract.commit_bid(auction_id, digest)
    with direct_vm.expect_revert("seller already committed"):
        contract.commit_bid(auction_id, digest)
    # The same auction can fill all twelve immutable slots; the thirteenth is rejected.
    auction2 = auction_id
    contract2 = contract
    bond = int(contract2.get_procurement(auction2).bond)
    # The first seller already occupies one slot.
    for seller in [*direct_accounts[1:], direct_bob, direct_charlie]:
        _commit(direct_vm, contract2, auction2, seller, GEN, "all-in")
    from gltest.direct.loader import create_address
    thirteenth = create_address("thirteenth-seller")
    with direct_vm.expect_revert("all bid slots occupied"):
        _commit(direct_vm, contract2, auction2, thirteenth, GEN, "all-in")
    assert int(contract2.get_procurement(auction2).bidder_count) == 12
    assert bond == GEN


def test_wrong_wallet_corrupted_reveal_and_replay_domain(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice)
    price = 4 * GEN
    terms = "all-in offer"
    salt = "b" * 64
    _commit(direct_vm, contract, auction_id, direct_bob, price, terms, salt)
    _open_reveal(direct_vm)
    with direct_vm.prank(direct_charlie), direct_vm.expect_revert("no commitment"):
        contract.reveal_bid(auction_id, price, terms, salt)
    with direct_vm.prank(direct_bob), direct_vm.expect_revert("commitment does not match"):
        contract.reveal_bid(auction_id, price + 1, terms, salt)
    with direct_vm.prank(direct_bob), direct_vm.expect_revert("commitment does not match"):
        contract.reveal_bid(auction_id, price, terms, "c" * 64)
    # The domain binds chain, contract, auction and signer, not only visible text.
    assert contract._hash(auction_id, _addr(direct_bob), price, terms, salt) != contract._hash(
        auction_id + 1, _addr(direct_bob), price, terms, salt
    )


def test_six_concurrent_bids_and_missing_reveal_are_accounted(direct_vm, direct_deploy, direct_alice, direct_accounts):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice)
    for seller in direct_accounts[:6]:
        _commit(direct_vm, contract, auction_id, seller, 3 * GEN, "all-in")
    _open_reveal(direct_vm)
    for seller in direct_accounts[:5]:
        _reveal(direct_vm, contract, auction_id, seller, 3 * GEN, "all-in")
    direct_vm.warp("2026-01-01T01:00:01Z")
    # A missing reveal is never treated as a seller-approved offer.
    result = contract.finalize_award(auction_id)
    assert result == "NO_AWARD"
    assert contract.get_procurement(auction_id).status == "NO_AWARD"
    assert int(contract.get_credit(_addr(direct_alice))) == 20 * GEN + int(contract.get_procurement(auction_id).bond)
    assert int(contract.get_credit(_addr(direct_accounts[5]))) == 0


def test_lowest_compliant_bid_wins_and_ties_use_commit_position(direct_vm, direct_deploy, direct_alice, direct_accounts):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice, 40 * GEN)
    terms = [
        "I exclude the SEO title, so this is not compliant.",
        "All four obligations are included in this all-in offer.",
        "All four obligations are included; conditional extra charges may apply.",
        "All four obligations are included in this all-in offer.",
    ]
    prices = [10 * GEN, 25 * GEN, 8 * GEN, 25 * GEN]
    for seller, price, text in zip(direct_accounts[:4], prices, terms):
        _commit(direct_vm, contract, auction_id, seller, price, text)
    _open_reveal(direct_vm)
    for seller, price, text in zip(direct_accounts[:4], prices, terms):
        _reveal(direct_vm, contract, auction_id, seller, price, text)
    _open_review(direct_vm)
    verdicts = [
        ["FAIL", "PASS", "PASS", "PASS"],
        ["PASS"] * 4,
        ["FAIL", "PASS", "FAIL", "PASS"],
        ["PASS"] * 4,
    ]
    for seller, expected in zip(direct_accounts[:4], verdicts):
        _classify(direct_vm, contract, expected)
        assert _evaluate(direct_vm, contract, auction_id, seller) == ("COMPLIANT" if expected == ["PASS"] * 4 else "NONCOMPLIANT")
    assert contract.finalize_award(auction_id) == _addr(direct_accounts[1])
    row = contract.get_procurement(auction_id)
    assert row.winner == _addr(direct_accounts[1])
    assert int(row.winning_price) == 25 * GEN


def test_finalize_rejects_unreviewed_offer_before_cutoff(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice)
    _commit(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_reveal(direct_vm)
    _reveal(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    direct_vm.warp("2026-01-01T00:30:01Z")
    with direct_vm.expect_revert("unreviewed offer"):
        contract.finalize_award(auction_id)


def test_award_cannot_race_reserved_bid_review(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice)
    _commit(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_reveal(direct_vm)
    _reveal(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_review(direct_vm)
    contract.begin_bid_review(auction_id, _addr(direct_bob))
    with direct_vm.expect_revert("review still in flight"):
        direct_vm.warp("2026-01-01T01:00:01Z")
        contract.finalize_award(auction_id)
    # Graceful cancellation wins the race against a stale consensus result.
    direct_vm.warp("2026-01-01T01:30:01Z")
    contract.cancel_bid_review(auction_id, _addr(direct_bob))
    with direct_vm.expect_revert("bid not reviewable"):
        contract.evaluate_bid(auction_id, _addr(direct_bob))
    assert contract.finalize_award(auction_id) == "NO_AWARD"


def test_timely_reserved_bid_review_can_finalize_after_cutoff(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice)
    _commit(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_reveal(direct_vm)
    _reveal(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_review(direct_vm)
    contract.begin_bid_review(auction_id, _addr(direct_bob))
    direct_vm.warp("2026-01-01T01:00:01Z")
    _classify(direct_vm, contract, ["PASS"] * 4)
    assert contract.evaluate_bid(auction_id, _addr(direct_bob)) == "COMPLIANT"
    assert contract.finalize_award(auction_id) == _addr(direct_bob)


def test_delivery_expiry_cannot_race_reserved_fulfillment_review(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice)
    _commit(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_reveal(direct_vm)
    _reveal(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_review(direct_vm)
    _classify(direct_vm, contract, ["PASS"] * 4)
    _evaluate(direct_vm, contract, auction_id, direct_bob)
    contract.finalize_award(auction_id)
    direct_vm.sender = direct_bob
    direct_vm.warp("2026-01-01T00:40:01Z")
    contract.submit_delivery(auction_id, "fulfills every mandatory obligation")
    direct_vm.sender = direct_charlie
    direct_vm.warp("2026-01-01T01:00:02Z")
    contract.begin_delivery_review(auction_id)
    direct_vm.warp("2026-01-01T01:20:02Z")
    with direct_vm.expect_revert("review still in flight"):
        contract.expire_delivery(auction_id)
    direct_vm.warp("2026-01-01T01:50:03Z")
    assert contract.expire_delivery(auction_id) == "UNWOUND"
    with direct_vm.expect_revert("no reviewable delivery"):
        contract.review_delivery(auction_id)


def test_buyer_cannot_choose_winner_or_evaluate_twice(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice)
    _commit(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _commit(direct_vm, contract, auction_id, direct_charlie, 5 * GEN, "all-in")
    _open_reveal(direct_vm)
    _reveal(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _reveal(direct_vm, contract, auction_id, direct_charlie, 5 * GEN, "all-in")
    _open_review(direct_vm)
    _classify(direct_vm, contract, ["PASS"] * 4)
    with direct_vm.expect_revert("unknown bidder"):
        # Buyer cannot inject a seller address that has no offer.
        contract.evaluate_bid(auction_id, _addr(direct_alice))
    _evaluate(direct_vm, contract, auction_id, direct_bob)
    with direct_vm.expect_revert("bid not reviewable"):
        contract.evaluate_bid(auction_id, _addr(direct_bob))
    # The contract chooses the cheapest reviewed compliant seller, not the buyer.
    _classify(direct_vm, contract, ["PASS"] * 4)
    _evaluate(direct_vm, contract, auction_id, direct_charlie)
    with direct_vm.prank(direct_alice), direct_vm.expect_revert("auction is not awardable"):
        # Award is only valid after the reveal period and review outcome.
        direct_vm.warp("2026-01-01T00:29:59Z")
        contract.finalize_award(auction_id)


def test_buyer_acceptance_creates_only_winner_and_refund_liabilities(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice, 20 * GEN)
    _commit(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_reveal(direct_vm)
    _reveal(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_review(direct_vm)
    _classify(direct_vm, contract, ["PASS"] * 4)
    _evaluate(direct_vm, contract, auction_id, direct_bob)
    contract.finalize_award(auction_id)
    assert int(contract.get_credit(_addr(direct_alice))) == 16 * GEN
    direct_vm.sender = direct_bob
    direct_vm.warp("2026-01-01T00:40:01Z")
    contract.submit_delivery(auction_id, "All four obligations are fulfilled.")
    direct_vm.sender = direct_alice
    contract.accept_delivery(auction_id)
    assert contract.get_procurement(auction_id).status == "SETTLED"
    assert int(contract.get_credit(_addr(direct_bob))) == 4 * GEN + 1 * GEN


def test_buyer_cannot_accept_after_response_window(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice, 20 * GEN)
    _commit(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_reveal(direct_vm)
    _reveal(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_review(direct_vm)
    _classify(direct_vm, contract, ["PASS"] * 4)
    _evaluate(direct_vm, contract, auction_id, direct_bob)
    contract.finalize_award(auction_id)
    direct_vm.sender = direct_bob
    direct_vm.warp("2026-01-01T00:40:01Z")
    contract.submit_delivery(auction_id, "All four obligations are fulfilled.")
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-01-01T00:50:02Z")
    with direct_vm.expect_revert("response window closed"):
        contract.accept_delivery(auction_id)
    assert contract.get_procurement(auction_id).status == "AWAITING_BUYER"


def test_buyer_refusal_neutral_review_passes(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice)
    _commit(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_reveal(direct_vm)
    _reveal(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_review(direct_vm)
    _classify(direct_vm, contract, ["PASS"] * 4)
    _evaluate(direct_vm, contract, auction_id, direct_bob)
    contract.finalize_award(auction_id)
    direct_vm.sender = direct_bob
    direct_vm.warp("2026-01-01T00:40:01Z")
    contract.submit_delivery(auction_id, "fulfills every mandatory obligation")
    direct_vm.sender = direct_alice
    contract.dispute_delivery(auction_id)
    direct_vm.sender = direct_charlie
    contract.begin_delivery_review(auction_id)
    _classify(direct_vm, contract, ["PASS"] * 4)
    assert contract.review_delivery(auction_id) == "PASS"
    assert contract.get_procurement(auction_id).status == "SETTLED"


def test_defective_delivery_gets_two_corrections_then_defaults(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice)
    _commit(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_reveal(direct_vm)
    _reveal(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_review(direct_vm)
    _classify(direct_vm, contract, ["PASS"] * 4)
    _evaluate(direct_vm, contract, auction_id, direct_bob)
    contract.finalize_award(auction_id)
    direct_vm.sender = direct_bob
    direct_vm.warp("2026-01-01T00:40:01Z")
    contract.submit_delivery(auction_id, "bad initial delivery")
    direct_vm.sender = direct_alice
    contract.dispute_delivery(auction_id)
    direct_vm.sender = direct_charlie
    contract.begin_delivery_review(auction_id)
    _classify(direct_vm, contract, ["FAIL", "PASS", "PASS", "PASS"])
    assert contract.review_delivery(auction_id) == "CORRECTION"
    direct_vm.sender = direct_bob
    direct_vm.warp("2026-01-01T00:50:02Z")
    contract.submit_delivery(auction_id, "bad correction one")
    direct_vm.warp("2026-01-01T01:10:03Z")
    direct_vm.sender = direct_charlie
    contract.begin_delivery_review(auction_id)
    _classify(direct_vm, contract, ["FAIL", "PASS", "PASS", "PASS"])
    assert contract.review_delivery(auction_id) == "CORRECTION"
    direct_vm.sender = direct_bob
    direct_vm.warp("2026-01-01T01:20:04Z")
    contract.submit_delivery(auction_id, "bad correction two")
    direct_vm.warp("2026-01-01T01:40:05Z")
    direct_vm.sender = direct_charlie
    contract.begin_delivery_review(auction_id)
    _classify(direct_vm, contract, ["FAIL", "PASS", "PASS", "PASS"])
    assert contract.review_delivery(auction_id) == "DEFAULT"
    assert contract.get_procurement(auction_id).status == "DEFAULTED"
    assert int(contract.get_credit(_addr(direct_alice))) == 21 * GEN


def test_seller_misses_delivery_and_expired_review_neutral_unwinds(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice)
    _commit(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_reveal(direct_vm)
    _reveal(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_review(direct_vm)
    _classify(direct_vm, contract, ["PASS"] * 4)
    _evaluate(direct_vm, contract, auction_id, direct_bob)
    contract.finalize_award(auction_id)
    direct_vm.warp("2026-01-01T01:00:01Z")
    assert contract.expire_delivery(auction_id) == "DEFAULT"
    assert contract.get_procurement(auction_id).status == "DEFAULTED"
    assert int(contract.get_credit(_addr(direct_alice))) == 21 * GEN


def test_claim_is_single_use_and_beneficiary_bound(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice)
    _commit(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_reveal(direct_vm)
    _reveal(direct_vm, contract, auction_id, direct_bob, 4 * GEN, "all-in")
    _open_review(direct_vm)
    _classify(direct_vm, contract, ["PASS"] * 4)
    _evaluate(direct_vm, contract, auction_id, direct_bob)
    contract.finalize_award(auction_id)
    # The buyer has a refund; a third party cannot claim it.
    with direct_vm.prank(direct_charlie), direct_vm.expect_revert("nothing claimable"):
        contract.claim()
    direct_vm.sender = direct_alice
    assert int(contract.claim()) == 16 * GEN
    claim = contract.get_claim(0)
    assert claim.beneficiary == _addr(direct_alice)
    assert int(claim.amount) == 16 * GEN
    assert claim.status == "DISPATCHED_PENDING_EXTERNAL_SETTLEMENT"
    with direct_vm.expect_revert("nothing claimable"):
        contract.claim()

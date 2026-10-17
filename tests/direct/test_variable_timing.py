"""Direct Mode proof for immutable buyer-selected procurement schedules."""

import json

import pytest


GEN = 10**18
T0 = "2026-01-01T00:00:00Z"


def _addr(account):
    if isinstance(account, bytes):
        return "0x" + account.hex()
    return str(account).lower()


def _create(vm, deploy, buyer, commit_seconds, reveal_seconds, budget=20 * GEN):
    vm._chain_id = 61999
    vm.warp(T0)
    contract = deploy("contracts/clausebid.py")
    vm.sender = buyer
    vm.value = budget
    auction_id = contract.create_procurement(
        "Timed procurement",
        "Authoritative facts",
        "Requirement one",
        "Requirement two",
        "Requirement three",
        "Requirement four",
        budget,
        commit_seconds,
        reveal_seconds,
    )
    vm.value = 0
    return contract, int(auction_id)


def _create_on_contract(vm, contract, buyer, commit_seconds, reveal_seconds, budget=20 * GEN):
    vm.sender = buyer
    vm.value = budget
    auction_id = contract.create_procurement(
        "Timed procurement",
        "Authoritative facts",
        "Requirement one",
        "Requirement two",
        "Requirement three",
        "Requirement four",
        budget,
        commit_seconds,
        reveal_seconds,
    )
    vm.value = 0
    return int(auction_id)


def _commit_and_reveal(vm, contract, auction_id, seller, price=4 * GEN, salt="a" * 64):
    terms = "All four requirements are fulfilled in the all-in offer."
    digest = contract._hash(auction_id, _addr(seller), price, terms, salt)
    vm.sender = seller
    vm.value = int(contract.get_procurement(auction_id).bond)
    contract.commit_bid(auction_id, digest)
    vm.value = 0
    return terms, salt, price


def _reveal(vm, contract, auction_id, seller, price, terms, salt):
    vm.sender = seller
    contract.reveal_bid(auction_id, price, terms, salt)


def _pass_review(vm, contract, auction_id, seller):
    vm.clear_mocks()
    vm.mock_llm(
        r".*independently applying an immutable procurement rulebook.*",
        json.dumps({"statuses": ["PASS"] * 4, "quotes": [""] * 4}),
    )
    contract.begin_bid_review(auction_id, _addr(seller))
    assert contract.evaluate_bid(auction_id, _addr(seller)) == "COMPLIANT"


def test_minimum_schedule_reproduces_accelerated_policy(direct_vm, direct_deploy, direct_alice):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice, 600, 1200)
    row = contract.get_procurement(auction_id)
    assert [int(row.commit_seconds), int(row.reveal_seconds), int(row.total_seconds)] == [600, 1200, 1800]
    assert [int(row.eligibility_seconds), int(row.delivery_seconds)] == [1800, 1800]
    assert [int(row.response_seconds), int(row.correction_seconds)] == [600, 1200]
    assert [int(row.review_grace_seconds), int(row.delivery_review_seconds), int(row.delivery_review_grace_seconds)] == [1800, 1800, 1800]
    assert [int(row.commit_end), int(row.reveal_end), int(row.review_end)] == [1767226200, 1767227400, 1767229200]


def test_default_schedule_is_stored_immutably(direct_vm, direct_deploy, direct_alice):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice, 86400, 172800)
    row = contract.get_procurement(auction_id)
    assert [int(row.commit_seconds), int(row.reveal_seconds), int(row.total_seconds)] == [86400, 172800, 259200]
    assert [int(row.eligibility_seconds), int(row.delivery_seconds)] == [259200, 259200]
    assert [int(row.response_seconds), int(row.correction_seconds)] == [86400, 172800]
    assert int(row.review_end) == int(row.reveal_end) + 259200


def test_maximum_schedule_uses_caps(direct_vm, direct_deploy, direct_alice):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice, 172800, 345600)
    row = contract.get_procurement(auction_id)
    assert int(row.total_seconds) == 518400
    assert int(row.eligibility_seconds) == 259200
    assert int(row.delivery_seconds) == 259200
    assert int(row.response_seconds) == 86400
    assert int(row.correction_seconds) == 172800
    assert int(row.review_grace_seconds) == 259200
    assert int(row.delivery_review_seconds) == 259200
    assert int(row.delivery_review_grace_seconds) == 259200


def test_commitment_and_reveal_are_independent(direct_vm, direct_deploy, direct_alice):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice, 3600, 7200)
    row = contract.get_procurement(auction_id)
    assert int(row.commit_seconds) == 3600
    assert int(row.reveal_seconds) == 7200
    assert int(row.total_seconds) == 10800
    assert int(row.commit_end) + 7200 == int(row.reveal_end)


@pytest.mark.parametrize(
    ("commit_seconds", "reveal_seconds", "message"),
    [
        (0, 1200, "commitment duration"),
        (599, 1200, "commitment duration"),
        (172801, 1200, "commitment duration"),
        (600, 0, "reveal duration"),
        (600, 1199, "reveal duration"),
        (600, 345601, "reveal duration"),
    ],
)
def test_duration_bounds_are_enforced_before_storage(
    direct_vm, direct_deploy, direct_alice, commit_seconds, reveal_seconds, message
):
    direct_vm._chain_id = 61999
    direct_vm.warp(T0)
    contract = direct_deploy("contracts/clausebid.py")
    direct_vm.sender = direct_alice
    direct_vm.value = 20 * GEN
    with direct_vm.expect_revert(message):
        contract.create_procurement(
            "Title", "Reference", "R1", "R2", "R3", "R4", 20 * GEN,
            commit_seconds, reveal_seconds,
        )


def test_deadline_boundaries_are_exact(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice, 600, 1200)
    price = 4 * GEN
    terms = "all four requirements"
    salt = "a" * 64
    digest = contract._hash(auction_id, _addr(direct_bob), price, terms, salt)
    direct_vm.sender = direct_bob
    direct_vm.value = GEN
    direct_vm.warp("2026-01-01T00:09:59Z")
    contract.commit_bid(auction_id, digest)
    direct_vm.value = 0
    direct_vm.warp("2026-01-01T00:10:00Z")
    with direct_vm.expect_revert("commit phase closed"):
        contract.commit_bid(auction_id, digest)
    contract.reveal_bid(auction_id, price, terms, salt)
    direct_vm.warp("2026-01-01T00:30:00Z")
    with direct_vm.expect_revert("reveal phase closed"):
        contract.reveal_bid(auction_id, price, terms, salt)


def test_review_cutoff_and_grace_use_selected_schedule(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice, 600, 1200)
    price = 4 * GEN
    terms = "all four requirements"
    salt = "b" * 64
    digest = contract._hash(auction_id, _addr(direct_bob), price, terms, salt)
    direct_vm.sender = direct_bob
    direct_vm.value = GEN
    contract.commit_bid(auction_id, digest)
    direct_vm.value = 0
    direct_vm.warp("2026-01-01T00:29:59Z")
    contract.reveal_bid(auction_id, price, terms, salt)
    direct_vm.warp("2026-01-01T00:30:01Z")
    contract.begin_bid_review(auction_id, _addr(direct_bob))
    direct_vm.warp("2026-01-01T01:00:00Z")
    with direct_vm.expect_revert("review cancellation not available"):
        contract.cancel_bid_review(auction_id, _addr(direct_bob))
    direct_vm.warp("2026-01-01T01:30:00Z")
    contract.cancel_bid_review(auction_id, _addr(direct_bob))


def test_multiple_procurements_do_not_share_timing_state(direct_vm, direct_deploy, direct_alice):
    direct_vm._chain_id = 61999
    direct_vm.warp(T0)
    contract = direct_deploy("contracts/clausebid.py")
    first = _create_on_contract(direct_vm, contract, direct_alice, 600, 1200)
    direct_vm.warp("2026-01-01T00:01:00Z")
    second = _create_on_contract(direct_vm, contract, direct_alice, 86400, 172800)
    one = contract.get_procurement(first)
    two = contract.get_procurement(second)
    assert int(one.commit_seconds) == 600
    assert int(two.commit_seconds) == 86400
    assert int(one.commit_end) == 1767226200
    assert int(two.commit_end) == 1767312060
    assert int(one.review_end) != int(two.review_end)


def test_deadline_overflow_is_rejected(direct_vm, direct_deploy, direct_alice):
    contract, _ = _create(direct_vm, direct_deploy, direct_alice, 600, 1200)
    with direct_vm.expect_revert("deadline overflow"):
        contract._deadline(2**64 - 1, 1)


def test_default_schedule_uses_real_phase_boundaries(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice, 86400, 172800)
    terms, salt, price = _commit_and_reveal(direct_vm, contract, auction_id, direct_bob)
    direct_vm.warp("2026-01-01T23:59:59Z")
    with direct_vm.expect_revert("reveal phase closed"):
        _reveal(direct_vm, contract, auction_id, direct_bob, price, terms, salt)
    direct_vm.warp("2026-01-02T00:00:00Z")
    _reveal(direct_vm, contract, auction_id, direct_bob, price, terms, salt)
    direct_vm.warp("2026-01-03T23:59:59Z")
    with direct_vm.expect_revert("review phase closed"):
        contract.begin_bid_review(auction_id, _addr(direct_bob))
    direct_vm.warp("2026-01-04T00:00:01Z")
    contract.begin_bid_review(auction_id, _addr(direct_bob))


def test_selected_deadlines_anchor_to_award_delivery_and_correction_starts(
    direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie
):
    contract, auction_id = _create(direct_vm, direct_deploy, direct_alice, 3600, 7200)
    terms, salt, price = _commit_and_reveal(direct_vm, contract, auction_id, direct_bob)
    direct_vm.warp("2026-01-01T01:00:01Z")
    _reveal(direct_vm, contract, auction_id, direct_bob, price, terms, salt)
    direct_vm.warp("2026-01-01T03:00:01Z")
    _pass_review(direct_vm, contract, auction_id, direct_bob)
    award_at = 1767236401  # 2026-01-01T03:00:01Z
    contract.finalize_award(auction_id)
    row = contract.get_procurement(auction_id)
    assert int(row.delivery_due) == award_at + 10800

    direct_vm.warp("2026-01-01T03:10:01Z")
    direct_vm.sender = direct_bob
    contract.submit_delivery(auction_id, "A defective first delivery")
    row = contract.get_procurement(auction_id)
    submission_at = 1767237001  # 2026-01-01T03:10:01Z
    assert int(row.response_due) == submission_at + 3600
    assert int(row.delivery_review_end) == submission_at + 3600 + 10800

    direct_vm.sender = direct_alice
    contract.dispute_delivery(auction_id)
    direct_vm.sender = direct_charlie
    contract.begin_delivery_review(auction_id)
    direct_vm.clear_mocks()
    direct_vm.mock_llm(
        r".*independently applying an immutable procurement rulebook.*",
        json.dumps({"statuses": ["FAIL", "PASS", "PASS", "PASS"], "quotes": ["", "", "", ""]}),
    )
    reviewed_at = 1767237001
    assert contract.review_delivery(auction_id) == "CORRECTION"
    row = contract.get_procurement(auction_id)
    assert int(row.delivery_due) == reviewed_at + 7200

"""Direct Mode proof for immutable buyer-selected procurement schedules."""

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

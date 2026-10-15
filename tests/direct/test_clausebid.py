"""Direct Mode safety checks. Full funded flow needs documented payable-message harness.
These tests intentionally never substitute mocks for a live payout receipt.
"""
import json
import pytest

def test_initial_state(direct_deploy):
    contract = direct_deploy("contracts/clausebid.py")
    assert int(contract.get_count()) == 0
    assert int(contract._bond_for(5*10**18)) == 5*10**17
    assert int(contract._bond_for(100*10**18)) == 5*10**18

def test_unknown_procurement_reverts(direct_vm, direct_deploy):
    contract = direct_deploy("contracts/clausebid.py")
    with direct_vm.expect_revert("unknown procurement"):
        contract.get_procurement(99)

def test_bond_bounds(direct_deploy):
    c=direct_deploy("contracts/clausebid.py")
    for budget in (5,10,20,50,100):
        wei=budget*10**18
        expected=max(10**18//2,min(5*10**18,wei//20))
        assert int(c._bond_for(wei)) == expected

def test_semantic_classification_independently_rechecked(direct_vm,direct_deploy):
    contract=direct_deploy("contracts/clausebid.py")
    good={"statuses":["PASS"]*4,"quotes":["included"]*4}
    direct_vm.mock_llm(r".*independently applying an immutable procurement rulebook.*",json.dumps(good))
    result=contract._classify(["a","b","c","d"],"included","reference","BID_COMPLIANCE")
    assert result["statuses"]==["PASS"]*4
    assert direct_vm.run_validator() is True

def test_semantic_validator_rejects_malicious_material_change(direct_vm,direct_deploy):
    contract=direct_deploy("contracts/clausebid.py")
    honest={"statuses":["FAIL","PASS","PASS","PASS"],"quotes":["excluded"]*4}
    direct_vm.mock_llm(r".*independently applying an immutable procurement rulebook.*",json.dumps(honest))
    contract._classify(["a","b","c","d"],"excluded","reference","BID_COMPLIANCE")
    forged={"statuses":["PASS"]*4,"quotes":["excluded"]*4}
    assert direct_vm.run_validator(leader_result=forged) is False

def test_no_shape_only_approval(direct_vm,direct_deploy):
    contract=direct_deploy("contracts/clausebid.py")
    answer={"statuses":["FAIL","PASS","PASS","PASS"],"quotes":["excluded"]*4}
    direct_vm.mock_llm(r".*independently applying an immutable procurement rulebook.*",json.dumps(answer))
    contract._classify(["a","b","c","d"],"excluded","reference","BID_COMPLIANCE")
    forged={"statuses":["PASS"]*4,"quotes":["excluded"]*4}
    assert direct_vm.run_validator(leader_result=forged) is False

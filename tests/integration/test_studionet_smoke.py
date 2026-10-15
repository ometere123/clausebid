"""Opt-in Studionet smoke suite. No fabricated contract address or receipts.
Run only after source-hash verified deployment; this is not run in offline CI.
"""
import os
import pytest

@pytest.mark.integration
def test_deployed_contract_reads():
    address=os.environ.get("CLAUSEBID_CONTRACT_ADDRESS")
    if not address:
        pytest.skip("CLAUSEBID_CONTRACT_ADDRESS not set; requires actual Studionet deployment")
    from gltest import get_contract_factory
    # Verify SDK's live Studionet factory/address attachment semantics before enabling.
    # This intentional fail prevents falsely claiming network integration coverage.
    pytest.fail("Codex must implement live schema-verified contract attachment, then record finalized receipts")

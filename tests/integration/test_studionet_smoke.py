"""Source-check the actual deployment only when explicitly enabled."""
import os
import subprocess
from pathlib import Path
import pytest

ROOT=Path(__file__).resolve().parents[2]

@pytest.mark.integration
def test_deployed_source_is_exact():
    if os.getenv('ENABLE_STUDIONET_SMOKE_TEST')!='true':
        pytest.skip('Opt in with ENABLE_STUDIONET_SMOKE_TEST=true')
    if not os.getenv('CLAUSEBID_CONTRACT_ADDRESS'):
        pytest.fail('A real deployed contract address is required')
    proc=subprocess.run(['node','scripts/preflight.mjs'],cwd=ROOT,env=os.environ.copy(),
                        capture_output=True,text=True,timeout=180)
    assert proc.returncode==0,proc.stdout+'\n'+proc.stderr

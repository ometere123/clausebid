"""Direct Mode compatibility helpers for the pinned Windows toolchain.

genlayer-test 0.29.2 replaces stdin with an open temporary file while loading
the contract. Windows does not permit unlinking that file until the duplicated
descriptor is closed, so the upstream loader raises before the contract is
even imported. Linux CI keeps the upstream cleanup behavior unchanged.
"""

import os
import sys

import pytest


@pytest.fixture(autouse=True)
def allow_windows_direct_mode_tempfiles(monkeypatch):
    if not sys.platform.startswith("win"):
        return

    import os as stdlib_os

    original_unlink = stdlib_os.unlink

    def unlink_after_fd_dup(path):
        try:
            original_unlink(path)
        except PermissionError:
            # The pinned upstream loader has already duplicated this file onto
            # stdin. It is released when the test process/VM closes that fd.
            pass

    monkeypatch.setattr(stdlib_os, "unlink", unlink_after_fd_dup)

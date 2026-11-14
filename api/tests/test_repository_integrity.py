import shutil
import subprocess
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[2]
TRUNCATION_MARKER = b"lines " + b"omitted"


def tracked_files() -> list[Path]:
    if shutil.which("git") is None or not (REPO_ROOT / ".git").exists():
        pytest.skip("not running inside the git repository")
    listing = subprocess.run(["git", "ls-files", "-z"], cwd=REPO_ROOT, check=True, capture_output=True).stdout
    return [REPO_ROOT / name for name in listing.decode().split("\0") if name]


def test_no_tracked_file_contains_a_truncation_marker():
    files = tracked_files()
    offenders = [str(path.relative_to(REPO_ROOT)) for path in files if TRUNCATION_MARKER in path.read_bytes()]

    assert files, "git listed no tracked files"
    assert offenders == []

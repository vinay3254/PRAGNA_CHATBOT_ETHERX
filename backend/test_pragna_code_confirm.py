#!/usr/bin/env python3
"""
Test script verifying pragna_code.py's mutating-tool classification and
diff/command preview builder (does not exercise the interactive y/N prompt).
"""
import shutil
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

import pragna_code


def run_tests():
    workdir = Path(tempfile.mkdtemp(prefix="pragna_cli_confirm_test_"))
    cwd = Path.cwd()
    try:
        import os
        os.chdir(workdir)

        print("=== Tool classification ===")
        assert pragna_code.MUTATING_TOOLS == {"write_file", "create_file", "append_file", "run_command"}

        print("\n=== run_command preview ===")
        preview = pragna_code._preview_for("run_command", {"command": "pytest -q"})
        print(preview)
        assert preview == "$ pytest -q"

        print("\n=== write_file preview on a new file ===")
        preview = pragna_code._preview_for("write_file", {"path": "new.txt", "content": "hello\n"})
        print(preview)
        assert "+hello" in preview

        print("\n=== write_file preview on an existing file ===")
        Path("existing.txt").write_text("old\n")
        preview = pragna_code._preview_for("write_file", {"path": "existing.txt", "content": "new\n"})
        print(preview)
        assert "-old" in preview
        assert "+new" in preview

        print("\nAll CLI confirm checks passed.")
    finally:
        os.chdir(cwd)
        shutil.rmtree(workdir, ignore_errors=True)


if __name__ == "__main__":
    run_tests()

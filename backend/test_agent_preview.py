#!/usr/bin/env python3
"""
Test script verifying code_agent.build_preview produces correct diffs/commands.
"""
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from services import code_agent


def run_tests():
    root = Path(tempfile.mkdtemp(prefix="pragna_preview_test_"))
    try:
        print("=== run_command preview ===")
        preview = code_agent.build_preview("run_command", {"command": "pytest -q"}, root)
        print(preview)
        assert preview.startswith("$ pytest -q")

        print("\n=== write_file preview on a new file ===")
        preview = code_agent.build_preview(
            "write_file", {"path": "new.txt", "content": "line1\nline2\n"}, root
        )
        print(preview)
        assert "+line1" in preview
        assert "+line2" in preview

        print("\n=== write_file preview on an existing file shows removed + added lines ===")
        (root / "existing.txt").write_text("old line\n")
        preview = code_agent.build_preview(
            "write_file", {"path": "existing.txt", "content": "new line\n"}, root
        )
        print(preview)
        assert "-old line" in preview
        assert "+new line" in preview

        print("\n=== append_file preview shows only the appended tail as added ===")
        (root / "log.txt").write_text("first\n")
        preview = code_agent.build_preview(
            "append_file", {"path": "log.txt", "content": "second\n"}, root
        )
        print(preview)
        assert "+second" in preview
        assert "-first" not in preview

        print("\nAll preview checks passed.")
    finally:
        shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    run_tests()

#!/usr/bin/env python3
"""
Test script verifying the pausable agent loop: a mutating tool call pauses
the run, and resume_agent_stream continues it correctly on approve/reject.
"""
import json
import shutil
import sys
import tempfile
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))

from services import code_agent


class _FakeResponse:
    def __init__(self, content):
        self._content = content

    def json(self):
        return {"message": {"content": self._content}}


def _parse_sse(chunk: str) -> dict:
    assert chunk.startswith("data: ")
    return json.loads(chunk[len("data: "):].strip())


def run_tests():
    root = Path(tempfile.mkdtemp(prefix="pragna_loop_test_"))
    try:
        print("=== Fresh run pauses on a mutating tool call ===")
        first_reply = (
            'Writing the file now.\n'
            '<tool_call>{"tool": "write_file", "args": {"path": "out.txt", "content": "hi"}}</tool_call>'
        )
        with patch.object(code_agent, "_call_ollama", return_value=_FakeResponse(first_reply)):
            events = [
                _parse_sse(chunk)
                for chunk in code_agent.run_agent_stream(
                    task="write a file", mode="general", working_dir=str(root)
                )
            ]
        print(events)
        assert events[-1]["type"] == "confirm_required"
        assert events[-1]["tool"] == "write_file"
        session_id = events[-1]["session_id"]
        assert session_id in code_agent.AGENT_SESSIONS
        assert not (root / "out.txt").exists(), "file must not be written before approval"

        print("\n=== Reject: file stays unwritten, session continues ===")
        second_reply = "DONE: acknowledged the rejection."
        with patch.object(code_agent, "_call_ollama", return_value=_FakeResponse(second_reply)):
            events = [
                _parse_sse(chunk)
                for chunk in code_agent.resume_agent_stream(session_id, "reject")
            ]
        print(events)
        assert any(e["type"] == "tool_result" and "rejected" in e["content"].lower() for e in events)
        assert events[-1]["type"] == "done"
        assert not (root / "out.txt").exists()
        assert session_id not in code_agent.AGENT_SESSIONS, "session should be cleaned up after DONE"

        print("\n=== Approve: file gets written, session continues ===")
        with patch.object(code_agent, "_call_ollama", return_value=_FakeResponse(first_reply)):
            events = [
                _parse_sse(chunk)
                for chunk in code_agent.run_agent_stream(
                    task="write a file", mode="general", working_dir=str(root)
                )
            ]
        session_id = events[-1]["session_id"]

        with patch.object(code_agent, "_call_ollama", return_value=_FakeResponse(second_reply)):
            events = [
                _parse_sse(chunk)
                for chunk in code_agent.resume_agent_stream(session_id, "approve")
            ]
        print(events)
        assert (root / "out.txt").read_text() == "hi"
        assert events[-1]["type"] == "done"

        print("\nAll agent-loop checks passed.")
    finally:
        shutil.rmtree(root, ignore_errors=True)


if __name__ == "__main__":
    run_tests()

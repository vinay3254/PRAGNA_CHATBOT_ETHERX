#!/usr/bin/env python3
"""
Test script verifying the /api/agent/resume route requires auth and
forwards to code_agent.resume_agent_stream correctly.
"""
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).parent))

from auth import AuthService
from app import app
from services import code_agent


def run_tests():
    client = app.test_client()

    print("=== No token -> 401 ===")
    resp = client.post("/api/agent/resume", json={"session_id": "x", "decision": "approve"})
    print(resp.status_code)
    assert resp.status_code == 401

    token = AuthService.generate_token("test-user")
    headers = {"Authorization": f"Bearer {token}"}

    print("\n=== Missing session_id -> 400 ===")
    resp = client.post("/api/agent/resume", json={"decision": "approve"}, headers=headers)
    print(resp.status_code, resp.get_json())
    assert resp.status_code == 400

    print("\n=== Invalid decision -> 400 ===")
    resp = client.post(
        "/api/agent/resume", json={"session_id": "abc", "decision": "maybe"}, headers=headers
    )
    print(resp.status_code, resp.get_json())
    assert resp.status_code == 400

    print("\n=== Valid request streams through to resume_agent_stream ===")
    with patch.object(
        code_agent,
        "resume_agent_stream",
        return_value=iter(['data: {"type": "done", "content": "ok"}\n\n']),
    ):
        resp = client.post(
            "/api/agent/resume",
            json={"session_id": "abc", "decision": "approve"},
            headers=headers,
        )
        body = resp.get_data(as_text=True)
    print(resp.status_code, body)
    assert resp.status_code == 200
    assert '"type": "done"' in body

    print("\nAll resume-route checks passed.")


if __name__ == "__main__":
    run_tests()

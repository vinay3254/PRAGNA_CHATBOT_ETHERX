#!/usr/bin/env python3
"""
Test script verifying the /api/agent/* routes require authentication.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from auth import AuthService
from app import app


def run_tests():
    client = app.test_client()

    print("=== No token -> 401 ===")
    for method, path in [
        ("post", "/api/agent/run"),
        ("post", "/api/agent/chat"),
        ("get", "/api/agent/modes"),
    ]:
        resp = getattr(client, method)(path, json={"task": "x"})
        print(f"{method.upper()} {path} -> {resp.status_code}")
        assert resp.status_code == 401, f"expected 401, got {resp.status_code} for {path}"

    print("\n=== OPTIONS preflight on /api/agent/run does not require auth ===")
    resp = client.options("/api/agent/run")
    print(f"OPTIONS /api/agent/run -> {resp.status_code}")
    assert resp.status_code in (200, 204), f"expected 200/204, got {resp.status_code}"

    print("\n=== Valid token -> not 401 ===")
    token = AuthService.generate_token("test-user")
    headers = {"Authorization": f"Bearer {token}"}
    resp = client.get("/api/agent/modes", headers=headers)
    print(f"GET /api/agent/modes (authed) -> {resp.status_code}")
    assert resp.status_code == 200, f"expected 200, got {resp.status_code}"

    print("\nAll auth checks passed.")


if __name__ == "__main__":
    run_tests()

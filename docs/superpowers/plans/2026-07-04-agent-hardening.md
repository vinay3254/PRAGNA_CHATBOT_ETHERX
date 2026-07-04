# Agent Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the auth/sandboxing gap on the web agent and add a confirm-before-act approval step for mutating tools, in both the web agent (`AgentPanel` + `code_agent.py`) and the CLI (`pragna_code.py`).

**Architecture:** The web agent's tool-use loop is split into a shared `_agent_loop(session_id)` generator that pauses (returns) whenever the model calls a mutating tool, storing pending state in an in-memory `AGENT_SESSIONS` dict; a new `/api/agent/resume` endpoint re-enters the same loop after the user approves or rejects. The CLI adds a synchronous `y/N` prompt before dispatching mutating tools, since its REPL is already a blocking loop with no need for session state. All file tools in both surfaces gain root-relative path resolution that rejects escapes.

**Tech Stack:** Flask + flask-cors (existing), Python `difflib` for diff previews, React (existing `AgentPanel.jsx`), no new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-04-agent-hardening-design.md`
- Mutating tools (require approval): `write_file`, `create_file`, `append_file`, `run_command`. Auto tools (no approval): `read_file`, `list_dir`, `search_code`.
- Web agent auth: reuse existing `@require_auth` from `backend/auth.py` — do not modify that decorator.
- Web agent path sandboxing: resolve every file-tool path against a `root` (the request's `working_dir`, or `Path(__file__).resolve().parent.parent.parent` — the repo root — if none given); reject anything that resolves outside `root` with an `"ERROR: ..."` string (existing tools' error convention), never raise.
- Follow this repo's existing test convention: standalone `test_*.py` scripts at `backend/` root (see `backend/test_vision.py`), run directly with `python backend/test_x.py`, using plain `assert` statements (exit via `AssertionError`/non-zero on failure) rather than introducing a pytest suite. No frontend test runner exists in this repo (`chatbot-ui-vite`) — frontend changes get a manual verification step, not an automated test.
- Frontend auth: attach `Authorization: Bearer <token>` from `localStorage.getItem('authToken')` on the two new/changed `fetch` calls in `api.js`, matching the key name used everywhere else in the app (see `chatbot-ui-vite/src/api/chatManagement.js:11`).

---

### Task 1: Auth on web agent routes

**Files:**
- Modify: `backend/app.py:2079-2160` (the three `/api/agent/*` routes)
- Test: `backend/test_agent_auth.py`

**Interfaces:**
- Produces: all three routes now require `Authorization: Bearer <token>`, consistent with every other protected route in `app.py`.

- [ ] **Step 1: Remove the OPTIONS special-case from `agent_run` and drop `@require_auth`-incompatible manual preflight handling**

  In `backend/app.py`, change:
  ```python
  @app.route('/api/agent/run', methods=['POST', 'OPTIONS'])
  def agent_run():
      """Streaming agentic loop endpoint (SSE).
      Body: { task, mode, context_files, working_dir }
      """
      if request.method == 'OPTIONS':
          return '', 204
      try:
  ```
  to:
  ```python
  @app.route('/api/agent/run', methods=['POST'])
  @require_auth
  def agent_run():
      """Streaming agentic loop endpoint (SSE).
      Body: { task, mode, context_files, working_dir }
      """
      try:
  ```
  This is safe because `CORS(app)` (already configured at `backend/app.py:443`) auto-handles `OPTIONS` preflight for routes that don't explicitly declare `OPTIONS` in their `methods` list — which is why `agent_chat` (declared `methods=['POST']` only) never needed the manual branch either.

- [ ] **Step 2: Add `@require_auth` to `agent_chat` and `agent_modes`**

  Change:
  ```python
  @app.route('/api/agent/chat', methods=['POST'])
  def agent_chat():
  ```
  to:
  ```python
  @app.route('/api/agent/chat', methods=['POST'])
  @require_auth
  def agent_chat():
  ```
  and:
  ```python
  @app.route('/api/agent/modes', methods=['GET'])
  def agent_modes():
  ```
  to:
  ```python
  @app.route('/api/agent/modes', methods=['GET'])
  @require_auth
  def agent_modes():
  ```

- [ ] **Step 3: Write the test script**

  Create `backend/test_agent_auth.py`:
  ```python
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
  ```

- [ ] **Step 4: Run the test**

  Run: `cd backend && python test_agent_auth.py`
  Expected: prints each check and ends with `All auth checks passed.` If `agent_modes` returns something other than 200 for the authed case, read the failure — likely `app.py` failed to import (check `OLLAMA_API_URL`/other env-dependent globals aren't required at import time; this repo's other `test_*.py` scripts already import backend modules directly, so this should work the same way).

- [ ] **Step 5: Commit**

  ```bash
  git add backend/app.py backend/test_agent_auth.py
  git commit -m "fix: require authentication on /api/agent/* routes"
  ```

---

### Task 2: Path sandboxing in `code_agent.py`

**Files:**
- Modify: `backend/services/code_agent.py`
- Test: `backend/test_agent_sandbox.py`

**Interfaces:**
- Produces: `DEFAULT_ROOT: Path`, `_resolve_in_root(root: Path, path: str) -> Path` (raises `ValueError` on escape), and every `tool_*` function now takes `root: Path` as its first parameter. `dispatch_tool(tool_name: str, args: dict, root: Path) -> str`.
- Consumes: nothing from other tasks.

- [ ] **Step 1: Add the root constant and resolver, just above `def _safe_path`**

  In `backend/services/code_agent.py`, replace:
  ```python
  def _safe_path(path: str) -> Path:
      """Resolve path, keeping it within reasonable bounds."""
      p = Path(path).expanduser()
      return p
  ```
  with:
  ```python
  # Default sandbox root when no working_dir is supplied: the repo root
  # (backend/services/code_agent.py -> backend/services -> backend -> repo root).
  DEFAULT_ROOT = Path(__file__).resolve().parent.parent.parent


  def _resolve_in_root(root: Path, path: str) -> Path:
      """Resolve `path` against `root`, rejecting anything that escapes it."""
      candidate = Path(path).expanduser()
      if not candidate.is_absolute():
          candidate = root / candidate
      resolved = candidate.resolve()
      root_resolved = root.resolve()
      if resolved != root_resolved and root_resolved not in resolved.parents:
          raise ValueError(
              f"Path '{path}' resolves outside the allowed working directory ({root_resolved})"
          )
      return resolved
  ```

- [ ] **Step 2: Thread `root` through every tool function**

  Replace the whole tool-function block (`tool_read_file` through `tool_append_file`) with:
  ```python
  def tool_read_file(root: Path, path: str) -> str:
      try:
          p = _resolve_in_root(root, path)
      except ValueError as e:
          return f"ERROR: {e}"
      try:
          if not p.exists():
              return f"ERROR: File not found: {path}"
          if p.stat().st_size > MAX_READ_BYTES:
              with open(p, "r", errors="replace") as f:
                  content = f.read(MAX_READ_BYTES)
              return content + f"\n\n[... truncated at {MAX_READ_BYTES} bytes ...]"
          with open(p, "r", errors="replace") as f:
              return f.read()
      except Exception as e:
          return f"ERROR reading file: {e}"


  def tool_write_file(root: Path, path: str, content: str) -> str:
      try:
          p = _resolve_in_root(root, path)
      except ValueError as e:
          return f"ERROR: {e}"
      try:
          p.parent.mkdir(parents=True, exist_ok=True)
          with open(p, "w", encoding="utf-8") as f:
              f.write(content)
          return f"OK: Written {len(content)} chars to {path}"
      except Exception as e:
          return f"ERROR writing file: {e}"


  def tool_create_file(root: Path, path: str, content: str) -> str:
      try:
          p = _resolve_in_root(root, path)
      except ValueError as e:
          return f"ERROR: {e}"
      try:
          if p.exists():
              return f"ERROR: File already exists: {path}. Use write_file to overwrite."
          p.parent.mkdir(parents=True, exist_ok=True)
          with open(p, "w", encoding="utf-8") as f:
              f.write(content)
          return f"OK: Created {path} ({len(content)} chars)"
      except Exception as e:
          return f"ERROR creating file: {e}"


  def tool_list_dir(root: Path, path: str) -> str:
      try:
          p = _resolve_in_root(root, path)
      except ValueError as e:
          return f"ERROR: {e}"
      try:
          if not p.exists():
              return f"ERROR: Path not found: {path}"
          if not p.is_dir():
              return f"ERROR: Not a directory: {path}"
          entries = []
          for item in sorted(p.iterdir()):
              if item.name.startswith("."):
                  continue
              if item.is_dir():
                  entries.append(f"[DIR]  {item.name}/")
              else:
                  size = item.stat().st_size
                  entries.append(f"[FILE] {item.name} ({size} bytes)")
          return "\n".join(entries) if entries else "(empty directory)"
      except Exception as e:
          return f"ERROR listing dir: {e}"


  def tool_run_command(root: Path, command: str, cwd: str = None) -> str:
      if _is_blocked_command(command):
          return f"ERROR: Blocked command — this command pattern is not allowed for safety: {command}"
      try:
          cwd_path = _resolve_in_root(root, cwd) if cwd else root
      except ValueError as e:
          return f"ERROR: {e}"
      try:
          result = subprocess.run(
              command,
              shell=True,
              capture_output=True,
              text=True,
              timeout=30,
              cwd=cwd_path,
          )
          output = ""
          if result.stdout:
              output += result.stdout
          if result.stderr:
              output += "\n[STDERR]\n" + result.stderr
          if not output.strip():
              output = f"(exit code {result.returncode}, no output)"
          if len(output) > MAX_SHELL_OUTPUT:
              output = output[:MAX_SHELL_OUTPUT] + "\n[... truncated ...]"
          return output
      except subprocess.TimeoutExpired:
          return "ERROR: Command timed out after 30 seconds."
      except Exception as e:
          return f"ERROR running command: {e}"


  def tool_search_code(root: Path, pattern: str, path: str = ".", file_pattern: str = None) -> str:
      try:
          p = _resolve_in_root(root, path)
      except ValueError as e:
          return f"ERROR: {e}"
      try:
          cmd = ["grep", "-rn", "--include", file_pattern or "*", pattern, str(p)]
          if os.name == "nt":
              if file_pattern:
                  cmd = f'findstr /s /n /r "{pattern}" "{p}\\{file_pattern}"'
              else:
                  cmd = f'findstr /s /n /r "{pattern}" "{p}\\*"'
              result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=15)
          else:
              result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)

          output = result.stdout or "(no matches found)"
          if len(output) > MAX_SHELL_OUTPUT:
              output = output[:MAX_SHELL_OUTPUT] + "\n[... truncated ...]"
          return output
      except Exception as e:
          return f"ERROR searching: {e}"


  def tool_append_file(root: Path, path: str, content: str) -> str:
      try:
          p = _resolve_in_root(root, path)
      except ValueError as e:
          return f"ERROR: {e}"
      try:
          with open(p, "a", encoding="utf-8") as f:
              f.write(content)
          return f"OK: Appended {len(content)} chars to {path}"
      except Exception as e:
          return f"ERROR appending to file: {e}"
  ```

- [ ] **Step 3: Update `dispatch_tool` to accept and forward `root`**

  Replace:
  ```python
  def dispatch_tool(tool_name: str, args: dict) -> str:
      """Route a tool call to the right function."""
      try:
          if tool_name == "read_file":
              return tool_read_file(args.get("path", ""))
          elif tool_name == "write_file":
              return tool_write_file(args.get("path", ""), args.get("content", ""))
          elif tool_name == "create_file":
              return tool_create_file(args.get("path", ""), args.get("content", ""))
          elif tool_name == "list_dir":
              return tool_list_dir(args.get("path", "."))
          elif tool_name == "run_command":
              return tool_run_command(args.get("command", ""), args.get("cwd"))
          elif tool_name == "search_code":
              return tool_search_code(
                  args.get("pattern", ""),
                  args.get("path", "."),
                  args.get("file_pattern"),
              )
          elif tool_name == "append_file":
              return tool_append_file(args.get("path", ""), args.get("content", ""))
          else:
              return f"ERROR: Unknown tool '{tool_name}'"
      except Exception as e:
          return f"ERROR in tool {tool_name}: {traceback.format_exc()}"
  ```
  with:
  ```python
  def dispatch_tool(tool_name: str, args: dict, root: Path) -> str:
      """Route a tool call to the right function."""
      try:
          if tool_name == "read_file":
              return tool_read_file(root, args.get("path", ""))
          elif tool_name == "write_file":
              return tool_write_file(root, args.get("path", ""), args.get("content", ""))
          elif tool_name == "create_file":
              return tool_create_file(root, args.get("path", ""), args.get("content", ""))
          elif tool_name == "list_dir":
              return tool_list_dir(root, args.get("path", "."))
          elif tool_name == "run_command":
              return tool_run_command(root, args.get("command", ""), args.get("cwd"))
          elif tool_name == "search_code":
              return tool_search_code(
                  root,
                  args.get("pattern", ""),
                  args.get("path", "."),
                  args.get("file_pattern"),
              )
          elif tool_name == "append_file":
              return tool_append_file(root, args.get("path", ""), args.get("content", ""))
          else:
              return f"ERROR: Unknown tool '{tool_name}'"
      except Exception as e:
          return f"ERROR in tool {tool_name}: {traceback.format_exc()}"
  ```

  Note: callers of `dispatch_tool` and `tool_read_file` inside `run_agent_stream` are updated in Task 4 — this task only changes the function definitions, so `run_agent_stream` will be briefly broken (missing `root` arg) until Task 4 lands. That's fine for a stacked-commit plan; Task 4 must follow immediately after this one before running the app.

- [ ] **Step 4: Write the sandbox test script**

  Create `backend/test_agent_sandbox.py`:
  ```python
  #!/usr/bin/env python3
  """
  Test script verifying code_agent's file tools stay sandboxed to `root`.
  """
  import shutil
  import sys
  import tempfile
  from pathlib import Path

  sys.path.insert(0, str(Path(__file__).parent))

  from services import code_agent


  def run_tests():
      workdir = Path(tempfile.mkdtemp(prefix="pragna_sandbox_test_"))
      outside = Path(tempfile.mkdtemp(prefix="pragna_sandbox_outside_"))
      try:
          print("=== Write inside root succeeds ===")
          result = code_agent.tool_write_file(workdir, "inside.txt", "hello")
          print(result)
          assert result.startswith("OK:")
          assert (workdir / "inside.txt").read_text() == "hello"

          print("\n=== Relative escape is rejected ===")
          result = code_agent.tool_write_file(workdir, "../escape.txt", "pwned")
          print(result)
          assert result.startswith("ERROR:")
          assert "outside the allowed working directory" in result
          assert not (workdir.parent / "escape.txt").exists()

          print("\n=== Absolute escape is rejected ===")
          target = outside / "absolute.txt"
          result = code_agent.tool_write_file(workdir, str(target), "pwned")
          print(result)
          assert result.startswith("ERROR:")
          assert not target.exists()

          print("\n=== read_file respects the same sandbox ===")
          result = code_agent.tool_read_file(workdir, "../../etc/passwd")
          print(result)
          assert result.startswith("ERROR:")

          print("\nAll sandbox checks passed.")
      finally:
          shutil.rmtree(workdir, ignore_errors=True)
          shutil.rmtree(outside, ignore_errors=True)


  if __name__ == "__main__":
      run_tests()
  ```

- [ ] **Step 5: Run the test**

  Run: `cd backend && python test_agent_sandbox.py`
  Expected: `All sandbox checks passed.`

- [ ] **Step 6: Commit**

  ```bash
  git add backend/services/code_agent.py backend/test_agent_sandbox.py
  git commit -m "fix: sandbox code_agent file tools to a working-directory root"
  ```

---

### Task 3: Tool classification and diff/command preview builder

**Files:**
- Modify: `backend/services/code_agent.py`
- Test: `backend/test_agent_preview.py`

**Interfaces:**
- Consumes: `_resolve_in_root(root, path)` from Task 2.
- Produces: `AUTO_TOOLS: set[str]`, `MUTATING_TOOLS: set[str]`, `build_preview(tool_name: str, args: dict, root: Path) -> str`.

- [ ] **Step 1: Add `import difflib` to the top-level imports**

  In `backend/services/code_agent.py`, change:
  ```python
  import json
  import logging
  import os
  import re
  import subprocess
  import traceback
  ```
  to:
  ```python
  import difflib
  import json
  import logging
  import os
  import re
  import subprocess
  import traceback
  ```

- [ ] **Step 2: Add tool classification and the preview builder**

  Just below the `dispatch_tool` function (after Task 2's version of it), add:
  ```python
  # ─── Tool classification (auto-run vs. requires approval) ────────────────────

  AUTO_TOOLS = {"read_file", "list_dir", "search_code"}
  MUTATING_TOOLS = {"write_file", "create_file", "append_file", "run_command"}


  def build_preview(tool_name: str, args: dict, root: Path) -> str:
      """Build a human-readable preview (diff or command) for a mutating tool call."""
      if tool_name == "run_command":
          cmd = args.get("command", "")
          cwd = args.get("cwd") or "(working directory)"
          return f"$ {cmd}\n(cwd: {cwd})"

      path = args.get("path", "")
      new_content = args.get("content", "")

      try:
          p = _resolve_in_root(root, path)
          old_content = p.read_text(errors="replace") if p.exists() else ""
      except (ValueError, OSError):
          old_content = ""

      if tool_name == "append_file":
          new_content = old_content + new_content

      diff = difflib.unified_diff(
          old_content.splitlines(keepends=True),
          new_content.splitlines(keepends=True),
          fromfile=f"a/{path}",
          tofile=f"b/{path}",
      )
      diff_text = "".join(diff)
      return diff_text or f"(no textual diff — {path} unchanged or binary)"
  ```

- [ ] **Step 3: Write the preview test script**

  Create `backend/test_agent_preview.py`:
  ```python
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
  ```

- [ ] **Step 4: Run the test**

  Run: `cd backend && python test_agent_preview.py`
  Expected: `All preview checks passed.`

- [ ] **Step 5: Commit**

  ```bash
  git add backend/services/code_agent.py backend/test_agent_preview.py
  git commit -m "feat: add mutating-tool classification and diff/command preview builder"
  ```

---

### Task 4: Pausable agent loop with session store

**Files:**
- Modify: `backend/services/code_agent.py`
- Test: `backend/test_agent_loop.py`

**Interfaces:**
- Consumes: `AUTO_TOOLS`, `MUTATING_TOOLS`, `build_preview` (Task 3); `dispatch_tool(tool_name, args, root)`, `tool_read_file(root, path)` (Task 2).
- Produces: `AGENT_SESSIONS: dict[str, dict]`, `run_agent_stream(task, mode="general", context_files=None, working_dir=None) -> Generator[str, None, None]` (same signature as before, now pauses instead of running mutating tools inline), `resume_agent_stream(session_id: str, decision: str) -> Generator[str, None, None]` (new).

- [ ] **Step 1: Add the session store just above `run_agent_stream`**

  In `backend/services/code_agent.py`, add near the top-level imports:
  ```python
  import time
  import uuid
  ```
  (append to the existing `import` block, alphabetically: `time` after `subprocess`, `uuid` after `traceback` — or simply add both lines after the `import traceback` line).

  Then, directly above `def run_agent_stream(`, add:
  ```python
  # ─── Session store for pausable agent runs ───────────────────────────────────

  AGENT_SESSIONS: dict[str, dict] = {}
  SESSION_TTL_SECONDS = 30 * 60


  def _prune_expired_sessions() -> None:
      now = time.time()
      expired = [sid for sid, s in AGENT_SESSIONS.items() if now - s["created"] > SESSION_TTL_SECONDS]
      for sid in expired:
          AGENT_SESSIONS.pop(sid, None)


  def _new_session(messages: list, root: Path, mode: str) -> str:
      _prune_expired_sessions()
      session_id = uuid.uuid4().hex
      AGENT_SESSIONS[session_id] = {
          "messages": messages,
          "root": root,
          "mode": mode,
          "iteration": 0,
          "created": time.time(),
      }
      return session_id
  ```

- [ ] **Step 2: Replace `run_agent_stream` with a thin entry point plus the shared `_agent_loop`**

  Replace the entire existing `run_agent_stream` function with:
  ```python
  def run_agent_stream(
      task: str,
      mode: str = "general",
      context_files: list = None,
      working_dir: str = None,
  ) -> Generator[str, None, None]:
      """
      Start a new agentic run and yield SSE-formatted events until the model
      finishes or hits a mutating tool call that needs user approval.

      Event types:
        data: {"type": "thought", "content": "..."}
        data: {"type": "tool_call", "tool": "...", "args": {...}}
        data: {"type": "tool_result", "tool": "...", "content": "..."}
        data: {"type": "confirm_required", "session_id": "...", "tool": "...", "args": {...}, "preview": "..."}
        data: {"type": "done", "content": "..."}
        data: {"type": "error", "content": "..."}
      """
      root = Path(working_dir).resolve() if working_dir else DEFAULT_ROOT
      system_prompt = AGENT_SYSTEM_PROMPTS.get(mode, AGENT_SYSTEM_PROMPTS["general"])

      full_system = (
          system_prompt
          + "\n\n"
          + TOOL_CALL_FORMAT
          + "\n\nIMPORTANT: Each message you send should contain at most ONE <tool_call> block. "
          "After receiving the tool result, continue thinking and either call another tool or produce your final answer. "
          "Do NOT make up tool results — wait for the actual result."
      )

      if working_dir:
          full_system += f"\n\nWorking directory context: {working_dir}"

      messages = [{"role": "system", "content": full_system}]

      if context_files:
          ctx_parts = []
          for cf in context_files:
              content = tool_read_file(root, cf)
              ctx_parts.append(f"### File: {cf}\n```\n{content}\n```")
          messages.append({
              "role": "user",
              "content": "Here are relevant files for context:\n\n" + "\n\n".join(ctx_parts)
          })
          messages.append({"role": "assistant", "content": "I have read the context files. Ready to proceed."})

      messages.append({"role": "user", "content": task})

      session_id = _new_session(messages, root, mode)
      yield from _agent_loop(session_id)


  def resume_agent_stream(session_id: str, decision: str) -> Generator[str, None, None]:
      """
      Resume a paused session after the user approves or rejects the pending
      mutating tool call, then continue the loop.
      """
      session = AGENT_SESSIONS.get(session_id)
      if not session:
          yield _sse({"type": "error", "content": "Unknown or expired session."})
          return

      pending = session.pop("pending_tool_call", None)
      if not pending:
          yield _sse({"type": "error", "content": "No pending action to resume."})
          return

      tool_name = pending["tool"]
      tool_args = pending["args"]

      if decision == "approve":
          result = dispatch_tool(tool_name, tool_args, session["root"])
      else:
          result = "User rejected this action. Do not repeat it; try a different approach or ask for clarification."

      result_preview = result[:500] + "..." if len(result) > 500 else result
      yield _sse({"type": "tool_result", "tool": tool_name, "content": result_preview})

      session["messages"].append({"role": "assistant", "content": pending["assistant_text"]})
      session["messages"].append({
          "role": "user",
          "content": f"<tool_result>\n{result}\n</tool_result>\n\nContinue with the next step."
      })

      yield from _agent_loop(session_id)


  def _agent_loop(session_id: str) -> Generator[str, None, None]:
      """Shared think -> tool -> observe loop, used by both a fresh run and a resume."""
      session = AGENT_SESSIONS.get(session_id)
      if not session:
          yield _sse({"type": "error", "content": "Unknown or expired session."})
          return

      messages = session["messages"]
      root = session["root"]

      while session["iteration"] < MAX_AGENT_ITERS:
          session["iteration"] += 1

          try:
              resp = _call_ollama(messages, stream=False)
              resp_data = resp.json()
              assistant_text = resp_data.get("message", {}).get("content", "").strip()
          except Exception as e:
              yield _sse({"type": "error", "content": f"Ollama error: {e}"})
              AGENT_SESSIONS.pop(session_id, None)
              return

          if not assistant_text:
              yield _sse({"type": "error", "content": "Empty response from model."})
              AGENT_SESSIONS.pop(session_id, None)
              return

          tool_call = _extract_tool_call(assistant_text)

          thought_text = re.sub(r"<tool_call>.*?</tool_call>", "", assistant_text, flags=re.DOTALL).strip()
          if thought_text:
              yield _sse({"type": "thought", "content": thought_text})

          if tool_call:
              tool_name = tool_call["tool"]
              tool_args = tool_call["args"]

              if tool_name in MUTATING_TOOLS:
                  preview = build_preview(tool_name, tool_args, root)
                  session["pending_tool_call"] = {
                      "tool": tool_name,
                      "args": tool_args,
                      "assistant_text": assistant_text,
                  }
                  yield _sse({
                      "type": "confirm_required",
                      "session_id": session_id,
                      "tool": tool_name,
                      "args": tool_args,
                      "preview": preview,
                  })
                  return

              yield _sse({"type": "tool_call", "tool": tool_name, "args": tool_args})

              result = dispatch_tool(tool_name, tool_args, root)
              result_preview = result[:500] + "..." if len(result) > 500 else result
              yield _sse({"type": "tool_result", "tool": tool_name, "content": result_preview})

              messages.append({"role": "assistant", "content": assistant_text})
              messages.append({
                  "role": "user",
                  "content": f"<tool_result>\n{result}\n</tool_result>\n\nContinue with the next step."
              })

          else:
              if "DONE:" in assistant_text or session["iteration"] >= MAX_AGENT_ITERS:
                  done_text = assistant_text.replace("DONE:", "").strip() if "DONE:" in assistant_text else assistant_text
                  yield _sse({"type": "done", "content": done_text})
                  AGENT_SESSIONS.pop(session_id, None)
                  return
              else:
                  messages.append({"role": "assistant", "content": assistant_text})
                  messages.append({
                      "role": "user",
                      "content": "Continue. If there are more steps, do them now. If fully done, output 'DONE:' followed by your summary."
                  })

      yield _sse({"type": "done", "content": "Agent reached maximum iteration limit. Task may be partially complete."})
      AGENT_SESSIONS.pop(session_id, None)
  ```

  This replaces the old single-generator `run_agent_stream` entirely — the while-loop body is unchanged in behavior for auto tools and the DONE/max-iteration cases; the only behavioral change is that mutating tool calls now pause instead of executing inline.

- [ ] **Step 3: Write the loop test script (mocks Ollama, no network needed)**

  Create `backend/test_agent_loop.py`:
  ```python
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
  ```

- [ ] **Step 4: Run the test**

  Run: `cd backend && python test_agent_loop.py`
  Expected: `All agent-loop checks passed.`

- [ ] **Step 5: Commit**

  ```bash
  git add backend/services/code_agent.py backend/test_agent_loop.py
  git commit -m "feat: pause agent loop on mutating tool calls, add resumable sessions"
  ```

---

### Task 5: `/api/agent/resume` route

**Files:**
- Modify: `backend/app.py`
- Test: `backend/test_agent_resume_route.py`

**Interfaces:**
- Consumes: `code_agent.resume_agent_stream(session_id, decision)` (Task 4).
- Produces: `POST /api/agent/resume` (SSE, `@require_auth`), body `{session_id, decision}`.

- [ ] **Step 1: Add the route**

  In `backend/app.py`, directly below the `agent_modes` function (end of the agent routes block, before `if __name__ == '__main__':`), add:
  ```python
  @app.route('/api/agent/resume', methods=['POST'])
  @require_auth
  def agent_resume():
      """Resume a paused agent session after the user approves/rejects a mutating tool call.
      Body: { session_id, decision: "approve"|"reject" }
      """
      try:
          data = request.json or {}
          session_id = (data.get('session_id') or '').strip()
          decision = (data.get('decision') or '').strip().lower()

          if not session_id:
              return jsonify({'error': 'session_id is required'}), 400
          if decision not in ('approve', 'reject'):
              return jsonify({'error': "decision must be 'approve' or 'reject'"}), 400

          def generate():
              try:
                  for chunk in code_agent.resume_agent_stream(session_id=session_id, decision=decision):
                      yield chunk
              except Exception as exc:
                  import json as _json
                  yield f"data: {_json.dumps({'type': 'error', 'content': str(exc)})}\n\n"

          return Response(
              generate(),
              mimetype='text/event-stream',
              headers={
                  'Cache-Control': 'no-cache',
                  'X-Accel-Buffering': 'no',
                  'Access-Control-Allow-Origin': '*',
              },
          )
      except Exception as exc:
          logger.error(f'Agent resume error: {exc}', exc_info=True)
          return jsonify({'error': str(exc)}), 500
  ```

- [ ] **Step 2: Write the route test**

  Create `backend/test_agent_resume_route.py`:
  ```python
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
  ```

- [ ] **Step 3: Run the test**

  Run: `cd backend && python test_agent_resume_route.py`
  Expected: `All resume-route checks passed.`

- [ ] **Step 4: Commit**

  ```bash
  git add backend/app.py backend/test_agent_resume_route.py
  git commit -m "feat: add /api/agent/resume endpoint for approve/reject flow"
  ```

---

### Task 6: Frontend client — `resumeAgentStream` + shared SSE parsing + auth header

**Files:**
- Modify: `chatbot-ui-vite/src/api/api.js`

**Interfaces:**
- Consumes: `POST /api/agent/resume` (Task 5).
- Produces: `resumeAgentStream({ sessionId, decision, onEvent }) -> AbortController` (mirrors the existing `runAgentStream` shape); both now attach `Authorization`.

- [ ] **Step 1: Factor out the shared SSE-consuming loop and add the auth header**

  In `chatbot-ui-vite/src/api/api.js`, replace the existing `runAgentStream` (everything from `export const runAgentStream = ...` through its closing `};`) with:
  ```javascript
  const _authHeaders = () => {
    const token = localStorage.getItem('authToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  async function _consumeSSE(response, onEvent) {
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      onEvent({ type: 'error', content: err.error || `HTTP ${response.status}` });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event = JSON.parse(line.slice(6));
            onEvent(event);
          } catch (_) {}
        }
      }
    }
  }

  /**
   * Run the agentic loop with streaming SSE.
   * onEvent(event) is called for each parsed SSE event:
   *   { type: 'thought'|'tool_call'|'tool_result'|'confirm_required'|'done'|'error', content, tool?, args?, session_id?, preview? }
   * Returns a controller with .abort() to cancel.
   */
  export const runAgentStream = ({ task, mode = 'general', contextFiles = [], workingDir = null, onEvent }) => {
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch('/api/agent/run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ..._authHeaders() },
          body: JSON.stringify({ task, mode, context_files: contextFiles, working_dir: workingDir }),
          signal: controller.signal,
        });
        await _consumeSSE(response, onEvent);
      } catch (err) {
        if (err.name !== 'AbortError') {
          onEvent({ type: 'error', content: err.message });
        }
      }
    })();

    return controller;
  };

  /**
   * Resume a paused agent session after the user approves or rejects a
   * mutating tool call. Same event shape and controller as runAgentStream.
   */
  export const resumeAgentStream = ({ sessionId, decision, onEvent }) => {
    const controller = new AbortController();

    (async () => {
      try {
        const response = await fetch('/api/agent/resume', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ..._authHeaders() },
          body: JSON.stringify({ session_id: sessionId, decision }),
          signal: controller.signal,
        });
        await _consumeSSE(response, onEvent);
      } catch (err) {
        if (err.name !== 'AbortError') {
          onEvent({ type: 'error', content: err.message });
        }
      }
    })();

    return controller;
  };
  ```

- [ ] **Step 2: Add the auth header to `agentChat` and `getAgentModes` too**

  Change:
  ```javascript
  export const agentChat = async ({ task, mode = 'general', history = [] }) => {
    const response = await fetch('/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, mode, history }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Agent error');
    return data;
  };

  /**
   * Get available agent modes from the backend.
   */
  export const getAgentModes = async () => {
    const response = await fetch('/api/agent/modes');
    const data = await response.json();
    return data.modes || [];
  };
  ```
  to:
  ```javascript
  export const agentChat = async ({ task, mode = 'general', history = [] }) => {
    const response = await fetch('/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ..._authHeaders() },
      body: JSON.stringify({ task, mode, history }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Agent error');
    return data;
  };

  /**
   * Get available agent modes from the backend.
   */
  export const getAgentModes = async () => {
    const response = await fetch('/api/agent/modes', { headers: _authHeaders() });
    const data = await response.json();
    return data.modes || [];
  };
  ```

- [ ] **Step 3: Manual verification (no frontend test runner is configured in this repo)**

  Run the dev server: `cd chatbot-ui-vite && npm run dev`. In the browser console on any page after logging in, run:
  ```javascript
  fetch('/api/agent/modes', { headers: { Authorization: `Bearer ${localStorage.getItem('authToken')}` } })
    .then(r => r.json()).then(console.log)
  ```
  Expected: logs `{ modes: [...] }` with status 200 (confirm via the Network tab), and the same call without the header returns 401.

- [ ] **Step 4: Commit**

  ```bash
  git add chatbot-ui-vite/src/api/api.js
  git commit -m "feat: add resumeAgentStream client and attach auth header to agent API calls"
  ```

---

### Task 7: `AgentPanel.jsx` — render approve/reject UI for `confirm_required`

**Files:**
- Modify: `chatbot-ui-vite/src/components/agent/AgentPanel.jsx`

**Interfaces:**
- Consumes: `resumeAgentStream` (Task 6), the `confirm_required` event shape `{ type, session_id, tool, args, preview }` (Task 4).

- [ ] **Step 1: Import `resumeAgentStream`**

  Change:
  ```javascript
  import { runAgentStream } from '../../api/api'
  ```
  to:
  ```javascript
  import { runAgentStream, resumeAgentStream } from '../../api/api'
  ```

- [ ] **Step 2: Add a color entry for `confirm_required`**

  In the `EVENT_COLORS` object, add a new key alongside the existing ones:
  ```javascript
  const EVENT_COLORS = {
    thought:     { bg: '#1a2035', border: '#3b4fd8', label: '💭 Thinking', labelColor: '#818cf8' },
    tool_call:   { bg: '#0d1f18', border: '#059669', label: '🔧 Tool Call', labelColor: '#34d399' },
    tool_result: { bg: '#1a1505', border: '#d97706', label: '📤 Result',   labelColor: '#fbbf24' },
    confirm_required: { bg: '#1f1a05', border: '#d97706', label: '⚠️ Approval needed', labelColor: '#fbbf24' },
    done:        { bg: '#0d1f18', border: '#10b981', label: '✅ Done',      labelColor: '#6ee7b7' },
    error:       { bg: '#1f0d0d', border: '#ef4444', label: '❌ Error',     labelColor: '#fca5a5' },
  }
  ```

- [ ] **Step 3: Add the `ConfirmCard` component**

  Directly below the existing `ToolResultCard` function, add:
  ```javascript
  function ConfirmCard({ event, onDecision }) {
    const cfg = EVENT_COLORS.confirm_required

    return (
      <div style={{
        background: cfg.bg,
        border: `1px solid ${cfg.border}`,
        borderRadius: 10,
        padding: '10px 14px',
        margin: '6px 0',
      }}>
        <div style={{ color: cfg.labelColor, fontWeight: 700, fontSize: 12, marginBottom: 6 }}>
          {cfg.label}: {event.tool}
        </div>
        <pre style={{
          margin: '0 0 10px',
          color: '#cbd5e1',
          fontSize: 12,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          fontFamily: 'monospace',
          maxHeight: 240,
          overflowY: 'auto',
        }}>
          {event.preview}
        </pre>
        {event.resolved ? (
          <div style={{
            color: event.resolved === 'approved' ? '#6ee7b7' : '#fca5a5',
            fontSize: 12,
            fontWeight: 700,
          }}>
            {event.resolved === 'approved' ? '✓ Approved' : '✗ Rejected'}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => onDecision(event, 'approve')}
              style={{
                padding: '6px 14px', borderRadius: 8, border: '1px solid #059669',
                background: '#0d1f18', color: '#34d399', fontWeight: 700, fontSize: 12, cursor: 'pointer',
              }}
            >
              ✓ Approve
            </button>
            <button
              onClick={() => onDecision(event, 'reject')}
              style={{
                padding: '6px 14px', borderRadius: 8, border: '1px solid #ef4444',
                background: '#1f0d0d', color: '#fca5a5', fontWeight: 700, fontSize: 12, cursor: 'pointer',
              }}
            >
              ✗ Reject
            </button>
          </div>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 4: Wire `ConfirmCard` into `EventBlock`**

  Change:
  ```javascript
  function EventBlock({ event }) {
    if (event.type === 'tool_call') return <ToolCallCard event={event} />
    if (event.type === 'tool_result') return <ToolResultCard event={event} />
  ```
  to:
  ```javascript
  function EventBlock({ event, onDecision }) {
    if (event.type === 'tool_call') return <ToolCallCard event={event} />
    if (event.type === 'tool_result') return <ToolResultCard event={event} />
    if (event.type === 'confirm_required') return <ConfirmCard event={event} onDecision={onDecision} />
  ```

- [ ] **Step 5: Stop the "running" state on `confirm_required`, and add `handleDecision`**

  Change:
  ```javascript
    controllerRef.current = runAgentStream({
      task: task.trim(),
      mode: selectedMode,
      contextFiles: files,
      onEvent: (event) => {
        setEvents(prev => [...prev, event])
        if (event.type === 'done' || event.type === 'error') {
          setIsRunning(false)
        }
      },
    })
  }, [task, selectedMode, contextFiles, isRunning])
  ```
  to:
  ```javascript
    controllerRef.current = runAgentStream({
      task: task.trim(),
      mode: selectedMode,
      contextFiles: files,
      onEvent: (event) => {
        setEvents(prev => [...prev, event])
        if (event.type === 'done' || event.type === 'error' || event.type === 'confirm_required') {
          setIsRunning(false)
        }
      },
    })
  }, [task, selectedMode, contextFiles, isRunning])

  const handleDecision = useCallback((event, decision) => {
    setEvents(prev => prev.map(e => (
      e === event ? { ...e, resolved: decision === 'approve' ? 'approved' : 'rejected' } : e
    )))
    setIsRunning(true)

    controllerRef.current = resumeAgentStream({
      sessionId: event.session_id,
      decision,
      onEvent: (ev) => {
        setEvents(prev => [...prev, ev])
        if (ev.type === 'done' || ev.type === 'error' || ev.type === 'confirm_required') {
          setIsRunning(false)
        }
      },
    })
  }, [])
  ```

- [ ] **Step 6: Pass `handleDecision` down in the render loop**

  Change:
  ```javascript
        {events.map((event, i) => (
          <EventBlock key={i} event={event} />
        ))}
  ```
  to:
  ```javascript
        {events.map((event, i) => (
          <EventBlock key={i} event={event} onDecision={handleDecision} />
        ))}
  ```

- [ ] **Step 7: Manual verification (no frontend test runner is configured in this repo)**

  With the backend running and Ollama up, start the frontend (`npm run dev`), open the Agent tab, and run a task that should trigger `write_file` (e.g. "create a file called scratch/hello.txt with the text hello world"). Confirm:
  - The run pauses and shows an amber "⚠️ Approval needed: write_file" card with a `+hello world` diff, and the file does not yet exist on disk.
  - Clicking **Reject** shows "✗ Rejected" on that card, the agent continues (e.g. it may retry or explain), and the file still does not exist.
  - Re-running and clicking **Approve** shows "✓ Approved", and the file is created on disk with the expected content.

- [ ] **Step 8: Commit**

  ```bash
  git add chatbot-ui-vite/src/components/agent/AgentPanel.jsx
  git commit -m "feat: add approve/reject UI for mutating agent tool calls"
  ```

---

### Task 8: CLI confirm-before-act (`pragna_code.py`)

**Files:**
- Modify: `pragna_code.py`
- Test: `backend/test_pragna_code_confirm.py`

**Interfaces:**
- Produces: `MUTATING_TOOLS: set[str]`, `_preview_for(tool_name: str, args: dict) -> str`, `_confirm_action(tool_name: str, args: dict) -> bool` (used interactively via `input()`).

- [ ] **Step 1: Add `import difflib`**

  In `pragna_code.py`, change:
  ```python
  import sys
  import os
  import json
  import re
  import subprocess
  import textwrap
  import threading
  import time
  import traceback
  ```
  to:
  ```python
  import sys
  import os
  import difflib
  import json
  import re
  import subprocess
  import textwrap
  import threading
  import time
  import traceback
  ```

- [ ] **Step 2: Add `MUTATING_TOOLS`, `_preview_for`, and `_confirm_action` just below the `BLOCKED`/`_is_blocked` block**

  Directly below:
  ```python
  def _is_blocked(cmd: str) -> bool:
      return any(re.search(p, cmd, re.IGNORECASE) for p in BLOCKED)
  ```
  add:
  ```python
  MUTATING_TOOLS = {"write_file", "create_file", "append_file", "run_command"}


  def _preview_for(tool_name: str, args: dict) -> str:
      """Build a human-readable preview (diff or command) for a mutating tool call."""
      if tool_name == "run_command":
          return f"$ {args.get('command', '')}"

      path = args.get("path", "")
      new_content = args.get("content", "")
      try:
          p = Path(path)
          old_content = p.read_text(errors="replace") if p.exists() else ""
      except Exception:
          old_content = ""

      if tool_name == "append_file":
          new_content = old_content + new_content

      diff = difflib.unified_diff(
          old_content.splitlines(keepends=True),
          new_content.splitlines(keepends=True),
          fromfile=f"a/{path}",
          tofile=f"b/{path}",
      )
      diff_text = "".join(diff)
      return diff_text or f"(no textual diff — {path} unchanged or binary)"


  def _confirm_action(tool_name: str, args: dict) -> bool:
      """Show a diff/command preview and block on a y/N prompt before a mutating tool runs."""
      preview = _preview_for(tool_name, args)
      print(f"  {C.GOLD_DEEP}┌─ approval required: {tool_name}{C.RESET}")
      for line in preview.splitlines()[:40]:
          print(f"  {C.GOLD_DEEP}│{C.RESET} {line}")
      print(f"  {C.GOLD_DEEP}└─{C.RESET}")
      answer = input(f"  Approve this action? [y/N] ").strip().lower()
      return answer == "y"
  ```

- [ ] **Step 3: Gate mutating tool dispatch in `run_agent` behind `_confirm_action`**

  Change:
  ```python
          if tool_call:
              tool_name = tool_call["tool"]
              tool_args = tool_call["args"]
              print_tool_call(tool_name, tool_args)

              if tool_name == "run_command":
                  spinner.label = f"Running: {tool_args.get('command', '')[:40]}"
                  spinner.start()
              result = dispatch_tool(tool_name, tool_args)
              if tool_name == "run_command":
                  spinner.stop()

              print_tool_result(tool_name, result)
  ```
  to:
  ```python
          if tool_call:
              tool_name = tool_call["tool"]
              tool_args = tool_call["args"]
              print_tool_call(tool_name, tool_args)

              if tool_name in MUTATING_TOOLS and not _confirm_action(tool_name, tool_args):
                  result = "User rejected this action. Do not repeat it; try a different approach or ask for clarification."
              else:
                  if tool_name == "run_command":
                      spinner.label = f"Running: {tool_args.get('command', '')[:40]}"
                      spinner.start()
                  result = dispatch_tool(tool_name, tool_args)
                  if tool_name == "run_command":
                      spinner.stop()

              print_tool_result(tool_name, result)
  ```

- [ ] **Step 4: Write the CLI preview/classification test**

  Create `backend/test_pragna_code_confirm.py`:
  ```python
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
  ```

- [ ] **Step 5: Run the test**

  Run: `python backend/test_pragna_code_confirm.py`
  Expected: `All CLI confirm checks passed.`

- [ ] **Step 6: Manual verification of the interactive prompt**

  Run `python pragna_code.py` in a scratch directory, give it a task like "create a file called hello.txt with the text hi", and confirm the `┌─ approval required: create_file` box appears with a `+hi` diff and blocks on `Approve this action? [y/N]` before anything is written. Confirm typing `n` skips the write and typing `y` performs it.

- [ ] **Step 7: Commit**

  ```bash
  git add pragna_code.py backend/test_pragna_code_confirm.py
  git commit -m "feat: add confirm-before-act prompt for mutating tools in the CLI agent"
  ```

---

### Task 9: Housekeeping

**Files:**
- Delete: `pragana.bat`
- Modify: `README_CLI.md`

**Interfaces:** none (no code dependencies on other tasks).

- [ ] **Step 1: Delete the duplicate launcher**

  ```bash
  git rm pragana.bat
  ```

- [ ] **Step 2: Update the safety section of `README_CLI.md`**

  Change:
  ```markdown
  > 🛡️ **Safety Guard:** Dangerous commands (e.g., `rm -rf`, `drop database`, force pushes) are automatically blocked.
  ```
  to:
  ```markdown
  > 🛡️ **Safety Guard:** Before `write_file`, `create_file`, `append_file`, or `run_command` runs, Pragna Code shows you a diff (or the exact command) and asks `Approve this action? [y/N]` — nothing mutates your files or runs a shell command without your say-so. A small blocklist (`rm -rf`, `drop database`, force pushes, etc.) is also enforced as a second layer for `run_command`.
  ```

- [ ] **Step 3: Verify no other reference to `pragana.bat` exists**

  Run: `grep -rn "pragana" --include=*.md --include=*.json --include=*.py --include=*.jsx .` (or the Grep tool equivalent)
  Expected: no matches outside of `.git` history.

- [ ] **Step 4: Commit**

  ```bash
  git add -u pragana.bat README_CLI.md
  git commit -m "chore: remove duplicate launcher script, update CLI safety docs"
  ```

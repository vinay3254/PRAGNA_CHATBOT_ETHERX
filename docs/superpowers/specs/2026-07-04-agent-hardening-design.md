# Agent Feature Hardening — Design Spec

Date: 2026-07-04

## Context

Two agentic coding assistants exist in-flight, uncommitted:

- **Web agent**: `backend/services/code_agent.py` (tool-use loop over Ollama) +
  three Flask routes in `backend/app.py` (`/api/agent/run`, `/api/agent/chat`,
  `/api/agent/modes`) + `chatbot-ui-vite/src/components/agent/AgentPanel.jsx`
  (chat-style UI, wired into the sidebar as a new "Agent" tab) + client
  functions in `chatbot-ui-vite/src/api/api.js`.
- **CLI agent**: `pragna_code.py` (714 lines, standalone terminal REPL), with
  `README_CLI.md` and launcher scripts `pragna.bat` / `pragana.bat`.

Both implement the same pattern: a system prompt instructs the model to emit
`<tool_call>{"tool": ..., "args": ...}</tool_call>` blocks; the harness
extracts, executes, and feeds results back in a loop (max 20 iterations) until
the model outputs `DONE:`.

Two gaps block calling this "finished":

1. **No auth, no sandboxing on the web agent.** Every other route in
   `app.py` is decorated with `@require_auth` (see lines 1925, 1938, 1954);
   the three agent routes are not. `code_agent.py`'s file tools resolve paths
   via `Path(path).expanduser()` with no jailing — a request can read, write,
   or delete any file the server process can reach. `run_command`'s safety
   check is a small regex blocklist (`rm -rf`, `drop database`, etc.) that
   does not cover most destructive one-liners.
2. **No confirmation before mutation.** `write_file`, `create_file`,
   `append_file`, and `run_command` execute the instant the model calls them,
   in both the web agent and the CLI. There is no diff preview or approval
   step, only the same weak blocklist.

## Goals

- Close the auth/sandboxing gap on the web agent.
- Require explicit user approval before any mutating tool call executes, in
  both the web agent and the CLI.
- Fix small housekeeping issues discovered alongside (duplicate launcher
  script, stale README safety claims).

## Non-goals

- Fixing `conversation_memory.db` being tracked in git despite `*.db` in
  `.gitignore` (pre-existing, unrelated secrets-hygiene issue — flagged
  separately, not fixed here).
- Any other roadmap item (streaming for the *main* chatbot, memory/user_facts
  wiring, multimodal, artifacts, etc.) — this spec covers only the two
  in-flight agent surfaces.
- Session persistence for the CLI or web agent beyond what's needed to
  support the approve/reject round-trip (see below). Long-term resumable
  sessions are a separate future item.

## Design

### 1. Auth on web agent routes

Add `@require_auth` to `agent_run`, `agent_chat`, and `agent_modes` in
`backend/app.py`, matching the existing pattern used elsewhere in the file.

### 2. Path sandboxing in `code_agent.py`

Replace `_safe_path` with a version that:

- Resolves `working_dir` (falling back to the backend project root if not
  supplied) to an absolute real path once per run.
- For every file tool call (`read_file`, `write_file`, `create_file`,
  `append_file`, `list_dir`, `search_code`), resolves the requested path
  relative to that root, then verifies the resolved path is still inside the
  root (`os.path.commonpath` check or equivalent). If not, returns an
  `ERROR:` string — same failure-reporting convention the tools already use
  — instead of raising.

`run_command`'s existing blocklist regex stays as a secondary guard but is
no longer the primary safety mechanism now that mutating commands require
approval (see below).

### 3. Confirm-before-act flow

**Tool classification:**
- Auto (execute immediately, no approval): `read_file`, `list_dir`,
  `search_code`.
- Mutating (require approval): `write_file`, `create_file`, `append_file`,
  `run_command`.

**Web agent (`code_agent.py` + `app.py` + `AgentPanel.jsx`):**

- `run_agent_stream` stops when the model emits a mutating tool call. Instead
  of executing, it yields:
  `data: {"type": "confirm_required", "session_id": "...", "tool": "...", "args": {...}, "preview": "..."}`
  - `preview` is a unified diff (`difflib.unified_diff`) of old vs. new
    content for `write_file`/`create_file`/`append_file`, or the literal
    command string for `run_command`.
  - The SSE stream ends after this event (HTTP response closes normally).
- Server-side, an in-memory dict (`AGENT_SESSIONS: dict[str, dict]`) keyed by
  `session_id` holds `{messages, pending_tool_call, working_dir, mode}`.
  Sessions expire after a short TTL (e.g. 30 min) or on process restart —
  acceptable since this is a dev-facing tool, not a durable feature.
- New route `POST /api/agent/resume` (also `@require_auth`), body
  `{session_id, decision: "approve"|"reject"}`:
  - `reject`: mark the tool result as "User rejected this action," feed that
    back into the conversation, continue the loop (so the model can try a
    different approach), streaming the continuation as a fresh SSE response.
  - `approve`: execute the pending tool call, feed the real result back,
    continue the loop the same way.
  - Loop continues (auto tools run inline, next mutating call pauses again)
    until `DONE:` or iteration cap, same as today.
- `AgentPanel.jsx`: new event renderer for `confirm_required` — shows the
  diff/command in a card with **Approve** / **Reject** buttons instead of
  auto-advancing. Clicking either calls a new `resumeAgentStream` client
  function (mirrors `runAgentStream`, posts to `/api/agent/resume`, same SSE
  parsing loop) and appends the continuation's events.

**CLI (`pragna_code.py`):**

- No session store needed — the REPL is already a blocking synchronous loop
  holding the conversation in memory.
- Before `dispatch_tool` executes a mutating tool, print the diff/command
  preview and prompt `Approve this action? [y/N]`. On `n`/anything else,
  feed back "User rejected this action" as the tool result and continue the
  loop; on `y`, execute normally.

### 4. Housekeeping

- Delete `pragana.bat` (byte-identical duplicate of `pragna.bat`).
- Update `README_CLI.md`'s "Safety Guard" section to describe
  confirm-before-act for mutating tools, rather than "automatically blocked."

## Testing

- Web: exercise `/api/agent/run` unauthenticated → expect 401. Exercise a
  `write_file` call targeting a path outside `working_dir` → expect the
  sandboxed `ERROR:` string, file untouched. Exercise a normal in-sandbox
  `write_file` → expect `confirm_required` event, then verify approve/reject
  both behave correctly via `/api/agent/resume`.
- CLI: run a task that calls `write_file`, confirm the `y/N` prompt appears
  with a correct diff, and that `n` prevents the write.
- Manual smoke test of `AgentPanel.jsx` in the browser: run a task that both
  reads a file (auto) and writes one (pauses for approval), confirm the UI
  renders both states correctly.

"""
Pragna Code Agent — agentic coding assistant with a tool-use loop.

The agent runs a think → tool_call → observe loop powered by the local Ollama model.
It understands code, can read/write/create files, run shell commands, and review projects.

Modes
-----
general       — General coding assistant
code_review   — Deep code review: bugs, security, style, improvements
app_builder   — Plan and build full applications step by step
debug         — Systematic bug finding and fixing
explain       — Explain code / concepts clearly
refactor      — Clean up and improve existing code
"""
from __future__ import annotations

import difflib
import json
import logging
import os
import re
import subprocess
import time
import traceback
import uuid
from pathlib import Path
from typing import Any, Generator

import requests

import config

logger = logging.getLogger(__name__)

# ─── Safety: restrict shell commands to a safe subset ──────────────────────────
BLOCKED_SHELL_PATTERNS = [
    r"\brm\s+-rf\b",
    r"\brmdir\b",
    r"\bdrop\s+database\b",
    r"\bformat\b",
    r"\bdel\s+/[sqa]",
    r"\bgit\s+push\s+--force\b",
    r"\bpoweroff\b",
    r"\bshutdown\b",
    r"\breboot\b",
]

# Max file size we'll read in full (bytes)
MAX_READ_BYTES = 80_000
# Max shell output we'll return
MAX_SHELL_OUTPUT = 6_000
# Max iterations in one agentic run
MAX_AGENT_ITERS = 20

AGENT_SYSTEM_PROMPTS = {
    "general": (
        "You are Pragna Code, an expert local AI coding assistant. "
        "You have access to tools that let you read files, write files, create files, "
        "run shell commands, list directories, and search code. "
        "Use these tools autonomously to complete the user's request fully. "
        "Think step by step. Call one tool at a time. After observing the result, decide the next action. "
        "When the task is fully done, output a final summary starting with 'DONE:'. "
        "Never just describe what to do — actually do it using the tools."
    ),
    "code_review": (
        "You are Pragna Code in CODE REVIEW mode. "
        "Your job is to thoroughly review code files for: bugs, security vulnerabilities, "
        "performance issues, code style, and improvement opportunities. "
        "Use list_dir and read_file tools to explore the codebase before reviewing. "
        "Structure your review with sections: Bugs, Security, Performance, Style, Suggestions. "
        "Be specific — include line numbers and code snippets where relevant. "
        "When done, output 'DONE:' followed by a structured review report."
    ),
    "app_builder": (
        "You are Pragna Code in APP BUILDER mode. "
        "You build complete, working applications from scratch or extend existing ones. "
        "Start by exploring the project structure, then plan the implementation, "
        "then create/edit files one by one using your tools. "
        "Always verify each file you create makes sense in context. "
        "When done, output 'DONE:' followed by what was built and how to run it."
    ),
    "debug": (
        "You are Pragna Code in DEBUG mode. "
        "You systematically find and fix bugs. Start by reading relevant files, "
        "then trace the error, identify the root cause, apply a targeted fix, "
        "and verify the fix makes logical sense. "
        "Explain your reasoning at each step. "
        "When done, output 'DONE:' followed by what was fixed and why."
    ),
    "explain": (
        "You are Pragna Code in EXPLAIN mode. "
        "You explain code clearly and thoroughly — what it does, how it works, "
        "and why it's written that way. Read the relevant files using your tools. "
        "Use clear language, examples, and analogies where helpful. "
        "When done, output 'DONE:' followed by the full explanation."
    ),
    "refactor": (
        "You are Pragna Code in REFACTOR mode. "
        "You improve existing code: better structure, cleaner logic, reduced duplication, "
        "better naming, improved readability — without changing behavior. "
        "Read the files first, plan the refactoring, then apply changes using write_file. "
        "When done, output 'DONE:' followed by what was refactored and how."
    ),
}

# ─── Tool definitions ────────────────────────────────────────────────────────

TOOLS = [
    {
        "name": "read_file",
        "description": "Read the contents of a file. Returns the file content as text.",
        "parameters": {
            "path": "string — path to the file (relative to project root or absolute)"
        },
    },
    {
        "name": "write_file",
        "description": "Write content to a file. Creates the file if it doesn't exist, overwrites if it does.",
        "parameters": {
            "path": "string — file path",
            "content": "string — full file content to write",
        },
    },
    {
        "name": "create_file",
        "description": "Create a new file with given content. Fails if file already exists.",
        "parameters": {
            "path": "string — file path",
            "content": "string — initial file content",
        },
    },
    {
        "name": "list_dir",
        "description": "List files and directories at a given path.",
        "parameters": {
            "path": "string — directory path (use '.' for current directory)"
        },
    },
    {
        "name": "run_command",
        "description": (
            "Run a shell command and return stdout + stderr. "
            "Use for: running scripts, installing packages, running tests, git commands. "
            "Keep commands safe and non-destructive."
        ),
        "parameters": {
            "command": "string — the shell command to run",
            "cwd": "string — optional working directory",
        },
    },
    {
        "name": "search_code",
        "description": "Search for a text pattern across all files in a directory (recursive grep).",
        "parameters": {
            "pattern": "string — text or regex to search for",
            "path": "string — directory to search in (default: '.')",
            "file_pattern": "string — optional glob to filter files, e.g. '*.py'",
        },
    },
    {
        "name": "append_file",
        "description": "Append text to the end of an existing file.",
        "parameters": {
            "path": "string — file path",
            "content": "string — content to append",
        },
    },
]

TOOLS_DESCRIPTION = "\n".join(
    f"- {t['name']}({', '.join(t['parameters'].keys())}): {t['description']}"
    for t in TOOLS
)

TOOL_CALL_FORMAT = """
To call a tool, output EXACTLY this JSON block (nothing else on that line):
<tool_call>
{"tool": "tool_name", "args": {"param1": "value1"}}
</tool_call>

Available tools:
""" + TOOLS_DESCRIPTION


# ─── Tool execution ──────────────────────────────────────────────────────────

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


def _is_blocked_command(cmd: str) -> bool:
    for pattern in BLOCKED_SHELL_PATTERNS:
        if re.search(pattern, cmd, re.IGNORECASE):
            return True
    return False


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


# ─── Ollama LLM call ─────────────────────────────────────────────────────────

def _call_ollama(messages: list, stream: bool = False):
    """Call Ollama /api/chat endpoint."""
    url = f"{config.OLLAMA_API_URL.rstrip('/')}/api/chat"
    model = config.OLLAMA_MODEL
    payload = {
        "model": model,
        "messages": messages,
        "stream": stream,
        "options": {
            "temperature": 0.3,
            "num_ctx": 8192,
        },
    }
    resp = requests.post(url, json=payload, timeout=120, stream=stream)
    resp.raise_for_status()
    return resp


def _extract_tool_call(text: str):
    """Extract a tool_call JSON block from the model output."""
    match = re.search(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", text, re.DOTALL)
    if not match:
        return None
    try:
        data = json.loads(match.group(1))
        if "tool" in data and "args" in data:
            return data
    except json.JSONDecodeError:
        pass
    return None


# ─── Main agentic loop (streaming generator) ─────────────────────────────────

def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


# ─── Session store for pausable agent runs ───────────────────────────────────

AGENT_SESSIONS: dict[str, dict] = {}
SESSION_TTL_SECONDS = 30 * 60


def _prune_expired_sessions() -> None:
    now = time.time()
    expired = [sid for sid, s in list(AGENT_SESSIONS.items()) if now - s["created"] > SESSION_TTL_SECONDS]
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


# ─── Non-streaming single-shot chat (for simpler UI calls) ────────────────────

def agent_chat(task: str, mode: str = "general", history: list = None) -> dict:
    """Simple non-streaming agent response for quick queries."""
    system_prompt = AGENT_SYSTEM_PROMPTS.get(mode, AGENT_SYSTEM_PROMPTS["general"])
    messages = [{"role": "system", "content": system_prompt}]

    if history:
        for turn in history[-6:]:  # last 6 turns
            messages.append({"role": turn.get("role", "user"), "content": turn.get("content", "")})

    messages.append({"role": "user", "content": task})

    try:
        resp = _call_ollama(messages, stream=False)
        resp_data = resp.json()
        content = resp_data.get("message", {}).get("content", "").strip()
        return {"response": content, "mode": mode}
    except Exception as e:
        return {"response": f"Agent error: {e}", "mode": mode}

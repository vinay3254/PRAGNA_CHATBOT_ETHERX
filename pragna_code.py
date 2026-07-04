#!/usr/bin/env python3
"""
Pragna Code CLI — v1.0.0
An agentic coding assistant powered by local Ollama.
Similar to Claude Code — runs in your terminal, reads/writes/runs code autonomously.

Usage:
    python pragna_code.py              # start in current directory
    python pragna_code.py /path/to/project  # start in a specific directory
"""

import sys
import os
import json
import re
import subprocess
import textwrap
import threading
import time
import traceback
from pathlib import Path
from typing import Optional

import requests

# Reconfigure stdout/stderr to UTF-8 if possible
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# ─── Try to load dotenv from backend/.env ────────────────────────────────────
try:
    from dotenv import load_dotenv
    _env = Path(__file__).parent / "backend" / ".env"
    if _env.exists():
        load_dotenv(_env)
    else:
        _env2 = Path(__file__).parent.parent / "backend" / ".env"
        if _env2.exists():
            load_dotenv(_env2)
except ImportError:
    pass

# ─── Config from env ─────────────────────────────────────────────────────────
OLLAMA_URL   = os.getenv("OLLAMA_API_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "mistral")
VERSION      = "1.0.0"

# ─── ANSI Colors ─────────────────────────────────────────────────────────────
class C:
    RESET   = "\033[0m"
    BOLD    = "\033[1m"
    DIM     = "\033[38;2;168;152;120m" # #a89878
    
    # Gold Palette Truecolors
    GOLD      = "\033[38;2;212;175;55m"    # #d4af37
    GOLD_SOFT = "\033[38;2;229;199;107m"  # #e5c76b
    GOLD_DEEP = "\033[38;2;184;134;11m"   # #b8860b
    BORDER    = "\033[38;2;45;42;36m"     # #2d2a24
    TEXT      = "\033[38;2;240;230;211m"   # #f0e6d3
    MUTED     = "\033[38;2;168;152;120m"   # #a89878

    # Remapped constants for backward compatibility
    BBLUE    = GOLD
    BYELLOW  = GOLD_SOFT
    BGREEN   = GOLD_DEEP
    BCYAN    = GOLD
    BWHITE   = TEXT
    BBLACK   = MUTED
    BMAGENTA = GOLD_SOFT
    
    # Alert / Error colors
    RED      = "\033[31m"
    BRED     = "\033[91m"

def _enable_ansi_windows():
    """Enable ANSI escape codes on Windows."""
    if sys.platform == "win32":
        try:
            import ctypes
            kernel = ctypes.windll.kernel32
            kernel.SetConsoleMode(kernel.GetStdHandle(-11), 7)
        except Exception:
            pass

_enable_ansi_windows()

# ─── Terminal helpers ─────────────────────────────────────────────────────────
def _width() -> int:
    try:
        return os.get_terminal_size().columns
    except Exception:
        return 100

def _hr(char="─", color=None):
    w = _width()
    c1 = (212, 175, 55) # Gold
    c2 = (45, 42, 36)   # Border color (#2d2a24)
    res = []
    for i in range(w):
        ratio = i / (w - 1) if w > 1 else 0
        r = int(c1[0] + (c2[0] - c1[0]) * ratio)
        g = int(c1[1] + (c2[1] - c1[1]) * ratio)
        b = int(c1[2] + (c2[2] - c1[2]) * ratio)
        res.append(f"\033[38;2;{r};{g};{b}m{char}")
    print("".join(res) + C.RESET)

def _clear():
    os.system("cls" if sys.platform == "win32" else "clear")

def _wrap(text: str, indent: int = 2) -> str:
    w = max(_width() - indent - 2, 40)
    lines = text.splitlines()
    wrapped = []
    for line in lines:
        if len(line) <= w:
            wrapped.append(line)
        else:
            wrapped.extend(textwrap.wrap(line, w))
    prefix = " " * indent
    return "\n".join(prefix + l for l in wrapped)

# ─── Print helpers ────────────────────────────────────────────────────────────
def print_thought(text: str):
    """Purple — agent reasoning"""
    print(f"  ● {C.MUTED}thinking...{C.RESET}")
    if text.strip():
        print(_wrap(f"{C.MUTED}{text.strip()}{C.RESET}", indent=2))

def print_tool_call(tool: str, args: dict):
    """Green — tool invocation"""
    args_str = "  ".join(f"{k}={repr(v)[:60]}" for k, v in args.items())
    print(f"  ⚙ {tool}  {C.MUTED}{args_str}{C.RESET}")

def print_tool_result(tool: str, result: str):
    """Yellow — tool output"""
    preview = result.strip()[:400]
    if len(result.strip()) > 400:
        preview += f"\n  ... ({len(result)} chars total)"
    print(f"  ↳ {C.MUTED}result:{C.RESET}")
    for line in preview.splitlines():
        print(f"  {C.MUTED}{line}{C.RESET}")

def print_done(text: str):
    """Bright white — final answer"""
    print(f"  ✓ {C.GOLD}done{C.RESET}")
    # Render markdown-ish output
    for line in text.splitlines():
        if line.startswith("### "):
            print(f"  {C.BOLD}{C.GOLD_SOFT}{line[4:]}{C.RESET}")
        elif line.startswith("## "):
            print(f"  {C.BOLD}{C.GOLD}{line[3:]}{C.RESET}")
        elif line.startswith("# "):
            print(f"  {C.BOLD}{C.GOLD}{line[2:]}{C.RESET}")
        elif line.startswith("- ") or line.startswith("* "):
            print(f"  {C.GOLD_SOFT}•{C.RESET} {line[2:]}")
        elif line.startswith("```"):
            print(f"  {C.MUTED}{line}{C.RESET}")
        elif line.strip().startswith("**") and line.strip().endswith("**"):
            print(f"  {C.BOLD}{line}{C.RESET}")
        else:
            print(f"  {line}")

def print_response(text: str):
    """Print the model response directly (for conversational turns)."""
    for line in text.splitlines():
        if line.startswith("### "):
            print(f"  {C.BOLD}{C.GOLD_SOFT}{line[4:]}{C.RESET}")
        elif line.startswith("## "):
            print(f"  {C.BOLD}{C.GOLD}{line[3:]}{C.RESET}")
        elif line.startswith("# "):
            print(f"  {C.BOLD}{C.GOLD}{line[2:]}{C.RESET}")
        elif line.startswith("- ") or line.startswith("* "):
            print(f"  {C.GOLD_SOFT}•{C.RESET} {line[2:]}")
        elif line.startswith("```"):
            print(f"  {C.MUTED}{line}{C.RESET}")
        elif line.strip().startswith("**") and line.strip().endswith("**"):
            print(f"  {C.BOLD}{line}{C.RESET}")
        else:
            print(f"  {line}")

def print_error(text: str):
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    if not lines:
        return
    title = lines[0]
    if title.endswith("."):
        title = title[:-1]
    
    if "Empty response from model" in title:
        subtitle = "no output received · retrying with reduced context"
    else:
        subtitle = "\n".join(lines[1:]) if len(lines) > 1 else None
        
    left_border = f"{C.GOLD_DEEP}│{C.RESET}"
    print(f"  {left_border} {C.GOLD_SOFT}{title}{C.RESET}")
    if subtitle:
        print(f"  {left_border} {C.MUTED}{subtitle}{C.RESET}")
    print()

def print_info(text: str):
    print(f"  {C.MUTED}{text}{C.RESET}")

# ─── Spinner ─────────────────────────────────────────────────────────────────
class Spinner:
    FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"]

    def __init__(self, label="Working"):
        self.label = label
        self._stop = threading.Event()
        self._thread = None

    def start(self):
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=1)
        # Clear spinner line
        print(f"\r{' ' * (_width() - 1)}\r", end="", flush=True)

    def _run(self):
        i = 0
        while not self._stop.is_set():
            frame = self.FRAMES[i % len(self.FRAMES)]
            print(f"\r  {C.BBLUE}{frame}{C.RESET}  {C.DIM}{self.label}...{C.RESET}", end="", flush=True)
            i += 1
            time.sleep(0.08)

# ─── Safety blocklist ─────────────────────────────────────────────────────────
BLOCKED = [
    r"\brm\s+-rf\b", r"\brmdir\b", r"\bformat\b",
    r"\bdel\s+/[sqaf]", r"\bgit\s+push\s+--force\b",
    r"\bpoweroff\b", r"\bshutdown\b", r"\breboot\b",
    r"\bdrop\s+database\b",
]

def _is_blocked(cmd: str) -> bool:
    return any(re.search(p, cmd, re.IGNORECASE) for p in BLOCKED)

MAX_READ   = 80_000
MAX_OUTPUT = 6_000

# ─── Tools ───────────────────────────────────────────────────────────────────
def tool_read_file(path: str) -> str:
    try:
        p = Path(path)
        if not p.exists():
            return f"ERROR: File not found: {path}"
        size = p.stat().st_size
        with open(p, "r", errors="replace") as f:
            content = f.read(MAX_READ)
        if size > MAX_READ:
            content += f"\n\n[... truncated at {MAX_READ} bytes, total {size} bytes ...]"
        return content
    except Exception as e:
        return f"ERROR: {e}"

def tool_write_file(path: str, content: str) -> str:
    try:
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(content)
        return f"OK: wrote {len(content)} chars to {path}"
    except Exception as e:
        return f"ERROR: {e}"

def tool_create_file(path: str, content: str) -> str:
    try:
        p = Path(path)
        if p.exists():
            return f"ERROR: File already exists. Use write_file to overwrite."
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(content)
        return f"OK: created {path}"
    except Exception as e:
        return f"ERROR: {e}"

def tool_list_dir(path: str = ".") -> str:
    try:
        p = Path(path)
        if not p.exists():
            return f"ERROR: Not found: {path}"
        items = sorted(p.iterdir(), key=lambda x: (x.is_file(), x.name.lower()))
        lines = []
        for item in items:
            if item.name.startswith("."):
                continue
            if item.is_dir():
                lines.append(f"[DIR]  {item.name}/")
            else:
                lines.append(f"[FILE] {item.name}  ({item.stat().st_size} bytes)")
        return "\n".join(lines) or "(empty)"
    except Exception as e:
        return f"ERROR: {e}"

def tool_run_command(command: str, cwd: str = None) -> str:
    if _is_blocked(command):
        return f"ERROR: Blocked command (safety policy): {command}"
    try:
        result = subprocess.run(
            command, shell=True, capture_output=True, text=True,
            timeout=30, cwd=cwd or None,
        )
        out = (result.stdout or "") + ("\n[STDERR]\n" + result.stderr if result.stderr else "")
        if not out.strip():
            out = f"(exit {result.returncode}, no output)"
        return out[:MAX_OUTPUT] + ("\n[... truncated ...]" if len(out) > MAX_OUTPUT else "")
    except subprocess.TimeoutExpired:
        return "ERROR: Command timed out after 30s."
    except Exception as e:
        return f"ERROR: {e}"

def tool_search_code(pattern: str, path: str = ".", file_pattern: str = None) -> str:
    try:
        if sys.platform == "win32":
            fp = file_pattern or "*"
            cmd = f'findstr /s /n /r /i "{pattern}" "{Path(path)}\\{fp}"'
        else:
            inc = f"--include={file_pattern}" if file_pattern else ""
            cmd = f'grep -rn {inc} "{pattern}" "{path}"'
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=15)
        out = result.stdout or "(no matches)"
        return out[:MAX_OUTPUT]
    except Exception as e:
        return f"ERROR: {e}"

def tool_append_file(path: str, content: str) -> str:
    try:
        with open(path, "a", encoding="utf-8") as f:
            f.write(content)
        return f"OK: appended {len(content)} chars to {path}"
    except Exception as e:
        return f"ERROR: {e}"

def dispatch_tool(name: str, args: dict) -> str:
    try:
        if name == "read_file":    return tool_read_file(args.get("path", ""))
        if name == "write_file":   return tool_write_file(args.get("path", ""), args.get("content", ""))
        if name == "create_file":  return tool_create_file(args.get("path", ""), args.get("content", ""))
        if name == "list_dir":     return tool_list_dir(args.get("path", "."))
        if name == "run_command":  return tool_run_command(args.get("command", ""), args.get("cwd"))
        if name == "search_code":  return tool_search_code(args.get("pattern", ""), args.get("path", "."), args.get("file_pattern"))
        if name == "append_file":  return tool_append_file(args.get("path", ""), args.get("content", ""))
        return f"ERROR: Unknown tool '{name}'"
    except Exception:
        return f"ERROR: {traceback.format_exc()}"

# ─── Mode definitions ─────────────────────────────────────────────────────────
MODES = {
    "general": {
        "label": "General",
        "color": C.BBLUE,
        "prompt": (
            "You are Pragna Code, a helpful and expert AI coding assistant. "
            "Answer questions, write code, and assist the user with programming. "
            "Respond naturally to conversational greetings and requests."
        ),
    },
    "code_review": {
        "label": "Code Review",
        "color": C.BYELLOW,
        "prompt": (
            "You are Pragna Code in CODE REVIEW mode. "
            "Review the provided files or codebase for bugs, security vulnerabilities, "
            "performance bottlenecks, style issues, and structure. Be detailed and constructive."
        ),
    },
    "app_builder": {
        "label": "App Builder",
        "color": C.BGREEN,
        "prompt": (
            "You are Pragna Code in APP BUILDER mode. "
            "Build complete, working applications step by step. "
            "Explore the project first, then plan, then implement file by file using tools. "
            "Output 'DONE:' followed by what was built and how to run it."
        ),
    },
    "debug": {
        "label": "Debug",
        "color": C.BRED,
        "prompt": (
            "You are Pragna Code in DEBUG mode. "
            "Systematically find and fix bugs. Read files, trace errors, identify root cause, apply fix. "
            "Explain reasoning at each step. "
            "Output 'DONE:' followed by what was fixed and why."
        ),
    },
    "explain": {
        "label": "Explain",
        "color": C.BCYAN,
        "prompt": (
            "You are Pragna Code in EXPLAIN mode. "
            "Explain code clearly — what it does, how it works, and best practices. "
            "Answer general programming concepts and architectural questions."
        ),
    },
    "refactor": {
        "label": "Refactor",
        "color": C.BMAGENTA,
        "prompt": (
            "You are Pragna Code in REFACTOR mode. "
            "Improve existing code: better structure, less duplication, cleaner logic, better naming. "
            "Read files first, plan the changes, then apply with write_file. "
            "Output 'DONE:' followed by what was refactored."
        ),
    },
}

TOOL_DOCS = """
To call a tool, output EXACTLY:
<tool_call>
{"tool": "name", "args": {"param": "value"}}
</tool_call>

Available tools:
- read_file(path)               — Read a file's contents
- write_file(path, content)     — Write/overwrite a file
- create_file(path, content)    — Create a new file (fails if exists)
- append_file(path, content)    — Append to an existing file
- list_dir(path)                — List directory contents
- run_command(command, cwd?)    — Run a shell command
- search_code(pattern, path?, file_pattern?)  — Grep across files

Rules: One <tool_call> per response. Wait for the tool result before the next call.
"""

MAX_ITERS = 20

# ─── Ollama call ─────────────────────────────────────────────────────────────
def _call_ollama(messages: list) -> str:
    """Call Ollama /api/chat endpoint non-streaming."""
    url = f"{OLLAMA_URL.rstrip('/')}/api/chat"
    payload = {
        "model": OLLAMA_MODEL,
        "messages": messages,
        "stream": False,
        "options": {"temperature": 0.3, "num_ctx": 8192},
    }
    resp = requests.post(url, json=payload, timeout=120)
    resp.raise_for_status()
    data = resp.json()
    return data.get("message", {}).get("content", "").strip()

def _extract_tool_call(text: str) -> Optional[dict]:
    m = re.search(r"<tool_call>\s*(\{.*?\})\s*</tool_call>", text, re.DOTALL)
    if not m:
        return None
    try:
        d = json.loads(m.group(1))
        if "tool" in d and "args" in d:
            return d
    except json.JSONDecodeError:
        pass
    return None

# ─── Agentic loop ─────────────────────────────────────────────────────────────
def run_agent(session: Session, task: str):
    """Run the think→tool→observe loop using the session's persistent message history."""
    session.messages.append({"role": "user", "content": task})

    spinner = Spinner("Calling Ollama")

    for iteration in range(1, MAX_ITERS + 1):
        spinner.start()
        try:
            text = _call_ollama(session.messages)
        except requests.exceptions.ConnectionError:
            spinner.stop()
            print_error(f"Cannot connect to Ollama at {OLLAMA_URL}\n  Make sure Ollama is running: ollama serve")
            return
        except Exception as e:
            spinner.stop()
            print_error(str(e))
            return
        spinner.stop()

        if not text:
            print_error("Empty response from model.")
            return

        # Extract tool call if present
        tool_call = _extract_tool_call(text)
        thought = re.sub(r"<tool_call>.*?</tool_call>", "", text, flags=re.DOTALL).strip()

        if thought:
            print_thought(thought)

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

            session.messages.append({"role": "assistant", "content": text})
            session.messages.append({
                "role": "user",
                "content": f"<tool_result>\n{result}\n</tool_result>\n\nContinue with the next step."
            })
        else:
            # Final answer or conversational turn
            session.messages.append({"role": "assistant", "content": text})
            if "DONE:" in text:
                done_text = text[text.index("DONE:") + 5:].strip()
                print_done(done_text)
            else:
                print_response(text)
            return

    print_done("Reached max iterations. Task may be partially complete.")

# ─── Session state ────────────────────────────────────────────────────────────
class Session:
    def __init__(self, start_dir: str):
        self.cwd   = os.path.abspath(start_dir)
        self.mode  = "general"
        self.history = []  # list of (task, mode) tuples
        self.messages = []  # persistent chat history
        self.reset_messages()

    def reset_messages(self, context_files: list = None):
        """Reset the conversation history with the mode system prompt."""
        mode_cfg = MODES.get(self.mode, MODES["general"])
        system = mode_cfg["prompt"]
        if self.mode in ("app_builder", "debug", "refactor"):
            system += "\n\n" + TOOL_DOCS
        system += f"\n\nCurrent working directory: {self.cwd}"
        self.messages = [{"role": "system", "content": system}]
        
        if context_files:
            ctx = []
            for f in context_files:
                content = tool_read_file(f)
                ctx.append(f"### {f}\n```\n{content}\n```")
            self.messages.append({"role": "user", "content": "Context files:\n\n" + "\n\n".join(ctx)})
            self.messages.append({"role": "assistant", "content": "Read. Ready."})

# ─── Header ──────────────────────────────────────────────────────────────────
def print_header(session: Session):
    _clear()
    mode_cfg = MODES[session.mode]
    mc = mode_cfg["color"]
    
    # Line 1: pragna code v1.0.0
    print(f"\n  {C.TEXT}pragna code {C.MUTED}v{VERSION}{C.RESET}")
    
    # Line 2: ravishka/miku · ollama · general mode
    dot = f" {C.BORDER}·{C.RESET} "
    print(f"  {C.MUTED}{OLLAMA_MODEL.lower()}{dot}ollama{dot}{mc}{session.mode.lower()} mode{C.RESET}")
    
    # Line 3: ? for shortcuts · /mode to switch · type your task and press enter
    print(f"  {C.MUTED}? for shortcuts · /mode to switch · type your task and press enter{C.RESET}")
    print()

def print_shortcuts():
    print(f"""
  {C.GOLD}shortcuts:{C.RESET}
  {C.GOLD_SOFT}?{C.RESET}                    show this help
  {C.GOLD_SOFT}/mode <name>{C.RESET}         switch mode
  {C.GOLD_SOFT}/modes{C.RESET}               list all modes
  {C.GOLD_SOFT}/dir <path>{C.RESET}          change working directory
  {C.GOLD_SOFT}/clear{C.RESET}               clear screen
  {C.GOLD_SOFT}/files <f1> <f2>{C.RESET}     pre-load files as context
  {C.GOLD_SOFT}/history{C.RESET}             show task history
  {C.GOLD_SOFT}exit / quit{C.RESET}          exit pragna code
  {C.GOLD_SOFT}Ctrl+C{C.RESET}               cancel current task or exit

  {C.GOLD}modes:{C.RESET}""")
    for mid, cfg in MODES.items():
        print(f"  {cfg['color']}●{C.RESET}  {C.GOLD_SOFT}{mid:<14}{C.RESET} {cfg['label'].lower()}")
    print()

def print_modes():
    print()
    for mid, cfg in MODES.items():
        print(f"  {cfg['color']}●{C.RESET} {C.GOLD_SOFT}{mid:<14}{C.RESET} {cfg['label'].lower()}")
    print()

def print_welcome():
    pass

# ─── Main REPL ────────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) > 1 and sys.argv[1] in ("--help", "-h"):
        print(f"""
  {C.BOLD}Pragna Code CLI{C.RESET} — v{VERSION}
  An agentic coding assistant powered by local Ollama.

  {C.BOLD}Usage:{C.RESET}
    python pragna_code.py                 # start in current directory
    python pragna_code.py [directory]     # start in target directory
    python pragna_code.py -h | --help     # show this help message
        """)
        sys.exit(0)

    start_dir = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()
    p = Path(start_dir).expanduser().resolve()
    if not p.is_dir():
        print(f"\n{C.BRED}  ✗ Error: Not a directory: {start_dir}{C.RESET}\n")
        sys.exit(1)

    session = Session(str(p))
    context_files = []

    print_header(session)
    print_welcome()

    while True:
        mode_cfg = MODES[session.mode]
        prompt_str = f"  {C.GOLD}> {C.RESET}"
        try:
            raw = input(prompt_str)
        except (EOFError, KeyboardInterrupt):
            print(f"\n\n  {C.MUTED}goodbye.{C.RESET}\n")
            sys.exit(0)

        line = raw.strip()
        if not line:
            continue

        # ── Built-in commands ──
        if line in ("exit", "quit", ":q"):
            print(f"\n  {C.MUTED}goodbye.{C.RESET}\n")
            sys.exit(0)

        if line == "?":
            print_shortcuts()
            continue

        if line == "/clear":
            session.reset_messages(context_files=context_files)
            print_header(session)
            print_welcome()
            continue

        if line == "/modes":
            print_modes()
            continue

        if line == "/history":
            if not session.history:
                print_info("No tasks yet.")
            else:
                print()
                for i, (t, m) in enumerate(session.history[-10:], 1):
                    print(f"  {C.BBLACK}{i:2}.{C.RESET} [{MODES[m]['color']}{m}{C.RESET}]  {t[:80]}")
                print()
            continue

        if line.startswith("/mode "):
            new_mode = line[6:].strip().lower()
            if new_mode in MODES:
                session.mode = new_mode
                session.reset_messages(context_files=context_files)
                mc = MODES[new_mode]["color"]
                print(f"  {mc}● Mode: {MODES[new_mode]['label']}{C.RESET}\n")
            else:
                print_error(f"Unknown mode '{new_mode}'. Use /modes to see options.")
            continue

        if line.startswith("/dir "):
            new_dir = line[5:].strip()
            p = Path(new_dir).expanduser()
            if not p.is_absolute():
                p = Path(session.cwd) / p
            if p.is_dir():
                session.cwd = str(p.resolve())
                session.reset_messages(context_files=context_files)
                print_info(f"Working directory: {session.cwd}")
            else:
                print_error(f"Not a directory: {new_dir}")
            continue

        if line.startswith("/files "):
            files_raw = line[7:].strip().split()
            context_files = [f.strip() for f in files_raw if f.strip()]
            session.reset_messages(context_files=context_files)
            print_info(f"Context files set: {', '.join(context_files)}")
            continue

        if line.startswith("/"):
            print_error(f"Unknown command '{line}'. Type ? for help.")
            continue

        # ── Run agent task ──
        session.history.append((line, session.mode))
        print()
        _hr("─", C.BBLACK)

        try:
            run_agent(session=session, task=line)
        except KeyboardInterrupt:
            print(f"\n\n  {C.BYELLOW}Task cancelled.{C.RESET}\n")

        print()

if __name__ == "__main__":
    main()

# Pragna Code CLI ⚡

An interactive, terminal-based agentic coding assistant powered by local Ollama, styled exactly like **Claude Code**.

It runs an autonomous loop: **think → call tool → observe result → decide next action** to read, write, create, review, and build applications inside your terminal.

---

## 🚀 How to Run

From your terminal (PowerShell or Bash), run:

```bash
python pragna_code.py
```

Or target a specific directory:

```bash
python pragna_code.py c:\path\to\your\project
```

---

## ⚙️ Interactive Commands & Shortcuts

Inside the REPL, you can type your task or use any of the slash commands:

| Command | Action |
|---------|--------|
| **`?`** | Show help/shortcut menu |
| **`/mode <name>`** | Switch active mode (e.g. `/mode code_review`) |
| **`/modes`** | List all available modes |
| **`/dir <path>`** | Change the active working directory |
| **`/files <f1> <f2>`** | Pre-load specific files into the agent's context |
| **`/history`** | Show your recent tasks |
| **`/clear`** | Clear terminal screen |
| **`exit`** or **`quit`** | Quit Pragna Code |
| **`Ctrl+C`** | Cancel active task / exit |

---

## 🧠 6 Agent Modes

| Mode | Visual Indicator | Purpose |
|------|------------------|---------|
| **`general`** | `● General` | Standard AI programming assistant |
| **`code_review`** | `● Code Review` | Deep audit for bugs, security, performance, style |
| **`app_builder`** | `● App Builder` | Plan and construct full applications step-by-step |
| **`debug`** | `● Debug` | Systematically trace errors, find root causes, and fix |
| **`explain`** | `● Explain` | Walk through files/concepts and explain implementation details |
| **`refactor`** | `● Refactor` | Restructure code to improve readability and structure |

---

## 🔧 Autonomous Tools

The agent can call the following tools directly without asking for confirmation:
1. `read_file(path)`
2. `write_file(path, content)`
3. `create_file(path, content)`
4. `append_file(path, content)`
5. `list_dir(path)`
6. `search_code(pattern, path, file_pattern)` (recursive grep/findstr)
7. `run_command(command, cwd)` (for tests, installs, script execution)

> 🛡️ **Safety Guard:** Before `write_file`, `create_file`, `append_file`, or `run_command` runs, Pragna Code shows you a diff (or the exact command) and asks `Approve this action? [y/N]` — nothing mutates your files or runs a shell command without your say-so. A small blocklist (`rm -rf`, `drop database`, force pushes, etc.) is also enforced as a second layer for `run_command`. Note: `read_file`/`write_file`/`create_file`/`append_file`/`list_dir`/`search_code` are restricted to the current working directory; `run_command` can run any shell command and is protected only by the approval prompt above, not by directory sandboxing.

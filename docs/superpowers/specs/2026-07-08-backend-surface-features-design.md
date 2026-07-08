# Feature Batch 3: RAG Scheduler View, Model Picker, PDF Export, Citations, Message Search

**Status:** Approved

## Goal

Add five small-to-medium features that expose existing-but-unsurfaced backend capabilities, plus two frontend-only additions. All five are independently shippable; task order for implementation is **largest to smallest**: scheduler view → model picker → PDF export → citations → message search.

## Context (why these are cheap)

A feasibility pass over the codebase found that most of the backend work for these features already exists:
- `message.sources` (RAG/web-search source metadata) is already populated identically across all three message-send call sites (`App.jsx`, `ChatWindow.jsx`, `InputBar.jsx`) — just never rendered.
- `GET /api/rag/scheduler/status` and `POST /api/rag/scheduler/{force_update,enable,disable}` already exist in `backend/app.py:1418-1507`, fully implemented, with zero frontend callers.
- `GET /api/models/catalog` (`backend/app.py:977-986`) already returns `default_model_key`, `fallback_models`, `recommendations`, `models`.
- The frontend already sends `model_override`/`fallback_models` on every orchestrator request (`chatbot-ui-vite/src/api/api.js:14-43, 74-100`), driven by `localStorage.getItem("pragna_model_profile")` — there is simply no UI to change that value today.

None of these five features requires new backend endpoints or new dependencies.

## A. RAG scheduler status view (largest)

**Backend:** none — reuse `GET /api/rag/scheduler/status` (returns `{ enabled, running, update_interval_hours, last_update, update_count, update_errors, next_update_in_hours }`, per `backend/services/rag_scheduler.py:165-179`) and the three `POST /api/rag/scheduler/{force_update,enable,disable}` endpoints (`backend/app.py:1439-1507`).

**Frontend (`chatbot-ui-vite/src/components/dashboard/GlobalDashboard.jsx`):**
- Add a new `getRagSchedulerStatus()` call (new `api.js` export doing a plain `fetch`/axios GET) to the existing `refresh()` cycle (which already fetches `platform`/`worldMonitor` the same way, `GlobalDashboard.jsx:32-61`), storing the result in a new `schedulerStatus` state.
- Render a new status section (near the existing `platformPills` row, which today only shows a single "Scheduler: running/stopped" pill from `/api/platform/status` — this adds the missing detail) showing last update time, update count, error count, and hours until next update.
- Three buttons ("Force update now", "Enable", "Disable") that POST to the corresponding endpoint and re-run `refresh()` on success. Disable the relevant button while a request is in flight (reuse the existing `loading` state pattern).

## B. Model picker (Settings)

**Backend:** none — reuse `GET /api/models/catalog`.

**Frontend (`chatbot-ui-vite/src/pragna/components/SettingsModal.jsx`):**
- Add a new tab (`{ label: 'Model', icon: '...' }`) to the existing `tabs` array.
- On that tab: fetch `/api/models/catalog` when the tab is opened (or on modal open, matching the lazy-fetch style already used for dashboard data elsewhere), display `default_model_key` and the `models`/`recommendations` list read-only, and a basic/pro toggle.
- The toggle reads/writes `localStorage.setItem("pragna_model_profile", "basic" | "pro")` — the exact key `api.js`'s `_resolveModelProfileRouting()` (`api.js:14-43`) already reads on every message send. No changes to `api.js` or the backend are needed; this tab is purely a UI lever for an existing mechanism.

## C. PDF export

**Frontend only:**
- `chatbot-ui-vite/src/pragna/components/RecentItem.jsx`: add an "Export as PDF" button next to the existing "Export" (markdown) button, following the same `onExport`-style prop-and-wire pattern already used for markdown export (`Sidebar.jsx`'s `handleExport`, `RecentItem.jsx`'s Export button).
- `chatbot-ui-vite/src/pragna/components/Sidebar.jsx`: add `handlePdfExport(chatId)` that builds a small print-styled HTML string (title, timestamp, `You:`/`Pragna:` turns — same content/ordering as `handleExport`'s markdown, just as styled HTML instead of markdown text), opens it in a new window via `window.open()`, writes the HTML via `document.write()`, and calls `.print()` once loaded. No new dependency (no PDF library) — the user saves as PDF via their browser's native print-to-PDF.

## D. RAG citations

**Frontend only (`chatbot-ui-vite/src/components/chat/MessageBubble.jsx`):**
- In the bot-message branch, when `message.sources?.length`, render a collapsed "Sources (N)" toggle below the response content and above the existing action-icon row (copy/bookmark/like/dislike/retry/voice).
- Expanding it shows each source's `title` (linked, if a URL/`source` field is present) in a simple list. Hidden entirely (no toggle rendered) when `sources` is empty or absent — matches today's behavior for messages with no sources.

## E. Global message-content search (smallest)

**Frontend only (`chatbot-ui-vite/src/pragna/components/Sidebar.jsx:296-298`):**
- Widen the existing `filteredChats` filter so a chat matches if **either** its title **or any message's `text`** includes the search query (case-insensitive), instead of title-only today. Same result list UI — chats still display as whole items, no per-message snippet preview (deferred, per the approved design choice).

## Testing (all five)

`npm run build && npm run lint` — no new errors/warnings beyond this repo's pre-existing baseline (27 errors / 3 warnings, unrelated files). Manual verification per feature via `npm run dev`, following this project's established convention (no automated frontend test runner).

## Out of scope

- Per-message snippet preview in search results (deferred to a future round if wanted).
- A real generated `.pdf` file via a client-side library (browser print-to-PDF chosen instead, per approved design).
- Per-chat (rather than global) model selection.
- Inline numbered footnote-style citations (expandable "Sources" section chosen instead).

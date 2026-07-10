# Feature Batch 4: Chunked Streaming, Chat Summarization, Prompt Templates

**Status:** Approved

## Goal

Three independent features:
1. Make chat responses appear progressively (chunked streaming), reusing and fixing the existing but unused `/api/chat_stream` endpoint.
2. A real "summarize this conversation" action, inserted into the chat as a message.
3. A user-managed library of reusable prompt templates on the Home page.

## Context (why these are scoped this way)

- `/api/chat_stream` (`backend/app.py:1631-1686`) already exists and goes through the same `orchestrator.handle_query(...)` pipeline as the regular chat endpoint, accepting the same `model_override`/`fallback_models`/`chat_mode` params. It is not real token-by-token generation — it blocks for the full response, then slices it into fixed 200-character pieces. True token-level streaming would require rewriting the Ollama call path (`services/llm.py`'s `_call_ollama_direct`, currently hardcoded `"stream": False`) used by every request — out of scope for this batch, deferred to its own round if wanted.
- The endpoint currently has an SSE framing bug: it yields bare `json.dumps(...) + "\n"` lines with `mimetype='text/event-stream'`, but the frontend's existing SSE consumer (`_consumeSSE` in `chatbot-ui-vite/src/api/api.js:236-262`, already used for the agent panel) only processes lines starting with `"data: "`. No frontend code currently calls this endpoint.
- The existing `/api/summarize` (`backend/app.py:1980-2018`) only produces a 6-word chat title and calls a Groq client directly with its own ad-hoc setup, separate from the rest of the app's LLM call path. The new chat-summarization feature is a different, longer-form capability and will go through `services/llm.py`'s `_call_ollama_direct(messages)` — the same low-level call path already used elsewhere in the app — rather than extending or depending on `/api/summarize`'s separate setup.
- The message-sending flow (placeholder bot message with `isStreaming: true`, then the message's `text` set once when the full response resolves) is duplicated identically in three places: `chatbot-ui-vite/src/components/chat/ChatWindow.jsx`, `chatbot-ui-vite/src/components/input/InputBar.jsx`, and `chatbot-ui-vite/src/pragna/App.jsx` (`sendQuickPrompt`). All three need the equivalent change for streaming to work everywhere a message can be sent.
- `ChatContext.jsx`'s `folders` state (`ChatContext.jsx:12-15, 64-66, 128-153`) is a plain array-in-state-plus-localStorage-mirror with matching CRUD functions — the template library reuses this exact shape.

## A. Chunked streaming

### Backend
`backend/app.py`'s `stream_orchestrated_chunks()` generator (inside the `/api/chat_stream` route) changes each `yield json.dumps(x) + "\n"` to `yield f"data: {json.dumps(x)}\n\n"`, and adds a final `yield f"data: {json.dumps({'type': 'done'})}\n\n"` after the chunk loop so the frontend has an explicit end-of-stream signal.

### Frontend
- New `sendOrchestratedMessageStream({ text, language, user_id, chatMode, onChunk, onSources, onActions, onDone })` in `chatbot-ui-vite/src/api/api.js`: builds the same request body as `sendOrchestratedMessage` (including `_resolveModelProfileRouting()`'s `model_override`/`fallback_models`), POSTs to `/api/chat_stream`, and passes the response to the existing `_consumeSSE(response, onEvent)` helper, with `onEvent` dispatching to `onChunk`/`onSources`/`onActions`/`onDone` based on which key is present on each parsed event (`event.content`, `event.sources`, `event.actions`, or `event.type === 'done'`).
- In each of `ChatWindow.jsx`, `InputBar.jsx`, and `App.jsx`'s `sendQuickPrompt`: replace the single `await sendOrchestratedMessage(...)` + one-shot `setChats(...)` with a call to `sendOrchestratedMessageStream(...)`, where `onChunk` appends the received text to the placeholder message's `text` (via the same `setChats((prev) => prev.map(...))` pattern already used, just appending instead of replacing), `onSources`/`onActions` attach those fields the same way the non-streaming path does today, and `onDone` sets `isStreaming: false`.

## B. Chat summarization

### Backend
New route `POST /api/summarize_chat` in `backend/app.py`, accepting `{"messages": [{"sender": "user"|"bot", "text": "..."}, ...], "language": "en"}`. Builds a `messages` list (system prompt instructing a substantive multi-sentence summary of the conversation, followed by the conversation transcript formatted as `You: ...` / `Pragna: ...` turns) and calls `_call_ollama_direct(messages)` (imported from `services/llm.py`, the same low-level helper `llm_service.py` itself uses). Returns `{"summary": "<text>"}` on success, or an error JSON with an appropriate status code on failure (no LLM call succeeded).

### Frontend
- New `summarizeChat(messages, language)` in `api.js`, POSTing to `/api/summarize_chat`.
- A "Summarize" button in `ChatWindow.jsx`'s header, next to the existing mode pill. On click, calls `summarizeChat(chat.messages, language)`, then appends the returned summary to the active chat as a new message (`{ sender: "bot", text: summary }`) via `setChats`, the same way any other bot response is appended.

## C. Prompt template library

### `ChatContext.jsx`
- New `templates` state, initialized from `localStorage.getItem("pragna_templates")` (default `[]`), persisted via a `useEffect` mirroring the `folders` pattern exactly.
- `createTemplate(title, prompt)`: trims both, no-ops if either is empty, appends `{ id: Date.now().toString(), title, prompt }`.
- `deleteTemplate(templateId)`: filters the template out.
- Both functions and `templates` exposed on the context value alongside the existing `folders`/`createFolder`/etc.

### `HomePage.jsx`
- A new "Your templates" section rendered below the existing fixed suggestion-card grid, using the same card component/style (icon swatch, title, description — description shows a truncated preview of the prompt text).
- An "+ Add template" card at the end of the grid (or in an empty state when there are no templates yet) that, when clicked, reveals an inline two-field form (title input + prompt textarea) directly in place — matching the existing inline "New Folder" dialog pattern in `Sidebar.jsx` (`newFolderDialogOpen` state driving an inline input) rather than introducing a new modal component. Submitting calls `createTemplate(title, prompt)` and closes the form.
- Clicking a saved template card calls the same `onUsePrompt(template.prompt)` prop already wired into `HomePage` (passed from `App.jsx` as `sendQuickPrompt`) — identical behavior to the existing fixed suggestion cards, sending the prompt immediately.
- Each template card also gets a small delete affordance calling `deleteTemplate(template.id)`, with `stopPropagation` so it doesn't also trigger the send action.

## Testing

- Frontend: `npm run build && npm run lint` (no new errors/warnings beyond this repo's pre-existing baseline), plus manual exercise via `npm run dev` — no automated frontend test runner in this repo (established convention).
- Backend: no pytest suite in this repo (established convention, see `CLAUDE.md`) — the two new/modified endpoints (`/api/chat_stream`'s fixed SSE framing, new `/api/summarize_chat`) are verified with direct requests (e.g. `curl`) confirming the expected response shape, run with the backend and Ollama both live.

## Out of scope

- Real token-by-token streaming (rewriting the provider call path) — deferred, noted above.
- Editing an existing template (create + delete only, per the approved design).
- A quick-access template menu in the input bar (Home-page section only, per the approved design).
- Any change to `/api/summarize` (the existing chat-title endpoint) — left untouched; the new summarization feature is a separate endpoint.

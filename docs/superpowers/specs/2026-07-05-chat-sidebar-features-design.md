# Chat Sidebar Features — Design Spec

## Goal

Add four new user-facing features to the existing Pragna chat frontend (`chatbot-ui-vite/`) — chat search, edit-and-resend a message, export chat as Markdown, and folders for organizing chats — plus a one-line logo size increase. This is additive feature work on top of the completed UI reskin (see `2026-07-04-pragna-chat-reskin-design.md`), not a restyle.

## Baseline (confirmed by codebase survey)

- Chat data lives **entirely in the browser**: `ChatContext.jsx` holds `chats` (array of `{ id, title, messages }`) in React state, mirrored to `localStorage['pragna_chats']` on every change. `activeChatId`, `language`, `theme`, `chatMode` follow the same pattern (their own `localStorage` keys).
- The backend's `conversations`/`messages` tables (`backend/database.py`) and the `chat_management_api.py` blueprint (`rename`/`pin`/`archive`/`delete`/`share`/`group`) are **not wired to real chat creation** — chat IDs are client-generated (`Date.now().toString()`), never registered server-side, so those endpoints act on backend rows that don't exist for chats created through normal use. The existing pin feature already only works as frontend state (`Sidebar.jsx`'s `pinnedChats` is a local `useState(new Set())`, never initialized from fetched data).
- Per user decision, **all four new features are frontend-only, localStorage-persisted** — consistent with this existing architecture. No backend changes, no new calls into `ChatManagementAPI`.
- `Sidebar.jsx` renders a flat "RECENTS" list via `RecentItem.jsx`, whose dropdown menu (`Share`/`Group Chat`/`Rename`/`Pin`/`Archive`/`Delete`) is the established pattern for per-chat actions.
- `ChatWindow.jsx` already has a `retryMessage(idx)` mechanism: given a bot-message index, it removes the preceding user+bot pair (`messages.slice(0, idx - 1)`) and calls `sendSuggestionMessage(userMsg.text)` to resend. This is the template the edit-and-resend feature generalizes.
- `MessageBubble.jsx` renders user messages with no hover actions today (lines ~451-467); assistant messages have a hover action row (copy/like/dislike/retry/speak) using a shared `actionBtnBase` ghost-icon-button style.
- Sidebar logo: `Sidebar.jsx:260`, `<img src={pragnaLogo} ... style={{ height: '100px', width: 'auto', objectFit: 'contain' }} />`. A second, unused copy of the sidebar lives at `src/components/layout/Sidebar.jsx` (confirmed not mounted in `main.jsx`) — not touched.

## Data model changes

`ChatContext.jsx` gains:
- `folders` state: array of `{ id, name }`, persisted to `localStorage['pragna_folders']` (same load-on-init / save-on-change pattern as `chats`).
- Each chat object gains an optional `folderId` field (`null`/absent = unfiled). Existing chats without the field are treated as unfiled.
- New context helpers:
  - `createFolder(name)` — appends `{ id: Date.now().toString(), name }`.
  - `renameFolder(id, name)` — updates a folder's `name`.
  - `deleteFolder(id)` — removes the folder from `folders` and sets `folderId: null` on any chat that referenced it. **Never deletes chats.**
  - `moveChatToFolder(chatId, folderId)` — sets `chats[i].folderId`.

No changes to `messages` shape, `activeChatId` handling, or any backend call.

## Feature 1 — Chat search

- `Sidebar.jsx`: new local state `searchQuery`, a text input rendered above the "RECENTS" label.
- Filtering is a simple case-insensitive substring match against each chat's `title` (falls back to `'New chat'` same as display logic already does), applied to `recentChats` before mapping to `RecentItem`/folder sections.
- No persistence, no debouncing needed (filtering an in-memory array on each keystroke is cheap at chat-list scale).
- Applies equally inside folder sections and the unfiled list (a chat matching the query shows in its folder or in RECENTS, whichever it belongs to; non-matching chats are hidden, folders with zero visible matches still show their header — simplest behavior, avoids extra empty-state logic).

## Feature 2 — Edit and resend a message

- `MessageBubble.jsx`: user-message block (currently the early-return `!isBot` branch) gets a `group` wrapper and a hover-revealed pencil/edit icon-button, matching the existing ghost-icon-button treatment used on the assistant action row.
- Clicking the edit icon swaps the static bubble text for an inline `<textarea>` (autofocus, pre-filled with `message.text`) plus small Save/Cancel buttons. Escape cancels; the textarea itself is local component state (`isEditing`, `draftText`) — no prop changes needed for entering/exiting edit mode.
- Save calls a new `onEdit(newText)` prop (passed from `ChatWindow.jsx` only for user messages, `undefined` for bot messages — same conditional-prop pattern already used for `onRetry`).
- `ChatWindow.jsx` adds `editMessage(idx, newText)`, modeled directly on `retryMessage`: truncates `chat.messages` to `slice(0, idx)` (dropping the edited message and everything after it — since `idx` here is the *user* message's own index, not idx-1 as in retry), then calls `sendSuggestionMessage(newText)`.
- Guarded by `isLoading` the same way `retryMessage` is — editing is disabled (icon not shown or a no-op) while a response is streaming.
- Not restricted to the last message — any user message in the conversation can be edited; editing an earlier one discards everything after it, same "truncate and replay" semantics as retry, just generalized to any index and to a user-supplied new text instead of the stored one.

## Feature 3 — Export chat as Markdown

- New "Export" entry added to `RecentItem.jsx`'s existing dropdown menu, positioned next to "Share" (same button styling, a `Download` lucide icon).
- New `onExport` prop/handler wired in `Sidebar.jsx`, given the target chat's `id`: looks up the chat's `messages` from context `chats`, builds a Markdown string:
  ```
  # {title}

  _Exported {ISO timestamp}_

  ---

  **You:** {message text}

  **Pragna:** {message text}

  ...
  ```
  (attachments, if present, noted as `_[attached: name]_` rather than embedded).
- Triggers a client-side download via a `Blob` + temporary `<a download>` element — no network call, no backend export endpoint.

## Feature 4 — Folders

- Sidebar layout changes from a single flat "RECENTS" list to: an "+ New Folder" row, then one section per folder (name header + its chats), then a "RECENTS" section for unfiled chats (search filter from Feature 1 applies within each).
- "+ New Folder" reuses the existing inline-rename-dialog UX (a text input that commits on blur/Enter, cancels on Escape) rather than a native `prompt()`, calling `createFolder`.
- Folder header: name + chat count + a small menu (reusing the existing dropdown-menu visual pattern) with Rename/Delete. Delete shows a `window.confirm`-style guard (matching the existing chat-delete confirm) and, per the data-model rule above, only unfiles the chats — it does not delete them.
- Drag-and-drop: each `RecentItem` row becomes `draggable`, setting the chat id via `dataTransfer` on `dragstart`; folder headers are drop targets (`onDragOver` prevents default, `onDrop` reads the id and calls `moveChatToFolder`). Dragging onto the "RECENTS" section header removes a chat from its folder (sets `folderId: null`).
- Accessible/non-drag fallback: `RecentItem`'s existing dropdown menu gets a "Move to folder ▸" submenu (list of existing folder names + "Remove from folder"), calling the same `moveChatToFolder`/unfile path — required so folder assignment isn't drag-only (keyboard/touch users).

## Feature 5 — Logo size

`Sidebar.jsx:260`: `height: '100px'` → `height: '150px'`. `width: 'auto'` is unchanged, so aspect ratio is preserved; no other layout changes to the surrounding `20px 20px 16px 20px`-padded container.

## Explicitly out of scope

- No backend changes of any kind — no new routes, no changes to `chat_management_api.py`, no persistence beyond `localStorage`.
- No fix to the pre-existing pin/rename/share/archive backend disconnect noted in Baseline — out of scope for this feature set (a pre-existing condition, not introduced or worsened here).
- No real-time collaboration, no cross-device sync of folders/search/exports.
- No changes to `src/components/layout/Sidebar.jsx` (confirmed unused).
- Folder sections are not collapsible in this pass (kept simple — always-expanded); collapse/expand can be a follow-up if wanted.

## Testing / verification approach

Same as the reskin: no automated frontend test runner in this repo. Verify via `npm run build` + `npm run lint` clean, plus manual exercise in `npm run dev`: search-filter a chat list, edit an early message in a multi-turn conversation and confirm truncation + resend, export a chat and open the downloaded `.md`, create a folder and move chats into it both by drag and by the menu fallback, delete a folder and confirm its chats reappear unfiled, and visually confirm the 150px logo.

## Commits

One commit per feature, in this order:
1. `feat: add chat search filter to sidebar`
2. `feat: allow editing and resending previously sent messages`
3. `feat: export chat as markdown`
4. `feat: add folders for organizing chats`
5. `style: increase sidebar logo size to 150px`

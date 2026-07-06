# Chat Sidebar Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add chat search, edit-and-resend, Markdown export, and folders to the Pragna chat sidebar, plus bump the sidebar logo to 150px.

**Architecture:** All four features are frontend-only additions to the existing React/Vite app (`chatbot-ui-vite/`), persisted via the same `localStorage`-backed `ChatContext` pattern the app already uses for chats/theme/language. No backend routes, no new `ChatManagementAPI` calls — see spec baseline for why (chat IDs are client-generated and never registered server-side, so the existing backend conversation endpoints don't apply to real chats anyway).

**Tech Stack:** React (function components + hooks), plain inline-style JSX (existing convention in `Sidebar.jsx`/`RecentItem.jsx`/`MessageBubble.jsx`), Tailwind utility classes where already used, `lucide-react` for icons (already a dependency, already used in `RecentItem.jsx`).

## Global Constraints

- No automated frontend test runner exists in this repo (per `CLAUDE.md`) — verification is `npm run build` + `npm run lint` clean, plus manual exercise via `npm run dev`, not a failing-test-first cycle. Every task's "test" steps follow this convention instead of `pytest`/`jest`-style steps.
- All new features are frontend-only, `localStorage`-persisted. No backend changes, no new network calls.
- The **live** sidebar is `chatbot-ui-vite/src/pragna/components/Sidebar.jsx`. Do not touch `chatbot-ui-vite/src/components/layout/Sidebar.jsx` — confirmed unused (not imported from `main.jsx`).
- One commit per task, in this exact order: search → edit-and-resend → export → folders → logo.
- Run all commands from `chatbot-ui-vite/` (the frontend package root), e.g. `cd chatbot-ui-vite && npm run build`.
- Spec reference: `docs/superpowers/specs/2026-07-05-chat-sidebar-features-design.md`.

---

### Task 1: Chat search filter

**Files:**
- Modify: `chatbot-ui-vite/src/pragna/components/Sidebar.jsx:23-27` (add state), `:330-345` and `:378-399` (search input + filtered rendering)

**Interfaces:**
- Consumes: existing `recentChats` prop (array of `{ id, title, messages }`, already passed into `Sidebar`).
- Produces: no new exports — this is a self-contained UI change local to `Sidebar.jsx`.

- [ ] **Step 1: Add search state**

In `chatbot-ui-vite/src/pragna/components/Sidebar.jsx`, find this block (currently lines 23-27):

```jsx
  const [pinnedChats, setPinnedChats] = useState(new Set())
  const [renameDialogId, setRenameDialogId] = useState(null)
  const [newTitle, setNewTitle] = useState('')
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState(null)
```

Replace it with:

```jsx
  const [pinnedChats, setPinnedChats] = useState(new Set())
  const [renameDialogId, setRenameDialogId] = useState(null)
  const [newTitle, setNewTitle] = useState('')
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
```

- [ ] **Step 2: Compute the filtered list**

Directly above the `return (` statement (the line right after `handleLanguageSelect`, currently around line 253), add:

```jsx
  const filteredChats = recentChats.filter((chat) =>
    (chat.title || 'New chat').toLowerCase().includes(searchQuery.toLowerCase())
  )
```

- [ ] **Step 3: Add the search input and switch rendering to the filtered list**

Find this block (currently lines 330-345):

```jsx
      {/* Recents */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 12px 12px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
          minHeight: 0,
        }}
      >
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: '#a89878', padding: '0 14px 10px 14px' }}>
          RECENTS
        </div>
```

Replace it with:

```jsx
      {/* Recents */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 12px 12px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
          minHeight: 0,
        }}
      >
        <div style={{ padding: '0 10px 10px 10px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            style={{
              width: '100%',
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid #2d2a24',
              background: '#1a1a1a',
              color: '#f0e6d3',
              fontSize: '13px',
            }}
            className="focus-ring"
          />
        </div>

        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: '#a89878', padding: '0 14px 10px 14px' }}>
          RECENTS
        </div>
```

Then find the chat-list rendering (currently lines 378-399):

```jsx
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {recentChats.map((chat) => (
```

Replace `recentChats.map` with `filteredChats.map` (keep everything else in that block — props, callbacks — unchanged):

```jsx
        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {filteredChats.map((chat) => (
```

- [ ] **Step 4: Build and lint**

Run: `cd chatbot-ui-vite && npm run build && npm run lint`
Expected: both commands exit cleanly with no errors.

- [ ] **Step 5: Manually verify**

Run: `cd chatbot-ui-vite && npm run dev`, open the app, create 2-3 chats with distinct titles (rename them via the row menu so titles differ), type into the new search box, and confirm the recent-chat list filters live as you type and clears back to the full list when the box is emptied.

- [ ] **Step 6: Commit**

```bash
git add chatbot-ui-vite/src/pragna/components/Sidebar.jsx
git commit -m "feat: add chat search filter to sidebar"
```

---

### Task 2: Edit and resend a message

**Files:**
- Modify: `chatbot-ui-vite/src/components/chat/ChatWindow.jsx:185-199` (add `editMessage`), `:429-436` (wire `onEdit` prop)
- Modify: `chatbot-ui-vite/src/components/chat/MessageBubble.jsx:1-38` (icon + import), `:314-321` (props + local state), `:450-467` (user-message render)

**Interfaces:**
- Consumes: existing `retryMessage(idx)` pattern in `ChatWindow.jsx` (truncate-then-resend via `sendSuggestionMessage(text)`); existing `chat.messages` shape `{ sender: "user"|"bot", text, attachments? }`.
- Produces: `editMessage(idx, newText)` in `ChatWindow.jsx` (truncates `chat.messages` to `slice(0, idx)`, then calls `sendSuggestionMessage(newText.trim())`); `MessageBubble` gains an `onEdit?: (newText: string) => void` prop and an `isLoading?: boolean` prop, both optional.

- [ ] **Step 1: Add `editMessage` to `ChatWindow.jsx`**

Find this block (currently lines 187-199):

```jsx
  // Retry a failed message: remove the old failed user+bot pair, then resend
  const retryMessage = useCallback((idx) => {
    if (isLoading) return;
    const userMsg = chat?.messages?.[idx - 1];
    if (!userMsg) return;
    const targetChatId = activeChatId;
    setChats((prev) =>
      prev.map((c) =>
        c.id === targetChatId ? { ...c, messages: c.messages.slice(0, idx - 1) } : c
      )
    );
    sendSuggestionMessage(userMsg.text);
  }, [chat, activeChatId, isLoading, setChats, sendSuggestionMessage]);
```

Add immediately after it:

```jsx

  // Edit a previously sent user message: drop it and everything after it, then resend the new text
  const editMessage = useCallback((idx, newText) => {
    if (isLoading) return;
    const trimmed = (newText || "").trim();
    if (!trimmed) return;
    const targetChatId = activeChatId;
    setChats((prev) =>
      prev.map((c) =>
        c.id === targetChatId ? { ...c, messages: c.messages.slice(0, idx) } : c
      )
    );
    sendSuggestionMessage(trimmed);
  }, [activeChatId, isLoading, setChats, sendSuggestionMessage]);
```

- [ ] **Step 2: Wire `onEdit` into the message list**

Find this block (currently lines 429-436):

```jsx
          {chat.messages.map((m, idx) => (
            <MessageBubble
              key={idx}
              message={m}
              language={language}
              onRetry={idx === chat.messages.length - 1 ? () => retryMessage(idx) : undefined}
            />
          ))}
```

Replace it with:

```jsx
          {chat.messages.map((m, idx) => (
            <MessageBubble
              key={idx}
              message={m}
              language={language}
              onRetry={idx === chat.messages.length - 1 ? () => retryMessage(idx) : undefined}
              onEdit={m.sender !== "bot" ? (newText) => editMessage(idx, newText) : undefined}
              isLoading={isLoading}
            />
          ))}
```

- [ ] **Step 3: Add a pencil icon to `MessageBubble.jsx`**

Find this block (currently lines 20-25):

```jsx
const RetryIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);
```

Add immediately after it:

```jsx
const PencilIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
  </svg>
);
```

- [ ] **Step 4: Accept the new props and add edit-mode state**

Find this line (currently line 314):

```jsx
export default function MessageBubble({ message, language = "en", onRetry }) {
```

Replace it with:

```jsx
export default function MessageBubble({ message, language = "en", onRetry, onEdit, isLoading }) {
```

Find this block (currently lines 315-317):

```jsx
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [speaking, setSpeaking] = useState(false);
```

Replace it with:

```jsx
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(message.text || "");
```

- [ ] **Step 5: Render the edit affordance on user messages**

Find this block (currently lines 450-467):

```jsx
  // ── User message: gold-gradient bubble ─────────────────────────────────
  if (!isBot) {
    return (
      <div className="flex flex-col items-end animate-[fadeUp_0.3s_ease]">
        <div
          className="max-w-[78%] rounded-[18px_18px_4px_18px] px-[18px] py-3 text-[15px] leading-[1.5] shadow-premium-md whitespace-pre-wrap break-words"
          style={{
            background: "linear-gradient(135deg, var(--pragna-gold-soft), var(--pragna-gold))",
            color: "var(--pragna-on-gold)",
            fontWeight: 550,
          }}
        >
          {hasAttachments && renderAttachments(message.attachments)}
          {message.text}
        </div>
      </div>
    );
  }
```

Replace it with:

```jsx
  // ── User message: gold-gradient bubble ─────────────────────────────────
  if (!isBot) {
    const handleEditSave = () => {
      const trimmed = draftText.trim();
      if (!trimmed) return;
      setIsEditing(false);
      onEdit?.(trimmed);
    };

    const handleEditCancel = () => {
      setDraftText(message.text || "");
      setIsEditing(false);
    };

    return (
      <div className="flex flex-col items-end gap-1.5 group animate-[fadeUp_0.3s_ease]">
        {isEditing ? (
          <div className="max-w-[78%] w-full flex flex-col gap-2">
            <textarea
              autoFocus
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleEditSave();
                } else if (e.key === "Escape") {
                  handleEditCancel();
                }
              }}
              rows={Math.min(8, Math.max(2, draftText.split("\n").length))}
              className="w-full rounded-[14px] px-[18px] py-3 text-[15px] leading-[1.5] resize-none"
              style={{
                background: "var(--pragna-surface)",
                border: "1px solid rgba(212,175,55,0.35)",
                color: "var(--pragna-text)",
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={handleEditCancel}
                className="rounded-lg px-3 py-1.5 text-[13px] font-semibold"
                style={{ color: "var(--pragna-text-muted)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditSave}
                className="rounded-lg px-3 py-1.5 text-[13px] font-semibold"
                style={{
                  background: "linear-gradient(135deg, var(--pragna-gold-soft), var(--pragna-gold))",
                  color: "var(--pragna-on-gold)",
                }}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className="max-w-[78%] rounded-[18px_18px_4px_18px] px-[18px] py-3 text-[15px] leading-[1.5] shadow-premium-md whitespace-pre-wrap break-words"
              style={{
                background: "linear-gradient(135deg, var(--pragna-gold-soft), var(--pragna-gold))",
                color: "var(--pragna-on-gold)",
                fontWeight: 550,
              }}
            >
              {hasAttachments && renderAttachments(message.attachments)}
              {message.text}
            </div>
            {onEdit && !isLoading && (
              <button
                type="button"
                onClick={() => {
                  setDraftText(message.text || "");
                  setIsEditing(true);
                }}
                title="Edit message"
                className={`${actionBtnBase} opacity-0 group-hover:opacity-100 text-[color:var(--pragna-text-muted)]`}
              >
                <PencilIcon />
              </button>
            )}
          </>
        )}
      </div>
    );
  }
```

- [ ] **Step 6: Build and lint**

Run: `cd chatbot-ui-vite && npm run build && npm run lint`
Expected: both commands exit cleanly with no errors.

- [ ] **Step 7: Manually verify**

Run: `cd chatbot-ui-vite && npm run dev`, start a multi-turn conversation (at least 2 user messages), hover an **earlier** user message (not the last one), click the pencil icon that appears, change the text, press Save (or Enter), and confirm: that message and everything after it disappears, and the edited text is resent as a new message with a fresh response. Confirm Cancel/Escape restores the original text without sending anything. Confirm the pencil icon does not appear while a response is streaming.

- [ ] **Step 8: Commit**

```bash
git add chatbot-ui-vite/src/components/chat/ChatWindow.jsx chatbot-ui-vite/src/components/chat/MessageBubble.jsx
git commit -m "feat: allow editing and resending previously sent messages"
```

---

### Task 3: Export chat as Markdown

**Files:**
- Modify: `chatbot-ui-vite/src/pragna/components/RecentItem.jsx:1-2` (import), `:4-16` (props), `:137-158` (menu button)
- Modify: `chatbot-ui-vite/src/pragna/components/Sidebar.jsx` (add `handleExport`, wire `onExport` prop)

**Interfaces:**
- Consumes: `recentChats` (array of `{ id, title, messages }, each message `{ sender, text, attachments? }`) already available in `Sidebar.jsx`.
- Produces: `handleExport(chatId)` in `Sidebar.jsx`, triggers a client-side `.md` file download. No return value depended on elsewhere.

- [ ] **Step 1: Add the Download icon import in `RecentItem.jsx`**

Find this line (currently line 2):

```jsx
import { MoreVertical, Share, Users, Edit2, Pin, Archive, Trash2 } from 'lucide-react'
```

Replace it with:

```jsx
import { MoreVertical, Share, Users, Edit2, Pin, Archive, Trash2, Download } from 'lucide-react'
```

- [ ] **Step 2: Accept an `onExport` prop**

Find this block (currently lines 4-16):

```jsx
const RecentItem = ({
  id,
  title,
  onClick,
  onDelete,
  onRename,
  onShare,
  onPinChat,
  onArchive,
  onStartGroupChat,
  active = false,
  isPinned = false
}) => {
```

Replace it with:

```jsx
const RecentItem = ({
  id,
  title,
  onClick,
  onDelete,
  onRename,
  onShare,
  onExport,
  onPinChat,
  onArchive,
  onStartGroupChat,
  active = false,
  isPinned = false
}) => {
```

- [ ] **Step 3: Add the Export menu button**

Find this block (currently lines 138-158, the Share button):

```jsx
          <button
            onClick={(e) => handleMenuClick(e, onShare)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: '7px',
              border: 'none',
              background: 'transparent',
              color: '#d8cbb0',
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            className="hover:bg-[#1e1a10] hover:text-[#e5c76b]"
          >
            <Share size={14} />
            <span>Share</span>
          </button>
```

Add immediately after it (before the "Group Chat" button):

```jsx

          <button
            onClick={(e) => handleMenuClick(e, onExport)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: '7px',
              border: 'none',
              background: 'transparent',
              color: '#d8cbb0',
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            className="hover:bg-[#1e1a10] hover:text-[#e5c76b]"
          >
            <Download size={14} />
            <span>Export</span>
          </button>
```

- [ ] **Step 4: Add `handleExport` to `Sidebar.jsx`**

Find the `handleShare` function in `chatbot-ui-vite/src/pragna/components/Sidebar.jsx` (currently lines 98-112):

```jsx
  const handleShare = async (chatId) => {
    try {
      setLoading('share')
      const result = await ChatManagementAPI.shareChat(chatId)
      const shareUrl = `${window.location.origin}${result.share_url}`
      await navigator.clipboard.writeText(shareUrl)
      alert(`Share link copied to clipboard!\n${shareUrl}`)
      setError(null)
    } catch (err) {
      setError(err.message || 'Failed to share chat')
      console.error('Error sharing chat:', err)
    } finally {
      setLoading(null)
    }
  }
```

Add immediately after it:

```jsx

  const handleExport = (chatId) => {
    const targetChat = recentChats.find((c) => c.id === chatId)
    if (!targetChat) return

    const title = targetChat.title || 'New chat'
    const lines = [`# ${title}`, '', `_Exported ${new Date().toISOString()}_`, '', '---', '']

    for (const msg of targetChat.messages || []) {
      const speaker = msg.sender === 'bot' ? 'Pragna' : 'You'
      lines.push(`**${speaker}:** ${msg.text || ''}`)
      if (msg.attachments?.length) {
        for (const att of msg.attachments) {
          lines.push(`_[attached: ${att.name}]_`)
        }
      }
      lines.push('')
    }

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'chat'}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
```

- [ ] **Step 5: Wire `onExport` into the `RecentItem` invocation**

Find this line in `Sidebar.jsx` (part of the `RecentItem` call, currently around line 393):

```jsx
                onShare={() => handleShare(chat.id)}
```

Add immediately after it:

```jsx
                onExport={() => handleExport(chat.id)}
```

- [ ] **Step 6: Build and lint**

Run: `cd chatbot-ui-vite && npm run build && npm run lint`
Expected: both commands exit cleanly with no errors.

- [ ] **Step 7: Manually verify**

Run: `cd chatbot-ui-vite && npm run dev`, open a chat with a few messages, open its row menu, click "Export", confirm a `.md` file downloads, and open it to confirm the title heading, timestamp, and `**You:**`/`**Pragna:**` turns are all present and correctly ordered.

- [ ] **Step 8: Commit**

```bash
git add chatbot-ui-vite/src/pragna/components/RecentItem.jsx chatbot-ui-vite/src/pragna/components/Sidebar.jsx
git commit -m "feat: export chat as markdown"
```

---

### Task 4: Folders

**Files:**
- Modify: `chatbot-ui-vite/src/context/ChatContext.jsx` (folder state, persistence, helpers, provider value)
- Modify: `chatbot-ui-vite/src/pragna/components/RecentItem.jsx` (draggable row, "Move to folder" submenu)
- Modify: `chatbot-ui-vite/src/pragna/components/Sidebar.jsx` (context wiring, "+ New Folder", folder sections, drag/drop targets, folder header menu)

**Interfaces:**
- Consumes: `Task 1`'s `filteredChats`, `Task 3`'s `handleExport`/`onExport` wiring, existing `chats`/`setChats` shape from `ChatContext`.
- Produces (from `ChatContext.jsx`, added to the context value): `folders: Array<{ id: string, name: string }>`, `createFolder(name: string): void`, `renameFolder(folderId: string, name: string): void`, `deleteFolder(folderId: string): void` (unfiles chats, never deletes them), `moveChatToFolder(chatId: string, folderId: string | null): void`. Each chat object gains an optional `folderId: string | null` field. `RecentItem` gains props `onExport`, `onMoveToFolder(folderId: string | null): void`, `folders`, `currentFolderId`.

- [ ] **Step 1: Add folder state to `ChatContext.jsx`**

Find this block (currently lines 10-13):

```jsx
  const [chats, setChats] = useState(() => {
    const saved = localStorage.getItem("pragna_chats");
    return saved ? JSON.parse(saved) : [];
  });
```

Add immediately after it:

```jsx

  const [folders, setFolders] = useState(() => {
    const saved = localStorage.getItem("pragna_folders");
    return saved ? JSON.parse(saved) : [];
  });
```

- [ ] **Step 2: Persist folders to `localStorage`**

Find this block (currently lines 59-62):

```jsx
  // Save to localStorage
  useEffect(() => {
    localStorage.setItem("pragna_chats", JSON.stringify(chats));
  }, [chats]);
```

Add immediately after it:

```jsx

  useEffect(() => {
    localStorage.setItem("pragna_folders", JSON.stringify(folders));
  }, [folders]);
```

- [ ] **Step 3: Add folder helper functions**

Find this block (currently lines 117-122, the `deleteChat` function):

```jsx
  const deleteChat = (chatId) => {
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChatId === chatId) {
      setActiveChatId(null);
    }
  };
```

Add immediately after it:

```jsx

  const createFolder = (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    setFolders((prev) => [...prev, { id: Date.now().toString(), name: trimmed }]);
  };

  const renameFolder = (folderId, name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f))
    );
  };

  const deleteFolder = (folderId) => {
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setChats((prev) =>
      prev.map((c) => (c.folderId === folderId ? { ...c, folderId: null } : c))
    );
  };

  const moveChatToFolder = (chatId, folderId) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, folderId } : c))
    );
  };
```

- [ ] **Step 4: Expose the new state and helpers on the provider**

Find this line inside the `<ChatContext.Provider value={{ ... }}>` block (currently line 143):

```jsx
        deleteChat,
```

Add immediately after it:

```jsx
        deleteChat,
        folders,
        createFolder,
        renameFolder,
        deleteFolder,
        moveChatToFolder,
```

(Note: this leaves the original `deleteChat,` line in place and adds five new lines after it — do not duplicate `deleteChat,`.)

- [ ] **Step 5: Make `RecentItem.jsx` draggable and add the "Move to folder" submenu**

Find this line (currently line 2, already modified by Task 3 to include `Download`):

```jsx
import { MoreVertical, Share, Users, Edit2, Pin, Archive, Trash2, Download } from 'lucide-react'
```

Replace it with:

```jsx
import { MoreVertical, Share, Users, Edit2, Pin, Archive, Trash2, Download, Folder } from 'lucide-react'
```

Find this block (currently lines 4-16, already modified by Task 3 to include `onExport`):

```jsx
const RecentItem = ({
  id,
  title,
  onClick,
  onDelete,
  onRename,
  onShare,
  onExport,
  onPinChat,
  onArchive,
  onStartGroupChat,
  active = false,
  isPinned = false
}) => {
```

Replace it with:

```jsx
const RecentItem = ({
  id,
  title,
  onClick,
  onDelete,
  onRename,
  onShare,
  onExport,
  onPinChat,
  onArchive,
  onStartGroupChat,
  onMoveToFolder,
  folders = [],
  currentFolderId = null,
  active = false,
  isPinned = false
}) => {
```

Find this block (currently lines 17-19):

```jsx
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)
  const buttonRef = useRef(null)
```

Replace it with:

```jsx
  const [showMenu, setShowMenu] = useState(false)
  const [showFolderSubmenu, setShowFolderSubmenu] = useState(false)
  const menuRef = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!showMenu) setShowFolderSubmenu(false)
  }, [showMenu])
```

Find the outer row `<div>` opening (currently lines 41-63):

```jsx
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '11px',
        padding: '10px 14px',
        borderRadius: '10px',
        cursor: 'pointer',
        background: active ? '#1a1a1a' : 'transparent',
        border: `1px solid ${active ? 'rgba(212,175,55,0.22)' : 'transparent'}`,
        transition: 'all 0.15s ease',
        position: 'relative',
      }}
      className="group focus-ring"
    >
```

Replace it with:

```jsx
    <div
      onClick={onClick}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', id)
        e.dataTransfer.effectAllowed = 'move'
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '11px',
        padding: '10px 14px',
        borderRadius: '10px',
        cursor: 'pointer',
        background: active ? '#1a1a1a' : 'transparent',
        border: `1px solid ${active ? 'rgba(212,175,55,0.22)' : 'transparent'}`,
        transition: 'all 0.15s ease',
        position: 'relative',
      }}
      className="group focus-ring"
    >
```

Find the Pin button block (currently lines 204-224):

```jsx
          <button
            onClick={(e) => handleMenuClick(e, onPinChat)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: '7px',
              border: 'none',
              background: 'transparent',
              color: '#d8cbb0',
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            className="hover:bg-[#1e1a10] hover:text-[#e5c76b]"
          >
            <Pin size={14} />
            <span>{isPinned ? 'Unpin' : 'Pin'}</span>
          </button>
```

Add immediately after it:

```jsx

          <button
            onClick={(e) => {
              e.stopPropagation()
              setShowFolderSubmenu((v) => !v)
            }}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: '7px',
              border: 'none',
              background: 'transparent',
              color: '#d8cbb0',
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            className="hover:bg-[#1e1a10] hover:text-[#e5c76b]"
          >
            <Folder size={14} />
            <span>Move to folder</span>
          </button>

          {showFolderSubmenu && (
            <div style={{ padding: '2px 0 2px 18px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
              {folders.length === 0 && (
                <div style={{ padding: '6px 10px', fontSize: '12px', color: '#6b6152' }}>No folders yet</div>
              )}
              {folders.map((folder) => (
                <button
                  key={folder.id}
                  onClick={(e) => handleMenuClick(e, () => onMoveToFolder?.(folder.id))}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 10px',
                    borderRadius: '7px',
                    border: 'none',
                    background: 'transparent',
                    color: folder.id === currentFolderId ? '#e5c76b' : '#a89878',
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  className="hover:bg-[#1e1a10] hover:text-[#e5c76b]"
                >
                  {folder.name}
                </button>
              ))}
              {currentFolderId && (
                <button
                  onClick={(e) => handleMenuClick(e, () => onMoveToFolder?.(null))}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    padding: '6px 10px',
                    borderRadius: '7px',
                    border: 'none',
                    background: 'transparent',
                    color: '#a89878',
                    fontSize: '12.5px',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                  className="hover:bg-[#1e1a10] hover:text-[#e5c76b]"
                >
                  Remove from folder
                </button>
              )}
            </div>
          )}
```

- [ ] **Step 6: Wire folder state and UI into `Sidebar.jsx`**

Find this line (currently line 21):

```jsx
  const { language, setLanguage } = useContext(ChatContext)
```

Replace it with:

```jsx
  const { language, setLanguage, folders, createFolder, renameFolder, deleteFolder, moveChatToFolder } = useContext(ChatContext)
```

Find this block (Task 1 added `searchQuery` here; currently ends with it):

```jsx
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
```

Replace it with:

```jsx
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [folderMenuOpenId, setFolderMenuOpenId] = useState(null)
  const [folderRenameId, setFolderRenameId] = useState(null)
  const [folderRenameName, setFolderRenameName] = useState('')
```

Find this block (Task 1 added `filteredChats` here):

```jsx
  const filteredChats = recentChats.filter((chat) =>
    (chat.title || 'New chat').toLowerCase().includes(searchQuery.toLowerCase())
  )
```

Add immediately after it:

```jsx

  const unfiledChats = filteredChats.filter((chat) => !chat.folderId)
```

Also add the `Folder`/`FolderPlus`/`Edit2`/`Trash2`/`MoreVertical` icons import. Find the top-of-file imports (currently lines 1-6):

```jsx
import { useState, useRef, useEffect, useContext } from 'react'
import pragnaLogo from '../../assets/pragna-logo-full.png'
import ChatManagementAPI from '../../api/chatManagement'
import RecentItem from './RecentItem'
import { ChatContext } from '../../context/ChatContext'
import { SUPPORTED_LANGUAGE_OPTIONS, normalizeLanguageCode } from '../../utils/language'
```

Replace it with:

```jsx
import { useState, useRef, useEffect, useContext } from 'react'
import { Folder, FolderPlus, MoreVertical, Edit2, Trash2 } from 'lucide-react'
import pragnaLogo from '../../assets/pragna-logo-full.png'
import ChatManagementAPI from '../../api/chatManagement'
import RecentItem from './RecentItem'
import { ChatContext } from '../../context/ChatContext'
import { SUPPORTED_LANGUAGE_OPTIONS, normalizeLanguageCode } from '../../utils/language'
```

Now find the full Recents-rendering block that Task 1 and Task 3 left in place (currently everything from the `{/* Recents */}` comment through the closing of that container, i.e. lines 330-401 as renumbered by Tasks 1 and 3 — locate it by the `{/* Recents */}` comment and the `filteredChats.map` call):

```jsx
      {/* Recents */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 12px 12px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
          minHeight: 0,
        }}
      >
        <div style={{ padding: '0 10px 10px 10px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            style={{
              width: '100%',
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid #2d2a24',
              background: '#1a1a1a',
              color: '#f0e6d3',
              fontSize: '13px',
            }}
            className="focus-ring"
          />
        </div>

        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: '#a89878', padding: '0 14px 10px 14px' }}>
          RECENTS
        </div>
        
        {renameDialogId ? (
          <div style={{ padding: '6px 14px' }}>
            <input
              autoFocus
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1px solid #2d2a24',
                borderRadius: '8px',
                fontSize: '13px',
                background: '#1a1a1a',
                color: '#f0e6d3',
              }}
              onBlur={() => {
                if (newTitle) handleRenameConfirm(renameDialogId)
                setRenameDialogId(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTitle) {
                  handleRenameConfirm(renameDialogId)
                  setRenameDialogId(null)
                } else if (e.key === 'Escape') {
                  setRenameDialogId(null)
                }
              }}
            />
          </div>
        ) : null}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
          {filteredChats.map((chat) => (
            renameDialogId === chat.id ? null : (
              <RecentItem
                key={chat.id}
                id={chat.id}
                title={chat.title || 'New chat'}
                active={chat.id === activeChatId}
                isPinned={pinnedChats.has(chat.id)}
                onClick={() => {
                  onSelectRecent(chat.id)
                  handleChangeView('chats')
                }}
                onDelete={() => handleDelete(chat.id)}
                onRename={() => handleRename(chat.id, chat.title || 'New chat')}
                onShare={() => handleShare(chat.id)}
                onExport={() => handleExport(chat.id)}
                onPinChat={() => handlePinChat(chat.id)}
                onArchive={() => handleArchive(chat.id)}
                onStartGroupChat={() => handleStartGroupChat(chat.id)}
              />
            )
          ))}
        </div>
      </div>
```

Replace the entire block with:

```jsx
      {/* Recents */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '20px 12px 12px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '3px',
          minHeight: 0,
        }}
      >
        <div style={{ padding: '0 10px 10px 10px' }}>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            style={{
              width: '100%',
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid #2d2a24',
              background: '#1a1a1a',
              color: '#f0e6d3',
              fontSize: '13px',
            }}
            className="focus-ring"
          />
        </div>

        {/* New Folder */}
        <div style={{ padding: '0 10px 8px 10px' }}>
          {newFolderDialogOpen ? (
            <input
              autoFocus
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              style={{
                width: '100%',
                padding: '6px 10px',
                border: '1px solid #2d2a24',
                borderRadius: '8px',
                fontSize: '13px',
                background: '#1a1a1a',
                color: '#f0e6d3',
              }}
              onBlur={() => {
                if (newFolderName.trim()) createFolder(newFolderName)
                setNewFolderName('')
                setNewFolderDialogOpen(false)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFolderName.trim()) {
                  createFolder(newFolderName)
                  setNewFolderName('')
                  setNewFolderDialogOpen(false)
                } else if (e.key === 'Escape') {
                  setNewFolderName('')
                  setNewFolderDialogOpen(false)
                }
              }}
            />
          ) : (
            <button
              type="button"
              onClick={() => setNewFolderDialogOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 10px',
                borderRadius: '8px',
                border: 'none',
                background: 'transparent',
                color: '#a89878',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
              }}
              className="hover:bg-[#1a1a1a] hover:text-[#e5c76b]"
            >
              <FolderPlus size={14} />
              <span>New Folder</span>
            </button>
          )}
        </div>

        {/* Folder sections */}
        {folders.map((folder) => {
          const folderChats = filteredChats.filter((c) => c.folderId === folder.id)
          return (
            <div
              key={folder.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault()
                const chatId = e.dataTransfer.getData('text/plain')
                if (chatId) moveChatToFolder(chatId, folder.id)
              }}
              style={{ marginBottom: '6px' }}
            >
              {folderRenameId === folder.id ? (
                <div style={{ padding: '6px 14px' }}>
                  <input
                    autoFocus
                    type="text"
                    value={folderRenameName}
                    onChange={(e) => setFolderRenameName(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '6px 10px',
                      border: '1px solid #2d2a24',
                      borderRadius: '8px',
                      fontSize: '13px',
                      background: '#1a1a1a',
                      color: '#f0e6d3',
                    }}
                    onBlur={() => {
                      if (folderRenameName.trim()) renameFolder(folder.id, folderRenameName)
                      setFolderRenameId(null)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && folderRenameName.trim()) {
                        renameFolder(folder.id, folderRenameName)
                        setFolderRenameId(null)
                      } else if (e.key === 'Escape') {
                        setFolderRenameId(null)
                      }
                    }}
                  />
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 14px', position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '1px', color: '#a89878' }}>
                    <Folder size={13} />
                    <span>{folder.name.toUpperCase()}</span>
                    <span style={{ color: '#6b6152' }}>({folderChats.length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFolderMenuOpenId(folderMenuOpenId === folder.id ? null : folder.id)}
                    style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', color: '#a89878', cursor: 'pointer', display: 'flex' }}
                    aria-label={`Menu for ${folder.name}`}
                  >
                    <MoreVertical size={13} />
                  </button>
                  {folderMenuOpenId === folder.id && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setFolderMenuOpenId(null)} />
                      <div
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: 'calc(100% + 2px)',
                          width: '150px',
                          zIndex: 100,
                          padding: '4px',
                          borderRadius: '10px',
                          background: '#141414',
                          border: '1px solid rgba(212,175,55,0.22)',
                          boxShadow: '0 10px 24px rgba(0,0,0,0.5)',
                        }}
                      >
                        <button
                          onClick={() => {
                            setFolderRenameId(folder.id)
                            setFolderRenameName(folder.name)
                            setFolderMenuOpenId(null)
                          }}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '7px', border: 'none', background: 'transparent', color: '#d8cbb0', fontSize: '13px', cursor: 'pointer', textAlign: 'left' }}
                          className="hover:bg-[#1e1a10] hover:text-[#e5c76b]"
                        >
                          <Edit2 size={14} />
                          <span>Rename</span>
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`Delete folder "${folder.name}"? Chats inside will be moved back to Recents.`)) {
                              deleteFolder(folder.id)
                            }
                            setFolderMenuOpenId(null)
                          }}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', borderRadius: '7px', border: 'none', background: 'transparent', color: '#d98b7f', fontSize: '13px', cursor: 'pointer', textAlign: 'left' }}
                          className="hover:bg-[#301614]"
                        >
                          <Trash2 size={14} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {folderChats.map((chat) => (
                  renameDialogId === chat.id ? null : (
                    <RecentItem
                      key={chat.id}
                      id={chat.id}
                      title={chat.title || 'New chat'}
                      active={chat.id === activeChatId}
                      isPinned={pinnedChats.has(chat.id)}
                      folders={folders}
                      currentFolderId={chat.folderId || null}
                      onMoveToFolder={(folderId) => moveChatToFolder(chat.id, folderId)}
                      onClick={() => {
                        onSelectRecent(chat.id)
                        handleChangeView('chats')
                      }}
                      onDelete={() => handleDelete(chat.id)}
                      onRename={() => handleRename(chat.id, chat.title || 'New chat')}
                      onShare={() => handleShare(chat.id)}
                      onExport={() => handleExport(chat.id)}
                      onPinChat={() => handlePinChat(chat.id)}
                      onArchive={() => handleArchive(chat.id)}
                      onStartGroupChat={() => handleStartGroupChat(chat.id)}
                    />
                  )
                ))}
              </div>
            </div>
          )
        })}

        {/* Unfiled chats */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const chatId = e.dataTransfer.getData('text/plain')
            if (chatId) moveChatToFolder(chatId, null)
          }}
        >
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: '#a89878', padding: '0 14px 10px 14px' }}>
            RECENTS
          </div>

          {renameDialogId ? (
            <div style={{ padding: '6px 14px' }}>
              <input
                autoFocus
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  border: '1px solid #2d2a24',
                  borderRadius: '8px',
                  fontSize: '13px',
                  background: '#1a1a1a',
                  color: '#f0e6d3',
                }}
                onBlur={() => {
                  if (newTitle) handleRenameConfirm(renameDialogId)
                  setRenameDialogId(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newTitle) {
                    handleRenameConfirm(renameDialogId)
                    setRenameDialogId(null)
                  } else if (e.key === 'Escape') {
                    setRenameDialogId(null)
                  }
                }}
              />
            </div>
          ) : null}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {unfiledChats.map((chat) => (
              renameDialogId === chat.id ? null : (
                <RecentItem
                  key={chat.id}
                  id={chat.id}
                  title={chat.title || 'New chat'}
                  active={chat.id === activeChatId}
                  isPinned={pinnedChats.has(chat.id)}
                  folders={folders}
                  currentFolderId={null}
                  onMoveToFolder={(folderId) => moveChatToFolder(chat.id, folderId)}
                  onClick={() => {
                    onSelectRecent(chat.id)
                    handleChangeView('chats')
                  }}
                  onDelete={() => handleDelete(chat.id)}
                  onRename={() => handleRename(chat.id, chat.title || 'New chat')}
                  onShare={() => handleShare(chat.id)}
                  onExport={() => handleExport(chat.id)}
                  onPinChat={() => handlePinChat(chat.id)}
                  onArchive={() => handleArchive(chat.id)}
                  onStartGroupChat={() => handleStartGroupChat(chat.id)}
                />
              )
            ))}
          </div>
        </div>
      </div>
```

- [ ] **Step 7: Build and lint**

Run: `cd chatbot-ui-vite && npm run build && npm run lint`
Expected: both commands exit cleanly with no errors.

- [ ] **Step 8: Manually verify**

Run: `cd chatbot-ui-vite && npm run dev` and check, in order:
1. Click "New Folder", type a name, press Enter — a new folder section appears with "(0)" chats.
2. Drag a chat from RECENTS onto the folder header — it moves into the folder (count increments, chat disappears from RECENTS).
3. Open that chat's row menu → "Move to folder" → pick a different folder (or "Remove from folder") — confirm it moves without drag-and-drop.
4. Open the folder header's menu → Rename — confirm the name updates. → Delete — confirm the browser confirm dialog appears, and after confirming, the folder disappears and its chat(s) reappear under RECENTS (not deleted).
5. Confirm the search box from Task 1 still filters correctly within both folder sections and RECENTS.

- [ ] **Step 9: Commit**

```bash
git add chatbot-ui-vite/src/context/ChatContext.jsx chatbot-ui-vite/src/pragna/components/RecentItem.jsx chatbot-ui-vite/src/pragna/components/Sidebar.jsx
git commit -m "feat: add folders for organizing chats"
```

---

### Task 5: Logo size

**Files:**
- Modify: `chatbot-ui-vite/src/pragna/components/Sidebar.jsx` (logo `<img>` style)

**Interfaces:**
- Consumes: none.
- Produces: none — purely visual.

- [ ] **Step 1: Bump the logo height**

Find this line:

```jsx
        <img src={pragnaLogo} alt="Pragna I-A" style={{ height: '100px', width: 'auto', objectFit: 'contain' }} />
```

Replace it with:

```jsx
        <img src={pragnaLogo} alt="Pragna I-A" style={{ height: '150px', width: 'auto', objectFit: 'contain' }} />
```

- [ ] **Step 2: Build and lint**

Run: `cd chatbot-ui-vite && npm run build && npm run lint`
Expected: both commands exit cleanly with no errors.

- [ ] **Step 3: Manually verify**

Run: `cd chatbot-ui-vite && npm run dev`, open the app, and visually confirm the sidebar logo renders noticeably larger (150px tall) without overlapping the "New chat" button below it or overflowing the sidebar's padding.

- [ ] **Step 4: Commit**

```bash
git add chatbot-ui-vite/src/pragna/components/Sidebar.jsx
git commit -m "style: increase sidebar logo size to 150px"
```

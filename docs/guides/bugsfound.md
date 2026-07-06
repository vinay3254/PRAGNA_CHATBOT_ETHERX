# Bugs Found — Pragna Chat UI Reskin Review

**Status: all 10 findings below are fixed** (each verified with a passing
`npm run build`; see "Fix applied" notes). Fixed via 8 parallel subagents,
grouped by file so no two agents edited the same file concurrently.

Review scope: uncommitted working-tree diff (`git diff HEAD`) covering the frontend
reskin under `chatbot-ui-vite/src/` (AgentPanel, ChatWindow, MessageBubble,
CodeBlock, GlobalDashboard, WorldMonitorDashboard, InputBar, LanguageSelector,
App, ModeToggle, NavItem, RecentItem, Sidebar, SuggestionCard, MainLayout,
HomePage, globals.css, chat.css, input.css, tailwind.config.js) plus new files
SettingsModal.jsx, GptModesPage.jsx, ImageStudioPage.jsx.

Method: 8 parallel finder passes (line-by-line scan, removed-behavior audit,
cross-file tracer, reuse, simplification, efficiency, altitude, conventions),
deduplicated, then independently re-verified against the current on-disk code.
All 10 correctness/regression findings below were verified **CONFIRMED**.

---

## 1. Typed message silently discarded while a response is streaming
**File:** `chatbot-ui-vite/src/components/input/InputBar.jsx:285` (send()), textarea ~464-467, mic button ~519-528

`send()` unconditionally calls `setText("")` / `setAttachments([])` right after
calling `handleSendMessage(text, attachments)`. But `handleSendMessage` silently
no-ops when `isLoading` is true (`if (!hasContent || isLoading) return;`, ~line
129). The textarea and mic button also lost the `disabled={isLoading}` guard
they previously had, so nothing stops the user from triggering this.

**Failure scenario:** While a bot response is still streaming, the user types a
follow-up and presses Enter/Send. The message is never sent, but the typed text
and attachments are cleared anyway — silent data loss with no error and no way
to recover the text.

**✅ Fix applied:** `send()` now guards on `if (!hasContent || isLoading) return;`
before doing anything, so it only clears the textarea/attachments when a
message actually goes out.

---

## 2. Retry on a failed message duplicates it instead of replacing it
**File:** `chatbot-ui-vite/src/components/chat/ChatWindow.jsx:420`

`onRetry={idx === chat.messages.length - 1 ? () => sendSuggestionMessage(chat.messages[idx - 1]?.text) : undefined}`
calls `sendSuggestionMessage`, which always **appends** a new user+bot message
pair rather than replacing/resending the failed exchange.

**Failure scenario:** A bot reply errors out (`message.error === true`) and the
user clicks "Retry." Instead of resending in place, it appends a duplicate copy
of the same user prompt plus a new bot placeholder to the end of the
conversation, leaving the original failed exchange still visible above it —
one retry click permanently duplicates the message in chat history.

**✅ Fix applied:** added a `retryMessage(idx)` function that removes the failed
user+bot pair (`messages.slice(0, idx - 1)`) before delegating to the existing
`sendSuggestionMessage` to resend — no duplicate logic, no duplicate messages.

---

## 3. Language switcher is completely broken (two dead ends)
**Files:** `chatbot-ui-vite/src/components/input/InputBar.jsx:493-517`, `chatbot-ui-vite/src/pragna/components/Sidebar.jsx:260-272,540-556`

InputBar.jsx dropped `import LanguageSelector` and `<LanguageSelector />`
entirely, replacing it with a decorative pill (`{language.toUpperCase()}`) that
has no `onClick` handler — `LanguageSelector` is now imported nowhere in `src/`.
Separately, Sidebar.jsx added its own "Language" flyout with
`handleLanguageSelect`, but that function only updates local
`selectedLanguage` state and never calls `ChatContext`'s real `setLanguage`.

**Failure scenario:** A user wants to chat in Hindi/Tamil/etc. Clicking the
input-bar pill does nothing; picking a language from the Sidebar's account
menu only updates cosmetic local state. There is no working UI path left to
change the `language` value that feeds message sending and speech recognition
— it stays stuck at whatever `ChatContext` initialized (default `en`).

**✅ Fix applied:** InputBar.jsx now renders the real `<LanguageSelector />`
(already correctly wired to `ChatContext`) instead of the dead pill. Sidebar.jsx's
flyout was rewired to the same context — it now maps over the app's real
`SUPPORTED_LANGUAGE_OPTIONS` and calls `setLanguage(normalizeLanguageCode(code))`
instead of updating disconnected local state (its old option list was also
mostly languages the backend doesn't even support).

---

## 4. Image Studio style options don't match the backend's style map
**Files:** `chatbot-ui-vite/src/pragna/pages/ImageStudioPage.jsx:52`, `backend/app.py:290-298`

The style `<select>` now offers `cinematic`/`studio`/`editorial`/`anime`, but
`backend/app.py`'s `_build_image_generation_prompt` `style_map` only has keys
`photo`/`cinematic`/`illustration`/`concept_art`/`product` and does
`style_map.get(style, style_map['cinematic'])`.

**Failure scenario:** Selecting "Studio," "Editorial," or "Anime" silently
falls back to the cinematic style hint — the generated image ignores the
user's choice with no error surfaced anywhere.

**✅ Fix applied:** the dropdown's options were replaced with the backend's
actual `style_map` keys: Cinematic, Photo, Illustration, Concept Art, Product.
Backend untouched (it was already correct).

---

## 5. Pin state prop dropped — "Pin"/"Unpin" label always wrong
**File:** `chatbot-ui-vite/src/pragna/components/Sidebar.jsx:400` (RecentItem call)

Sidebar.jsx's `<RecentItem>` invocation no longer passes
`isPinned={pinnedChats.has(chat.id)}` (present before this diff), even though
`pinnedChats` state and `handlePinChat` are still fully maintained.
`RecentItem.jsx` defaults `isPinned` to `false`.

**Failure scenario:** User pins a chat via the row menu; internal state updates
correctly, but the menu item for that chat permanently reads "Pin" (never
flips to "Unpin") — no way to tell from the UI whether a chat is pinned.

**✅ Fix applied:** `isPinned={pinnedChats.has(chat.id)}` restored on the
`<RecentItem>` call.

---

## 6. `.focus-ring` deleted + blanket `outline: none` removes keyboard focus indication app-wide
**File:** `chatbot-ui-vite/src/pragna/styles/globals.css:62`; affects `chatbot-ui-vite/src/components/dashboard/GlobalDashboard.jsx:192,202,213`

This diff deletes the `.focus-ring` utility class
(`@apply focus:outline-none focus:ring-2 focus:ring-accent-500/35 ...`) and
adds `textarea:focus, input:focus, button:focus { outline: none; }`.
GlobalDashboard.jsx still applies `className="... focus-ring"` to its
severity/region selects and search input.

**Failure scenario:** Keyboard users tabbing to any textarea/input/button in
the app — including those dashboard filters — get zero visible focus
indicator, since the native outline is suppressed and the custom ring class no
longer exists.

**✅ Fix applied:** replaced the blanket `outline: none` with a
`:focus-visible`-based rule (gold 2px outline on keyboard focus, none on mouse
click) and restored `.focus-ring` as a standalone utility class with the same
behavior, so `GlobalDashboard.jsx` and `RecentItem.jsx` resolve again.

---

## 7. Recent-chat row is keyboard-unreachable
**File:** `chatbot-ui-vite/src/pragna/components/RecentItem.jsx:41`

The clickable row changed from `<button type="button" onClick={onClick}>` to
`<div onClick={onClick}>` with no `role`, `tabIndex`, or `onKeyDown`.

**Failure scenario:** Keyboard-only or screen-reader users can no longer Tab to
a recent-chat item and press Enter/Space to open it — it was focusable and
operable before this diff.

**✅ Fix applied:** added `role="button"`, `tabIndex={0}`, an `onKeyDown`
handler for Enter/Space, and the `focus-ring` class to the row div (kept as a
div, not a `<button>`, since it wraps a nested interactive menu button).

---

## 8. Settings' Appearance selector is disconnected from the real theme
**File:** `chatbot-ui-vite/src/pragna/components/SettingsModal.jsx:10`

`const [appearance, setAppearance] = useState('dark')` — the Appearance
buttons (Light/Dark/System) only call `setAppearance(...)`. The file never
imports `ChatContext`, so it has no path to the real `theme`/`toggleTheme`
mechanism that `ThemeToggle.jsx` uses.

**Failure scenario:** Clicking "Light" or "System" in Settings visibly
highlights the option in the modal but changes nothing about the app's
actual rendered theme.

**✅ Fix applied:** added real `theme`/`setTheme` state to `ChatContext.jsx`
(same pattern as `language` — persisted to `localStorage['pragna_theme']` and
mirrored to `document.documentElement`'s `data-theme` attribute).
SettingsModal now reads/writes through context instead of local state. Note:
there's still no actual light-theme CSS anywhere in the app (single dark/gold
theme) — this fix makes the setting real and persisted, but a visible light
mode would need separate CSS work, which was out of scope for this bug fix.

---

## 9. Username stored under two different localStorage keys
**File:** `chatbot-ui-vite/src/pragna/components/SettingsModal.jsx:7`; conflicts with `chatbot-ui-vite/src/components/ui/ProfileDropdown.jsx:15-19,30`

SettingsModal.jsx reads/writes `localStorage['authUsername']` for the display
name, while ProfileDropdown.jsx reads/writes a different key, `userName`, for
the same concept.

**Failure scenario:** Editing the name in Settings doesn't update what
ProfileDropdown shows, and vice versa, since each watches its own independent
key.

**✅ Fix applied:** `ProfileDropdown.jsx` now reads/writes `authUsername`,
matching `Sidebar.jsx`/`SettingsModal.jsx`. (Note: `ProfileDropdown` isn't
currently rendered by the live app — it's only reachable through the legacy,
unused `src/components/layout/MainLayout.jsx` — so this had no visible runtime
effect today, but fixes the latent inconsistency for if/when it's reused.)

---

## 10. "Folder" attach option silently removed, dead ref left behind
**File:** `chatbot-ui-vite/src/components/input/InputBar.jsx:58`

The attach popup now only lists Image/Video/File; the folder
(`webkitdirectory`) hidden input and its trigger button were deleted, but
`folderInputRef` is still declared and unused.

**Failure scenario:** Any user who relied on Attach → Folder to bulk-upload a
directory into a chat message has no way to do so anymore, with no indication
the feature disappeared.

**✅ Fix applied:** restored the "Folder" entry in the attach menu and its
matching hidden `<input type="file" webkitdirectory ...>`, wired to the
existing `folderInputRef` and `handleFilePick(e, 'folder')` (which already had
folder-handling logic in place).

---

## Not included above (cleanup items, capped out by correctness findings)

These were also found and corroborated across multiple review passes, but
correctness bugs took priority for the top-10 cap. Worth a follow-up pass:

- **Duplicated `@keyframes`**: `fadeUp` and `dotBlink`/`blink` are defined
  independently in both `chatbot-ui-vite/src/styles/chat.css` and
  `chatbot-ui-vite/src/pragna/styles/globals.css`.
- **Hand-rolled SVG icons duplicated across ≥4 files** (`ChatWindow.jsx`,
  `Sidebar.jsx`, `SettingsModal.jsx`, `HomePage.jsx`) instead of using
  `lucide-react`, which this same diff already adds as a dependency and uses
  elsewhere (`AgentPanel.jsx`, `ModeToggle.jsx`, `RecentItem.jsx`,
  `MainLayout.jsx`).
- **Missing memoization**: static icon-builder closures and config arrays
  (`modes`, `navItemsList`, `tabs`, etc.) are recreated on every render inside
  `ChatWindow.jsx`, `Sidebar.jsx`, and `SettingsModal.jsx` — all three are
  re-rendered on every keystroke/streamed token.
- **`!important`-laden overrides** in `globals.css`'s `.pragna-shell` block
  repaint Tailwind's own generated utility classes (`.bg-white`,
  `.text-gray-700`, etc.) app-wide by specificity, rather than updating the
  Tailwind theme/tokens directly — any component that legitimately wants those
  utilities elsewhere in the tree will be silently repainted if nested under
  `.pragna-shell`.
- **No shared Modal/Dialog primitive**: `SettingsModal.jsx` reimplements its
  own overlay/backdrop/escape-key scaffolding from scratch with a hardcoded
  z-index (100), risking collisions with `MainLayout`'s mobile drawer (z-50)
  and Sidebar's new popup stack (z-40/41/42).
- **Orphaned components**: `NavItem.jsx`, `ModeToggle.jsx`, and
  `SuggestionCard.jsx` were all re-styled in this diff but are no longer
  imported/rendered anywhere (Sidebar.jsx inlines an equivalent nav item
  instead of using `NavItem`).
- **Dead/invalid style keys**: a lowercase `justifycontent` (no-op) sits next
  to the real `justifyContent` in three spots (`ChatWindow.jsx:340`,
  `SettingsModal.jsx:387,417`); `SettingsModal.jsx:121` has a stray
  non-existent `alignMeters` key next to the real `alignItems`.
- **Hardcoded hex colors** (`#d4af37`, `#f0e6d3`, `#a89878`, etc.) repeated
  dozens of times across `HomePage.jsx`, `GptModesPage.jsx`,
  `ImageStudioPage.jsx`, `SettingsModal.jsx`, `AgentPanel.jsx` instead of the
  existing `--pragna-gold`/`--pragna-text` CSS variables or
  `accent`/`surface` Tailwind tokens already defined in `globals.css` /
  `tailwind.config.js`.

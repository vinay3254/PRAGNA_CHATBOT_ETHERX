# Desktop Sidebar Close/Collapse

**Status:** Approved

## Goal

Let the user hide the always-on desktop sidebar to reclaim screen width, and reopen it via a small floating button. State persists across reloads. Mobile's existing drawer behavior is unaffected.

## Current state (why this is needed)

`ChatContext.jsx` already declares `sidebarOpen` (`useState(() => !isMobile())`) and `toggleSidebar()`, plus a `resize` effect that forces `sidebarOpen` to `true` on any resize to desktop width and `false` on any resize to mobile width. None of this is actually wired to anything: `MainLayout.jsx` renders the desktop `<Sidebar>` unconditionally (`{isDesktop && (...)}`), and the mobile drawer uses its own independent `mobileMenuOpen` local state. `sidebarOpen`/`toggleSidebar` are dead code on desktop today.

## Architecture

Wire the existing `sidebarOpen`/`toggleSidebar` context state into `MainLayout.jsx`'s desktop branch, and persist it to `localStorage`, replacing the current resize-driven effect (which has no real job once desktop honors an explicit/persisted user choice, since mobile ignores this state entirely via its own `mobileMenuOpen`).

## Changes

### `chatbot-ui-vite/src/context/ChatContext.jsx`
- Change the `sidebarOpen` initializer to read `localStorage.getItem("pragna_sidebar_open")` (parse as JSON boolean; default `true` if unset or unparsable).
- Add a `useEffect` that writes `sidebarOpen` to `localStorage.setItem("pragna_sidebar_open", JSON.stringify(sidebarOpen))` on change — same pattern as the existing `theme`/`chatMode` persistence effects in this file.
- Remove the existing `resize` `useEffect` that calls `setSidebarOpen(isMobile() ? false : true)`. It currently has no observable effect (desktop always rendered the sidebar regardless of `sidebarOpen`; mobile never reads `sidebarOpen`), and once desktop is wired to honor `sidebarOpen`, this effect would incorrectly override a persisted "closed" choice on every resize event. The `isMobile()` helper becomes unused after this removal and should be removed too.

### `chatbot-ui-vite/src/pragna/layouts/MainLayout.jsx`
- Import `useContext` and `ChatContext`; destructure `{ sidebarOpen, toggleSidebar }`.
- Change the desktop sidebar block's condition from `{isDesktop && (...)}` to `{isDesktop && sidebarOpen && (...)}`.
- Add a floating reopen button, rendered when `isDesktop && !sidebarOpen`: a small fixed-position button at the top-left of the content area (`position: fixed`, similar `z-index`/hover styling to the mobile header's hamburger button), using lucide's `PanelLeft` icon, `onClick={toggleSidebar}`, `title="Open sidebar"`.

### `chatbot-ui-vite/src/pragna/components/Sidebar.jsx`
- Pull `toggleSidebar` from `ChatContext` (added to the existing `useContext(ChatContext)` destructure alongside `language`, `folders`, etc. — no prop drilling).
- Add a close button (lucide `PanelLeftClose` icon) in the logo header row (the `{/* Wordmark logo */}` div), `onClick={toggleSidebar}`, `title="Close sidebar"`.

## Data flow

Click close button in sidebar header → `toggleSidebar()` → `sidebarOpen` → `false` → persisted to `localStorage` → `MainLayout` re-renders: desktop `<Sidebar>` unmounts, floating reopen button appears. Click reopen button → `toggleSidebar()` → `sidebarOpen` → `true` → persisted → sidebar reappears, floating button disappears.

## Compatibility

The not-yet-merged `feature/chat-ui-batch2` branch (PR #1, keyboard shortcuts) already assumes this exact `sidebarOpen`/`toggleSidebar` contract for its Ctrl+K flow (open the sidebar if closed, then focus search). No rework needed there once it merges.

## Scope

- Desktop only (`≥1024px`, matching the existing `isDesktop` breakpoint already used in `MainLayout.jsx`). Mobile's hamburger + slide-in drawer (`mobileMenuOpen`) is untouched.
- No new collapsed "icon rail" state — closed means fully hidden, per the approved design choice.

## Testing

`npm run build && npm run lint` (no new errors/warnings versus the current baseline — see prior batch's established convention for this repo's pre-existing lint debt). Manual verification: close the sidebar on desktop, confirm it hides and the floating reopen button appears; reload, confirm it stays closed; reopen, confirm the floating button disappears and the sidebar reappears; reload again, confirm it stays open.

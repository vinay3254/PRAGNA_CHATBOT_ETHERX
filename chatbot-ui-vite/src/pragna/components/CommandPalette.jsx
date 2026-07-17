import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ChatContext } from '../../context/ChatContext'
import ChatManagementAPI from '../../api/chatManagement'
import { SUPPORTED_LANGUAGE_OPTIONS } from '../../utils/language'

const CHAT_MODES = [
  { id: 'general', label: 'General' },
  { id: 'explain_concepts', label: 'Explain' },
  { id: 'generate_ideas', label: 'Ideas' },
  { id: 'write_content', label: 'Write' },
  { id: 'code_assistance', label: 'Code' },
  { id: 'ask_questions', label: 'Questions' },
  { id: 'creative_writing', label: 'Story' },
]

const NAV_VIEWS = [
  { id: 'chats', label: 'Chats' },
  { id: 'explore', label: 'Explore' },
  { id: 'images', label: 'Images' },
  { id: 'projects', label: 'Projects' },
  { id: 'gpts', label: 'GPTs' },
  { id: 'compare', label: 'Compare' },
]

// Global Ctrl/Cmd+K quick switcher: jump to any chat, or run an action
// (new chat, switch mode/persona/language, navigate, open settings, share).
// Supersedes the old Ctrl+K "focus chat search" binding - this does that
// (chats are searchable here too) plus everything else, so nothing is lost.
export default function CommandPalette({ isOpen, onClose, onNavigate, onOpenSettings }) {
  const {
    chats,
    setActiveChatId,
    newChat,
    toggleSidebar,
    chatMode,
    setChatMode,
    personas,
    activePersonaId,
    setActivePersonaId,
    language,
    setLanguage,
  } = useContext(ChatContext)

  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [shareStatus, setShareStatus] = useState('')
  const inputRef = useRef(null)

  // Reset transient state on the closed->open transition, computed during
  // render (React's recommended way to adjust state on a prop change)
  // rather than in an effect, which would cost an extra render.
  const [wasOpen, setWasOpen] = useState(false)
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) {
      setQuery('')
      setActiveIndex(0)
      setShareStatus('')
    }
  }

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [isOpen])

  const handleShareActiveChat = async (chat) => {
    if (!chat) return
    try {
      setShareStatus('Sharing…')
      const result = await ChatManagementAPI.shareChat(chat.id, chat.title || 'New chat', chat.messages || [])
      const shareUrl = `${window.location.origin}${result.share_url}`
      await navigator.clipboard.writeText(shareUrl)
      setShareStatus('Link copied to clipboard!')
      setTimeout(() => onClose(), 900)
    } catch (err) {
      setShareStatus(err.message || 'Failed to share chat.')
    }
  }

  const items = useMemo(() => {
    const list = []

    list.push({ id: 'action:new-chat', section: 'Actions', label: 'New chat', onSelect: () => { newChat(); onNavigate('chats'); onClose() } })
    list.push({ id: 'action:toggle-sidebar', section: 'Actions', label: 'Toggle sidebar', onSelect: () => { toggleSidebar(); onClose() } })
    list.push({ id: 'action:settings', section: 'Actions', label: 'Open settings', onSelect: () => { onOpenSettings(); onClose() } })

    NAV_VIEWS.forEach((v) => {
      list.push({ id: `nav:${v.id}`, section: 'Go to', label: v.label, onSelect: () => { onNavigate(v.id); onClose() } })
    })

    CHAT_MODES.forEach((m) => {
      list.push({
        id: `mode:${m.id}`,
        section: 'Chat mode',
        label: m.label,
        hint: chatMode === m.id ? 'current' : undefined,
        onSelect: () => { setChatMode(m.id); onNavigate('chats'); onClose() },
      })
    })

    list.push({
      id: 'persona:none',
      section: 'Persona',
      label: 'No persona',
      hint: !activePersonaId ? 'current' : undefined,
      onSelect: () => { setActivePersonaId(null); onClose() },
    })
    personas.forEach((p) => {
      list.push({
        id: `persona:${p.id}`,
        section: 'Persona',
        label: p.name,
        hint: activePersonaId === p.id ? 'current' : undefined,
        onSelect: () => { setActivePersonaId(p.id); onClose() },
      })
    })

    SUPPORTED_LANGUAGE_OPTIONS.forEach((opt) => {
      list.push({
        id: `lang:${opt.code}`,
        section: 'Language',
        label: opt.label,
        hint: language === opt.code ? 'current' : undefined,
        onSelect: () => { setLanguage(opt.code); onClose() },
      })
    })

    chats.slice(0, 50).forEach((chat) => {
      list.push({
        id: `chat:${chat.id}`,
        section: 'Chats',
        label: chat.title || 'New chat',
        onSelect: () => { setActiveChatId(chat.id); onNavigate('chats'); onClose() },
        shareable: chat,
      })
    })

    return list
  }, [chats, chatMode, personas, activePersonaId, language, newChat, toggleSidebar, onOpenSettings, onNavigate, onClose, setChatMode, setActivePersonaId, setLanguage, setActiveChatId])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items.slice(0, 30)
    return items.filter((item) => item.label.toLowerCase().includes(q) || item.section.toLowerCase().includes(q)).slice(0, 40)
  }, [items, query])

  // Reset the highlighted row whenever the query changes the result set -
  // same render-time adjustment pattern as the open/close reset above.
  const [prevQuery, setPrevQuery] = useState(query)
  if (query !== prevQuery) {
    setPrevQuery(query)
    setActiveIndex(0)
  }

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((prev) => Math.max(prev - 1, 0))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = filtered[activeIndex]
        if (item) item.onSelect()
      }
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, filtered, activeIndex, onClose])

  if (!isOpen) return null

  let lastSection = null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0 }}></div>
      <div style={{ position: 'relative', width: 'min(560px, 92vw)', maxHeight: '64vh', display: 'flex', flexDirection: 'column', borderRadius: '18px', overflow: 'hidden', background: 'var(--pragna-surface)', border: '1px solid rgba(212,175,55,0.25)', boxShadow: '0 24px 70px rgba(0,0,0,0.65)' }}>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search chats or run a command…"
          style={{ padding: '16px 20px', border: 'none', borderBottom: '1px solid var(--pragna-border)', background: 'transparent', color: 'var(--pragna-text)', fontSize: '15px', fontFamily: 'inherit', outline: 'none' }}
        />

        <div style={{ overflowY: 'auto', padding: '8px' }} className="custom-scrollbar">
          {filtered.length === 0 && (
            <div style={{ padding: '20px', textAlign: 'center', fontSize: '13px', color: 'var(--pragna-text-muted)' }}>No matches.</div>
          )}
          {filtered.map((item, idx) => {
            const showSectionHeader = item.section !== lastSection
            lastSection = item.section
            const active = idx === activeIndex
            return (
              <div key={item.id}>
                {showSectionHeader && (
                  <div style={{ padding: '10px 12px 4px 12px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.6px', color: 'var(--pragna-text-muted)' }}>
                    {item.section.toUpperCase()}
                  </div>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={item.onSelect}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '10px',
                    border: 'none',
                    background: active ? 'linear-gradient(135deg, rgba(212,175,55,0.16), rgba(184,134,11,0.08))' : 'transparent',
                    color: active ? 'var(--pragna-gold-soft)' : 'var(--pragna-text)',
                    fontSize: '13.5px',
                    fontWeight: active ? 650 : 500,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    {item.hint && (
                      <span style={{ fontSize: '10.5px', color: 'var(--pragna-text-muted)' }}>{item.hint}</span>
                    )}
                    {item.shareable && (
                      <span
                        role="button"
                        tabIndex={-1}
                        onClick={(e) => { e.stopPropagation(); handleShareActiveChat(item.shareable) }}
                        title="Copy share link"
                        style={{ fontSize: '10.5px', color: 'var(--pragna-text-muted)', border: '1px solid var(--pragna-border)', borderRadius: '999px', padding: '2px 8px' }}
                      >
                        Share
                      </span>
                    )}
                  </span>
                </button>
              </div>
            )
          })}
        </div>

        {shareStatus && (
          <div style={{ padding: '8px 16px', borderTop: '1px solid var(--pragna-border)', fontSize: '12px', color: 'var(--pragna-gold-soft)' }}>
            {shareStatus}
          </div>
        )}
      </div>
    </div>
  )
}

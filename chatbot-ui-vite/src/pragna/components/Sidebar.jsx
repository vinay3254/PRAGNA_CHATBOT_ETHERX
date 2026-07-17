import { useState, useRef, useEffect, useContext } from 'react'
import { Folder, FolderPlus, MoreVertical, Edit2, Trash2, PanelLeftClose } from 'lucide-react'
import pragnaLogo from '../../assets/pragna-logo-full.png'
import ChatManagementAPI from '../../api/chatManagement'
import RecentItem from './RecentItem'
import { ChatContext } from '../../context/ChatContext'

const Sidebar = ({
  activeView,
  onViewChange,
  recentChats,
  activeChatId,
  onSelectRecent,
  onDeleteRecent,
  onNewChat,
  onLogout,
  userProfile,
  onClose,
  onOpenSettings,
}) => {
  const { folders, createFolder, renameFolder, deleteFolder, moveChatToFolder, toggleSidebar, sidebarSearchInputRef, duplicateChat } = useContext(ChatContext)

  const [pinnedChats, setPinnedChats] = useState(new Set())
  const [renameDialogId, setRenameDialogId] = useState(null)
  const [newTitle, setNewTitle] = useState('')
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [folderMenuOpenId, setFolderMenuOpenId] = useState(null)
  const [folderRenameId, setFolderRenameId] = useState(null)
  const [folderRenameName, setFolderRenameName] = useState('')

  // Menu popup states
  const [userMenuOpen, setUserMenuOpen] = useState(false)

  const userMenuRef = useRef(null)
  const userButtonRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        userMenuOpen &&
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target) &&
        !userButtonRef.current?.contains(event.target)
      ) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [userMenuOpen])

  const handleChangeView = (viewId) => {
    onViewChange(viewId)
    if (onClose) onClose()
  }

  const handlePinChat = async (chatId) => {
    try {
      setLoading('pin')
      const isPinned = pinnedChats.has(chatId)
      await ChatManagementAPI.pinChat(chatId, !isPinned)
      
      const updated = new Set(pinnedChats)
      if (updated.has(chatId)) {
        updated.delete(chatId)
      } else {
        updated.add(chatId)
      }
      setPinnedChats(updated)
      setError(null)
    } catch (err) {
      setError(err.message || 'Failed to pin chat')
      console.error('Error pinning chat:', err)
    } finally {
      setLoading(null)
    }
  }

  const handleRename = (chatId, currentTitle) => {
    setRenameDialogId(chatId)
    setNewTitle(currentTitle)
  }

  const handleRenameConfirm = async (chatId) => {
    try {
      setLoading('rename')
      await ChatManagementAPI.renameChat(chatId, newTitle)
      setError(null)
    } catch (err) {
      setError(err.message || 'Failed to rename chat')
      console.error('Error renaming chat:', err)
    } finally {
      setRenameDialogId(null)
      setLoading(null)
    }
  }

  const handleShare = async (chatId) => {
    try {
      setLoading('share')
      const targetChat = recentChats.find((c) => c.id === chatId)
      const title = targetChat?.title || 'New chat'
      const messages = targetChat?.messages || []
      const result = await ChatManagementAPI.shareChat(chatId, title, messages)
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

  const handlePdfExport = (chatId) => {
    const targetChat = recentChats.find((c) => c.id === chatId)
    if (!targetChat) return

    const title = targetChat.title || 'New chat'
    const escapeHtml = (str) =>
      (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    const turns = (targetChat.messages || [])
      .map((msg) => {
        const speaker = msg.sender === 'bot' ? 'Pragna' : 'You'
        let html = `<p><strong>${speaker}:</strong> ${escapeHtml(msg.text)}</p>`
        if (msg.attachments?.length) {
          for (const att of msg.attachments) {
            html += `<p><em>[attached: ${escapeHtml(att.name)}]</em></p>`
          }
        }
        return html
      })
      .join('\n')

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  body { font-family: Georgia, serif; max-width: 720px; margin: 40px auto; color: #1a1a1a; }
  h1 { font-size: 22px; }
  .meta { color: #666; font-size: 13px; margin-bottom: 24px; }
  hr { border: none; border-top: 1px solid #ccc; margin: 24px 0; }
  p { line-height: 1.6; white-space: pre-wrap; }
</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="meta">Exported ${new Date().toISOString()}</div>
<hr>
${turns}
</body>
</html>`

    const printWindow = window.open('', '_blank')
    if (!printWindow) return
    printWindow.document.write(html)
    printWindow.document.close()
    printWindow.print()
  }

  const handleDuplicate = (chatId) => {
    duplicateChat(chatId)
    handleChangeView('chats')
  }

  const handleStartGroupChat = async (chatId) => {
    try {
      setLoading('group')
      const collaborators = prompt('Enter collaborator usernames/emails (comma-separated):')
      if (collaborators) {
        const collaboratorList = collaborators.split(',').map(c => c.trim()).filter(c => c)
        if (collaboratorList.length > 0) {
          await ChatManagementAPI.startGroupChat(chatId, collaboratorList)
          alert(`Group chat started with ${collaboratorList.length} collaborators!`)
          setError(null)
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to start group chat')
      console.error('Error starting group chat:', err)
    } finally {
      setLoading(null)
    }
  }

  const handleArchive = async (chatId) => {
    try {
      setLoading('archive')
      await ChatManagementAPI.archiveChat(chatId)
      setError(null)
    } catch (err) {
      setError(err.message || 'Failed to archive chat')
      console.error('Error archiving chat:', err)
    } finally {
      setLoading(null)
    }
  }

  const handleDelete = async (chatId) => {
    if (window.confirm('Are you sure you want to delete this chat? This action cannot be undone.')) {
      try {
        setLoading('delete')
        await ChatManagementAPI.deleteChat(chatId)
        onDeleteRecent?.(chatId)
        setError(null)
      } catch (err) {
        setError(err.message || 'Failed to delete chat')
        console.error('Error deleting chat:', err)
      } finally {
        setLoading(null)
      }
    }
  }

  const displayName = (userProfile?.username || localStorage.getItem('authUsername') || 'vianan').trim()
  const displayEmail = (userProfile?.email || localStorage.getItem('authEmail') || 'ajnakna@gmail.com').trim()
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'V'

  // Icon Helper (identical to mockup)
  const icon = (paths, extra) => {
    return (
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {paths.map((d, i) => (
          <path d={d} key={i} />
        ))}
        {extra || null}
      </svg>
    )
  }

  const navIcon = (name) => {
    const c = ({ key, ...props }) => <circle key={key || 'c'} {...props} />
    const r = ({ key, ...props }) => <rect key={key || ('r' + (props.x || '') + (props.y || ''))} {...props} />
    switch (name) {
      case 'chats':
        return icon(['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'])
      case 'explore':
        return icon(['M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z'], c({ cx: 12, cy: 12, r: 10 }))
      case 'images':
        return icon(['M21 15l-5-5L5 21'], [r({ x: 3, y: 3, width: 18, height: 18, rx: 2, key: 'r' }), c({ cx: 8.5, cy: 8.5, r: 1.5, key: 'c' })])
      case 'projects':
        return icon([], [r({ x: 3, y: 3, width: 7, height: 7, rx: 1, key: 'r1' }), r({ x: 14, y: 3, width: 7, height: 7, rx: 1, key: 'r2' }), r({ x: 3, y: 14, width: 7, height: 7, rx: 1, key: 'r3' }), r({ x: 14, y: 14, width: 7, height: 7, rx: 1, key: 'r4' })])
      case 'gpts':
        return icon(['M13 2L3 14h9l-1 8 10-12h-9l1-8z'])
      case 'compare':
        return icon([], [r({ x: 3, y: 4, width: 8, height: 16, rx: 1.5, key: 'r1' }), r({ x: 13, y: 4, width: 8, height: 16, rx: 1.5, key: 'r2' })])
      case 'agent':
        return icon(['M4 17l6-5-6-5', 'M12 19h8'])
      default:
        return null
    }
  }

  const gearIcon = (name) => {
    const c = (props) => <circle key="c" {...props} />
    const r = (props) => <rect key="r" {...props} />
    switch (name) {
      case 'gear':
        return icon(['M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'], c({ cx: 12, cy: 12, r: 3 }))
      case 'globe':
        return icon(['M2 12h20', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'], c({ cx: 12, cy: 12, r: 10 }))
      case 'help':
        return icon(['M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4', 'M12 17.5v.1'], c({ cx: 12, cy: 12, r: 9.2 }))
      case 'list':
        return icon(['M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'])
      case 'download':
        return icon(['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'])
      case 'info':
        return icon(['M12 16v-4M12 8h.01'], c({ cx: 12, cy: 12, r: 9.2 }))
      case 'logout':
        return icon(['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'])
      default:
        return null
    }
  }

  const navItemsList = [
    { id: 'chats', label: 'Chats' },
    { id: 'explore', label: 'Explore' },
    { id: 'images', label: 'Images' },
    { id: 'projects', label: 'Projects' },
    { id: 'gpts', label: 'GPTs' },
    { id: 'compare', label: 'Compare' },
  ]

  const filteredChats = recentChats.filter((chat) => {
    const query = searchQuery.toLowerCase()
    if (!query) return true
    const titleMatch = (chat.title || 'New chat').toLowerCase().includes(query)
    const messageMatch = (chat.messages || []).some((msg) => (msg.text || '').toLowerCase().includes(query))
    return titleMatch || messageMatch
  })

  const unfiledChats = filteredChats.filter((chat) => !chat.folderId)

  return (
    <aside style={{ width: '340px', flexShrink: 0, display: 'flex', flexDirection: 'column', background: 'var(--pragna-surface)', borderRight: '1px solid var(--pragna-border)', backdropFilter: 'blur(8px)', height: '100%' }}>
      
      {/* Wordmark logo */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 20px 16px 20px' }}>
        <img src={pragnaLogo} alt="Pragna I-A" style={{ height: '150px', width: '300px', objectFit: 'cover' }} />
        {!onClose && (
          <button
            type="button"
            onClick={toggleSidebar}
            title="Close sidebar"
            style={{ padding: '6px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--pragna-text-muted)', cursor: 'pointer', display: 'flex', flexShrink: 0 }}
            className="hover:bg-[var(--pragna-surface-2)] hover:text-[var(--pragna-gold-soft)]"
          >
            <PanelLeftClose size={18} />
          </button>
        )}
      </div>

      {/* New chat button */}
      <div style={{ padding: '6px 16px 14px 16px' }}>
        <button
          onClick={onNewChat}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '9px',
            padding: '12px 16px',
            borderRadius: '12px',
            border: '1px solid rgba(212,175,55,0.35)',
            background: 'linear-gradient(135deg, rgba(212,175,55,0.16), rgba(184,134,11,0.10))',
            color: 'var(--pragna-gold-soft)',
            fontSize: '14px',
            fontWeight: 600,
            letterSpacing: '0.3px',
            cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.28)',
            transition: 'all 0.15s ease',
          }}
          className="hover:border-accent-500/55 hover:shadow-premium-md hover:from-accent-500/[.26] hover:to-accent-700/[.16] active:scale-[0.98]"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M12 5v14M5 12h14"></path>
          </svg>
          New chat
        </button>
      </div>

      {/* Nav links */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px', padding: '0 12px' }}>
        {navItemsList.map((nav) => {
          const active = activeView === nav.id
          return (
            <button
              key={nav.id}
              onClick={() => handleChangeView(nav.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '13px',
                width: '100%',
                padding: '11px 14px',
                borderRadius: '11px',
                border: active ? '1px solid rgba(212,175,55,0.30)' : '1px solid transparent',
                background: active ? 'linear-gradient(135deg, rgba(212,175,55,0.14), rgba(184,134,11,0.07))' : 'transparent',
                color: active ? 'var(--pragna-gold-soft)' : 'var(--pragna-text-soft)',
                fontSize: '14.5px',
                fontWeight: active ? 650 : 500,
                letterSpacing: '0.2px',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s ease',
              }}
              className="hover:bg-[var(--pragna-surface-2)] hover:text-[var(--pragna-gold-soft)]"
            >
              <span style={{ display: 'flex', width: '20px', height: '20px', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {navIcon(nav.id)}
              </span>
              {nav.label}
            </button>
          )
        })}
      </nav>

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
        <div style={{ padding: '0 10px 10px 10px', position: 'relative' }}>
          <input
            ref={sidebarSearchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats..."
            style={{
              width: '100%',
              padding: '7px 44px 7px 12px',
              borderRadius: '8px',
              border: '1px solid var(--pragna-border)',
              background: 'var(--pragna-surface-2)',
              color: 'var(--pragna-text)',
              fontSize: '13px',
            }}
            className="focus-ring"
          />
          <span
            title="Open command palette (jump to any chat or run an action)"
            style={{
              position: 'absolute',
              right: '18px',
              top: '50%',
              transform: 'translateY(-50%)',
              fontSize: '10.5px',
              fontFamily: 'monospace',
              color: 'var(--pragna-text-muted)',
              background: 'var(--pragna-surface)',
              border: '1px solid var(--pragna-border)',
              borderRadius: '5px',
              padding: '2px 6px',
              pointerEvents: 'none',
            }}
          >
            ⌘K
          </span>
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
                border: '1px solid var(--pragna-border)',
                borderRadius: '8px',
                fontSize: '13px',
                background: 'var(--pragna-surface-2)',
                color: 'var(--pragna-text)',
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
                color: 'var(--pragna-text-muted)',
                fontSize: '12.5px',
                fontWeight: 600,
                cursor: 'pointer',
                width: '100%',
                textAlign: 'left',
              }}
              className="hover:bg-[var(--pragna-surface-2)] hover:text-[var(--pragna-gold-soft)]"
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
                      border: '1px solid var(--pragna-border)',
                      borderRadius: '8px',
                      fontSize: '13px',
                      background: 'var(--pragna-surface-2)',
                      color: 'var(--pragna-text)',
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', fontSize: '11.5px', fontWeight: 700, letterSpacing: '1px', color: 'var(--pragna-text-muted)' }}>
                    <Folder size={13} />
                    <span>{folder.name.toUpperCase()}</span>
                    <span style={{ color: '#6b6152' }}>({folderChats.length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setFolderMenuOpenId(folderMenuOpenId === folder.id ? null : folder.id)}
                    style={{ padding: '2px', borderRadius: '4px', border: 'none', background: 'transparent', color: 'var(--pragna-text-muted)', cursor: 'pointer', display: 'flex' }}
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
                          background: 'var(--pragna-surface)',
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
                          className="hover:bg-[#1e1a10] hover:text-[var(--pragna-gold-soft)]"
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
                      onPdfExport={() => handlePdfExport(chat.id)}
                      onDuplicate={() => handleDuplicate(chat.id)}
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
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '2px', color: 'var(--pragna-text-muted)', padding: '0 14px 10px 14px' }}>
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
                  border: '1px solid var(--pragna-border)',
                  borderRadius: '8px',
                  fontSize: '13px',
                  background: 'var(--pragna-surface-2)',
                  color: 'var(--pragna-text)',
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
                  onPdfExport={() => handlePdfExport(chat.id)}
                  onDuplicate={() => handleDuplicate(chat.id)}
                  onPinChat={() => handlePinChat(chat.id)}
                  onArchive={() => handleArchive(chat.id)}
                  onStartGroupChat={() => handleStartGroupChat(chat.id)}
                />
              )
            ))}
          </div>
        </div>
      </div>

      {/* User footer with menu popup overlay */}
      <div style={{ position: 'relative' }}>
        {userMenuOpen && (
          <>
            {/* Click-out backdrop */}
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 40 }}
              onClick={() => setUserMenuOpen(false)}
            />

            {/* Menu Popup */}
            <div
              ref={userMenuRef}
              style={{
                position: 'absolute',
                bottom: '68px',
                left: '12px',
                width: '244px',
                zIndex: 41,
                padding: '8px',
                borderRadius: '14px',
                background: 'var(--pragna-surface)',
                border: '1px solid rgba(212,175,55,0.22)',
                boxShadow: '0 20px 32px rgba(0,0,0,0.50)',
                animation: 'fadeUp 0.15s ease',
              }}
            >
              {/* Settings */}
              <button
                onClick={() => {
                  setUserMenuOpen(false)
                  onOpenSettings?.()
                }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '11px', padding: '10px 12px', borderRadius: '9px', border: 'none', background: 'transparent', color: '#d8cbb0', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', textAlign: 'left' }}
                className="hover:bg-[#1e1a10] hover:text-[var(--pragna-gold-soft)]"
              >
                <span style={{ display: 'flex', width: '16px', height: '16px', color: 'var(--pragna-text-muted)', flexShrink: 0 }}>
                  {gearIcon('gear')}
                </span>
                <span style={{ flex: 1 }}>Settings</span>
                <span style={{ fontSize: '11px', color: '#6b6152' }}>Ctrl ⇧,</span>
              </button>

              {/* Log out */}
              <button
                onClick={() => {
                  setUserMenuOpen(false)
                  onLogout?.()
                }}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '11px', padding: '10px 12px', borderRadius: '9px', border: 'none', background: 'transparent', color: '#d8cbb0', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', textAlign: 'left' }}
                className="hover:bg-[#1e1a10] hover:text-[var(--pragna-gold-soft)]"
              >
                <span style={{ display: 'flex', width: '16px', height: '16px', color: 'var(--pragna-text-muted)', flexShrink: 0 }}>
                  {gearIcon('logout')}
                </span>
                <span style={{ flex: 1 }}>Log out</span>
              </button>
            </div>
          </>
        )}

        {/* User bar element (clickable to toggle userMenuOpen) */}
        <div
          ref={userButtonRef}
          onClick={() => setUserMenuOpen(!userMenuOpen)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '16px 18px',
            borderTop: '1px solid var(--pragna-border)',
            background: 'var(--pragna-surface-2)',
            cursor: 'pointer',
            transition: 'background 0.15s ease',
          }}
          className="hover:bg-[var(--pragna-surface-2)]"
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #2a2415, var(--pragna-surface-2))',
              border: '1.5px solid rgba(212,175,55,0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--pragna-accent)',
              fontWeight: 700,
              fontSize: '15px',
              flexShrink: 0,
            }}
          >
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--pragna-text)' }}>{displayName}</div>
            <div style={{ fontSize: '12px', color: 'var(--pragna-text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {displayEmail}
            </div>
          </div>
          <button
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '9px',
              border: 'none',
              background: 'transparent',
              color: 'var(--pragna-text-muted)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
              flexShrink: 0,
            }}
            className="hover:bg-[var(--pragna-surface-2)] hover:text-[var(--pragna-gold-soft)]"
          >
            {gearIcon('gear')}
          </button>
        </div>
      </div>
    </aside>
  )
}

export default Sidebar

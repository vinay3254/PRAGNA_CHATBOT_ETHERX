import { useState, useRef, useEffect } from 'react'
import { MoreVertical, Share, Users, Edit2, Pin, Archive, Trash2, Download, Folder, Copy } from 'lucide-react'

const RecentItem = ({
  id,
  title,
  onClick,
  onDelete,
  onRename,
  onShare,
  onExport,
  onDuplicate,
  onPinChat,
  onArchive,
  onStartGroupChat,
  onMoveToFolder,
  folders = [],
  currentFolderId = null,
  active = false,
  isPinned = false
}) => {
  const [showMenu, setShowMenu] = useState(false)
  const [showFolderSubmenu, setShowFolderSubmenu] = useState(false)
  const menuRef = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!showMenu) setShowFolderSubmenu(false)
  }, [showMenu])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target) && !buttonRef.current?.contains(event.target)) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  const handleMenuClick = (e, callback) => {
    e.stopPropagation()
    callback?.()
    setShowMenu(false)
  }

  return (
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
      {/* Icon */}
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? '#f0e6d3' : '#a89878'}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ flexShrink: 0 }}
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      </svg>

      {/* Title */}
      <span
        style={{
          flex: 1,
          fontSize: '13.5px',
          color: active ? '#f0e6d3' : '#a89878',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {title}
      </span>

      {/* Action button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setShowMenu(!showMenu)
        }}
        style={{
          padding: '2px',
          borderRadius: '4px',
          border: 'none',
          background: 'transparent',
          color: '#a89878',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: active ? 1 : 0,
          transition: 'all 0.15s ease',
        }}
        className="group-hover:opacity-100"
        aria-label={`Menu for ${title}`}
      >
        <MoreVertical size={13} />
      </button>

      {showMenu && (
        <div
          ref={menuRef}
          style={{
            position: 'absolute',
            right: '8px',
            top: 'calc(100% + 4px)',
            width: '180px',
            zIndex: 100,
            padding: '4px',
            borderRadius: '10px',
            background: '#141414',
            border: '1px solid rgba(212,175,55,0.22)',
            boxShadow: '0 10px 24px rgba(0,0,0,0.5)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
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

          <button
            onClick={(e) => handleMenuClick(e, onDuplicate)}
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
            <Copy size={14} />
            <span>Duplicate</span>
          </button>

          <button
            onClick={(e) => handleMenuClick(e, onStartGroupChat)}
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
            <Users size={14} />
            <span>Group Chat</span>
          </button>

          <button
            onClick={(e) => handleMenuClick(e, onRename)}
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
            <Edit2 size={14} />
            <span>Rename</span>
          </button>

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

          <button
            onClick={(e) => handleMenuClick(e, onArchive)}
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
            <Archive size={14} />
            <span>Archive</span>
          </button>

          <div style={{ height: '1px', background: '#2d2a24', margin: '4px 0' }} />

          <button
            onClick={(e) => handleMenuClick(e, onDelete)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: '7px',
              border: 'none',
              background: 'transparent',
              color: '#d98b7f',
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
            className="hover:bg-[#301614]"
          >
            <Trash2 size={14} />
            <span>Delete</span>
          </button>
        </div>
      )}
    </div>
  )
}

export default RecentItem

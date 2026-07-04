import { useState } from 'react'
import { 
  Plus, 
  MessageSquare, 
  Compass, 
  Image, 
  LayoutGrid, 
  Settings,
  Zap,
  Globe,
  Terminal
} from 'lucide-react'
import NavItem from './NavItem'
import RecentItem from './RecentItem'
import ChatManagementAPI from '../../api/chatManagement'
import pragnaLogo from '../../assets/pragna-logo-full.png'

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
}) => {
  const [pinnedChats, setPinnedChats] = useState(new Set())
  const [renameDialogId, setRenameDialogId] = useState(null)
  const [newTitle, setNewTitle] = useState('')
  const [loading, setLoading] = useState(null)
  const [error, setError] = useState(null)

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
      // Trigger parent component to update the chat list
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
      const result = await ChatManagementAPI.shareChat(chatId)
      // Copy share URL to clipboard
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
      // Remove from recent chats list
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
        // Call parent delete handler
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

  const displayName = (userProfile?.username || localStorage.getItem('authUsername') || 'User').trim()
  const displayEmail = (userProfile?.email || localStorage.getItem('authEmail') || '').trim()
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'U'

  return (
    <div className="flex h-full flex-col bg-white border-r border-border">
      {/* Header */}
      <div className="p-5 pb-2">
        <div className="flex items-center gap-2 mb-6">
          <img src={pragnaLogo} alt="Pragna" className="header-logo-small" />
          <span className="project-name">PRAGNA I-A</span>
        </div>
        
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 rounded-xl transition-all duration-200 group"
        >
          <Plus size={18} className="text-gray-500 group-hover:text-accent-600" />
          <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">New chat</span>
        </button>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto px-3">
        <div className="space-y-1">
          <NavItem icon={MessageSquare} label="Chats" active={activeView === 'chats'} onClick={() => handleChangeView('chats')} />
          <NavItem icon={Compass} label="Explore" active={activeView === 'explore'} onClick={() => handleChangeView('explore')} />
          <NavItem icon={Image} label="Images" active={activeView === 'images'} onClick={() => handleChangeView('images')} />
          <NavItem icon={LayoutGrid} label="Projects" active={activeView === 'projects'} onClick={() => handleChangeView('projects')} />
          <NavItem icon={Zap} label="GPTs" active={activeView === 'gpts'} onClick={() => handleChangeView('gpts')} />
          <NavItem icon={Globe} label="Intelligence" active={activeView === 'intelligence'} onClick={() => handleChangeView('intelligence')} />
          <NavItem icon={Terminal} label="Agent" active={activeView === 'agent'} onClick={() => handleChangeView('agent')} />
        </div>

        <div className="mt-8">
          <div className="px-3 mb-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
            Recents
          </div>
          <div className="space-y-1">
            {renameDialogId ? (
              <div className="px-2 py-1.5">
                <input
                  autoFocus
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-2 py-1 border border-gray-600 rounded text-sm bg-gray-800 text-white placeholder-gray-500"
                  placeholder="Enter new title"
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
            {recentChats.map(chat => (
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
                  onPinChat={() => handlePinChat(chat.id)}
                  onArchive={() => handleArchive(chat.id)}
                  onStartGroupChat={() => handleStartGroupChat(chat.id)}
                />
              )
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
        >
          <div className="w-7 h-7 bg-accent-100 rounded-full flex items-center justify-center">
            <span className="text-xs font-semibold text-accent-600">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-700">{displayName}</p>
            <p className="text-xs text-gray-400 truncate">{displayEmail || 'Signed in'}</p>
          </div>
          <Settings size={16} className="text-gray-400" />
        </button>
      </div>
    </div>
  )
}

export default Sidebar

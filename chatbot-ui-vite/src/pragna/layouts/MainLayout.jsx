import { useContext, useState } from 'react'
import { Menu, PanelLeft } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { ChatContext } from '../../context/ChatContext'
import { motion, AnimatePresence } from 'framer-motion'

const MainLayout = ({
  children,
  activeView,
  onViewChange,
  recentChats,
  activeChatId,
  onSelectRecent,
  onDeleteRecent,
  onNewChat,
  onLogout,
  userProfile,
  onOpenSettings,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 1024px)')
  const { sidebarOpen, toggleSidebar } = useContext(ChatContext)

  return (
    <div className="pragna-shell flex h-screen overflow-hidden bg-transparent">
      {/* Desktop Sidebar */}
      {isDesktop && sidebarOpen && (
        <div style={{ width: '340px' }} className="flex-shrink-0">
          <Sidebar
            activeView={activeView}
            onViewChange={onViewChange}
            recentChats={recentChats}
            activeChatId={activeChatId}
            onSelectRecent={onSelectRecent}
            onDeleteRecent={onDeleteRecent}
            onNewChat={onNewChat}
            onLogout={onLogout}
            userProfile={userProfile}
            onOpenSettings={onOpenSettings}
          />
        </div>
      )}

      {/* Mobile Sidebar Drawer */}
      <AnimatePresence>
        {!isDesktop && mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25 }}
              className="fixed left-0 top-0 bottom-0 w-80 z-50 shadow-premium-lg"
            >
              <Sidebar
                activeView={activeView}
                onViewChange={onViewChange}
                recentChats={recentChats}
                activeChatId={activeChatId}
                onSelectRecent={onSelectRecent}
                onDeleteRecent={onDeleteRecent}
                onNewChat={onNewChat}
                onLogout={onLogout}
                userProfile={userProfile}
                onOpenSettings={onOpenSettings}
                onClose={() => setMobileMenuOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="relative flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Reopen sidebar button (desktop only, shown when sidebar is closed) */}
        {isDesktop && !sidebarOpen && (
          <button
            onClick={toggleSidebar}
            title="Open sidebar"
            className="fixed top-4 left-4 z-30 p-2 rounded-lg bg-surface/80 backdrop-blur-sm border border-border hover:bg-surface-subtle transition-colors"
          >
            <PanelLeft size={18} className="text-[var(--pragna-text-muted)]" />
          </button>
        )}

        {/* Mobile Header */}
        {!isDesktop && (
          <div className="sticky top-0 z-20 bg-surface/80 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center justify-between">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 -ml-2 rounded-lg hover:bg-surface-subtle transition-colors"
            >
              <Menu size={20} className="text-[var(--pragna-text-muted)]" />
            </button>
            <div className="flex items-center gap-2">
              <div className="w-[26px] h-[26px] rounded-[8px] bg-gradient-to-br from-accent-400 to-accent-700 flex items-center justify-center text-[#0a0a0a] font-extrabold text-xs shadow-[0_2px_8px_rgba(0,0,0,0.28),0_0_14px_rgba(212,175,55,0.25)]">
                P
              </div>
              <span className="text-[13px] font-bold tracking-[1.5px] text-accent-500 whitespace-nowrap">
                PRAGNA I-A
              </span>
            </div>
            <div className="w-8" />
          </div>
        )}
        
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  )
}

export default MainLayout

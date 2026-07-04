import { useState } from 'react'
import { Menu } from 'lucide-react'
import Sidebar from '../components/Sidebar'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { motion, AnimatePresence } from 'framer-motion'
import pragnaLogo from '../../assets/pragna-logo-full.png'

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
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 1024px)')

  return (
    <div className="pragna-shell flex h-screen overflow-hidden bg-[#f8fafc]">
      {/* Desktop Sidebar */}
      {isDesktop && (
        <div className="w-72 flex-shrink-0 border-r border-border bg-white">
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
              className="fixed left-0 top-0 bottom-0 w-80 bg-white z-50 shadow-premium-lg"
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
                onClose={() => setMobileMenuOpen(false)}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="relative flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Mobile Header */}
        {!isDesktop && (
          <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center justify-between">
            <button
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 -ml-2 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <Menu size={20} className="text-gray-600" />
            </button>
            <div className="flex items-center gap-2">
              <img src={pragnaLogo} alt="Pragna" className="header-logo-small" />
              <span className="project-name">PRAGNA I-A</span>
            </div>
            <div className="w-8" />
          </div>
        )}
        
        <main className="flex-1 flex flex-col min-h-0">
          {children}
        </main>
      </div>
    </div>
  )
}

export default MainLayout

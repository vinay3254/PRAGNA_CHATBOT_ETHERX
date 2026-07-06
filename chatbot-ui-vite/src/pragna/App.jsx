import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ChatContext } from '../context/ChatContext'
import { generateAIImage, sendOrchestratedMessage } from '../api/api'
import { normalizeLanguageCode } from '../utils/language'
import MainLayout from './layouts/MainLayout'
import HomePage from './pages/HomePage'
import ImageStudioPage from './pages/ImageStudioPage'
import GptModesPage from './pages/GptModesPage'
import ChatWindow from '../components/chat/ChatWindow'
import InputBar from '../components/input/InputBar'
import GlobalDashboard from '../components/dashboard/GlobalDashboard'
import WorldMonitorDashboard from '../components/dashboard/WorldMonitorDashboard'
import AgentPanel from '../components/agent/AgentPanel'
import SettingsModal from './components/SettingsModal'
import ShortcutsHelpModal from './components/ShortcutsHelpModal'

const IMAGE_REQUEST_RE = /(create|generate|make|design)\s+(an?\s+)?(ai\s+)?image|image\s+of|illustration\s+of|poster\s+of|logo\s+of/i

const extractImagePrompt = (text) => {
  const raw = (text || '').trim()
  if (!raw) return ''
  return raw
    .replace(/^(please\s+)?(create|generate|make|design)\s+(an?\s+)?(ai\s+)?(image|picture|photo|illustration)\s+(of|for)?\s*/i, '')
    .trim() || raw
}

function App({ onLogout, userProfile }) {
  const [activeView, setActiveView] = useState(() => localStorage.getItem('pragna_nav_view') || 'explore')
  const [imagePrompt, setImagePrompt] = useState('')
  const [imageStyle, setImageStyle] = useState('cinematic')
  const [imageQuality, setImageQuality] = useState('hd')
  const [imageSize, setImageSize] = useState('1024x1024')
  const [isGeneratingImage, setIsGeneratingImage] = useState(false)
  const [generatedImage, setGeneratedImage] = useState(null)
  const [imageError, setImageError] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false)

  const {
    chats,
    setChats,
    activeChatId,
    setActiveChatId,
    newChat,
    deleteChat,
    language,
    isLoading,
    setIsLoading,
    chatMode,
    setChatMode,
    sidebarOpen,
    toggleSidebar,
    sidebarSearchInputRef,
  } = useContext(ChatContext)

  useEffect(() => {
    localStorage.setItem('pragna_nav_view', activeView)
  }, [activeView])

  const recentChats = useMemo(() => chats.slice(0, 10), [chats])

  const sendQuickPrompt = useCallback(async (prompt) => {
    if (!prompt?.trim() || isLoading) return

    let targetChatId = activeChatId
    let currentChat = chats.find((c) => c.id === activeChatId)

    if (!targetChatId || !currentChat) {
      const newId = Date.now().toString()
      const newChatObj = {
        id: newId,
        title: 'New chat',
        messages: [],
      }
      setChats((prev) => [newChatObj, ...prev])
      setActiveChatId(newId)
      targetChatId = newId
      currentChat = newChatObj
    }

    const updatedMessages = [...currentChat.messages, { sender: 'user', text: prompt, attachments: [] }]
    const botMsg = { sender: 'bot', text: '', isStreaming: true }

    setChats((prev) =>
      prev.map((c) =>
        c.id === targetChatId ? { ...c, messages: [...updatedMessages, botMsg] } : c
      )
    )
    setActiveView('chats')
    setIsLoading(true)

    try {
      if (IMAGE_REQUEST_RE.test(prompt)) {
        const imageResult = await generateAIImage({
          prompt: extractImagePrompt(prompt),
          style: 'cinematic',
          quality: 'hd',
          size: '1024x1024',
        })

        setIsLoading(false)
        setChats((prev) =>
          prev.map((c) =>
            c.id === targetChatId
              ? {
                  ...c,
                  messages: c.messages.map((m, idx) =>
                    idx === c.messages.length - 1
                      ? {
                          ...m,
                          text: 'Generated image ready.',
                          isStreaming: false,
                          attachments: [
                            {
                              name: `generated-${Date.now()}.png`,
                              type: 'image',
                              previewUrl: imageResult.image,
                            },
                          ],
                        }
                      : m
                  ),
                }
              : c
          )
        )
        return
      }

      const data = await sendOrchestratedMessage(
        prompt,
        normalizeLanguageCode(language),
        targetChatId,
        chatMode
      )
      setIsLoading(false)

      if (data && data.response) {
        const responseText = data.response
        const sources = data.web_search_sources || []

        setChats((prev) =>
          prev.map((c) =>
            c.id === targetChatId
              ? {
                  ...c,
                  messages: c.messages.map((m, idx) =>
                    idx === c.messages.length - 1
                      ? { ...m, text: responseText, isStreaming: false, sources }
                      : m
                  ),
                }
              : c
          )
        )
      } else {
        throw new Error('Invalid response from server')
      }
    } catch (err) {
      setIsLoading(false)
      setChats((prev) =>
        prev.map((c) =>
          c.id === targetChatId
            ? {
                ...c,
                messages: c.messages.map((m, idx) =>
                  idx === c.messages.length - 1
                    ? { ...m, text: 'Server error. Please try again.', isStreaming: false, error: true }
                    : m
                ),
              }
            : c
        )
      )
    }
  }, [activeChatId, chatMode, chats, isLoading, language, setActiveChatId, setChats, setIsLoading])

  const handleNewChat = useCallback(() => {
    newChat()
    setActiveView('chats')
  }, [newChat])

  // Global keyboard shortcuts: Ctrl/Cmd+K focus search, Ctrl/Cmd+Shift+O new chat, Ctrl/Cmd+/ toggle help
  useEffect(() => {
    const handleGlobalKeydown = (e) => {
      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

      const key = e.key.toLowerCase()

      if (key === 'k' && !e.shiftKey) {
        if (settingsOpen || shortcutsHelpOpen) return
        e.preventDefault()
        if (!sidebarOpen) toggleSidebar()
        setTimeout(() => sidebarSearchInputRef.current?.focus(), 0)
      } else if (key === 'o' && e.shiftKey) {
        if (settingsOpen || shortcutsHelpOpen) return
        e.preventDefault()
        handleNewChat()
      } else if (e.key === '/') {
        if (settingsOpen) return
        e.preventDefault()
        setShortcutsHelpOpen((prev) => !prev)
      }
    }
    document.addEventListener('keydown', handleGlobalKeydown)
    return () => document.removeEventListener('keydown', handleGlobalKeydown)
  }, [settingsOpen, shortcutsHelpOpen, sidebarOpen, toggleSidebar, sidebarSearchInputRef, handleNewChat])

  const handleGenerateImage = async () => {
    if (!imagePrompt.trim() || isGeneratingImage) return
    setIsGeneratingImage(true)
    setImageError('')

    try {
      const data = await generateAIImage({
        prompt: imagePrompt.trim(),
        style: imageStyle,
        quality: imageQuality,
        size: imageSize,
      })
      setGeneratedImage(data)
    } catch (err) {
      setImageError(err?.message || 'Image generation failed.')
    } finally {
      setIsGeneratingImage(false)
    }
  }

  const renderView = () => {
    if (activeView === 'chats') {
      return (
        <>
          <ChatWindow />
          <InputBar />
        </>
      )
    }

    if (activeView === 'projects') {
      return <GlobalDashboard />
    }

    if (activeView === 'gpts') {
      return (
        <GptModesPage
          chatMode={chatMode}
          onSelectMode={(modeId) => {
            setChatMode(modeId)
            setActiveView('chats')
          }}
        />
      )
    }

    if (activeView === 'images') {
      return (
        <ImageStudioPage
          imagePrompt={imagePrompt}
          setImagePrompt={setImagePrompt}
          imageStyle={imageStyle}
          setImageStyle={setImageStyle}
          imageQuality={imageQuality}
          setImageQuality={setImageQuality}
          imageSize={imageSize}
          setImageSize={setImageSize}
          isGeneratingImage={isGeneratingImage}
          generatedImage={generatedImage}
          imageError={imageError}
          onGenerate={handleGenerateImage}
          onSendToChat={() =>
            sendQuickPrompt(`Create an image prompt for: ${imagePrompt || 'a cinematic visual concept'}`)
          }
        />
      )
    }

    if (activeView === 'intelligence') {
      return <WorldMonitorDashboard />
    }

    if (activeView === 'agent') {
      return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
          <AgentPanel />
        </div>
      )
    }

    return <HomePage onUsePrompt={sendQuickPrompt} userProfile={userProfile} />
  }

  return (
    <>
      <MainLayout
        activeView={activeView}
        onViewChange={setActiveView}
        recentChats={recentChats}
        activeChatId={activeChatId}
        onSelectRecent={setActiveChatId}
        onDeleteRecent={deleteChat}
        onNewChat={handleNewChat}
        onLogout={onLogout}
        userProfile={userProfile}
        onOpenSettings={() => setSettingsOpen(true)}
      >
        {renderView()}
      </MainLayout>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onLogout={onLogout}
        userProfile={userProfile}
      />

      <ShortcutsHelpModal
        isOpen={shortcutsHelpOpen}
        onClose={() => setShortcutsHelpOpen(false)}
      />
    </>
  )
}

export default App

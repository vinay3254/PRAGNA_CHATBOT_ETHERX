import { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ChatContext } from '../context/ChatContext'
import { generateAIImage, sendOrchestratedMessage } from '../api/api'
import { normalizeLanguageCode } from '../utils/language'
import MainLayout from './layouts/MainLayout'
import HomePage from './pages/HomePage'
import ChatWindow from '../components/chat/ChatWindow'
import InputBar from '../components/input/InputBar'
import GlobalDashboard from '../components/dashboard/GlobalDashboard'
import WorldMonitorDashboard from '../components/dashboard/WorldMonitorDashboard'
import AgentPanel from '../components/agent/AgentPanel'

const CHAT_MODE_ITEMS = [
  { id: 'general', label: 'General', description: 'Standard helpful assistant' },
  { id: 'explain_concepts', label: 'Explain', description: 'Break down complex ideas' },
  { id: 'generate_ideas', label: 'Ideas', description: 'Creative brainstorming' },
  { id: 'write_content', label: 'Write', description: 'Professional writing' },
  { id: 'code_assistance', label: 'Code', description: 'Programming help' },
  { id: 'ask_questions', label: 'Questions', description: 'Curious inquiry' },
  { id: 'creative_writing', label: 'Story', description: 'Storytelling and narrative' },
]

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

  const handleNewChat = () => {
    newChat()
    setActiveView('chats')
  }

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
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Pragna GPT Modes</h2>
          <p className="text-gray-600 mb-6">Choose a specialized behavior profile for your assistant.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CHAT_MODE_ITEMS.map((mode) => (
              <button
                key={mode.id}
                onClick={() => {
                  setChatMode(mode.id)
                  setActiveView('chats')
                }}
                className={`text-left p-4 rounded-xl border transition-all ${
                  chatMode === mode.id
                    ? 'border-accent-500 bg-accent-50 shadow-premium-sm'
                    : 'border-border bg-white hover:shadow-premium-sm'
                }`}
              >
                <div className="font-semibold text-gray-800">{mode.label}</div>
                <div className="text-sm text-gray-500 mt-1">{mode.description}</div>
              </button>
            ))}
          </div>
        </div>
      )
    }

    if (activeView === 'images') {
      return (
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <h2 className="text-2xl font-semibold text-gray-100 mb-2">Image Studio</h2>
          <p className="text-gray-400 mb-6">Generate production-quality AI images with style and quality controls.</p>

          <div className="bg-[#0f1219]/90 border border-[#2f3b52] rounded-2xl p-5 shadow-premium-sm space-y-4 backdrop-blur-sm">
            <textarea
              value={imagePrompt}
              onChange={(e) => setImagePrompt(e.target.value)}
              placeholder="Describe the image in detail. Example: A hyper-real product photo of a matte black smartwatch on floating glass with soft studio light."
              className="w-full min-h-[120px] rounded-xl border border-[#2f4f86] bg-[#131b2a] px-4 py-3 text-sm text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#e2b84b]/70 focus:border-[#e2b84b]"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <select
                value={imageStyle}
                onChange={(e) => setImageStyle(e.target.value)}
                className="rounded-lg border border-[#2f3b52] px-3 py-2 text-sm bg-[#121722] text-gray-100"
              >
                <option value="cinematic">Cinematic</option>
                <option value="photo">Photoreal</option>
                <option value="illustration">Illustration</option>
                <option value="concept_art">Concept Art</option>
                <option value="product">Product</option>
              </select>

              <select
                value={imageQuality}
                onChange={(e) => setImageQuality(e.target.value)}
                className="rounded-lg border border-[#2f3b52] px-3 py-2 text-sm bg-[#121722] text-gray-100"
              >
                <option value="hd">HD</option>
                <option value="standard">Standard</option>
              </select>

              <select
                value={imageSize}
                onChange={(e) => setImageSize(e.target.value)}
                className="rounded-lg border border-[#2f3b52] px-3 py-2 text-sm bg-[#121722] text-gray-100"
              >
                <option value="1024x1024">Square (1024x1024)</option>
                <option value="1024x1536">Portrait (1024x1536)</option>
                <option value="1536x1024">Landscape (1536x1024)</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={handleGenerateImage}
                disabled={isGeneratingImage || !imagePrompt.trim()}
                className="px-4 py-2 rounded-lg bg-[#c8a53e] text-[#1a1306] text-sm font-semibold disabled:opacity-50 hover:bg-[#d9b758]"
              >
                {isGeneratingImage ? 'Generating...' : 'Generate Image'}
              </button>

              <button
                onClick={() => sendQuickPrompt(`Create an image prompt for: ${imagePrompt || 'a cinematic visual concept'}`)}
                className="px-4 py-2 rounded-lg border border-[#39445d] text-sm text-gray-200 hover:bg-[#1a2233]"
              >
                Send Prompt to Chat
              </button>
            </div>

            {imageError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                {imageError}
              </div>
            )}

            {generatedImage?.image && (
              <div className="space-y-3">
                <img
                  src={generatedImage.image}
                  alt="Generated AI"
                  className="w-full rounded-xl border border-[#2f3b52] object-cover"
                />
                <div className="flex items-center gap-3">
                  <a
                    href={generatedImage.image}
                    download="pragna-generated-image.png"
                    className="px-4 py-2 rounded-lg border border-[#39445d] text-sm text-gray-200 hover:bg-[#1a2233]"
                  >
                    Download
                  </a>
                  <span className="text-xs text-gray-400">
                    Model: {generatedImage.model} | {generatedImage.style} | {generatedImage.size}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
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
    >
      {renderView()}
    </MainLayout>
  )
}

export default App

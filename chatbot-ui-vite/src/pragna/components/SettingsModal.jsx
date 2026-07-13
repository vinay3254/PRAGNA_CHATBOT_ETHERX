import { useState, useEffect, useContext } from 'react'
import { ChatContext } from '../../context/ChatContext'
import { getModelsCatalog, createPersona, updatePersona, deletePersona } from '../../api/api'

const SettingsModal = ({ isOpen, onClose, onLogout, userProfile }) => {
  const [activeTab, setActiveTab] = useState('General')
  const { theme, setTheme, personas, refreshPersonas } = useContext(ChatContext)

  // Settings States matching mockup
  const [userName, setUserName] = useState(() => userProfile?.username || localStorage.getItem('authUsername') || 'vianan')
  const [nickname, setNickname] = useState('')
  const [instructions, setInstructions] = useState('')
  const [accent, setAccent] = useState('#d4af37')
  const [chatFont, setChatFont] = useState('Default (Segoe UI)')
  const [locationMeta, setLocationMeta] = useState(true)
  const [improveModels, setImproveModels] = useState(true)
  const [usageCredits, setUsageCredits] = useState(false)
  const [searchChats, setSearchChats] = useState(true)
  const [genMemory, setGenMemory] = useState(true)
  const [toolAccessMode, setToolAccessMode] = useState('Load tools when needed')
  const [modelProfile, setModelProfile] = useState(() => localStorage.getItem('pragna_model_profile') || 'basic')
  const [modelCatalog, setModelCatalog] = useState(null)
  const [modelCatalogError, setModelCatalogError] = useState(false)
  const modelCatalogLoading = isOpen && activeTab === 'Model' && !modelCatalog && !modelCatalogError

  const [personaFormOpen, setPersonaFormOpen] = useState(false)
  const [editingPersonaId, setEditingPersonaId] = useState(null)
  const [personaName, setPersonaName] = useState('')
  const [personaPrompt, setPersonaPrompt] = useState('')
  const [personaSaving, setPersonaSaving] = useState(false)
  const [personaError, setPersonaError] = useState('')

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen || activeTab !== 'Model' || modelCatalog || modelCatalogError) return
    getModelsCatalog()
      .then((data) => setModelCatalog(data))
      .catch((err) => {
        console.warn('Models catalog unavailable:', err)
        setModelCatalogError(true)
      })
  }, [isOpen, activeTab, modelCatalog, modelCatalogError])

  useEffect(() => {
    if (isOpen && activeTab === 'Personas') {
      refreshPersonas()
    }
    // refreshPersonas is intentionally omitted below: it's re-created on every ChatProvider render
    // (not memoized), so including it would re-trigger this effect on every fetch and cause a
    // request loop. Only isOpen/activeTab transitions should refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab])

  const handleModelProfileChange = (profile) => {
    setModelProfile(profile)
    localStorage.setItem('pragna_model_profile', profile)
  }

  const openNewPersonaForm = () => {
    setEditingPersonaId(null)
    setPersonaName('')
    setPersonaPrompt('')
    setPersonaError('')
    setPersonaFormOpen(true)
  }

  const openEditPersonaForm = (persona) => {
    setEditingPersonaId(persona.id)
    setPersonaName(persona.name)
    setPersonaPrompt(persona.system_prompt)
    setPersonaError('')
    setPersonaFormOpen(true)
  }

  const closePersonaForm = () => {
    setPersonaFormOpen(false)
    setEditingPersonaId(null)
  }

  const savePersona = async () => {
    const name = personaName.trim()
    const systemPrompt = personaPrompt.trim()
    if (!name || !systemPrompt) {
      setPersonaError('Both a name and a system prompt are required.')
      return
    }
    setPersonaSaving(true)
    setPersonaError('')
    try {
      if (editingPersonaId) {
        await updatePersona(editingPersonaId, { name, system_prompt: systemPrompt })
      } else {
        await createPersona({ name, system_prompt: systemPrompt })
      }
      await refreshPersonas()
      closePersonaForm()
    } catch (err) {
      setPersonaError(err.message || 'Failed to save persona.')
    } finally {
      setPersonaSaving(false)
    }
  }

  const removePersona = async (persona) => {
    try {
      await deletePersona(persona.id)
      await refreshPersonas()
    } catch (err) {
      console.warn('Failed to delete persona:', err)
    }
  }

  if (!isOpen) return null

  const userInitial = (userName[0] || 'U').toUpperCase()

  // Icon helper matching sidebar / mockup
  const icon = (paths, extra) => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      {paths.map((d, i) => <path d={d} key={i} />)}
      {extra || null}
    </svg>
  )

  const cCircle = (props) => <circle key="c" {...props} />
  const rRect = (props) => <rect key="r" {...props} />

  const gearIcon = (name) => {
    switch (name) {
      case 'gear':
        return icon(['M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z'], cCircle({ cx: 12, cy: 12, r: 3 }))
      case 'globe':
        return icon(['M2 12h20', 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z'], cCircle({ cx: 12, cy: 12, r: 10 }))
      case 'help':
        return icon(['M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4', 'M12 17.5v.1'], cCircle({ cx: 12, cy: 12, r: 9.2 }))
      case 'list':
        return icon(['M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01'])
      case 'download':
        return icon(['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'])
      case 'info':
        return icon(['M12 16v-4M12 8h.01'], cCircle({ cx: 12, cy: 12, r: 9.2 }))
      case 'logout':
        return icon(['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'])
      case 'account':
        return icon(['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2'], cCircle({ cx: 12, cy: 7, r: 4 }))
      case 'shield':
        return icon(['M12 2l8 3v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V5z'])
      case 'card':
        return icon(['M2 10h20'], rRect({ x: 2, y: 5, width: 20, height: 14, rx: 2 }))
      case 'chart':
        return icon(['M18 20V10M12 20V4M6 20v-6'])
      case 'puzzle':
        return icon(['M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.3 2.3 0 0 1 0 4.6H2V19a2 2 0 0 0 2 2h3.8v-1.5a2.3 2.3 0 0 1 4.6 0V21H16a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z'])
      case 'code':
        return icon(['M16 18l6-6-6-6M8 6l-6 6 6 6'])
      case 'monitor':
        return icon(['M8 21h8M12 17v4'], rRect({ x: 2, y: 3, width: 20, height: 14, rx: 2 }))
      case 'sun':
        return icon(['M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4'], cCircle({ cx: 12, cy: 12, r: 5 }))
      case 'moon':
        return icon(['M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z'])
      default:
        return null
    }
  }

  const tabs = [
    { label: 'General', icon: 'gear' },
    { label: 'Account', icon: 'account' },
    { label: 'Privacy', icon: 'shield' },
    { label: 'Billing', icon: 'card' },
    { label: 'Usage', icon: 'chart' },
    { label: 'Model', icon: 'puzzle' },
    { label: 'Personas', icon: 'account' },
    { label: 'Capabilities', icon: 'puzzle' },
    { label: 'Connectors', icon: 'puzzle' },
    { label: 'Pragna Code', icon: 'code' },
  ]

  const appearanceOpts = [
    { key: 'system', icon: 'monitor' },
    { key: 'light', icon: 'sun' },
    { key: 'dark', icon: 'moon' },
  ]

  const accentOpts = ['#d4af37', '#e5c76b', '#b8860b', '#8a6d3b']

  const activeSessions = [
    { device: 'Chrome Mobile (Android)', current: false, location: 'Bengaluru, Karnataka, IN', created: 'Jul 4, 2026, 3:26 PM', updated: 'Jul 4, 2026, 3:26 PM' },
    { device: 'Pragna Desktop (Windows)', current: false, location: 'Bengaluru, Karnataka, IN', created: 'Jul 4, 2026, 10:00 AM', updated: 'Jul 4, 2026, 10:00 AM' },
    { device: 'Edge (Windows)', current: false, location: 'Bengaluru, Karnataka, IN', created: 'Jul 4, 2026, 9:50 AM', updated: 'Jul 4, 2026, 9:50 AM' },
    { device: 'Chrome (Windows)', current: true, location: 'Bengaluru, Karnataka, IN', created: 'Jun 29, 2026, 10:04 AM', updated: 'Jul 4, 2026, 4:00 PM' },
  ]

  const usageMeters = [
    { label: 'All models', resets: 'Resets Wed 3:30 AM', pct: '18%' },
    { label: 'Fable', resets: 'Resets Wed 3:30 AM', pct: '3%' },
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0 }}></div>
      <div style={{ position: 'relative', width: 'min(920px, 92vw)', height: 'min(680px, 88vh)', display: 'flex', borderRadius: '20px', overflow: 'hidden', background: '#141414', border: '1px solid rgba(212,175,55,0.2)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
        
        {/* Settings Left Nav */}
        <div style={{ width: '232px', flexShrink: 0, padding: '22px 14px', background: 'rgba(10,10,10,0.5)', borderRight: '1px solid #2d2a24', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignMeters: 'center', gap: '9px', padding: '8px 10px 18px 10px', alignItems: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a89878" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.35-4.35"></path></svg>
            <span style={{ fontSize: '13px', color: '#a89878', whiteSpace: 'nowrap' }}>Search settings</span>
          </div>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1px', color: '#a89878', padding: '0 10px 8px 10px' }}>SETTINGS</div>
          {tabs.map((tab) => {
            const active = activeTab === tab.label
            return (
              <button
                key={tab.label}
                onClick={() => setActiveTab(tab.label)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '11px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: 'none',
                  background: active ? 'linear-gradient(135deg, rgba(212,175,55,0.16), rgba(184,134,11,0.08))' : 'transparent',
                  color: active ? '#e5c76b' : '#c9bda2',
                  fontSize: '13.5px',
                  fontWeight: active ? 650 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
                className="hover:bg-[#1a1a1a] hover:text-[#e5c76b]"
              >
                <span style={{ display: 'flex', width: '16px', height: '16px', flexShrink: 0 }}>
                  {gearIcon(tab.icon)}
                </span>
                {tab.label}
              </button>
            )
          })}
        </div>

        {/* Settings Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '30px 40px', minWidth: 0, position: 'relative' }}>
          
          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '9px',
              border: 'none',
              background: 'transparent',
              color: '#a89878',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
              position: 'absolute',
              top: '24px',
              right: '28px',
              zIndex: 10,
            }}
            className="hover:bg-[#1a1a1a] hover:text-[#e5c76b]"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>

          {/* GENERAL / PROFILE TAB */}
          {activeTab === 'General' && (
            <div style={{ animation: 'fadeUp 0.15s ease' }}>
              <h2 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: 700, color: '#f0e6d3' }}>Profile</h2>

              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '30px' }}>
                <div style={{ fontSize: '13px', color: '#a89878', width: '110px', flexShrink: 0 }}>Avatar</div>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'linear-gradient(135deg, #2a2415, #1a1a1a)', border: '1.5px solid rgba(212,175,55,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#d4af37', fontWeight: 700, fontSize: '19px' }}>
                  {userInitial}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', color: '#a89878', width: '110px', flexShrink: 0 }}>Full name</div>
                <input
                  value={userName}
                  onChange={(e) => {
                    setUserName(e.target.value)
                    localStorage.setItem('authUsername', e.target.value)
                  }}
                  style={{ flex: 1, padding: '11px 14px', borderRadius: '10px', border: '1px solid #2d2a24', background: '#1a1a1a', color: '#f0e6d3', fontFamily: 'inherit', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', marginBottom: '30px' }}>
                <div style={{ fontSize: '13px', color: '#a89878', width: '110px', flexShrink: 0, paddingTop: '11px' }}>Nickname</div>
                <input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="What should Pragna call you?"
                  style={{ flex: 1, padding: '11px 14px', borderRadius: '10px', border: '1px solid #2d2a24', background: '#1a1a1a', color: '#f0e6d3', fontFamily: 'inherit', fontSize: '14px' }}
                />
              </div>

              <div style={{ marginBottom: '30px' }}>
                <div style={{ fontSize: '14px', fontWeight: 650, color: '#f0e6d3', marginBottom: '4px' }}>Instructions for Pragna</div>
                <p style={{ margin: '0 0 12px 0', fontSize: '12.5px', color: '#a89878' }}>Pragna keeps these in mind across chats.</p>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. I primarily code in Python (not a beginner)"
                  rows="3"
                  style={{ width: '100%', resize: 'vertical', padding: '13px 14px', borderRadius: '12px', border: '1px solid #2d2a24', background: '#1a1a1a', color: '#f0e6d3', fontFamily: 'inherit', fontSize: '14px', lineHeight: 1.5 }}
                />
              </div>

              <div style={{ height: '1px', background: '#2d2a24', marginBottom: '26px' }}></div>

              <h3 style={{ margin: '0 0 18px 0', fontSize: '15px', fontWeight: 700, color: '#f0e6d3' }}>Preferences</h3>

              {/* Appearance selection */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '22px' }}>
                <div style={{ fontSize: '13px', color: '#a89878', width: '110px', flexShrink: 0 }}>Appearance</div>
                <div style={{ display: 'flex', gap: '4px', padding: '4px', borderRadius: '11px', background: '#1a1a1a', border: '1px solid #2d2a24' }}>
                  {appearanceOpts.map((opt) => {
                    const active = theme === opt.key
                    return (
                      <button
                        key={opt.key}
                        onClick={() => setTheme(opt.key)}
                        style={{
                          width: '40px',
                          height: '32px',
                          borderRadius: '8px',
                          border: 'none',
                          background: active ? 'rgba(212,175,55,0.18)' : 'transparent',
                          color: active ? '#e5c76b' : '#a89878',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {gearIcon(opt.icon)}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Accent selection */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '22px' }}>
                <div style={{ fontSize: '13px', color: '#a89878', width: '110px', flexShrink: 0 }}>Accent color</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {accentOpts.map((hex) => {
                    const active = accent === hex
                    return (
                      <button
                        key={hex}
                        onClick={() => setAccent(hex)}
                        style={{
                          width: '26px',
                          height: '26px',
                          borderRadius: '50%',
                          border: `2px solid ${active ? '#f0e6d3' : 'transparent'}`,
                          background: hex,
                          cursor: 'pointer',
                          padding: 0,
                        }}
                      />
                    )
                  })}
                </div>
              </div>

              {/* Font selection */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ fontSize: '13px', color: '#a89878', width: '110px', flexShrink: 0 }}>Chat font</div>
                <select
                  value={chatFont}
                  onChange={(e) => setChatFont(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #2d2a24', background: '#1a1a1a', color: '#f0e6d3', fontFamily: 'inherit', fontSize: '13.5px', cursor: 'pointer' }}
                >
                  <option>Default (Segoe UI)</option>
                  <option>Serif</option>
                  <option>Monospace</option>
                </select>
              </div>
            </div>
          )}

          {/* ACCOUNT TAB */}
          {activeTab === 'Account' && (
            <div style={{ animation: 'fadeUp 0.15s ease' }}>
              <div style={{ marginBottom: '34px' }}>
                <h2 style={{ margin: '0 0 8px 0', fontSize: '18px', fontWeight: 700, color: '#f0e6d3' }}>Trusted devices</h2>
                <p style={{ margin: '0 0 18px 0', fontSize: '13px', color: '#a89878' }}>Devices that can control your local machine through remote sessions.</p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', padding: '10px 0', borderBottom: '1px solid #2d2a24', fontSize: '12px', color: '#a89878', fontWeight: 650 }}>
                  <div>Device</div>
                  <div>Added</div>
                </div>
                <div style={{ padding: '30px 0', textAlign: 'center', fontSize: '13.5px', color: '#a89878' }}>No trusted devices.</div>
              </div>

              <div>
                <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 700, color: '#f0e6d3' }}>Active sessions</h2>
                <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.3fr 1fr 1fr', padding: '10px 0', borderBottom: '1px solid #2d2a24', fontSize: '12px', color: '#a89878', fontWeight: 650 }}>
                  <div>Device</div>
                  <div>Location</div>
                  <div>Created</div>
                  <div>Updated</div>
                </div>
                {activeSessions.map((sess, idx) => (
                  <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.3fr 1fr 1fr', padding: '14px 0', borderBottom: '1px solid #201d18', fontSize: '13px', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f0e6d3', fontWeight: 600 }}>
                      {sess.device}
                      {sess.current && (
                        <span style={{ fontSize: '10.5px', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: 'rgba(212,175,55,0.18)', color: '#e5c76b' }}>Current</span>
                      )}
                    </div>
                    <div style={{ color: '#a89878' }}>{sess.location}</div>
                    <div style={{ color: '#a89878' }}>{sess.created}</div>
                    <div style={{ color: '#a89878' }}>{sess.updated}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: '30px', borderTop: '1px solid #2d2a24', paddingTop: '20px' }}>
                <button
                  onClick={onLogout}
                  style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid rgba(220,110,100,0.35)', background: 'rgba(220,110,100,0.10)', color: '#e8a598', fontSize: '13.5px', fontWeight: 650, cursor: 'pointer' }}
                >
                  Log out current session
                </button>
              </div>
            </div>
          )}

          {/* PRIVACY TAB */}
          {activeTab === 'Privacy' && (
            <div style={{ animation: 'fadeUp 0.15s ease' }}>
              <h2 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: 700, color: '#f0e6d3' }}>Privacy</h2>
              <p style={{ margin: '0 0 26px 0', fontSize: '13.5px', color: '#a89878', lineHeight: 1.6 }}>Pragna believes in transparent data practices. Learn how your information is handled, and visit our <span style={{ color: '#d4af37', textDecoration: 'underline', cursor: 'pointer' }}>Privacy Center</span> and <span style={{ color: '#d4af37', textDecoration: 'underline', cursor: 'pointer' }}>Privacy Policy</span> for more details.</p>

              <button style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0', border: 'none', borderBottom: '1px solid #2d2a24', background: 'transparent', color: '#f0e6d3', fontSize: '14.5px', fontWeight: 650, cursor: 'pointer', textAlign: 'left' }}>
                How we protect your data <span style={{ color: '#a89878' }}>›</span>
              </button>
              <button style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 0', border: 'none', borderBottom: '1px solid #2d2a24', background: 'transparent', color: '#f0e6d3', fontSize: '14.5px', fontWeight: 650, cursor: 'pointer', textAlign: 'left', marginBottom: '26px' }}>
                How we use your data <span style={{ color: '#a89878' }}>›</span>
              </button>

              <h3 style={{ margin: '0 0 18px 0', fontSize: '15px', fontWeight: 700, color: '#f0e6d3' }}>Preferences</h3>
              
              {/* Location metadata toggle */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', marginBottom: '22px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 650, color: '#f0e6d3', marginBottom: '4px' }}>Location metadata</div>
                  <div style={{ fontSize: '12.5px', color: '#a89878', maxWidth: '460px', lineHeight: 1.5 }}>Allow Pragna to use coarse location metadata to improve responses.</div>
                </div>
                <button
                  onClick={() => setLocationMeta(!locationMeta)}
                  style={{ width: '42px', height: '24px', borderRadius: '999px', border: 'none', background: locationMeta ? '#d4af37' : '#2d2a24', cursor: 'pointer', flexShrink: 0, position: 'relative', padding: 0, marginTop: '2px' }}
                >
                  <span style={{ position: 'absolute', top: '2px', left: locationMeta ? '20px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s ease' }}></span>
                </button>
              </div>

              {/* Improve models toggle */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifycontent: 'space-between', justifyContent: 'space-between', gap: '20px', marginBottom: '30px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 650, color: '#f0e6d3', marginBottom: '4px' }}>Help improve our AI models</div>
                  <div style={{ fontSize: '12.5px', color: '#a89878', maxWidth: '460px', lineHeight: 1.5 }}>Allow the use of your chats to help train and improve Pragna.</div>
                </div>
                <button
                  onClick={() => setImproveModels(!improveModels)}
                  style={{ width: '42px', height: '24px', borderRadius: '999px', border: 'none', background: improveModels ? '#d4af37' : '#2d2a24', cursor: 'pointer', flexShrink: 0, position: 'relative', padding: 0, marginTop: '2px' }}
                >
                  <span style={{ position: 'absolute', top: '2px', left: improveModels ? '20px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s ease' }}></span>
                </button>
              </div>

              <h3 style={{ margin: '0 0 16px 0', fontSize: '15px', fontWeight: 700, color: '#f0e6d3' }}>Your data</h3>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid #2d2a24' }}>
                <span style={{ fontSize: '14px', color: '#f0e6d3' }}>Export data</span>
                <button style={{ padding: '8px 18px', borderRadius: '10px', border: '1px solid #2d2a24', background: '#1a1a1a', color: '#f0e6d3', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Export data</button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid #2d2a24' }}>
                <span style={{ fontSize: '14px', color: '#f0e6d3' }}>Shared chats</span>
                <button style={{ padding: '8px 18px', borderRadius: '10px', border: '1px solid #2d2a24', background: '#1a1a1a', color: '#f0e6d3', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}>Manage</button>
              </div>
            </div>
          )}

          {/* BILLING TAB */}
          {activeTab === 'Billing' && (
            <div style={{ animation: 'fadeUp 0.15s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '30px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div style={{ width: '46px', height: '46px', borderRadius: '12px', background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.3)', display: 'flex', alignItems: 'center', justifycontent: 'center', justifyContent: 'center' }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#d4af37" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"></path></svg>
                  </div>
                  <div>
                    <div style={{ fontSize: '17px', fontWeight: 700, color: '#f0e6d3' }}>Pro plan</div>
                    <div style={{ fontSize: '13px', color: '#a89878' }}>Monthly</div>
                  </div>
                </div>
                <button style={{ padding: '10px 20px', borderRadius: '10px', border: '1px solid rgba(212,175,55,0.35)', background: 'rgba(212,175,55,0.10)', color: '#e5c76b', fontSize: '13.5px', fontWeight: 650, cursor: 'pointer' }}>Adjust plan</button>
              </div>
              <div style={{ paddingTop: '20px', borderTop: '1px solid #2d2a24' }}>
                <div style={{ fontSize: '14.5px', fontWeight: 650, color: '#f0e6d3', marginBottom: '8px' }}>Manage subscription</div>
                <p style={{ margin: 0, fontSize: '13px', color: '#a89878', lineHeight: 1.6 }}>View invoices and update payment details from your billing portal.</p>
              </div>
            </div>
          )}

          {/* USAGE TAB */}
          {activeTab === 'Usage' && (
            <div style={{ animation: 'fadeUp 0.15s ease' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '24px' }}>
                <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 700, color: '#f0e6d3' }}>Plan usage limits</h2>
                <span style={{ fontSize: '12.5px', fontWeight: 650, color: '#d4af37' }}>Pro</span>
              </div>

              <div style={{ marginBottom: '26px' }}>
                <div style={{ fontSize: '14px', fontWeight: 650, color: '#f0e6d3', marginBottom: '2px' }}>Current session</div>
                <div style={{ fontSize: '12.5px', color: '#a89878', marginBottom: '10px' }}>Resets in 3 hr 30 min</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <div style={{ flex: 1, height: '6px', borderRadius: '999px', background: '#1a1a1a', overflow: 'hidden' }}>
                    <div style={{ width: '73%', height: '100%', background: 'linear-gradient(90deg, #e5c76b, #d4af37)' }}></div>
                  </div>
                  <span style={{ fontSize: '12.5px', color: '#a89878', flexShrink: 0 }}>73% used</span>
                </div>
              </div>

              <h3 style={{ margin: '0 0 6px 0', fontSize: '15px', fontWeight: 700, color: '#f0e6d3' }}>Weekly limits</h3>
              <div style={{ fontSize: '12.5px', color: '#d4af37', textDecoration: 'underline', cursor: 'pointer', marginBottom: '18px' }}>Learn more about usage limits</div>

              {usageMeters.map((um) => (
                <div key={um.label} style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '14px', fontWeight: 650, color: '#f0e6d3', marginBottom: '2px' }}>{um.label}</div>
                  <div style={{ fontSize: '12.5px', color: '#a89878', marginBottom: '10px' }}>{um.resets}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{ flex: 1, height: '6px', borderRadius: '999px', background: '#1a1a1a', overflow: 'hidden' }}>
                      <div style={{ width: um.pct, height: '100%', background: 'linear-gradient(90deg, #e5c76b, #d4af37)' }}></div>
                    </div>
                    <span style={{ fontSize: '12.5px', color: '#a89878', flexShrink: 0 }}>{um.pct} used</span>
                  </div>
                </div>
              ))}

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', color: '#a89878', margin: '18px 0 30px 0' }}>
                Last updated: just now
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a89878" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M23 4v6h-6M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
              </div>

              <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 700, color: '#f0e6d3' }}>Usage credits</h3>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px' }}>
                <div style={{ fontSize: '13px', color: '#a89878', maxWidth: '460px', lineHeight: 1.5 }}>Turn on usage credits to keep using Pragna if you hit a limit.</div>
                <button
                  onClick={() => setUsageCredits(!usageCredits)}
                  style={{ width: '42px', height: '24px', borderRadius: '999px', border: 'none', background: usageCredits ? '#d4af37' : '#2d2a24', cursor: 'pointer', flexShrink: 0, position: 'relative', padding: 0 }}
                >
                  <span style={{ position: 'absolute', top: '2px', left: usageCredits ? '20px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s ease' }}></span>
                </button>
              </div>
            </div>
          )}

          {/* MODEL TAB */}
          {activeTab === 'Model' && (
            <div style={{ animation: 'fadeUp 0.15s ease' }}>
              <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 700, color: '#f0e6d3' }}>Model</h2>
              <p style={{ margin: '0 0 26px 0', fontSize: '13.5px', color: '#a89878', lineHeight: 1.6 }}>Choose how much model power Pragna uses for new messages.</p>

              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '22px' }}>
                <div style={{ fontSize: '13px', color: '#a89878', width: '110px', flexShrink: 0 }}>Profile</div>
                <div style={{ display: 'flex', gap: '4px', padding: '4px', borderRadius: '11px', background: '#1a1a1a', border: '1px solid #2d2a24' }}>
                  {['basic', 'pro'].map((profile) => {
                    const active = modelProfile === profile
                    return (
                      <button
                        key={profile}
                        onClick={() => handleModelProfileChange(profile)}
                        style={{
                          padding: '8px 18px',
                          borderRadius: '8px',
                          border: 'none',
                          background: active ? 'rgba(212,175,55,0.18)' : 'transparent',
                          color: active ? '#e5c76b' : '#a89878',
                          fontSize: '13px',
                          fontWeight: active ? 650 : 500,
                          cursor: 'pointer',
                          textTransform: 'capitalize',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {profile}
                      </button>
                    )
                  })}
                </div>
              </div>

              {modelCatalogLoading && (
                <div style={{ fontSize: '13px', color: '#a89878' }}>Loading model catalog…</div>
              )}

              {modelCatalog && (
                <>
                  <div style={{ height: '1px', background: '#2d2a24', margin: '22px 0' }}></div>
                  <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 700, color: '#f0e6d3' }}>Server default</h3>
                  <div style={{ fontSize: '13px', color: '#d8cbb0', marginBottom: '18px' }}>{modelCatalog.default_model_key}</div>

                  <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 700, color: '#f0e6d3' }}>Available models</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {(modelCatalog.models || []).map((model) => (
                      <div
                        key={model.key || model.name || JSON.stringify(model)}
                        style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid #2d2a24', background: '#1a1a1a', fontSize: '13px', color: '#d8cbb0' }}
                      >
                        {model.key || model.name || JSON.stringify(model)}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* PERSONAS TAB */}
          {activeTab === 'Personas' && (
            <div style={{ animation: 'fadeUp 0.15s ease' }}>
              <h2 style={{ margin: '0 0 8px 0', fontSize: '20px', fontWeight: 700, color: '#f0e6d3' }}>Personas</h2>
              <p style={{ margin: '0 0 22px 0', fontSize: '13.5px', color: '#a89878', lineHeight: 1.6 }}>Custom system prompts you can switch between per chat, from the picker next to the mode badge.</p>

              {!personaFormOpen && (
                <button
                  onClick={openNewPersonaForm}
                  style={{ padding: '9px 18px', borderRadius: '10px', border: '1px solid rgba(212,175,55,0.35)', background: 'rgba(212,175,55,0.10)', color: '#e5c76b', fontSize: '13px', fontWeight: 650, cursor: 'pointer', marginBottom: '22px' }}
                >
                  + Add persona
                </button>
              )}

              {personaFormOpen && (
                <div style={{ marginBottom: '26px', padding: '16px', borderRadius: '12px', border: '1px solid #2d2a24', background: '#1a1a1a' }}>
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', color: '#a89878', marginBottom: '6px' }}>Name</div>
                    <input
                      value={personaName}
                      onChange={(e) => setPersonaName(e.target.value)}
                      placeholder="e.g. Concise Coder"
                      style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #2d2a24', background: '#141414', color: '#f0e6d3', fontFamily: 'inherit', fontSize: '14px' }}
                    />
                  </div>
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '13px', color: '#a89878', marginBottom: '6px' }}>System prompt</div>
                    <textarea
                      value={personaPrompt}
                      onChange={(e) => setPersonaPrompt(e.target.value)}
                      placeholder="e.g. Respond with terse, code-first answers. Skip pleasantries."
                      rows="4"
                      style={{ width: '100%', resize: 'vertical', padding: '11px 14px', borderRadius: '10px', border: '1px solid #2d2a24', background: '#141414', color: '#f0e6d3', fontFamily: 'inherit', fontSize: '14px', lineHeight: 1.5 }}
                    />
                  </div>
                  {personaError && (
                    <div style={{ fontSize: '12.5px', color: '#e8a598', marginBottom: '12px' }}>{personaError}</div>
                  )}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={savePersona}
                      disabled={personaSaving}
                      style={{ padding: '9px 18px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, #e5c76b, #b8860b)', color: '#0a0a0a', fontSize: '13px', fontWeight: 650, cursor: personaSaving ? 'default' : 'pointer', opacity: personaSaving ? 0.6 : 1 }}
                    >
                      {personaSaving ? 'Saving…' : editingPersonaId ? 'Save changes' : 'Create persona'}
                    </button>
                    <button
                      onClick={closePersonaForm}
                      style={{ padding: '9px 18px', borderRadius: '10px', border: '1px solid #2d2a24', background: 'transparent', color: '#a89878', fontSize: '13px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {personas.length === 0 && !personaFormOpen && (
                <div style={{ fontSize: '13.5px', color: '#a89878' }}>No personas yet.</div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {personas.map((persona) => (
                  <div
                    key={persona.id}
                    style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px', padding: '14px', borderRadius: '10px', border: '1px solid #2d2a24', background: '#1a1a1a' }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: 650, color: '#f0e6d3', marginBottom: '4px' }}>{persona.name}</div>
                      <div style={{ fontSize: '12.5px', color: '#a89878', maxWidth: '460px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{persona.system_prompt}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <button
                        onClick={() => openEditPersonaForm(persona)}
                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #2d2a24', background: 'transparent', color: '#d8cbb0', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => removePersona(persona)}
                        style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid rgba(220,110,100,0.35)', background: 'rgba(220,110,100,0.10)', color: '#e8a598', fontSize: '12.5px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CAPABILITIES TAB */}
          {activeTab === 'Capabilities' && (
            <div style={{ animation: 'fadeUp 0.15s ease' }}>
              <h2 style={{ margin: '0 0 20px 0', fontSize: '20px', fontWeight: 700, color: '#f0e6d3' }}>Memory</h2>

              {/* Search chats toggle */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', marginBottom: '22px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 650, color: '#f0e6d3', marginBottom: '4px' }}>Search and reference chats</div>
                  <div style={{ fontSize: '12.5px', color: '#a89878', maxWidth: '460px', lineHeight: 1.5 }}>Allow Pragna to search for relevant details in past chats.</div>
                </div>
                <button
                  onClick={() => setSearchChats(!searchChats)}
                  style={{ width: '42px', height: '24px', borderRadius: '999px', border: 'none', background: searchChats ? '#d4af37' : '#2d2a24', cursor: 'pointer', flexShrink: 0, position: 'relative', padding: 0, marginTop: '2px' }}
                >
                  <span style={{ position: 'absolute', top: '2px', left: searchChats ? '20px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s ease' }}></span>
                </button>
              </div>

              {/* Memory toggle */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px', marginBottom: '20px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 650, color: '#f0e6d3', marginBottom: '4px' }}>Generate memory from chat history</div>
                  <div style={{ fontSize: '12.5px', color: '#a89878', maxWidth: '460px', lineHeight: 1.5 }}>Allow Pragna to remember relevant context from your chats and projects.</div>
                </div>
                <button
                  onClick={() => setGenMemory(!genMemory)}
                  style={{ width: '42px', height: '24px', borderRadius: '999px', border: 'none', background: genMemory ? '#d4af37' : '#2d2a24', cursor: 'pointer', flexShrink: 0, position: 'relative', padding: 0, marginTop: '2px' }}
                >
                  <span style={{ position: 'absolute', top: '2px', left: genMemory ? '20px' : '2px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', transition: 'left 0.15s ease' }}></span>
                </button>
              </div>

              <button style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderRadius: '12px', border: '1px solid #2d2a24', background: '#1a1a1a', color: '#f0e6d3', fontSize: '13.5px', fontWeight: 600, cursor: 'pointer', marginBottom: '28px' }}>
                <span>View and manage memory · <span style={{ color: '#a89878', fontWeight: 400 }}>Updated 7 hours ago</span></span>
                <span style={{ color: '#a89878' }}>›</span>
              </button>

              <div style={{ height: '1px', background: '#2d2a24', marginBottom: '24px' }}></div>

              <h3 style={{ margin: '0 0 18px 0', fontSize: '15px', fontWeight: 700, color: '#f0e6d3' }}>General</h3>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '20px' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 650, color: '#f0e6d3', marginBottom: '4px' }}>Tool access mode</div>
                  <div style={{ fontSize: '12.5px', color: '#a89878', maxWidth: '400px', lineHeight: 1.5 }}>Controls how connector tools are loaded in new conversations.</div>
                </div>
                <select
                  value={toolAccessMode}
                  onChange={(e) => setToolAccessMode(e.target.value)}
                  style={{ padding: '9px 12px', borderRadius: '9px', border: '1px solid #2d2a24', background: '#1a1a1a', color: '#f0e6d3', fontFamily: 'inherit', fontSize: '13px', cursor: 'pointer', flexShrink: 0 }}
                >
                  <option>Load tools when needed</option>
                  <option>Always load all tools</option>
                </select>
              </div>
            </div>
          )}

          {/* CONNECTORS TAB */}
          {activeTab === 'Connectors' && (
            <div style={{ animation: 'fadeUp 0.15s ease' }}>
              <h2 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: 700, color: '#f0e6d3' }}>Connectors</h2>
              <p style={{ margin: 0, fontSize: '13.5px', color: '#a89878', lineHeight: 1.6 }}>Connectors have moved to <span style={{ color: '#d4af37', textDecoration: 'underline', cursor: 'pointer' }}>Customize</span>. Head there to browse, connect, and manage them.</p>
            </div>
          )}

          {/* PRAGNA CODE TAB */}
          {activeTab === 'Pragna Code' && (
            <div style={{ animation: 'fadeUp 0.15s ease' }}>
              <h2 style={{ margin: '0 0 12px 0', fontSize: '20px', fontWeight: 700, color: '#f0e6d3' }}>Pragna Code</h2>
              <p style={{ margin: 0, fontSize: '13.5px', color: '#a89878', lineHeight: 1.6 }}>Agentic coding tools, configured from the Agent tab in the sidebar.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default SettingsModal

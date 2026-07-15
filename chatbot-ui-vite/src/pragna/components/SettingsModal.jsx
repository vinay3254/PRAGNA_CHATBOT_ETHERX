import { useState, useEffect, useContext } from 'react'
import { ChatContext } from '../../context/ChatContext'

const SettingsModal = ({ isOpen, onClose, userProfile }) => {
  const [activeTab, setActiveTab] = useState('General')
  const { theme, setTheme } = useContext(ChatContext)

  // Settings States matching mockup
  const [userName, setUserName] = useState(() => userProfile?.username || localStorage.getItem('authUsername') || 'vianan')
  const [nickname, setNickname] = useState('')
  const [instructions, setInstructions] = useState('')
  const [accent, setAccent] = useState('#d4af37')
  const [chatFont, setChatFont] = useState('Default (Segoe UI)')

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

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
  ]

  const appearanceOpts = [
    { key: 'system', icon: 'monitor' },
    { key: 'light', icon: 'sun' },
    { key: 'dark', icon: 'moon' },
  ]

  const accentOpts = ['#d4af37', '#e5c76b', '#b8860b', '#8a6d3b']

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

        </div>
      </div>
    </div>
  )
}

export default SettingsModal

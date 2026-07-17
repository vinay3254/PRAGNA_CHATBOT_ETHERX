import { useState, useEffect, useContext } from 'react'
import { ChatContext } from '../../context/ChatContext'
import { changePassword, deleteAccount } from '../../api/api'

const SettingsModal = ({ isOpen, onClose, onLogout, userProfile }) => {
  const [activeTab, setActiveTab] = useState('General')
  const { chatFont, setChatFont, chats, setChats } = useContext(ChatContext)

  // Settings States matching mockup
  const [userName, setUserName] = useState(() => userProfile?.username || localStorage.getItem('authUsername') || 'vianan')
  const [nickname, setNickname] = useState(() => localStorage.getItem('pragna_nickname') || '')
  const [instructions, setInstructions] = useState(() => localStorage.getItem('pragna_instructions') || '')

  // Change password
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSaving, setPasswordSaving] = useState(false)
  const [passwordError, setPasswordError] = useState('')
  const [passwordSuccess, setPasswordSuccess] = useState('')

  // Delete account
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  // Clear chat history
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  const handleChangePassword = async () => {
    setPasswordError('')
    setPasswordSuccess('')
    if (!currentPassword || !newPassword || !confirmPassword) {
      setPasswordError('Fill in all three fields.')
      return
    }
    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.')
      return
    }
    setPasswordSaving(true)
    try {
      await changePassword(currentPassword, newPassword)
      setPasswordSuccess('Password updated.')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      setPasswordError(err.message || 'Failed to change password.')
    } finally {
      setPasswordSaving(false)
    }
  }

  const handleDeleteAccount = async () => {
    setDeleteError('')
    if (!deletePassword) {
      setDeleteError('Enter your password to confirm.')
      return
    }
    setDeleting(true)
    try {
      await deleteAccount(deletePassword)
      onClose()
      onLogout?.()
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete account.')
      setDeleting(false)
    }
  }

  const handleClearHistory = () => {
    setChats([])
    setClearConfirmOpen(false)
  }

  const handleExportData = () => {
    const payload = {
      exported_at: new Date().toISOString(),
      username: userName,
      chats,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pragna-chats-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
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
  ]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0 }}></div>
      <div style={{ position: 'relative', width: 'min(920px, 92vw)', height: 'min(680px, 88vh)', display: 'flex', borderRadius: '20px', overflow: 'hidden', background: 'var(--pragna-surface)', border: '1px solid rgba(212,175,55,0.2)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
        
        {/* Settings Left Nav */}
        <div style={{ width: '232px', flexShrink: 0, padding: '22px 14px', background: 'var(--pragna-surface-2)', borderRight: '1px solid var(--pragna-border)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ display: 'flex', alignMeters: 'center', gap: '9px', padding: '8px 10px 18px 10px', alignItems: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--pragna-text-muted)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7"></circle><path d="M21 21l-4.35-4.35"></path></svg>
            <span style={{ fontSize: '13px', color: 'var(--pragna-text-muted)', whiteSpace: 'nowrap' }}>Search settings</span>
          </div>
          <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1px', color: 'var(--pragna-text-muted)', padding: '0 10px 8px 10px' }}>SETTINGS</div>
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
                  color: active ? 'var(--pragna-gold-soft)' : 'var(--pragna-text-soft)',
                  fontSize: '13.5px',
                  fontWeight: active ? 650 : 500,
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s ease',
                }}
                className="hover:bg-[var(--pragna-surface-2)] hover:text-[var(--pragna-gold-soft)]"
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
              color: 'var(--pragna-text-muted)',
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
            className="hover:bg-[var(--pragna-surface-2)] hover:text-[var(--pragna-gold-soft)]"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12"></path>
            </svg>
          </button>

          {/* GENERAL / PROFILE TAB */}
          {activeTab === 'General' && (
            <div style={{ animation: 'fadeUp 0.15s ease' }}>
              <h2 style={{ margin: '0 0 24px 0', fontSize: '20px', fontWeight: 700, color: 'var(--pragna-text)' }}>Profile</h2>

              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '30px' }}>
                <div style={{ fontSize: '13px', color: 'var(--pragna-text-muted)', width: '110px', flexShrink: 0 }}>Avatar</div>
                <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: 'linear-gradient(135deg, #2a2415, var(--pragna-surface-2))', border: '1.5px solid rgba(212,175,55,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--pragna-accent)', fontWeight: 700, fontSize: '19px' }}>
                  {userInitial}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '20px' }}>
                <div style={{ fontSize: '13px', color: 'var(--pragna-text-muted)', width: '110px', flexShrink: 0 }}>Full name</div>
                <input
                  value={userName}
                  onChange={(e) => {
                    setUserName(e.target.value)
                    localStorage.setItem('authUsername', e.target.value)
                  }}
                  style={{ flex: 1, padding: '11px 14px', borderRadius: '10px', border: '1px solid var(--pragna-border)', background: 'var(--pragna-surface-2)', color: 'var(--pragna-text)', fontFamily: 'inherit', fontSize: '14px' }}
                />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', marginBottom: '30px' }}>
                <div style={{ fontSize: '13px', color: 'var(--pragna-text-muted)', width: '110px', flexShrink: 0, paddingTop: '11px' }}>Nickname</div>
                <input
                  value={nickname}
                  onChange={(e) => {
                    setNickname(e.target.value)
                    localStorage.setItem('pragna_nickname', e.target.value)
                  }}
                  placeholder="What should Pragna call you?"
                  style={{ flex: 1, padding: '11px 14px', borderRadius: '10px', border: '1px solid var(--pragna-border)', background: 'var(--pragna-surface-2)', color: 'var(--pragna-text)', fontFamily: 'inherit', fontSize: '14px' }}
                />
              </div>

              <div style={{ marginBottom: '30px' }}>
                <div style={{ fontSize: '14px', fontWeight: 650, color: 'var(--pragna-text)', marginBottom: '4px' }}>Instructions for Pragna</div>
                <p style={{ margin: '0 0 12px 0', fontSize: '12.5px', color: 'var(--pragna-text-muted)' }}>Pragna keeps these in mind across chats.</p>
                <textarea
                  value={instructions}
                  onChange={(e) => {
                    setInstructions(e.target.value)
                    localStorage.setItem('pragna_instructions', e.target.value)
                  }}
                  placeholder="e.g. I primarily code in Python (not a beginner)"
                  rows="3"
                  style={{ width: '100%', resize: 'vertical', padding: '13px 14px', borderRadius: '12px', border: '1px solid var(--pragna-border)', background: 'var(--pragna-surface-2)', color: 'var(--pragna-text)', fontFamily: 'inherit', fontSize: '14px', lineHeight: 1.5 }}
                />
              </div>

              <div style={{ height: '1px', background: 'var(--pragna-border)', marginBottom: '26px' }}></div>

              <h3 style={{ margin: '0 0 18px 0', fontSize: '15px', fontWeight: 700, color: 'var(--pragna-text)' }}>Preferences</h3>

              {/* Font selection */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ fontSize: '13px', color: 'var(--pragna-text-muted)', width: '110px', flexShrink: 0 }}>Chat font</div>
                <select
                  value={chatFont}
                  onChange={(e) => setChatFont(e.target.value)}
                  style={{ padding: '10px 14px', borderRadius: '10px', border: '1px solid var(--pragna-border)', background: 'var(--pragna-surface-2)', color: 'var(--pragna-text)', fontFamily: 'inherit', fontSize: '13.5px', cursor: 'pointer' }}
                >
                  <option>Default (Segoe UI)</option>
                  <option>Serif</option>
                  <option>Monospace</option>
                </select>
              </div>

              <div style={{ height: '1px', background: 'var(--pragna-border)', margin: '30px 0 26px 0' }}></div>

              <h3 style={{ margin: '0 0 18px 0', fontSize: '15px', fontWeight: 700, color: 'var(--pragna-text)' }}>Account</h3>

              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '22px' }}>
                <div style={{ fontSize: '13px', color: 'var(--pragna-text-muted)', width: '110px', flexShrink: 0 }}>Email</div>
                <div style={{ fontSize: '14px', color: 'var(--pragna-text)' }}>{userProfile?.email || localStorage.getItem('authEmail') || '—'}</div>
              </div>

              <div style={{ marginBottom: '10px' }}>
                <div style={{ fontSize: '14px', fontWeight: 650, color: 'var(--pragna-text)', marginBottom: '12px' }}>Change password</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '360px' }}>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                    style={{ padding: '11px 14px', borderRadius: '10px', border: '1px solid var(--pragna-border)', background: 'var(--pragna-surface-2)', color: 'var(--pragna-text)', fontFamily: 'inherit', fontSize: '14px' }}
                  />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="New password (min 8 characters)"
                    style={{ padding: '11px 14px', borderRadius: '10px', border: '1px solid var(--pragna-border)', background: 'var(--pragna-surface-2)', color: 'var(--pragna-text)', fontFamily: 'inherit', fontSize: '14px' }}
                  />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                    style={{ padding: '11px 14px', borderRadius: '10px', border: '1px solid var(--pragna-border)', background: 'var(--pragna-surface-2)', color: 'var(--pragna-text)', fontFamily: 'inherit', fontSize: '14px' }}
                  />
                  {passwordError && (
                    <div style={{ fontSize: '12.5px', color: '#e8a598' }}>{passwordError}</div>
                  )}
                  {passwordSuccess && (
                    <div style={{ fontSize: '12.5px', color: '#8fd19e' }}>{passwordSuccess}</div>
                  )}
                  <button
                    onClick={handleChangePassword}
                    disabled={passwordSaving}
                    style={{ alignSelf: 'flex-start', padding: '9px 18px', borderRadius: '10px', border: 'none', background: 'linear-gradient(135deg, var(--pragna-gold-soft), var(--pragna-gold-deep))', color: 'var(--pragna-on-gold)', fontWeight: 650, fontSize: '13.5px', cursor: passwordSaving ? 'default' : 'pointer', opacity: passwordSaving ? 0.7 : 1 }}
                  >
                    {passwordSaving ? 'Updating…' : 'Update password'}
                  </button>
                </div>
              </div>

              <div style={{ height: '1px', background: 'var(--pragna-border)', margin: '30px 0 26px 0' }}></div>

              <h3 style={{ margin: '0 0 18px 0', fontSize: '15px', fontWeight: 700, color: 'var(--pragna-text)' }}>Data</h3>

              <div style={{ display: 'flex', alignItems: 'center', gap: '20px', marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', color: 'var(--pragna-text-muted)', width: '110px', flexShrink: 0 }}>Export chats</div>
                <button
                  onClick={handleExportData}
                  style={{ padding: '9px 16px', borderRadius: '10px', border: '1px solid var(--pragna-border)', background: 'var(--pragna-surface-2)', color: 'var(--pragna-text)', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                  className="hover:bg-[var(--pragna-surface)]"
                >
                  Download as JSON
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                <div style={{ fontSize: '13px', color: 'var(--pragna-text-muted)', width: '110px', flexShrink: 0 }}>Chat history</div>
                {!clearConfirmOpen ? (
                  <button
                    onClick={() => setClearConfirmOpen(true)}
                    style={{ padding: '9px 16px', borderRadius: '10px', border: '1px solid var(--pragna-border)', background: 'var(--pragna-surface-2)', color: 'var(--pragna-text)', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                    className="hover:bg-[var(--pragna-surface)]"
                  >
                    Clear all chats
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '12.5px', color: 'var(--pragna-text-muted)' }}>Delete all {chats.length} chat{chats.length === 1 ? '' : 's'}? This can't be undone.</span>
                    <button
                      onClick={handleClearHistory}
                      style={{ padding: '7px 14px', borderRadius: '9px', border: 'none', background: '#c0392b', color: '#fff', fontWeight: 650, fontSize: '12.5px', cursor: 'pointer' }}
                    >
                      Yes, clear
                    </button>
                    <button
                      onClick={() => setClearConfirmOpen(false)}
                      style={{ padding: '7px 14px', borderRadius: '9px', border: '1px solid var(--pragna-border)', background: 'transparent', color: 'var(--pragna-text-muted)', fontWeight: 600, fontSize: '12.5px', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>

              <div style={{ height: '1px', background: 'var(--pragna-border)', margin: '30px 0 26px 0' }}></div>

              <h3 style={{ margin: '0 0 12px 0', fontSize: '15px', fontWeight: 700, color: '#e8a598' }}>Danger zone</h3>
              <p style={{ margin: '0 0 16px 0', fontSize: '12.5px', color: 'var(--pragna-text-muted)' }}>
                Permanently deletes your account, all chats, and all personas. This cannot be undone.
              </p>

              {!deleteConfirmOpen ? (
                <button
                  onClick={() => setDeleteConfirmOpen(true)}
                  style={{ padding: '9px 16px', borderRadius: '10px', border: '1px solid rgba(220,110,100,0.4)', background: 'rgba(180,60,60,0.12)', color: '#e8a598', fontWeight: 650, fontSize: '13px', cursor: 'pointer' }}
                >
                  Delete account
                </button>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '360px' }}>
                  <input
                    type="password"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder="Enter your password to confirm"
                    style={{ padding: '11px 14px', borderRadius: '10px', border: '1px solid rgba(220,110,100,0.4)', background: 'var(--pragna-surface-2)', color: 'var(--pragna-text)', fontFamily: 'inherit', fontSize: '14px' }}
                  />
                  {deleteError && (
                    <div style={{ fontSize: '12.5px', color: '#e8a598' }}>{deleteError}</div>
                  )}
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button
                      onClick={handleDeleteAccount}
                      disabled={deleting}
                      style={{ padding: '9px 16px', borderRadius: '10px', border: 'none', background: '#c0392b', color: '#fff', fontWeight: 650, fontSize: '13px', cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.7 : 1 }}
                    >
                      {deleting ? 'Deleting…' : 'Permanently delete my account'}
                    </button>
                    <button
                      onClick={() => { setDeleteConfirmOpen(false); setDeletePassword(''); setDeleteError('') }}
                      style={{ padding: '9px 16px', borderRadius: '10px', border: '1px solid var(--pragna-border)', background: 'transparent', color: 'var(--pragna-text-muted)', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  )
}

export default SettingsModal

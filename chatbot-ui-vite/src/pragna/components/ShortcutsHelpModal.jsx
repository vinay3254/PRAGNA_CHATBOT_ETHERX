import { useEffect } from 'react'

const SHORTCUTS = [
  { keys: 'Ctrl/Cmd + K', action: 'Focus chat search' },
  { keys: 'Ctrl/Cmd + Shift + O', action: 'Start a new chat' },
  { keys: 'Ctrl/Cmd + /', action: 'Show this shortcuts panel' },
]

const ShortcutsHelpModal = ({ isOpen, onClose }) => {
  useEffect(() => {
    if (!isOpen) return
    const handleKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0 }}></div>
      <div style={{ position: 'relative', width: 'min(420px, 90vw)', padding: '24px', borderRadius: '20px', background: '#141414', border: '1px solid rgba(212,175,55,0.2)', boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, color: '#f0e6d3', marginBottom: '16px' }}>Keyboard shortcuts</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {SHORTCUTS.map((s) => (
            <div key={s.keys} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
              <span style={{ fontSize: '13px', color: '#d8cbb0' }}>{s.action}</span>
              <span style={{ fontSize: '12px', fontFamily: 'monospace', color: '#e5c76b', background: 'rgba(212,175,55,0.10)', border: '1px solid rgba(212,175,55,0.22)', borderRadius: '6px', padding: '3px 8px', whiteSpace: 'nowrap' }}>{s.keys}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default ShortcutsHelpModal

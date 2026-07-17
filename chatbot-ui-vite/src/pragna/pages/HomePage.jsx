import { useContext, useState } from 'react'
import { ChatContext } from '../../context/ChatContext'

const HomePage = ({ onUsePrompt, userProfile }) => {
  const [tier, setTier] = useState('Basic')
  const { templates, createTemplate, deleteTemplate } = useContext(ChatContext)
  const [addingTemplate, setAddingTemplate] = useState(false)
  const [newTemplateTitle, setNewTemplateTitle] = useState('')
  const [newTemplatePrompt, setNewTemplatePrompt] = useState('')

  const userName = userProfile?.username || localStorage.getItem('authUsername') || 'vianan'

  // Icon path helper
  const icon = (paths, extra) => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
      {paths.map((d, i) => <path d={d} key={i} />)}
      {extra || null}
    </svg>
  )

  const starterIcon = (name) => {
    const c = (props) => <circle key="c" {...props} />
    const r = (props) => <rect key="r" {...props} />
    switch (name) {
      case 'image': return icon(['M21 15l-5-5L5 21'], [r({ x: 3, y: 3, width: 18, height: 18, rx: 2 }), c({ cx: 8.5, cy: 8.5, r: 1.5 })]);
      case 'sports': return icon(['M22 12h-4l-3 9L9 3l-3 9H2']);
      case 'write': return icon(['M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z']);
      case 'code': return icon(['M16 18l6-6-6-6M8 6l-6 6 6 6']);
      case 'research': return icon(['M21 21l-4.35-4.35'], [c({ cx: 11, cy: 11, r: 8 })]);
      case 'idea': return icon(['M9 18h6M10 22h4', 'M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.4 1 2.3h6c0-.9.4-1.8 1-2.3A7 7 0 0 0 12 2z']);
      case 'music': return icon(['M9 18V5l12-2v13'], [<circle cx={6} cy={18} r={3} key="c1" />, <circle cx={18} cy={16} r={3} key="c2" />]);
      case 'help': return icon(['M9.09 9a3 3 0 0 1 5.83 1c0 2-3 2-3 4', 'M12 17.5v.1'], [<circle cx={12} cy={12} r={9.2} key="c" />]);
      case 'sun': return icon(['M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4'], [<circle cx={12} cy={12} r={5} key="c" />]);
      case 'pen': return icon(['M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z']);
      default: return null;
    }
  }

  const basicIcon = icon(['M13 2L3 14h9l-1 8 10-12h-9l1-8z'])
  const proIcon = icon(['M12 2l2.4 7.4H22l-6 4.4 2.3 7.2-6.3-4.5-6.3 4.5 2.3-7.2-6-4.4h7.6z'])

  const tiers = [
    { label: 'Pragna Basic', key: 'Basic', icon: basicIcon },
    { label: 'Pragna Pro', key: 'Pro', icon: proIcon },
  ]

  const exploreCardDefs = [
    { icon: 'image', title: 'Create image', desc: 'Generate visuals from text', bg: 'rgba(120,110,220,0.16)', color: '#a8a0f0', prompt: 'Create an image of a golden temple at dusk' },
    { icon: 'sports', title: 'Follow IPL', desc: 'Live scores & updates', bg: 'rgba(80,200,150,0.14)', color: '#7fe0bd', prompt: 'Give me the latest IPL scores' },
    { icon: 'music', title: 'Create music', desc: 'AI-generated tracks', bg: 'rgba(200,110,220,0.14)', color: '#e0a0f0', prompt: 'Suggest a lo-fi track structure for studying' },
    { icon: 'help', title: 'Help me learn', desc: 'Tutoring & explanations', bg: 'rgba(90,140,230,0.14)', color: '#9dc0f5', prompt: 'Explain how neural networks learn' },
    { icon: 'sun', title: 'Boost my day', desc: 'Motivation & insights', bg: 'rgba(230,160,60,0.15)', color: '#f0c087', prompt: 'Give me a quick motivational boost' },
    { icon: 'pen', title: 'Write anything', desc: 'Drafts & copywriting', bg: 'rgba(220,90,110,0.14)', color: '#f0a0ad', prompt: 'Write a short bio for my portfolio' },
  ]

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '56px 40px', animation: 'fadeUp 0.4s ease', height: '100%' }}>
      <h1 style={{ margin: '0 0 8px 0', fontSize: '34px', fontWeight: 700, color: 'var(--pragna-text)', textAlign: 'center' }}>Hi {userName},</h1>
      <div style={{ fontSize: '22px', color: 'var(--pragna-text-muted)', marginBottom: '18px' }}>where should we start?</div>
      <p style={{ margin: '0 0 28px 0', fontSize: '15px', color: 'var(--pragna-text-muted)', textAlign: 'center' }}>Explore, create, or ask anything — I'm here to help.</p>

      {/* Tiers slider */}
      <div style={{ display: 'flex', gap: '8px', padding: '5px', borderRadius: '999px', background: 'var(--pragna-surface)', border: '1px solid var(--pragna-border)', marginBottom: '36px' }}>
        {tiers.map((t) => {
          const active = tier === t.key
          return (
            <button
              key={t.key}
              onClick={() => setTier(t.key)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '9px 20px',
                borderRadius: '999px',
                border: 'none',
                background: active ? 'linear-gradient(135deg, var(--pragna-gold-soft), var(--pragna-accent))' : 'transparent',
                color: active ? 'var(--pragna-bg)' : 'var(--pragna-text-muted)',
                fontSize: '13.5px',
                fontWeight: 650,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ display: 'flex', color: active ? 'var(--pragna-bg)' : 'var(--pragna-text-muted)' }}>
                {t.icon}
              </span>
              {t.label}
            </button>
          )
        })}
      </div>

      {tier === 'Pro' && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            maxWidth: 'min(90vw, 620px)',
            padding: '14px 18px',
            borderRadius: '14px',
            marginBottom: '28px',
            background: 'rgba(212,175,55,0.08)',
            border: '1px solid rgba(212,175,55,0.3)',
            color: 'var(--pragna-text)',
          }}
        >
          <span style={{ display: 'flex', flexShrink: 0, color: 'var(--pragna-gold-soft)' }}>{proIcon}</span>
          <span style={{ fontSize: '13.5px', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--pragna-gold-soft)' }}>Pragna Pro is a future enhancement.</strong> It's not available yet - we're still building it out. Stick with Pragna Basic for now.
          </span>
        </div>
      )}

      {/* Explore cards grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 260px))', gap: '16px', maxWidth: 'min(90vw, 820px)', justifyContent: 'center' }}>
        {exploreCardDefs.map((card, idx) => {
          return (
            <button
              key={idx}
              onClick={() => onUsePrompt(card.prompt)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '14px',
                padding: '22px',
                borderRadius: '18px',
                textAlign: 'left',
                cursor: 'pointer',
                background: 'var(--pragna-surface)',
                border: '1px solid rgba(212,175,55,0.18)',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.28)',
                transition: 'all 0.18s ease',
              }}
              className="hover:translate-y-[-3px] hover:shadow-[0_20px_32px_rgba(0,0,0,0.50)] hover:border-accent-500/50"
            >
              <span style={{ width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: card.bg, color: card.color }}>
                {starterIcon(card.icon)}
              </span>
              <span style={{ fontSize: '16px', fontWeight: 650, color: 'var(--pragna-text)' }}>{card.title}</span>
              <span style={{ fontSize: '13px', color: 'var(--pragna-text-muted)' }}>{card.desc}</span>
            </button>
          )
        })}
      </div>

      {/* Your templates */}
      <div style={{ marginTop: '34px', width: '100%', maxWidth: 'min(90vw, 820px)' }}>
        <div style={{ fontSize: '13px', fontWeight: 650, letterSpacing: '1px', color: 'var(--pragna-text-muted)', textTransform: 'uppercase', marginBottom: '14px' }}>
          Your templates
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 260px))', gap: '16px' }}>
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => onUsePrompt(tpl.prompt)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '22px',
                borderRadius: '18px',
                textAlign: 'left',
                cursor: 'pointer',
                background: 'var(--pragna-surface)',
                border: '1px solid rgba(212,175,55,0.18)',
                backdropFilter: 'blur(8px)',
                boxShadow: '0 2px 8px rgba(0,0,0,0.28)',
                transition: 'all 0.18s ease',
                position: 'relative',
              }}
              className="hover:translate-y-[-3px] hover:shadow-[0_20px_32px_rgba(0,0,0,0.50)] hover:border-accent-500/50"
            >
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  deleteTemplate(tpl.id)
                }}
                title="Delete template"
                style={{ position: 'absolute', top: '12px', right: '12px', width: '22px', height: '22px', borderRadius: '6px', border: 'none', background: 'transparent', color: 'var(--pragna-text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                className="hover:bg-[#1e1a10] hover:text-[var(--pragna-gold-soft)]"
              >
                ✕
              </button>
              <span style={{ fontSize: '16px', fontWeight: 650, color: 'var(--pragna-text)' }}>{tpl.title}</span>
              <span style={{ fontSize: '13px', color: 'var(--pragna-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{tpl.prompt}</span>
            </button>
          ))}

          {addingTemplate ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                padding: '22px',
                borderRadius: '18px',
                background: 'var(--pragna-surface)',
                border: '1px solid rgba(212,175,55,0.32)',
              }}
            >
              <input
                autoFocus
                value={newTemplateTitle}
                onChange={(e) => setNewTemplateTitle(e.target.value)}
                placeholder="Template name"
                style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--pragna-border)', background: 'var(--pragna-surface-2)', color: 'var(--pragna-text)', fontSize: '13.5px' }}
              />
              <textarea
                value={newTemplatePrompt}
                onChange={(e) => setNewTemplatePrompt(e.target.value)}
                placeholder="Prompt text"
                rows={3}
                style={{ padding: '8px 10px', borderRadius: '8px', border: '1px solid var(--pragna-border)', background: 'var(--pragna-surface-2)', color: 'var(--pragna-text)', fontSize: '13.5px', resize: 'vertical' }}
              />
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button
                  onClick={() => {
                    setAddingTemplate(false)
                    setNewTemplateTitle('')
                    setNewTemplatePrompt('')
                  }}
                  style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: 'transparent', color: 'var(--pragna-text-muted)', fontSize: '13px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    createTemplate(newTemplateTitle, newTemplatePrompt)
                    setAddingTemplate(false)
                    setNewTemplateTitle('')
                    setNewTemplatePrompt('')
                  }}
                  style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: 'linear-gradient(135deg, var(--pragna-gold-soft), var(--pragna-gold-deep))', color: 'var(--pragna-bg)', fontSize: '13px', fontWeight: 650, cursor: 'pointer' }}
                >
                  Save
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setAddingTemplate(true)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '22px',
                borderRadius: '18px',
                textAlign: 'center',
                cursor: 'pointer',
                background: 'transparent',
                border: '1px dashed rgba(212,175,55,0.3)',
                color: 'var(--pragna-text-muted)',
                minHeight: '110px',
              }}
              className="hover:border-accent-500/50 hover:text-[var(--pragna-gold-soft)]"
            >
              + Add template
            </button>
          )}
        </div>
      </div>

      <div style={{ marginTop: '34px', fontSize: '12.5px', color: 'var(--pragna-text-muted)', opacity: 0.7 }}>
        Powered by advanced AI · Responses may vary · <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>Privacy</span>
      </div>
    </div>
  )
}

export default HomePage

import { useState, useRef, useEffect, useCallback } from 'react'
import { runAgentStream, resumeAgentStream } from '../../api/api'

const MODES = [
  { id: 'general',     label: 'General',     icon: '🤖', desc: 'General coding assistant' },
  { id: 'code_review', label: 'Code Review',  icon: '🔍', desc: 'Bugs, security, style analysis' },
  { id: 'app_builder', label: 'App Builder',  icon: '🏗️', desc: 'Build complete apps step by step' },
  { id: 'debug',       label: 'Debug',        icon: '🐛', desc: 'Find and fix bugs systematically' },
  { id: 'explain',     label: 'Explain',      icon: '📖', desc: 'Understand code and concepts' },
  { id: 'refactor',    label: 'Refactor',     icon: '✨', desc: 'Clean up and improve code' },
]

const EVENT_COLORS = {
  thought:     { bg: '#1a2035', border: '#3b4fd8', label: '💭 Thinking', labelColor: '#818cf8' },
  tool_call:   { bg: '#0d1f18', border: '#059669', label: '🔧 Tool Call', labelColor: '#34d399' },
  tool_result: { bg: '#1a1505', border: '#d97706', label: '📤 Result',   labelColor: '#fbbf24' },
  confirm_required: { bg: '#1f1a05', border: '#d97706', label: '⚠️ Approval needed', labelColor: '#fbbf24' },
  done:        { bg: '#0d1f18', border: '#10b981', label: '✅ Done',      labelColor: '#6ee7b7' },
  error:       { bg: '#1f0d0d', border: '#ef4444', label: '❌ Error',     labelColor: '#fca5a5' },
}

function ToolCallCard({ event }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = EVENT_COLORS.tool_call

  return (
    <div style={{
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: 10,
      padding: '10px 14px',
      margin: '6px 0',
      fontFamily: 'monospace',
      fontSize: 13,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}
           onClick={() => setExpanded(e => !e)}>
        <span style={{ color: cfg.labelColor, fontWeight: 700 }}>🔧 {event.tool}</span>
        <span style={{ color: '#64748b', fontSize: 11, marginLeft: 'auto' }}>{expanded ? '▲' : '▼'} args</span>
      </div>
      {expanded && (
        <pre style={{ margin: '8px 0 0', color: '#94a3b8', fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
          {JSON.stringify(event.args, null, 2)}
        </pre>
      )}
    </div>
  )
}

function ToolResultCard({ event }) {
  const [expanded, setExpanded] = useState(false)
  const cfg = EVENT_COLORS.tool_result
  const preview = (event.content || '').slice(0, 120)
  const hasMore = (event.content || '').length > 120

  return (
    <div style={{
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: 10,
      padding: '10px 14px',
      margin: '6px 0',
      fontFamily: 'monospace',
      fontSize: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: hasMore ? 'pointer' : 'default' }}
           onClick={() => hasMore && setExpanded(e => !e)}>
        <span style={{ color: cfg.labelColor, fontWeight: 700 }}>📤 {event.tool} result</span>
        {hasMore && <span style={{ color: '#64748b', fontSize: 11, marginLeft: 'auto' }}>{expanded ? '▲ less' : '▼ more'}</span>}
      </div>
      <pre style={{ margin: '6px 0 0', color: '#94a3b8', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
        {expanded ? event.content : (preview + (hasMore ? '...' : ''))}
      </pre>
    </div>
  )
}

function ConfirmCard({ event, onDecision }) {
  const cfg = EVENT_COLORS.confirm_required

  return (
    <div style={{
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: 10,
      padding: '10px 14px',
      margin: '6px 0',
    }}>
      <div style={{ color: cfg.labelColor, fontWeight: 700, fontSize: 12, marginBottom: 6 }}>
        {cfg.label}: {event.tool}
      </div>
      <pre style={{
        margin: '0 0 10px',
        color: '#cbd5e1',
        fontSize: 12,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-all',
        fontFamily: 'monospace',
        maxHeight: 240,
        overflowY: 'auto',
      }}>
        {event.preview}
      </pre>
      {event.resolved ? (
        <div style={{
          color: event.resolved === 'approved' ? '#6ee7b7' : '#fca5a5',
          fontSize: 12,
          fontWeight: 700,
        }}>
          {event.resolved === 'approved' ? '✓ Approved' : '✗ Rejected'}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => onDecision(event, 'approve')}
            style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid #059669',
              background: '#0d1f18', color: '#34d399', fontWeight: 700, fontSize: 12, cursor: 'pointer',
            }}
          >
            ✓ Approve
          </button>
          <button
            onClick={() => onDecision(event, 'reject')}
            style={{
              padding: '6px 14px', borderRadius: 8, border: '1px solid #ef4444',
              background: '#1f0d0d', color: '#fca5a5', fontWeight: 700, fontSize: 12, cursor: 'pointer',
            }}
          >
            ✗ Reject
          </button>
        </div>
      )}
    </div>
  )
}

function EventBlock({ event, onDecision }) {
  if (event.type === 'tool_call') return <ToolCallCard event={event} />
  if (event.type === 'tool_result') return <ToolResultCard event={event} />
  if (event.type === 'confirm_required') return <ConfirmCard event={event} onDecision={onDecision} />

  const cfg = EVENT_COLORS[event.type] || EVENT_COLORS.thought

  return (
    <div style={{
      background: cfg.bg,
      border: `1px solid ${cfg.border}`,
      borderRadius: 10,
      padding: '10px 14px',
      margin: '6px 0',
    }}>
      <div style={{ color: cfg.labelColor, fontWeight: 700, fontSize: 12, marginBottom: 6 }}>
        {cfg.label}
      </div>
      <div style={{
        color: event.type === 'done' ? '#e2e8f0' : '#cbd5e1',
        fontSize: 14,
        lineHeight: 1.65,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: event.type === 'done' ? 'inherit' : 'inherit',
      }}>
        {event.content}
      </div>
    </div>
  )
}

function ThinkingDots() {
  return (
    <div style={{ display: 'flex', gap: 5, padding: '10px 0', alignItems: 'center' }}>
      <span style={{ color: '#818cf8', fontSize: 13 }}>Agent is thinking</span>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: '#818cf8',
          display: 'inline-block',
          animation: `pulse 1.2s ease-in-out ${i * 0.2}s infinite`,
        }} />
      ))}
    </div>
  )
}

export default function AgentPanel() {
  const [selectedMode, setSelectedMode] = useState('general')
  const [task, setTask] = useState('')
  const [events, setEvents] = useState([])
  const [isRunning, setIsRunning] = useState(false)
  const [contextFiles, setContextFiles] = useState('')
  const controllerRef = useRef(null)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  const handleRun = useCallback(() => {
    if (!task.trim() || isRunning) return
    setEvents([])
    setIsRunning(true)

    const files = contextFiles.split('\n').map(s => s.trim()).filter(Boolean)

    controllerRef.current = runAgentStream({
      task: task.trim(),
      mode: selectedMode,
      contextFiles: files,
      onEvent: (event) => {
        setEvents(prev => [...prev, event])
        if (event.type === 'done' || event.type === 'error' || event.type === 'confirm_required') {
          setIsRunning(false)
        }
      },
    })
  }, [task, selectedMode, contextFiles, isRunning])

  const handleDecision = useCallback((event, decision) => {
    setEvents(prev => prev.map(e => (
      e === event ? { ...e, resolved: decision === 'approve' ? 'approved' : 'rejected' } : e
    )))
    setIsRunning(true)

    controllerRef.current = resumeAgentStream({
      sessionId: event.session_id,
      decision,
      onEvent: (ev) => {
        setEvents(prev => [...prev, ev])
        if (ev.type === 'done' || ev.type === 'error' || ev.type === 'confirm_required') {
          setIsRunning(false)
        }
      },
    })
  }, [])

  const handleStop = () => {
    controllerRef.current?.abort()
    setIsRunning(false)
    setEvents(prev => [...prev, { type: 'error', content: 'Stopped by user.' }])
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleRun()
    }
  }

  const handleClear = () => {
    setEvents([])
    setTask('')
  }

  const activeMode = MODES.find(m => m.id === selectedMode)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: '#0b0f1a',
      color: '#e2e8f0',
      fontFamily: "'Inter', 'Segoe UI', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        padding: '18px 24px 14px',
        borderBottom: '1px solid #1e293b',
        background: '#0d1117',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 22 }}>⚡</span>
          <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#f1f5f9' }}>Pragna Code</h2>
          <span style={{
            background: '#1e3a5f',
            color: '#60a5fa',
            fontSize: 11,
            padding: '2px 8px',
            borderRadius: 20,
            fontWeight: 600,
          }}>AGENT</span>
        </div>
        <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
          Agentic AI that reads, writes, and runs code autonomously via Ollama
        </p>
      </div>

      {/* Mode selector */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #1e293b' }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {MODES.map(mode => (
            <button
              key={mode.id}
              onClick={() => setSelectedMode(mode.id)}
              title={mode.desc}
              style={{
                padding: '6px 12px',
                borderRadius: 20,
                border: selectedMode === mode.id ? '1px solid #6366f1' : '1px solid #1e293b',
                background: selectedMode === mode.id ? '#1e1b4b' : '#111827',
                color: selectedMode === mode.id ? '#a5b4fc' : '#94a3b8',
                fontSize: 12,
                fontWeight: selectedMode === mode.id ? 700 : 400,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
                transition: 'all 0.15s',
              }}
            >
              {mode.icon} {mode.label}
            </button>
          ))}
        </div>
        {activeMode && (
          <p style={{ margin: '8px 0 0', color: '#475569', fontSize: 12 }}>
            {activeMode.icon} <strong style={{ color: '#64748b' }}>{activeMode.label}:</strong> {activeMode.desc}
          </p>
        )}
      </div>

      {/* Events stream */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {events.length === 0 && !isRunning && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: '#334155' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>⚡</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#475569', marginBottom: 8 }}>
              Ready to work
            </div>
            <div style={{ fontSize: 13, color: '#334155', lineHeight: 1.7 }}>
              Type a task below. The agent will think, use tools, and complete the job autonomously.<br />
              Examples:<br />
              <span style={{ color: '#4b5563' }}>• "Review the backend code for security issues"</span><br />
              <span style={{ color: '#4b5563' }}>• "Create a REST API for user authentication"</span><br />
              <span style={{ color: '#4b5563' }}>• "Debug why image generation returns empty"</span><br />
              <span style={{ color: '#4b5563' }}>• "Explain how the RAG system works"</span>
            </div>
          </div>
        )}
        {events.map((event, i) => (
          <EventBlock key={i} event={event} onDecision={handleDecision} />
        ))}
        {isRunning && <ThinkingDots />}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{
        padding: '14px 16px',
        borderTop: '1px solid #1e293b',
        background: '#0d1117',
      }}>
        {/* Context files input (collapsible) */}
        <details style={{ marginBottom: 8 }}>
          <summary style={{ color: '#475569', fontSize: 12, cursor: 'pointer', marginBottom: 4 }}>
            📎 Context files (optional — paths to pre-load)
          </summary>
          <textarea
            value={contextFiles}
            onChange={e => setContextFiles(e.target.value)}
            placeholder="One file path per line&#10;e.g. backend/app.py"
            rows={2}
            style={{
              width: '100%',
              background: '#111827',
              border: '1px solid #1e293b',
              borderRadius: 8,
              padding: '8px 10px',
              color: '#94a3b8',
              fontSize: 12,
              fontFamily: 'monospace',
              resize: 'vertical',
              boxSizing: 'border-box',
              marginTop: 4,
            }}
          />
        </details>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
          <textarea
            ref={textareaRef}
            value={task}
            onChange={e => setTask(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Describe your task for ${activeMode?.label || 'the agent'}… (Ctrl+Enter to run)`}
            rows={3}
            disabled={isRunning}
            style={{
              flex: 1,
              background: '#111827',
              border: '1px solid #1e3a5f',
              borderRadius: 10,
              padding: '10px 12px',
              color: '#e2e8f0',
              fontSize: 14,
              fontFamily: 'inherit',
              resize: 'vertical',
              outline: 'none',
              lineHeight: 1.5,
              boxSizing: 'border-box',
              minHeight: 72,
              opacity: isRunning ? 0.6 : 1,
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {isRunning ? (
              <button
                onClick={handleStop}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: '1px solid #ef4444',
                  background: '#1f0d0d',
                  color: '#fca5a5',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                ⛔ Stop
              </button>
            ) : (
              <button
                onClick={handleRun}
                disabled={!task.trim()}
                style={{
                  padding: '10px 18px',
                  borderRadius: 10,
                  border: 'none',
                  background: task.trim() ? 'linear-gradient(135deg, #4f46e5, #6366f1)' : '#1e293b',
                  color: task.trim() ? '#fff' : '#475569',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: task.trim() ? 'pointer' : 'not-allowed',
                  whiteSpace: 'nowrap',
                  boxShadow: task.trim() ? '0 2px 12px rgba(99,102,241,0.4)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                ▶ Run
              </button>
            )}
            {events.length > 0 && !isRunning && (
              <button
                onClick={handleClear}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  border: '1px solid #1e293b',
                  background: 'transparent',
                  color: '#475569',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                🗑 Clear
              </button>
            )}
          </div>
        </div>
        <p style={{ margin: '6px 0 0', color: '#374151', fontSize: 11 }}>
          Ctrl+Enter to run • Agent uses Ollama model: <strong style={{ color: '#4b5563' }}>{'{OLLAMA_MODEL}'}</strong>
        </p>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
        details > summary { list-style: none; }
        details > summary::-webkit-details-marker { display: none; }
      `}</style>
    </div>
  )
}

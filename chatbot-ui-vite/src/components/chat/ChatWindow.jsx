import { useContext, useCallback, useState, useEffect } from "react";
import { ChatContext } from "../../context/ChatContext";
import { generateAIImage, sendOrchestratedMessageStream, summarizeChat } from "../../api/api";
import MessageBubble from "./MessageBubble";
import { normalizeLanguageCode } from "../../utils/language";

const IMAGE_REQUEST_RE = /(create|generate|make|design)\s+(an?\s+)?(ai\s+)?image|image\s+of|illustration\s+of|poster\s+of|logo\s+of/i;

const extractImagePrompt = (text) => {
  const raw = (text || "").trim();
  if (!raw) return "";
  return raw
    .replace(/^(please\s+)?(create|generate|make|design)\s+(an?\s+)?(ai\s+)?(image|picture|photo|illustration)\s+(of|for)?\s*/i, "")
    .trim() || raw;
};

export default function ChatWindow() {
  const {
    chats,
    setChats,
    activeChatId,
    setActiveChatId,
    language,
    isLoading,
    setIsLoading,
    chatMode,
    setChatMode,
  } = useContext(ChatContext);

  const chat = chats.find((c) => c.id === activeChatId);

  // Map display names for modes
  const modeMapping = {
    general: "General",
    explain_concepts: "Explain",
    generate_ideas: "Ideas",
    write_content: "Write",
    code_assistance: "Code",
    ask_questions: "Questions",
    creative_writing: "Story",
  };

  const dbModeFromLabel = (label) => {
    const rMap = {
      General: "general",
      Explain: "explain_concepts",
      Ideas: "generate_ideas",
      Write: "write_content",
      Code: "code_assistance",
      Questions: "ask_questions",
      Story: "creative_writing",
    };
    return rMap[label] || "general";
  };

  const getModeLabel = (v) => modeMapping[v] || "General";

  // Send suggestion message
  const sendSuggestionMessage = useCallback(async (suggestion) => {
    if (isLoading) return;

    let targetChatId = activeChatId;
    let currentChat = chat;

    if (!targetChatId || !currentChat) {
      const newId = Date.now().toString();
      const newChatObj = {
        id: newId,
        title: "New chat",
        messages: [],
      };
      setChats((prev) => [newChatObj, ...prev]);
      setActiveChatId(newId);
      targetChatId = newId;
      currentChat = newChatObj;
    }

    const botMsg = { sender: "bot", text: "", isStreaming: true };

    setChats((prev) =>
      prev.map((c) =>
        c.id === targetChatId
          ? { ...c, messages: [...c.messages, { sender: "user", text: suggestion, attachments: [] }, botMsg] }
          : c
      )
    );
    setIsLoading(true);

    try {
      if (IMAGE_REQUEST_RE.test(suggestion)) {
        const imageResult = await generateAIImage({
          prompt: extractImagePrompt(suggestion),
          style: "cinematic",
          quality: "hd",
          size: "1024x1024",
        });

        setIsLoading(false);
        setChats((prev) =>
          prev.map((c) =>
            c.id === targetChatId
              ? {
                  ...c,
                  messages: c.messages.map((m, idx) =>
                    idx === c.messages.length - 1
                      ? {
                          ...m,
                          text: "Generated image ready.",
                          isStreaming: false,
                          attachments: [
                            {
                              name: `generated-${Date.now()}.png`,
                              type: "image",
                              previewUrl: imageResult.image,
                            },
                          ],
                        }
                      : m
                  ),
                }
              : c
          )
        );
        return;
      }

      let sawResponse = false;
      await sendOrchestratedMessageStream({
        text: suggestion,
        language: normalizeLanguageCode(language),
        user_id: targetChatId,
        chatMode,
        onChunk: (chunk) => {
          sawResponse = true;
          setChats((prev) =>
            prev.map((c) =>
              c.id === targetChatId
                ? {
                    ...c,
                    messages: c.messages.map((m, idx) =>
                      idx === c.messages.length - 1 ? { ...m, text: (m.text || "") + chunk } : m
                    ),
                  }
                : c
            )
          );
        },
        onSources: (sources) => {
          setChats((prev) =>
            prev.map((c) =>
              c.id === targetChatId
                ? {
                    ...c,
                    messages: c.messages.map((m, idx) =>
                      idx === c.messages.length - 1 ? { ...m, sources } : m
                    ),
                  }
                : c
            )
          );
        },
        onDone: () => {
          setIsLoading(false);
          setChats((prev) =>
            prev.map((c) =>
              c.id === targetChatId
                ? {
                    ...c,
                    messages: c.messages.map((m, idx) =>
                      idx === c.messages.length - 1 ? { ...m, isStreaming: false } : m
                    ),
                  }
                : c
            )
          );
        },
      });

      if (!sawResponse) {
        throw new Error("Invalid response from server");
      }
    } catch (err) {
      console.error("API error:", err);
      setIsLoading(false);

      const errorMessage = "Server error. Please try again.";
      setChats((prev) =>
        prev.map((c) =>
          c.id === targetChatId
            ? {
                ...c,
                messages: c.messages.map((m, idx) =>
                  idx === c.messages.length - 1
                    ? {
                        ...m,
                        text: errorMessage,
                        isStreaming: false,
                        error: true,
                      }
                    : m
                ),
              }
            : c
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [activeChatId, chat, isLoading, language, setChats, setActiveChatId, setIsLoading, chatMode]);

  // Retry a failed message: remove the old failed user+bot pair, then resend
  const retryMessage = useCallback((idx) => {
    if (isLoading) return;
    const userMsg = chat?.messages?.[idx - 1];
    if (!userMsg) return;
    const targetChatId = activeChatId;
    setChats((prev) =>
      prev.map((c) =>
        c.id === targetChatId ? { ...c, messages: c.messages.slice(0, idx - 1) } : c
      )
    );
    sendSuggestionMessage(userMsg.text);
  }, [chat, activeChatId, isLoading, setChats, sendSuggestionMessage]);

  // Edit a previously sent user message: drop it and everything after it, then resend the new text
  const editMessage = useCallback((idx, newText) => {
    if (isLoading) return;
    const trimmed = (newText || "").trim();
    if (!trimmed) return;
    const targetChatId = activeChatId;
    setChats((prev) =>
      prev.map((c) =>
        c.id === targetChatId ? { ...c, messages: c.messages.slice(0, idx) } : c
      )
    );
    sendSuggestionMessage(trimmed);
  }, [activeChatId, isLoading, setChats, sendSuggestionMessage]);

  // Toggle the bookmarked flag on a single message, leaving everything else untouched
  const toggleBookmark = useCallback((idx) => {
    const targetChatId = activeChatId;
    setChats((prev) =>
      prev.map((c) =>
        c.id === targetChatId
          ? {
              ...c,
              messages: c.messages.map((m, i) =>
                i === idx ? { ...m, bookmarked: !m.bookmarked } : m
              ),
            }
          : c
      )
    );
  }, [activeChatId, setChats]);

  // Summarize the active chat and append the result as a new message
  const [summarizing, setSummarizing] = useState(false);
  const handleSummarize = useCallback(async () => {
    if (!chat || summarizing) return;
    setSummarizing(true);
    try {
      const { summary } = await summarizeChat(chat.messages, language);
      setChats((prev) =>
        prev.map((c) =>
          c.id === activeChatId
            ? { ...c, messages: [...c.messages, { sender: "bot", text: summary }] }
            : c
        )
      );
    } catch (err) {
      console.error("Summarize error:", err);
    } finally {
      setSummarizing(false);
    }
  }, [chat, activeChatId, language, setChats, summarizing]);

  // Mode select handler
  const handleSelectMode = (label) => {
    const modeKey = dbModeFromLabel(label);
    setChatMode(modeKey);
  };

  // Icon path helper
  const icon = (paths, extra) => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
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

  // Greeting based on time
  const [greeting, setGreeting] = useState("Good evening,")
  useEffect(() => {
    const hour = new Date().getHours();
    const greet = hour < 5 ? 'Still up,' : hour < 12 ? 'Good morning,' : hour < 17 ? 'Good afternoon,' : hour < 21 ? 'Good evening,' : 'Good night,';
    setGreeting(greet);
  }, []);

  const userName = localStorage.getItem('authUsername') || 'vianan';

  const modes = [
    { label: 'General', key: 'general', iconName: 'sun' },
    { label: 'Explain', key: 'explain_concepts', iconName: 'help' },
    { label: 'Ideas', key: 'generate_ideas', iconName: 'idea' },
    { label: 'Write', key: 'write_content', iconName: 'pen' },
    { label: 'Code', key: 'code_assistance', iconName: 'code' },
    { label: 'Questions', key: 'ask_questions', iconName: 'help' },
    { label: 'Story', key: 'creative_writing', iconName: 'music' },
  ]

  const starterDefs = [
    { icon: 'code', title: 'Code help', desc: 'Debugging, implementation, and reviews — describe the problem and get working code.', prompt: 'Can you write me a bubble sort algorithm?', featured: true },
    { icon: 'image', title: 'Create image', desc: 'Generate visuals from text prompts', prompt: 'Create an image of a golden temple at dusk' },
    { icon: 'sports', title: 'Follow sports', desc: 'Live scores and quick match updates', prompt: 'Give me the latest IPL scores' },
    { icon: 'write', title: 'Write content', desc: 'Draft posts, scripts, and copy', prompt: 'Write a LinkedIn post about learning in public' },
    { icon: 'research', title: 'Research mode', desc: 'Summaries with context and action points', prompt: 'Summarize the pros and cons of microservices' },
    { icon: 'idea', title: 'Brainstorm', desc: 'Generate strategic ideas quickly', prompt: 'Brainstorm names for a chai café' },
  ];

  // If chat is empty, show the Welcome / Home view
  if (!chat || chat.messages.length === 0) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative', animation: 'fadeUp 0.4s ease', height: '100%' }}>
        {/* Ambient glow */}
        <div style={{ position: 'absolute', top: '-120px', right: '-80px', width: '480px', height: '480px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(212,175,55,0.16), transparent 70%)', pointerEvents: 'none' }}></div>

        <div style={{ position: 'relative', maxWidth: '920px', margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 4vw, 40px) 40px clamp(20px, 4vw, 40px)' }}>
          {/* Hero */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px', marginBottom: '30px', flexWrap: 'wrap' }}>
            <div style={{ minWidth: '240px' }}>
              <div style={{ fontSize: '13px', fontWeight: 650, letterSpacing: '1.5px', color: '#a89878', textTransform: 'uppercase', marginBottom: '10px' }}>
                {greeting} {userName}
              </div>
              <h1 style={{ margin: '0 0 12px 0', fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 700, color: '#f0e6d3', letterSpacing: '-1px', lineHeight: 1.1 }}>
                What are we<br />
                <span style={{ background: 'linear-gradient(120deg, #e5c76b, #d4af37, #b8860b)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>
                  building today?
                </span>
              </h1>
              <p style={{ margin: 0, fontSize: '15px', color: '#a89878', maxWidth: '440px', lineHeight: 1.5 }}>
                Explore, create, or ask anything — Pragna adapts to how you work.
              </p>
            </div>
            <div style={{ width: '56px', height: '56px', flexShrink: 0, borderRadius: '16px', background: 'linear-gradient(135deg, #e5c76b, #b8860b)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0a0a0a', fontWeight: 800, fontSize: '24px', boxShadow: '0 12px 28px rgba(0,0,0,0.42), 0 0 42px rgba(212,175,55,0.30)' }}>
              P
            </div>
          </div>

          {/* Mode Rail */}
          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '2px', marginBottom: '28px' }} className="hide-scrollbar">
            {modes.map((mode) => {
              const active = chatMode === mode.key
              return (
                <button
                  key={mode.key}
                  onClick={() => handleSelectMode(mode.label)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    flexShrink: 0,
                    padding: '10px 18px',
                    borderRadius: '999px',
                    fontSize: '12.5px',
                    fontWeight: 650,
                    letterSpacing: '0.6px',
                    cursor: 'pointer',
                    border: active ? '1px solid rgba(212,175,55,0.55)' : '1px solid #2d2a24',
                    background: active ? 'linear-gradient(135deg, rgba(212,175,55,0.22), rgba(184,134,11,0.12))' : 'rgba(20,20,20,0.82)',
                    color: active ? '#e5c76b' : '#a89878',
                    boxShadow: active ? '0 0 20px rgba(212,175,55,0.18)' : 'none',
                    transition: 'all 0.15s ease',
                    whiteSpace: 'nowrap',
                  }}
                  className="hover:border-accent-500/50 hover:text-[#e5c76b]"
                >
                  <span style={{ display: 'flex', width: '15px', height: '15px', color: active ? '#e5c76b' : '#a89878' }}>
                    {starterIcon(mode.iconName)}
                  </span>
                  {mode.label.toUpperCase()}
                </button>
              )
            })}
          </div>

          {/* Bento starter grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '32px' }}>
            {starterDefs.map((card, index) => {
              return (
                <button
                  key={index}
                  onClick={() => sendSuggestionMessage(card.prompt)}
                  style={{
                    gridColumn: card.featured ? 'span 2' : 'span 1',
                    display: 'flex',
                    flexDirection: card.featured ? 'row' : 'column',
                    alignItems: 'flex-start',
                    gap: card.featured ? '18px' : '12px',
                    padding: card.featured ? '26px' : '20px',
                    borderRadius: '18px',
                    textAlign: 'left',
                    cursor: 'pointer',
                    background: card.featured ? 'linear-gradient(135deg, rgba(212,175,55,0.14), rgba(20,20,20,0.85))' : 'rgba(20,20,20,0.82)',
                    border: `1px solid ${card.featured ? 'rgba(212,175,55,0.32)' : 'rgba(212,175,55,0.18)'}`,
                    backdropFilter: 'blur(8px)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.28)',
                    transition: 'all 0.18s ease',
                    minHeight: card.featured ? '0px' : '150px',
                  }}
                  className="hover:translate-y-[-3px] hover:shadow-[0_20px_32px_rgba(0,0,0,0.50)] hover:border-accent-500/50"
                >
                  <span style={{ width: card.featured ? '48px' : '38px', height: card.featured ? '48px' : '38px', flexShrink: 0, borderRadius: '12px', display: 'flex', alignItems: 'center', justifycontent: 'center', justifyContent: 'center', background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)', color: '#d4af37' }}>
                    {starterIcon(card.icon)}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 }}>
                    <span style={{ fontSize: card.featured ? '18px' : '15px', fontWeight: 700, color: '#f0e6d3' }}>{card.title}</span>
                    <span style={{ fontSize: '13px', color: '#a89878', lineHeight: 1.5 }}>{card.desc}</span>
                  </span>
                </button>
              )
            })}
          </div>

          {/* Recent Activity strip */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ fontSize: '12px', fontWeight: 700, letterSpacing: '1.5px', color: '#a89878', marginBottom: '12px' }}>
              JUMP BACK IN
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {chats.slice(0, 3).map((r, i) => (
                <div
                  key={r.id}
                  onClick={() => setActiveChatId(r.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    padding: '13px 18px',
                    borderRadius: '13px',
                    background: 'rgba(20,20,20,0.6)',
                    border: '1px solid #2d2a24',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  className="hover:border-accent-500/30 hover:bg-[#141414]"
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d4af37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.7 }}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    <span style={{ fontSize: '14px', color: '#d8cbb0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.title || 'New chat'}
                    </span>
                  </div>
                  <span style={{ fontSize: '12px', color: '#a89878', flexShrink: 0 }}>Active</span>
                </div>
              ))}
              {chats.length === 0 && (
                <div style={{ padding: '16px', textAlign: 'center', color: '#a89878', border: '1px dashed #2d2a24', borderRadius: '13px', fontSize: '13px' }}>
                  No recent chats. Start one above!
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // If chat is active and has messages, show conversation
  const chatTitle = chat.title || 'New Chat'
  const modeLabel = getModeLabel(chatMode)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      {/* Chat header (matches mockup) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '14px 28px', borderBottom: '1px solid #2d2a24', background: 'rgba(10,10,10,0.5)', backdropFilter: 'blur(8px)', flexShrink: 0 }}>
        <div style={{ fontSize: '15px', fontWeight: 650, color: '#f0e6d3' }}>{chatTitle}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '5px 13px', borderRadius: '999px', background: 'rgba(212,175,55,0.10)', border: '1px solid rgba(212,175,55,0.22)', fontSize: '12px', fontWeight: 600, color: '#d4af37', letterSpacing: '0.4px' }}>
          <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#d4af37', boxShadow: '0 0 8px rgba(212,175,55,0.8)' }}></span>
          {modeLabel} mode
        </div>
        <button
          onClick={handleSummarize}
          disabled={summarizing}
          title="Summarize this conversation"
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 14px',
            borderRadius: '999px',
            border: '1px solid #2d2a24',
            background: 'transparent',
            color: '#a89878',
            fontSize: '12.5px',
            fontWeight: 600,
            cursor: summarizing ? 'default' : 'pointer',
            opacity: summarizing ? 0.6 : 1,
          }}
          className="hover:text-[#e5c76b] hover:border-accent-500/40"
        >
          {summarizing ? 'Summarizing…' : 'Summarize'}
        </button>
      </div>

      {/* Messages Scroll Area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '32px 0', minHeight: 0 }} className="custom-scrollbar">
        <div style={{ maxWidth: '780px', margin: '0 auto', padding: '0 28px', display: 'flex', flexDirection: 'column', gap: '22px' }}>
          {chat.messages.map((m, idx) => (
            <MessageBubble
              key={idx}
              message={m}
              language={language}
              onRetry={idx === chat.messages.length - 1 ? () => retryMessage(idx) : undefined}
              onEdit={m.sender !== "bot" ? (newText) => editMessage(idx, newText) : undefined}
              isLoading={isLoading}
              onToggleBookmark={() => toggleBookmark(idx)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

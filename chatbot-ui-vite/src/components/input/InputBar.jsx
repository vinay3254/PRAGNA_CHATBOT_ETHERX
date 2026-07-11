import { useContext, useState, useRef, useCallback, useEffect } from "react";
import { ChatContext } from "../../context/ChatContext";
import { generateAIImage, generateDocument, sendOrchestratedMessage, sendOrchestratedMessageStream, sendOrchestratedUploadMessage } from "../../api/api";
import { normalizeLanguageCode } from "../../utils/language";
import LanguageSelector from "./LanguageSelector";

// BCP-47 tags for SpeechRecognition
const LANG_TAG = {
  en: "en-US", hi: "hi-IN", kn: "kn-IN", te: "te-IN",
  ta: "ta-IN", ml: "ml-IN", mr: "mr-IN", bn: "bn-IN",
  gu: "gu-IN", pa: "pa-IN", ur: "ur-PK",
};

const IMAGE_REQUEST_RE = /(create|generate|make|design)\s+(an?\s+)?(ai\s+)?image|image\s+of|illustration\s+of|poster\s+of|logo\s+of/i;

const extractImagePrompt = (text) => {
  const raw = (text || "").trim();
  if (!raw) return "";
  return raw
    .replace(/^(please\s+)?(create|generate|make|design)\s+(an?\s+)?(ai\s+)?(image|picture|photo|illustration)\s+(of|for)?\s*/i, "")
    .trim() || raw;
};

const DOCUMENT_VERB_RE = /\b(create|generate|make|write|draft)\b.*\b(word\s*doc(ument)?|report|excel\s*(sheet|spreadsheet)|spreadsheet|pdf|power\s*point|presentation|slides?)\b/i;

const DOCUMENT_FORMAT_PATTERNS = [
  { format: "pptx", re: /power\s*point|presentation|slides?/i },
  { format: "xlsx", re: /excel|spreadsheet|sheet/i },
  { format: "pdf", re: /\bpdf\b/i },
  { format: "docx", re: /word\s*doc(ument)?|\bdoc(ument)?\b|report/i },
];

const extractDocumentRequest = (text) => {
  const raw = (text || "").trim();
  if (!raw || !DOCUMENT_VERB_RE.test(raw)) return null;
  const match = DOCUMENT_FORMAT_PATTERNS.find((p) => p.re.test(raw));
  if (!match) return null;
  const subject = raw
    .replace(/^(please\s+)?(create|generate|make|write|draft)\s+(an?\s+)?(ms\s*)?(word\s*doc(ument)?|excel\s*(sheet|spreadsheet)|spreadsheet|pdf|power\s*point(\s*(presentation|deck))?|presentation|slides?|report)\s*(about|on|for|regarding)?\s*/i, "")
    .trim() || raw;
  return { format: match.format, subject };
};

// Generate smart title from user input and AI response
const generateChatTitle = (userMessage, aiResponse) => {
  if (!userMessage && !aiResponse) return "New Chat";
  const combined = (userMessage + " " + aiResponse).toLowerCase();
  let cleaned = combined.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'and', 'or', 'but', 'in', 'on',
    'at', 'to', 'from', 'for', 'of', 'with', 'by', 'it', 'you', 'i', 'that',
    'this', 'your', 'my', 'we', 'they', 'them', 'their', 'what', 'which',
    'when', 'where', 'why', 'how', 'if', 'as', 'just', 'so', 'than'
  ]);
  const words = cleaned
    .split(" ")
    .filter(w => w && !stopWords.has(w) && w.length > 2);
  const title = words.slice(0, 5).join(" ");
  if (!title || title.length < 3) {
    return userMessage.slice(0, 40).replace(/[^\w\s]/g, " ").trim() || "New Chat";
  }
  return title.charAt(0).toUpperCase() + title.slice(1);
};

export default function InputBar() {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [inputFocused, setInputFocused] = useState(false);

  const recognitionRef = useRef(null);
  const attachMenuRef = useRef(null);
  const imageInputRef = useRef(null);
  const videoInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);

  const {
    chats, setChats, activeChatId, setActiveChatId,
    language, isLoading, setIsLoading, chatMode, inputRef,
  } = useContext(ChatContext);

  const activeChat = chats.find((c) => c.id === activeChatId);

  // Update chat title when it's still "New chat" (after first response)
  useEffect(() => {
    const chat = chats.find(c => c.title === "New chat" && c.messages.length > 1);
    if (chat) {
      const userMsg = chat.messages.find(m => m.sender === "user")?.text || "";
      const botMsg = chat.messages.find(m => m.sender === "bot")?.text || "";
      
      if (userMsg && botMsg) {
        const summary = generateChatTitle(userMsg, botMsg);
        if (summary !== "New chat") {
          setChats(prev => prev.map(c => 
            c.id === chat.id ? { ...c, title: summary } : c
          ));
        }
      }
    }
  }, [chats, setChats]);

  // Close attachment menu on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) {
        setAttachMenuOpen(false);
      }
    };
    if (attachMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [attachMenuOpen]);

  // Handle file picked from any input
  const handleFilePick = (e, type) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    const newAttachments = files.map((file) => ({
      file,
      type,
      name: type === "folder" ? (file.webkitRelativePath || file.name) : file.name,
      relativePath: file.webkitRelativePath || file.name,
      previewUrl: (type === "image" || type === "video") && !file.webkitRelativePath
        ? URL.createObjectURL(file)
        : null,
    }));
    setAttachments((prev) => [...prev, ...newAttachments]);
    setAttachMenuOpen(false);
    e.target.value = "";
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => {
      const updated = [...prev];
      if (updated[index].previewUrl) {
        URL.revokeObjectURL(updated[index].previewUrl);
      }
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleSendMessage = useCallback(async (msgText, msgAttachments = []) => {
    const hasContent = msgText.trim() || msgAttachments.length > 0;
    if (!hasContent || isLoading) return;

    let fullText = msgText.trim();
    if (msgAttachments.length > 0) {
      const fileNames = msgAttachments.map((a) => a.relativePath || a.name).join(", ");
      fullText = fullText
        ? `${fullText}\n[Attached: ${fileNames}]`
        : `[Attached: ${fileNames}]`;
    }

    let targetChatId = activeChatId;
    let currentChat = activeChat;

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

    const attachmentMeta = msgAttachments.map((a) => ({
      name: a.name,
      type: a.type,
      relativePath: a.relativePath,
      previewUrl: a.previewUrl,
    }));

    const updatedMessages = [
      ...currentChat.messages,
      { sender: "user", text: msgText.trim(), attachments: attachmentMeta },
    ];
    const botMsg = { sender: "bot", text: "", isStreaming: true };

    setChats((prev) =>
      prev.map((c) =>
        c.id === targetChatId ? { ...c, messages: [...updatedMessages, botMsg] } : c
      )
    );
    setIsLoading(true);

    try {
      const normalizedLanguage = normalizeLanguageCode(language);

      const docRequest = msgAttachments.length === 0 ? extractDocumentRequest(msgText) : null;
      if (docRequest) {
        const docResult = await generateDocument({
          format: docRequest.format,
          prompt: docRequest.subject,
          language: normalizedLanguage,
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
                          text: "Generated document ready.",
                          isStreaming: false,
                          attachments: [
                            {
                              name: docResult.filename,
                              type: "document",
                              downloadUrl: docResult.download_url,
                              format: docRequest.format,
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

      const isImageRequest = IMAGE_REQUEST_RE.test(msgText) && msgAttachments.length === 0;

      if (isImageRequest) {
        const imagePrompt = extractImagePrompt(msgText);
        const imageResult = await generateAIImage({
          prompt: imagePrompt,
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

      if (msgAttachments.length > 0) {
        let data;
        try {
          data = await sendOrchestratedUploadMessage(
            msgText.trim(),
            normalizedLanguage,
            targetChatId,
            chatMode,
            msgAttachments
          );
        } catch (uploadErr) {
          console.warn("Upload analysis endpoint failed, falling back to text-only orchestrator:", uploadErr);
          const fallbackText = `${fullText}\n[Note: Attachment parsing endpoint unavailable.]`;
          data = await sendOrchestratedMessage(fallbackText, normalizedLanguage, targetChatId, chatMode);
        }
        setIsLoading(false);

        if (data && data.response) {
          const responseText = data.response;
          const sources = data.web_search_sources || [];

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
          );
        } else {
          throw new Error("Invalid response from server");
        }
      } else {
        let sawResponse = false;
        await sendOrchestratedMessageStream({
          text: fullText,
          language: normalizedLanguage,
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
    }
  }, [activeChatId, activeChat, chats, isLoading, language, setChats, setActiveChatId, setIsLoading]);

  const hasContent = text.trim() || attachments.length > 0;

  const send = () => {
    if (!hasContent || isLoading) return;
    handleSendMessage(text, attachments);
    setText("");
    setAttachments([]);
  };

  const toggleMic = () => {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Your browser doesn't support voice input. Please use Chrome.");
      return;
    }

    const recognition = new SpeechRecognition();
    const normalizedLanguage = normalizeLanguageCode(language);
    recognition.lang = LANG_TAG[normalizedLanguage] || "en-US";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    let finalTranscript = "";

    recognition.onstart = () => setRecording(true);

    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += t;
        } else {
          interim += t;
        }
      }
      setText(finalTranscript + interim);
    };

    recognition.onend = () => {
      setRecording(false);
      recognitionRef.current = null;
      if (finalTranscript.trim()) {
        handleSendMessage(finalTranscript.trim(), attachments);
        setText("");
        setAttachments([]);
      }
    };

    recognition.onerror = (e) => {
      console.error("SpeechRecognition error:", e.error);
      setRecording(false);
      recognitionRef.current = null;
      if (e.error === "not-allowed") {
        alert("Microphone access denied. Please allow microphone access in your browser.");
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  };

  const inputBorder = inputFocused ? 'rgba(212,175,55,0.45)' : 'rgba(212,175,55,0.18)';

  return (
    <div style={{ padding: '16px 28px 22px 28px', flexShrink: 0 }}>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>
        
        {/* Attachment preview strip */}
        {attachments.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '8px' }}>
            {attachments.map((att, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', borderRadius: '8px', background: '#1a1a1a', border: '1px solid #2d2a24', fontSize: '12px' }}>
                {att.type === "image" && att.previewUrl ? (
                  <img src={att.previewUrl} alt={att.name} style={{ width: '20px', height: '20px', objectFit: 'cover', borderRadius: '4px' }} />
                ) : (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#a89878" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                )}
                <span style={{ color: '#d8cbb0', maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                <button onClick={() => removeAttachment(i)} style={{ border: 'none', background: 'transparent', color: '#ff6b6b', cursor: 'pointer', fontSize: '11px' }}>✕</button>
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '10px',
            padding: '10px 12px',
            borderRadius: '20px',
            background: 'rgba(20,20,20,0.82)',
            border: `1px solid ${inputBorder}`,
            backdropFilter: 'blur(8px)',
            boxShadow: '0 12px 28px rgba(0,0,0,0.42)',
            transition: 'border-color 0.2s ease',
          }}
        >
          {/* Attach Button */}
          <div style={{ position: 'relative' }} ref={attachMenuRef}>
            <button
              title="Attach"
              onClick={() => setAttachMenuOpen(!attachMenuOpen)}
              style={{
                width: '40px',
                height: '40px',
                flexShrink: 0,
                borderRadius: '12px',
                border: 'none',
                background: '#222222',
                color: '#a89878',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
              className="hover:text-[#e5c76b] hover:bg-[#1a1a1a]"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14"></path>
              </svg>
            </button>

            {attachMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '50px',
                  left: 0,
                  zIndex: 50,
                  width: '160px',
                  background: '#141414',
                  border: '1px solid rgba(212,175,55,0.22)',
                  borderRadius: '10px',
                  boxShadow: '0 10px 24px rgba(0,0,0,0.5)',
                  padding: '4px',
                }}
              >
                {[
                  { label: 'Image', type: 'image', accept: 'image/*', ref: imageInputRef },
                  { label: 'Video', type: 'video', accept: 'video/*', ref: videoInputRef },
                  { label: 'File', type: 'file', accept: '*/*', ref: fileInputRef },
                  { label: 'Folder', type: 'folder', accept: undefined, ref: folderInputRef },
                ].map((item) => (
                  <button
                    key={item.label}
                    onClick={() => item.ref.current?.click()}
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      border: 'none',
                      background: 'transparent',
                      color: '#d8cbb0',
                      fontSize: '13px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      borderRadius: '7px',
                    }}
                    className="hover:bg-[#1e1a10] hover:text-[#e5c76b]"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <input ref={imageInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={(e) => handleFilePick(e, 'image')} />
          <input ref={videoInputRef} type="file" accept="video/*" multiple style={{ display: 'none' }} onChange={(e) => handleFilePick(e, 'video')} />
          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={(e) => handleFilePick(e, 'file')} />
          <input ref={folderInputRef} type="file" webkitdirectory="" directory="" multiple style={{ display: 'none' }} onChange={(e) => handleFilePick(e, 'folder')} />

          {/* Text Area */}
          <textarea
            ref={inputRef}
            rows="1"
            placeholder={recording ? "Listening…" : "Ask Pragna anything…"}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            style={{
              flex: 1,
              resize: 'none',
              border: 'none',
              background: 'transparent',
              color: '#f0e6d3',
              fontFamily: 'inherit',
              fontSize: '15px',
              lineHeight: 1.5,
              padding: '10px 4px',
              maxHeight: '140px',
            }}
          />

          {/* Language Selector */}
          <LanguageSelector />

          {/* Voice microphone button */}
          <button
            title="Voice input"
            onClick={toggleMic}
            style={{
              width: '40px',
              height: '40px',
              flexShrink: 0,
              borderRadius: '12px',
              border: 'none',
              background: recording ? 'rgba(220,100,100,0.2)' : 'transparent',
              color: recording ? '#ff6b6b' : '#a89878',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s ease',
            }}
            className="hover:text-[#e5c76b] hover:bg-[#1a1a1a]"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"></path>
            </svg>
          </button>

          {/* Send button */}
          <button
            onClick={send}
            disabled={!hasContent || isLoading}
            title="Send"
            style={{
              width: '40px',
              height: '40px',
              flexShrink: 0,
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(135deg, #e5c76b, #b8860b)',
              color: '#0a0a0a',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 6px 18px rgba(0,0,0,0.34), 0 0 16px rgba(212,175,55,0.25)',
              transition: 'all 0.15s ease',
              opacity: (hasContent && !isLoading) ? 1 : 0.5,
            }}
            className="hover:shadow-[0_6px_18px_rgba(0,_0,_0,_0.34),_0_0_26px_rgba(212,_175,_55,_0.45)] active:scale-[0.94]"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"></path>
            </svg>
          </button>
        </div>
        <div style={{ textAlign: 'center', marginTop: '10px', fontSize: '11.5px', color: '#a89878', opacity: 0.6 }}>
          Pragna can make mistakes. Verify important information.
        </div>
      </div>
    </div>
  );
}

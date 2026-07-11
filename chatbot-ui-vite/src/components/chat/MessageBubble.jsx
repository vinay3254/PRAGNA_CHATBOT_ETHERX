import { useEffect, useRef, useState } from "react";
import CodeBlock from "./CodeBlock";

const CopyIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);
const ThumbsUpIcon = ({ filled }) => (
  <svg width="1em" height="1em" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
  </svg>
);
const ThumbsDownIcon = ({ filled }) => (
  <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
    <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
  </svg>
);
const RetryIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="23 4 23 10 17 10" />
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
  </svg>
);
const PencilIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z" />
  </svg>
);
const StarIcon = ({ filled }) => (
  <svg viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);
const VoiceIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);
const ErrorIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#d98b7f" strokeWidth="2.2" strokeLinecap="round">
    <path d="M12 8v5M12 16.5v.5" />
    <circle cx="12" cy="12" r="9.2" />
  </svg>
);

// BCP-47 language tag map - Comprehensive support for all Indian regional languages
// Includes all 22 official languages + tribal languages, modern variants, and international languages
const LANG_TAG = {
  // International
  en: "en-US",        // English

  // Major Official Indian Languages - Google TTS supported locales
  hi: "hi-IN",        // Hindi
  ta: "ta-IN",        // Tamil
  te: "te-IN",        // Telugu
  kn: "kn-IN",        // Kannada
  ml: "ml-IN",        // Malayalam
  mr: "mr-IN",        // Marathi
  gu: "gu-IN",        // Gujarati
  pa: "pa-IN",        // Punjabi (Gurmukhi)
  bn: "bn-IN",        // Bengali
  or: "or-IN",        // Odia
  as: "as-IN",        // Assamese

  // Regional Languages - Google TTS supported
  kok: "kok-IN",      // Konkani
  mni: "mni-IN",      // Manipuri
  sat: "sat-IN",      // Santali (Tribal)
  mai: "mai-IN",      // Maithili
  mag: "mag-IN",      // Magahi
  ang: "ang-IN",      // Angika
  ks: "ks-IN",        // Kashmiri
  doi: "doi-IN",      // Dogri
  raj: "raj-IN",      // Rajasthani
  har: "har-IN",      // Haryanvi
  gom: "kok-IN",      // Goan Konkani → use Konkani

  // Tribal & Other Languages
  ho: "hi-IN",        // Ho → fallback to Hindi (has Google support)
  kru: "hi-IN",       // Kurukh → fallback to Hindi
  mun: "hi-IN",       // Mundari → fallback to Hindi
  brx: "brx-IN",      // Bodo - Google has this
  mwr: "mr-IN",       // Marwari → use Marathi voice
  urd: "ur-PK",       // Urdu - Pakistan variant (Google supports)
  lah: "pa-IN",       // Lahnda → use Punjabi voice
};

// Language-specific voice parameters for natural, accent-aware delivery
// All Indian languages use natural parameters to preserve authentic accents
const LANGUAGE_CONFIG = {
  // International
  "en-US": { rate: 0.95, pitch: 1.0, volume: 1.0 },

  // Major Official Indian Languages
  "hi-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },    // Hindi
  "ta-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },    // Tamil
  "te-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },    // Telugu
  "kn-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },    // Kannada
  "ml-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },    // Malayalam
  "mr-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },    // Marathi
  "gu-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },    // Gujarati
  "pa-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },    // Punjabi
  "bn-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },    // Bengali
  "or-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },    // Odia
  "as-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },    // Assamese

  // Regional Languages
  "kok-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },   // Konkani
  "mni-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },   // Manipuri
  "sat-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },   // Santali
  "mai-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },   // Maithili
  "mag-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },   // Magahi
  "ang-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },   // Angika
  "ks-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },    // Kashmiri
  "doi-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },   // Dogri
  "raj-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },   // Rajasthani
  "har-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },   // Haryanvi

  // Tribal & Others
  "brx-IN": { rate: 0.95, pitch: 1.0, volume: 1.0 },   // Bodo
  "ur-PK": { rate: 0.95, pitch: 1.0, volume: 1.0 },    // Urdu
};

// Keywords for voice selection (no longer needed with Google TTS)
// Kept for potential future use
const FEMALE_KEYWORDS = [
  "female", "woman", "girl", "zira", "susan", "hazel", "samantha", "victoria",
  "karen", "moira", "fiona", "veena", "raveena", "heera", "lekha", "kalpana",
  "priya", "aditi", "neerja", "madhubala", "deepika",
  "natural", "premium", "neural", "standard", "default"
];

// Clean text for speech: remove emojis, code blocks, markdown formatting
const cleanTextForSpeech = (text) => {
  if (!text) return "";

  // Remove code blocks (```...```)
  let cleaned = text.replace(/```[\s\S]*?```/g, "[code block]");

  // Remove inline code (`...`)
  cleaned = cleaned.replace(/`[^`]+`/g, "");

  // Remove markdown links [text](url) but keep the link text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Remove markdown formatting but keep content
  cleaned = cleaned.replace(/(\*\*|__)(.*?)\1/g, "$2");  // Bold: **text** → text
  cleaned = cleaned.replace(/(\*|_)(.*?)\1/g, "$2");      // Italic: *text* → text
  cleaned = cleaned.replace(/~~(.*?)~~/g, "$1");          // Strikethrough: ~~text~~ → text

  // Remove common emojis (but keep punctuation for intonation)
  cleaned = cleaned.replace(
    /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]/gu,
    ""
  );

  // Clean up extra spaces but preserve paragraph breaks
  cleaned = cleaned.replace(/\n\n+/g, ". ");  // Multiple newlines → period + space
  cleaned = cleaned.replace(/\n/g, " ");      // Single newline → space
  cleaned = cleaned.replace(/\s+/g, " ");     // Multiple spaces → single space
  cleaned = cleaned.trim();

  return cleaned;
};

// Enhanced voice selection with smart fallback for all languages
// NOTE: No longer used - Google TTS handles all languages automatically
// Kept for reference/fallback support in future
function findVoiceForLanguage(langTag, preferFemale = true) {
  // Removed - using Google TTS instead
  return null;
}


// Clean markdown formatting from text for clean display
const cleanMarkdownForDisplay = (text) => {
  if (!text) return "";

  let cleaned = text;

  // Remove markdown headings (###, ##, #) anywhere in text, including mid-line
  cleaned = cleaned.replace(/#+\s+/g, "");

  // Remove bold markdown ** and __ (handle nested cases)
  cleaned = cleaned.replace(/\*\*(.+?)\*\*/g, "$1");
  cleaned = cleaned.replace(/__(.*?)__/g, "$1");

  // Remove italic markdown * and _ (but be careful with single asterisks)
  // This handles *text* and _text_ patterns
  cleaned = cleaned.replace(/([^\*]+)\*([^\*]+)\*([^\*]*)/g, "$1$2$3");
  cleaned = cleaned.replace(/([^_]+)_([^_]+)_([^_]*)/g, "$1$2$3");

  // Remove bare markdown symbols that appear to be formatting attempts
  cleaned = cleaned.replace(/\s+\*\s+/g, " ");
  cleaned = cleaned.replace(/\s+_\s+/g, " ");

  // Remove markdown links [text](url) but keep the link text
  cleaned = cleaned.replace(/\[([^\]]+)\]\([^)]*\)/g, "$1");

  // Convert markdown bullet points to clean version
  cleaned = cleaned.replace(/^[\s]*[-*+]\s+/gm, "• ");

  // Remove inline code markers but keep content
  cleaned = cleaned.replace(/`([^`]+)`/g, "$1");

  // Remove strikethrough
  cleaned = cleaned.replace(/~~([^~]+)~~/g, "$1");

  // Remove remaining stray markdown symbols
  cleaned = cleaned.replace(/^\s*#+\s*/gm, "");  // Leading hashes
  cleaned = cleaned.replace(/\*\*+/g, "");       // Extra asterisks
  cleaned = cleaned.replace(/___+/g, "");        // Extra underscores

  // Clean up multiple spaces
  cleaned = cleaned.replace(/[ ]{2,}/g, " ");

  return cleaned.trim();
};

// Parse code blocks from message text
const parseMessageContent = (text) => {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const parts = [];
  let lastIndex = 0;

  text.replace(codeBlockRegex, (match, language, code, index) => {
    // Add text before code block
    if (index > lastIndex) {
      parts.push({
        type: "text",
        content: cleanMarkdownForDisplay(text.slice(lastIndex, index)),
      });
    }
    // Add code block
    parts.push({
      type: "code",
      language: language || "plaintext",
      content: code.trim(),
    });
    lastIndex = index + match.length;
  });

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: "text",
      content: cleanMarkdownForDisplay(text.slice(lastIndex)),
    });
  }

  return parts.length > 0 ? parts : [{ type: "text", content: cleanMarkdownForDisplay(text) }];
};

// Render parsed message content as a stack of blocks: text segments become
// individual "glass card" bubbles, code segments render as standalone CodeBlocks
// (mirrors the mock, where the bubble and the code block are visual siblings).
const renderContentBlocks = (text, isStreaming) => {
  const parts = parseMessageContent(text);
  return parts.map((part, idx) => {
    if (part.type === "code") {
      return <CodeBlock key={idx} code={part.content} language={part.language} />;
    }
    const isLast = idx === parts.length - 1;
    return (
      <div
        key={idx}
        className="glass-card rounded-[4px_18px_18px_18px] px-5 py-4 text-[15px] leading-[1.65] whitespace-pre-wrap"
        style={{ color: "var(--pragna-text)" }}
      >
        {part.content}
        {isStreaming && isLast && <span className="cursor">|</span>}
      </div>
    );
  });
};

// Shared ghost-icon-button styling for the message action row (copy/like/dislike/speak)
const actionBtnBase =
  "w-[30px] h-[30px] rounded-lg bg-transparent flex items-center justify-center transition-colors duration-150 [&>svg]:w-[18px] [&>svg]:h-[18px] hover:bg-surface-subtle hover:text-accent-400";

const renderAttachments = (attachments) => (
  <div className="flex flex-wrap gap-2 mb-1.5">
    {attachments.map((att, i) => {
      if (att.type === "image" && att.previewUrl) {
        return (
          <img
            key={i}
            src={att.previewUrl}
            alt={att.name}
            className="msg-attachment-img"
            onClick={() => window.open(att.previewUrl, "_blank")}
          />
        );
      } else if (att.type === "video") {
        return (
          <div key={i} className="msg-attachment-file">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="2" y="5" width="15" height="14" rx="2"/>
              <path d="M17 9l5-3v12l-5-3V9z"/>
            </svg>
            <span>{att.name}</span>
          </div>
        );
      } else if (att.type === "document") {
        return (
          <a
            key={i}
            href={att.downloadUrl}
            download={att.name}
            className="msg-attachment-file"
            style={{ textDecoration: "none" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="13" y2="17"/>
            </svg>
            <span>{att.name}</span>
            <span style={{ fontSize: "10px", opacity: 0.7, marginLeft: "4px" }}>
              {(att.format || "doc").toUpperCase()}
            </span>
          </a>
        );
      } else {
        return (
          <div key={i} className="msg-attachment-file">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="9" y1="13" x2="15" y2="13"/>
              <line x1="9" y1="17" x2="13" y2="17"/>
            </svg>
            <span>{att.name}</span>
          </div>
        );
      }
    })}
  </div>
);

export default function MessageBubble({ message, language = "en", onRetry, onEdit, isLoading, onToggleBookmark }) {
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState(message.text || "");
  const [sourcesExpanded, setSourcesExpanded] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard?.writeText(message.text);
  };

  const handleThumbsUp = () => {
    setLiked((prev) => !prev);
    if (disliked) setDisliked(false);
  };

  const handleThumbsDown = () => {
    setDisliked((prev) => !prev);
    if (liked) setLiked(false);
  };

  const speakIntervalRef = useRef(null);
  const audioRef = useRef(null);

  const stopSpeaking = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (speakIntervalRef.current) {
      clearInterval(speakIntervalRef.current);
      speakIntervalRef.current = null;
    }
    setSpeaking(false);
  };

  const speakText = () => {
    if (!message.text?.trim()) {
      console.warn("No text to speak");
      return;
    }

    // Toggle off if already speaking
    if (speaking) {
      stopSpeaking();
      return;
    }

    try {
      setSpeaking(true);

      const targetLang = language || "en";

      // Call backend to generate speech (backend handles Google TTS silently)
      const requestBody = {
        text: message.text,
        language: targetLang
      };

      console.log(`Requesting speech from backend | Language: ${targetLang} | Text: ${message.text.substring(0, 50)}...`);

      // Fetch audio from backend
      fetch('/api/speech', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      })
        .then(response => {
          console.log(`Backend response status: ${response.status} for language: ${targetLang}`);
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          return response.blob();
        })
        .then(audioBlob => {
          console.log(`Audio blob received | size: ${audioBlob.size} bytes | type: ${audioBlob.type}`);
          // Create object URL for the blob
          const audioUrl = URL.createObjectURL(audioBlob);

          // Create and play audio
          const audio = new Audio(audioUrl);
          audioRef.current = audio;

          // Set up event handlers
          audio.onplay = () => {
            setSpeaking(true);
            console.log("Audio playback started");
          };

          audio.onended = () => {
            setSpeaking(false);
            URL.revokeObjectURL(audioUrl);  // Clean up object URL
            audioRef.current = null;
            console.log("Audio playback finished");
          };

          audio.onerror = (e) => {
            console.error("Audio playback error:", e);
            setSpeaking(false);
            URL.revokeObjectURL(audioUrl);
            audioRef.current = null;
          };

          // Play the audio
          audio.play().catch((err) => {
            console.error("Error playing audio:", err);
            setSpeaking(false);
            URL.revokeObjectURL(audioUrl);
            audioRef.current = null;
          });
        })
        .catch(err => {
          console.error("Error getting speech from backend:", err);
          setSpeaking(false);
        });

    } catch (err) {
      console.error("Error in speakText:", err);
      setSpeaking(false);
    }
  };

  useEffect(() => {
    return () => {
      stopSpeaking();
    };
  }, []);

  const isBot = message.sender === "bot";
  const isError = isBot && !!message.error;
  const isStreaming = message.isStreaming;
  const hasText = (message.text || "").trim().length > 0;
  const showTypingDots = isBot && isStreaming && !hasText && !isError;
  const hasAttachments = message.attachments && message.attachments.length > 0;
  const bookmarked = !!message.bookmarked;

  // ── User message: gold-gradient bubble ─────────────────────────────────
  if (!isBot) {
    const handleEditSave = () => {
      const trimmed = draftText.trim();
      if (!trimmed) return;
      setIsEditing(false);
      onEdit?.(trimmed);
    };

    const handleEditCancel = () => {
      setDraftText(message.text || "");
      setIsEditing(false);
    };

    return (
      <div className="flex flex-col items-end gap-1.5 group animate-[fadeUp_0.3s_ease]">
        {isEditing ? (
          <div className="max-w-[78%] w-full flex flex-col gap-2">
            <textarea
              autoFocus
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleEditSave();
                } else if (e.key === "Escape") {
                  handleEditCancel();
                }
              }}
              rows={Math.min(8, Math.max(2, draftText.split("\n").length))}
              className="w-full rounded-[14px] px-[18px] py-3 text-[15px] leading-[1.5] resize-none"
              style={{
                background: "var(--pragna-surface)",
                border: "1px solid rgba(212,175,55,0.35)",
                color: "var(--pragna-text)",
              }}
            />
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={handleEditCancel}
                className="rounded-lg px-3 py-1.5 text-[13px] font-semibold"
                style={{ color: "var(--pragna-text-muted)" }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleEditSave}
                className="rounded-lg px-3 py-1.5 text-[13px] font-semibold"
                style={{
                  background: "linear-gradient(135deg, var(--pragna-gold-soft), var(--pragna-gold))",
                  color: "var(--pragna-on-gold)",
                }}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className="max-w-[78%] rounded-[18px_18px_4px_18px] px-[18px] py-3 text-[15px] leading-[1.5] shadow-premium-md whitespace-pre-wrap break-words"
              style={{
                background: "linear-gradient(135deg, var(--pragna-gold-soft), var(--pragna-gold))",
                color: "var(--pragna-on-gold)",
                fontWeight: 550,
              }}
            >
              {hasAttachments && renderAttachments(message.attachments)}
              {message.text}
            </div>
            <div className="flex gap-1">
              {onToggleBookmark && (
                <button
                  type="button"
                  onClick={onToggleBookmark}
                  title={bookmarked ? "Remove bookmark" : "Bookmark message"}
                  className={`${actionBtnBase} ${bookmarked ? "opacity-100" : "opacity-0 group-hover:opacity-100"} ${bookmarked ? "text-accent-400" : "text-[color:var(--pragna-text-muted)]"}`}
                >
                  <StarIcon filled={bookmarked} />
                </button>
              )}
              {onEdit && !isLoading && (
                <button
                  type="button"
                  onClick={() => {
                    setDraftText(message.text || "");
                    setIsEditing(true);
                  }}
                  title="Edit message"
                  className={`${actionBtnBase} opacity-0 group-hover:opacity-100 text-[color:var(--pragna-text-muted)]`}
                >
                  <PencilIcon />
                </button>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Assistant / error message ───────────────────────────────────────────
  return (
    <div className="flex flex-col items-start animate-[fadeUp_0.3s_ease]">
      <div className="flex gap-3.5 max-w-[92%] min-w-0">
        {isError ? (
          <div
            className="w-8 h-8 shrink-0 mt-0.5 rounded-[9px] flex items-center justify-center"
            style={{ background: "rgba(180,60,60,0.15)", border: "1px solid rgba(220,110,100,0.35)" }}
          >
            <ErrorIcon />
          </div>
        ) : (
          <div
            className="w-8 h-8 shrink-0 mt-0.5 rounded-[9px] flex items-center justify-center font-extrabold text-[13px] shadow-premium-sm"
            style={{ background: "linear-gradient(135deg, var(--pragna-gold-soft), var(--pragna-gold-deep))", color: "#0a0a0a" }}
          >
            P
          </div>
        )}

        <div className="flex flex-col gap-2.5 min-w-0 flex-1">
          {hasAttachments && renderAttachments(message.attachments)}

          {showTypingDots ? (
            <div className="glass-card w-fit flex items-center gap-[5px] rounded-[4px_18px_18px_18px] px-[18px] py-3.5">
              <span className="w-[7px] h-[7px] rounded-full" style={{ background: "var(--pragna-gold)", animation: "dotBlink 1.2s infinite" }} />
              <span className="w-[7px] h-[7px] rounded-full" style={{ background: "var(--pragna-gold)", animation: "dotBlink 1.2s infinite 0.2s" }} />
              <span className="w-[7px] h-[7px] rounded-full" style={{ background: "var(--pragna-gold)", animation: "dotBlink 1.2s infinite 0.4s" }} />
            </div>
          ) : isError ? (
            <div
              className="min-w-0 rounded-[4px_18px_18px_18px] px-5 py-4 shadow-premium-sm"
              style={{ background: "rgba(48,22,20,0.55)", border: "1px solid rgba(220,110,100,0.28)", backdropFilter: "blur(8px)" }}
            >
              <div className="text-[14px] font-bold tracking-[0.3px] mb-1.5" style={{ color: "#e8a598" }}>
                Something went wrong
              </div>
              <div className="text-[13.5px] leading-[1.6] whitespace-pre-wrap" style={{ color: "#cfa9a0" }}>
                {message.text}
              </div>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  title="Retry"
                  className="mt-3 flex items-center gap-[7px] rounded-lg px-4 py-[7px] text-[13px] font-semibold transition-colors duration-150 [&>svg]:w-[13px] [&>svg]:h-[13px]"
                  style={{
                    border: "1px solid rgba(220,110,100,0.35)",
                    background: "rgba(220,110,100,0.10)",
                    color: "#e8a598",
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(220,110,100,0.18)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(220,110,100,0.10)"; }}
                >
                  <RetryIcon />
                  Retry
                </button>
              )}
            </div>
          ) : (
            renderContentBlocks(message.text, isStreaming)
          )}

          {isBot && !isStreaming && !isError && message.sources?.length > 0 && (
            <div className="text-[13px]">
              <button
                type="button"
                onClick={() => setSourcesExpanded((prev) => !prev)}
                className="text-[color:var(--pragna-text-muted)] hover:text-accent-400 transition-colors duration-150"
              >
                {sourcesExpanded ? "▾" : "▸"} Sources ({message.sources.length})
              </button>
              {sourcesExpanded && (
                <ul className="mt-1.5 flex flex-col gap-1 pl-4 list-disc">
                  {message.sources.map((src, idx) => {
                    const href = src.link && /^https?:\/\//.test(src.link) ? src.link : null;
                    const label = src.title || href || "Untitled source";
                    return (
                      <li key={idx} className="text-[color:var(--pragna-text-muted)]">
                        {href ? (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-accent-400 hover:underline">
                            {label}
                          </a>
                        ) : (
                          <span>{label}</span>
                        )}
                        {src.source && !/^https?:\/\//.test(src.source) && (
                          <span className="ml-1.5 text-[11px] opacity-70">({src.source})</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* Only show action icons for finished, non-error assistant messages */}
          {isBot && !isStreaming && !isError && (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={copyToClipboard}
                title="Copy"
                className={`${actionBtnBase} text-[color:var(--pragna-text-muted)]`}
              >
                <CopyIcon />
              </button>
              {onToggleBookmark && (
                <button
                  type="button"
                  onClick={onToggleBookmark}
                  title={bookmarked ? "Remove bookmark" : "Bookmark message"}
                  className={`${actionBtnBase} ${bookmarked ? "text-accent-400" : "text-[color:var(--pragna-text-muted)]"}`}
                >
                  <StarIcon filled={bookmarked} />
                </button>
              )}
              <button
                type="button"
                onClick={handleThumbsUp}
                title="Good response"
                className={`${actionBtnBase} ${liked ? "text-accent-400" : "text-[color:var(--pragna-text-muted)]"}`}
              >
                <ThumbsUpIcon filled={liked} />
              </button>
              <button
                type="button"
                onClick={handleThumbsDown}
                title="Bad response"
                className={`${actionBtnBase} ${disliked ? "text-accent-400" : "text-[color:var(--pragna-text-muted)]"}`}
              >
                <ThumbsDownIcon filled={disliked} />
              </button>
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  title="Regenerate"
                  className={`${actionBtnBase} text-[color:var(--pragna-text-muted)]`}
                >
                  <RetryIcon />
                </button>
              )}
              <button
                type="button"
                onClick={speakText}
                title="Read aloud"
                className={`${actionBtnBase} ${speaking ? "text-accent-400" : "text-[color:var(--pragna-text-muted)]"}`}
              >
                <VoiceIcon />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

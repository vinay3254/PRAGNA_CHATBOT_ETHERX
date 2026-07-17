import { useEffect, useState } from "react";
import MessageBubble from "./MessageBubble";
import { getSharedChat } from "../../api/api";
import pragnaLogo from "../../assets/pragna-logo-full.png";

// Public, read-only view of a shared chat (/share/<token>). No auth, no
// composer, no edit/retry - just the conversation as it stood when shared.
export default function SharedChatView({ token, onDone }) {
  const [status, setStatus] = useState("loading");
  const [chat, setChat] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    getSharedChat(token)
      .then((data) => {
        if (cancelled) return;
        setChat(data);
        setStatus("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "This shared chat link is invalid or has expired.");
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--pragna-bg)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "18px 28px", borderBottom: "1px solid var(--pragna-border)" }}>
        <img src={pragnaLogo} alt="Pragna" style={{ height: "28px", width: "auto" }} />
        <span style={{ fontSize: "14px", fontWeight: 700, color: "var(--pragna-gold-soft)", letterSpacing: "1px" }}>PRAGNA-1 A</span>
        <span style={{ fontSize: "12.5px", color: "var(--pragna-text-muted)", marginLeft: "6px" }}>Shared conversation</span>
        <button
          type="button"
          onClick={onDone}
          style={{ marginLeft: "auto", padding: "8px 16px", borderRadius: "10px", border: "none", background: "linear-gradient(135deg, var(--pragna-gold-soft), var(--pragna-gold-deep))", color: "var(--pragna-on-gold)", fontWeight: 650, fontSize: "13px", cursor: "pointer" }}
        >
          Start your own chat
        </button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "32px 0" }}>
        {status === "loading" && (
          <div style={{ textAlign: "center", color: "var(--pragna-text-muted)", fontSize: "14px", marginTop: "60px" }}>
            Loading shared conversation…
          </div>
        )}

        {status === "error" && (
          <div style={{ maxWidth: "480px", margin: "60px auto 0", textAlign: "center" }}>
            <h1 style={{ fontSize: "20px", color: "var(--pragna-text)", marginBottom: "10px" }}>Link not found</h1>
            <p style={{ fontSize: "13.5px", color: "var(--pragna-text-muted)", lineHeight: 1.6 }}>{error}</p>
          </div>
        )}

        {status === "ready" && (
          <div style={{ maxWidth: "780px", margin: "0 auto", padding: "0 28px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: 700, color: "var(--pragna-text)", marginBottom: "24px" }}>
              {chat.title || "Shared chat"}
            </h1>
            {chat.messages.length === 0 ? (
              <p style={{ fontSize: "13.5px", color: "var(--pragna-text-muted)" }}>This conversation has no messages yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
                {chat.messages.map((m, idx) => (
                  <MessageBubble key={idx} message={m} language="en" />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

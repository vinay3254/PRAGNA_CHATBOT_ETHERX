import { createContext, useState, useEffect, useRef, useCallback } from "react";
import { normalizeLanguageCode } from "../utils/language";
import { listPersonas } from "../api/api";

export const ChatContext = createContext();

export function ChatProvider({ children }) {
  const [chats, setChats] = useState(() => {
    const saved = localStorage.getItem("pragna_chats");
    return saved ? JSON.parse(saved) : [];
  });

  const [folders, setFolders] = useState(() => {
    const saved = localStorage.getItem("pragna_folders");
    return saved ? JSON.parse(saved) : [];
  });

  const [templates, setTemplates] = useState(() => {
    const saved = localStorage.getItem("pragna_templates");
    return saved ? JSON.parse(saved) : [];
  });

  const [activeChatId, setActiveChatId] = useState(() => {
    const saved = localStorage.getItem("pragna_active_chat_id");
    return saved || null;
  });

  const [language, setLanguage] = useState(() => {
    return normalizeLanguageCode(localStorage.getItem("pragna_language") || "en");
  });

  const setNormalizedLanguage = (nextLanguage) => {
    setLanguage(normalizeLanguageCode(nextLanguage));
  };

  // Theme/accent switching was tried and removed (didn't look good) - the app
  // is single fixed dark-gold theme now. Kept as constants rather than state
  // so nothing can drift from this, and cleared any stale values a previous
  // build may have left in localStorage.
  const theme = "dark";
  const setTheme = () => {};
  const resolvedTheme = "dark";
  const accentColor = "#d4af37";
  const setAccentColor = () => {};
  localStorage.removeItem("pragna_theme");
  localStorage.removeItem("pragna_accent");

  const CHAT_FONT_STACKS = {
    "Default (Segoe UI)": "'Segoe UI', system-ui, -apple-system, sans-serif",
    "Serif": "Georgia, 'Times New Roman', serif",
    "Monospace": "'Cascadia Code', 'Consolas', 'Courier New', monospace",
  };

  const [chatFont, setChatFontState] = useState(() => {
    return localStorage.getItem("pragna_chat_font") || "Default (Segoe UI)";
  });

  const [isLoading, setIsLoading] = useState(false);

  // Sidebar: open by default, persisted across reloads (desktop only — mobile uses its own drawer state)
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const saved = localStorage.getItem("pragna_sidebar_open");
    return saved === null ? true : JSON.parse(saved);
  });

  const [user, setUser] = useState(null);

  const [chatMode, setChatMode] = useState(() => {
    return localStorage.getItem("pragna_chat_mode") || "general";
  });

  const [personas, setPersonas] = useState([]);

  const [activePersonaId, setActivePersonaId] = useState(() => {
    return localStorage.getItem("pragna_active_persona_id") || null;
  });

  // Ref to input field for focusing when mode is selected
  const inputRef = useRef(null);

  // Ref to the sidebar's search input, focused via the Ctrl/Cmd+K shortcut
  const sidebarSearchInputRef = useRef(null);

  // Persist sidebar open/closed state
  useEffect(() => {
    localStorage.setItem("pragna_sidebar_open", JSON.stringify(sidebarOpen));
  }, [sidebarOpen]);

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem("pragna_chats", JSON.stringify(chats));
  }, [chats]);

  useEffect(() => {
    localStorage.setItem("pragna_folders", JSON.stringify(folders));
  }, [folders]);

  useEffect(() => {
    localStorage.setItem("pragna_templates", JSON.stringify(templates));
  }, [templates]);

  // Save chat mode
  useEffect(() => {
    localStorage.setItem("pragna_chat_mode", chatMode);
  }, [chatMode]);

  // Save active persona selection
  useEffect(() => {
    if (activePersonaId) {
      localStorage.setItem("pragna_active_persona_id", activePersonaId);
    } else {
      localStorage.removeItem("pragna_active_persona_id");
    }
  }, [activePersonaId]);

  const refreshPersonas = useCallback(async () => {
    try {
      const data = await listPersonas();
      setPersonas(data.personas || []);
    } catch (err) {
      console.warn("Failed to load personas:", err);
    }
  }, []);

  // Fetch personas once on load, only if the user is logged in (personas require auth)
  useEffect(() => {
    if (localStorage.getItem("authToken")) {
      refreshPersonas();
    }
  }, []);

  useEffect(() => {
    if (activeChatId) {
      localStorage.setItem("pragna_active_chat_id", activeChatId);
    } else {
      localStorage.removeItem("pragna_active_chat_id");
    }
  }, [activeChatId]);

  useEffect(() => {
    localStorage.setItem("pragna_language", language);
  }, [language]);

  const setChatFont = (label) => {
    setChatFontState(label);
    localStorage.setItem("pragna_chat_font", label);
  };

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--pragna-chat-font",
      CHAT_FONT_STACKS[chatFont] || CHAT_FONT_STACKS["Default (Segoe UI)"]
    );
  }, [chatFont]);

  // Auto-initialize first chat if none exist
  useEffect(() => {
    if (!activeChatId && chats.length > 0) {
      setActiveChatId(chats[0].id);
    }
  }, []);

  const newChat = () => {
    const chat = {
      id: Date.now().toString(),
      title: "New chat",
      messages: [],
    };
    setChats((prev) => [chat, ...prev]);
    setActiveChatId(chat.id);
  };

  const toggleSidebar = () => {
    setSidebarOpen((prev) => !prev);
  };

  const login = (name, email) => {
    setUser({ name, email });
  };

  const logout = () => {
    setUser(null);
  };

  const deleteChat = (chatId) => {
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChatId === chatId) {
      setActiveChatId(null);
    }
  };

  const createFolder = (name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    setFolders((prev) => [...prev, { id: Date.now().toString(), name: trimmed }]);
  };

  const renameFolder = (folderId, name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    setFolders((prev) =>
      prev.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f))
    );
  };

  const deleteFolder = (folderId) => {
    setFolders((prev) => prev.filter((f) => f.id !== folderId));
    setChats((prev) =>
      prev.map((c) => (c.folderId === folderId ? { ...c, folderId: null } : c))
    );
  };

  const moveChatToFolder = (chatId, folderId) => {
    setChats((prev) =>
      prev.map((c) => (c.id === chatId ? { ...c, folderId } : c))
    );
  };

  const duplicateChat = (chatId) => {
    const source = chats.find((c) => c.id === chatId);
    if (!source) return;
    const copy = {
      id: Date.now().toString(),
      title: `${source.title || "New chat"} (copy)`,
      messages: JSON.parse(JSON.stringify(source.messages || [])),
      folderId: source.folderId || null,
    };
    setChats((prev) => [copy, ...prev]);
    setActiveChatId(copy.id);
  };

  const createTemplate = (title, prompt) => {
    const trimmedTitle = (title || "").trim();
    const trimmedPrompt = (prompt || "").trim();
    if (!trimmedTitle || !trimmedPrompt) return;
    setTemplates((prev) => [...prev, { id: Date.now().toString(), title: trimmedTitle, prompt: trimmedPrompt }]);
  };

  const deleteTemplate = (templateId) => {
    setTemplates((prev) => prev.filter((t) => t.id !== templateId));
  };

  return (
    <ChatContext.Provider
      value={{
        chats,
        setChats,
        activeChatId,
        setActiveChatId,
        newChat,
        language,
        setLanguage: setNormalizedLanguage,
        theme,
        setTheme,
        resolvedTheme,
        accentColor,
        setAccentColor,
        chatFont,
        setChatFont,
        isLoading,
        setIsLoading,
        sidebarOpen,
        toggleSidebar,
        user,
        login,
        logout,
        deleteChat,
        folders,
        createFolder,
        renameFolder,
        deleteFolder,
        moveChatToFolder,
        duplicateChat,
        templates,
        createTemplate,
        deleteTemplate,
        chatMode,
        setChatMode,
        personas,
        activePersonaId,
        setActivePersonaId,
        refreshPersonas,
        inputRef,
        sidebarSearchInputRef,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

import { createContext, useState, useEffect, useRef } from "react";
import { normalizeLanguageCode } from "../utils/language";

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

  const [theme, setTheme] = useState(() => {
    return localStorage.getItem("pragna_theme") || "dark";
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

  // Save chat mode
  useEffect(() => {
    localStorage.setItem("pragna_chat_mode", chatMode);
  }, [chatMode]);

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

  useEffect(() => {
    localStorage.setItem("pragna_theme", theme);
    if (typeof document !== "undefined") {
      document.documentElement.setAttribute("data-theme", theme);
    }
  }, [theme]);

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
        chatMode,
        setChatMode,
        inputRef,
        sidebarSearchInputRef,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

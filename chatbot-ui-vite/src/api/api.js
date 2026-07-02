import axios from "axios";
import { normalizeLanguageCode } from "../utils/language";

const api = axios.create({
  baseURL: "/api", // Use relative paths to work through Vite proxy
});

const _csvToList = (value) =>
  (value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const _resolveModelProfileRouting = () => {
  const rawProfile = (localStorage.getItem("pragna_model_profile") || "basic").toLowerCase();
  const profile = rawProfile === "instant" ? "basic" : rawProfile === "expert" ? "pro" : rawProfile;

  const instantOverride =
    import.meta.env.VITE_MODEL_PROFILE_LIGHT_KEY || "ollama:qwen3-vl:8b";
  const instantFallbacks =
    _csvToList(import.meta.env.VITE_MODEL_PROFILE_LIGHT_FALLBACKS) || [];

  const expertOverride =
    import.meta.env.VITE_MODEL_PROFILE_HEAVY_KEY || "ollama:qwen3-vl:8b";
  const expertFallbacks =
    _csvToList(import.meta.env.VITE_MODEL_PROFILE_HEAVY_FALLBACKS) || [];

  if (profile === "pro") {
    return {
      model_override: expertOverride,
      fallback_models: expertFallbacks.length
        ? expertFallbacks
        : ["ollama:qwen3-vl:8b"],
    };
  }

  return {
    model_override: instantOverride,
    fallback_models: instantFallbacks.length
      ? instantFallbacks
      : ["ollama:qwen3-vl:8b"],
  };
};

export const runResponseActions = (payload) => {
  const actions = payload?.actions || [];
  actions.forEach((action) => {
    if (action?.action === "open_url" && action?.url) {
      try {
        window.open(action.url, "_blank", "noopener,noreferrer");
      } catch (error) {
        console.warn("Unable to open action URL:", action.url, error);
      }
    }
  });
};

export const sendText = (text, language, user_id) =>
  api.post("/process_text", {
    text,
    language: normalizeLanguageCode(language),
    user_id,
  });

export const sendAudio = (audioBlob, language, user_id) => {
  const form = new FormData();
  form.append("audio", audioBlob);
  form.append("language", normalizeLanguageCode(language));
  form.append("user_id", user_id);

  return api.post("/process_audio", form);
};

export const sendOrchestratedMessage = async (text, language, user_id, chatMode = "general") => {
  const normalizedLanguage = normalizeLanguageCode(language);
  const modelRouting = _resolveModelProfileRouting();

  const response = await fetch("/api/orchestrator/query", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: text,
      language: normalizedLanguage,
      user_id,
      chat_mode: chatMode,
      model_override: modelRouting.model_override,
      fallback_models: modelRouting.fallback_models,
    }),
  });

  if (!response.ok) {
    throw new Error("Server error. Please try again.");
  }

  const data = await response.json();
  runResponseActions(data);
  return data;
};

export const sendOrchestratedUploadMessage = async (
  text,
  language,
  user_id,
  chatMode = "general",
  attachments = []
) => {
  const normalizedLanguage = normalizeLanguageCode(language);
  const modelRouting = _resolveModelProfileRouting();
  const formData = new FormData();

  formData.append("message", text || "");
  formData.append("language", normalizedLanguage);
  formData.append("user_id", user_id);
  formData.append("chat_mode", chatMode);
  formData.append("model_override", modelRouting.model_override);
  formData.append("fallback_models", JSON.stringify(modelRouting.fallback_models || []));

  attachments.forEach((item) => {
    if (!item?.file) return;
    formData.append("files", item.file, item.file.name);
    formData.append("relative_paths", item.relativePath || item.name || item.file.name);
    formData.append("attachment_types", item.type || "file");
  });

  const response = await fetch("/api/orchestrator/analyze_uploads", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error("Server error. Please try again.");
  }

  const data = await response.json();
  runResponseActions(data);
  return data;
};

export const sendMessage = async (text, language, user_id, chatMode = "general") => {
  const normalizedLanguage = normalizeLanguageCode(language);
  const modelRouting = _resolveModelProfileRouting();

  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message: text,
      language: normalizedLanguage,
      user_id,
      chat_mode: chatMode,
      model_override: modelRouting.model_override,
      fallback_models: modelRouting.fallback_models,
    }),
  });

  if (!response.ok) {
    throw new Error("Server error. Please try again.");
  }

  const data = await response.json();
  runResponseActions(data);
  return data;
};

export const getRealtimeEventsFeed = async (limit = 20, focus = "india") => {
  const response = await fetch(`/api/events/feed?limit=${limit}&focus=${encodeURIComponent(focus)}`);
  if (!response.ok) {
    throw new Error("Failed to fetch realtime events feed.");
  }
  return response.json();
};

export const getDashboardGeoSummary = async (limit = 50, focus = "india") => {
  const response = await fetch(`/api/dashboard/geo?limit=${limit}&focus=${encodeURIComponent(focus)}`);
  if (!response.ok) {
    throw new Error("Failed to fetch geo dashboard summary.");
  }
  return response.json();
};

export const getPlatformStatus = async () => {
  const response = await fetch("/api/platform/status");
  if (!response.ok) {
    throw new Error("Failed to fetch platform status.");
  }
  return response.json();
};

export const getWorldMonitorConfig = async () => {
  const response = await fetch("/api/world-monitor/config");
  if (!response.ok) {
    throw new Error("Failed to fetch World Monitor configuration.");
  }
  return response.json();
};

export const generateAIImage = async ({ prompt, style = "cinematic", quality = "hd", size = "1024x1024" }) => {
  let response;
  try {
    response = await fetch("/api/images/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt, style, quality, size }),
    });
  } catch (err) {
    throw new Error("Cannot reach backend. Start/restart backend server on port 5001.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Image API not found. Restart backend to load the new /api/images/generate route.");
    }
    if (response.status === 503) {
      throw new Error(data?.error || "Image generation is currently unavailable on backend.");
    }
    throw new Error(data?.error || "Image generation failed.");
  }
  return data;
};



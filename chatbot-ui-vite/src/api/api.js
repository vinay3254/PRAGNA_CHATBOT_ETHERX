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

export const sendOrchestratedMessageStream = async ({
  text,
  language,
  user_id,
  chatMode = "general",
  onChunk,
  onSources,
  onDone,
}) => {
  const normalizedLanguage = normalizeLanguageCode(language);
  const modelRouting = _resolveModelProfileRouting();

  const response = await fetch("/api/chat_stream", {
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

  await _consumeSSE(response, (event) => {
    if (event.content) {
      onChunk?.(event.content);
    } else if (event.sources) {
      onSources?.(event.sources);
    } else if (event.actions) {
      runResponseActions({ actions: event.actions });
    } else if (event.type === "done") {
      onDone?.();
    } else if (event.type === "error") {
      throw new Error(event.content || "Stream error");
    }
  });
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

export const getRagSchedulerStatus = async () => {
  const response = await fetch("/api/rag/scheduler/status");
  if (!response.ok) {
    throw new Error("Failed to fetch RAG scheduler status.");
  }
  return response.json();
};

export const forceRagUpdate = async () => {
  const response = await fetch("/api/rag/scheduler/force_update", { method: "POST" });
  if (!response.ok) {
    throw new Error("Failed to force RAG update.");
  }
  return response.json();
};

export const enableRagScheduler = async () => {
  const response = await fetch("/api/rag/scheduler/enable", { method: "POST" });
  if (!response.ok) {
    throw new Error("Failed to enable RAG scheduler.");
  }
  return response.json();
};

export const disableRagScheduler = async () => {
  const response = await fetch("/api/rag/scheduler/disable", { method: "POST" });
  if (!response.ok) {
    throw new Error("Failed to disable RAG scheduler.");
  }
  return response.json();
};

export const getModelsCatalog = async () => {
  const response = await fetch("/api/models/catalog");
  if (!response.ok) {
    throw new Error("Failed to fetch models catalog.");
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


// ── Pragna Code Agent ────────────────────────────────────────────────────────

const _authHeaders = () => {
  const token = localStorage.getItem('authToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

async function _consumeSSE(response, onEvent) {
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    onEvent({ type: 'error', content: err.error || `HTTP ${response.status}` });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop(); // keep incomplete line
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const event = JSON.parse(line.slice(6));
          onEvent(event);
        } catch (_) {}
      }
    }
  }
}

/**
 * Run the agentic loop with streaming SSE.
 * onEvent(event) is called for each parsed SSE event:
 *   { type: 'thought'|'tool_call'|'tool_result'|'confirm_required'|'done'|'error', content, tool?, args?, session_id?, preview? }
 * Returns a controller with .abort() to cancel.
 */
export const runAgentStream = ({ task, mode = 'general', contextFiles = [], workingDir = null, onEvent }) => {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch('/api/agent/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ..._authHeaders() },
        body: JSON.stringify({ task, mode, context_files: contextFiles, working_dir: workingDir }),
        signal: controller.signal,
      });
      await _consumeSSE(response, onEvent);
    } catch (err) {
      if (err.name !== 'AbortError') {
        onEvent({ type: 'error', content: err.message });
      }
    }
  })();

  return controller;
};

/**
 * Resume a paused agent session after the user approves or rejects a
 * mutating tool call. Same event shape and controller as runAgentStream.
 */
export const resumeAgentStream = ({ sessionId, decision, onEvent }) => {
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch('/api/agent/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ..._authHeaders() },
        body: JSON.stringify({ session_id: sessionId, decision }),
        signal: controller.signal,
      });
      await _consumeSSE(response, onEvent);
    } catch (err) {
      if (err.name !== 'AbortError') {
        onEvent({ type: 'error', content: err.message });
      }
    }
  })();

  return controller;
};

/**
 * Simple non-streaming agent chat (quick questions, no tool loop).
 */
export const agentChat = async ({ task, mode = 'general', history = [] }) => {
  const response = await fetch('/api/agent/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ..._authHeaders() },
    body: JSON.stringify({ task, mode, history }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Agent error');
  return data;
};

/**
 * Get available agent modes from the backend.
 */
export const getAgentModes = async () => {
  const response = await fetch('/api/agent/modes', { headers: _authHeaders() });
  const data = await response.json();
  return data.modes || [];
};

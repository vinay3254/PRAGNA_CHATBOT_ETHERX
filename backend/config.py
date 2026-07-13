"""
Configuration module for Pragna-1 A
Loads settings from .env file
"""
import os
from dotenv import load_dotenv

# Load environment variables from .env file
# Use override=True so backend/.env values take precedence over any
# empty or conflicting environment variables set in the shell.
load_dotenv(override=True)

# Flask Configuration
HOST = os.getenv('FLASK_HOST', '0.0.0.0')
PORT = int(os.getenv('FLASK_PORT', 5001))
# DEBUG should be False in production - only enable for local development
DEBUG = os.getenv('FLASK_DEBUG', 'False').lower() == 'true'

# CORS: comma-separated list of allowed frontend origins in production
# (e.g. "https://etherx-frontend.onrender.com"). Defaults to "*" so local
# dev keeps working with no configuration; set explicitly in production.
_cors_origins_env = os.getenv('CORS_ALLOWED_ORIGINS', '*').strip()
CORS_ALLOWED_ORIGINS = (
    '*' if _cors_origins_env == '*'
    else [origin.strip() for origin in _cors_origins_env.split(',') if origin.strip()]
)

# Development Mode - Enables mock responses for testing without valid API keys
# WARNING: Should be False in production to ensure real API calls
DEVELOPMENT_MODE = os.getenv('DEVELOPMENT_MODE', 'False').lower() == 'true'

if DEVELOPMENT_MODE:
    import logging
    logging.warning('⚠️  DEVELOPMENT_MODE is enabled - demo responses will be used instead of real APIs')

# Groq Configuration (Primary LLM)
GROQ_API_KEY = os.getenv('GROQ_API_KEY', '')
GROQ_MODEL = os.getenv('GROQ_MODEL', 'llama-3.1-70b-versatile')
GROQ_TIMEOUT = int(os.getenv('GROQ_TIMEOUT', 60))
GROQ_BASE_URL = os.getenv('GROQ_BASE_URL', 'https://api.groq.com/openai/v1')

# Validate that at least one API key is configured for production
_has_valid_api = GROQ_API_KEY or os.getenv('OPENAI_API_KEY', '') or os.getenv('OLLAMA_ENABLED', 'False').lower() == 'true'
if not _has_valid_api and not DEVELOPMENT_MODE:
    import logging
    logging.error('❌ CRITICAL: No valid API configuration found!')
    logging.error('   Please configure one of: GROQ_API_KEY, OPENAI_API_KEY, or enable Ollama')
    logging.error('   Set DEVELOPMENT_MODE=True only for testing')

# LLM Provider Selection
LLM_PROVIDER = os.getenv('LLM_PROVIDER', 'standard')  # 'ollama_only', 'standard', or 'deepseek_local'
if LLM_PROVIDER not in ['ollama_only', 'standard', 'deepseek_local']:
    LLM_PROVIDER = 'standard'

# Ollama Configuration (Local Open Models)
OLLAMA_ENABLED = os.getenv('OLLAMA_ENABLED', 'True').lower() == 'true'
OLLAMA_API_URL = os.getenv('OLLAMA_API_URL', 'http://localhost:11434')
OLLAMA_MODEL = os.getenv('OLLAMA_MODEL', 'mistral')
OLLAMA_TIMEOUT = int(os.getenv('OLLAMA_TIMEOUT', 120))

# ── DeepSeek Local (HuggingFace Transformers) ──────────────────────────────
# Used when LLM_PROVIDER = 'deepseek_local'.  The model is downloaded once
# from HuggingFace Hub and cached at ~/.cache/huggingface/.
#
# CPU baseline (Intel i7-1065G7, 16 GB RAM):
#   - Load time  : 60–120 s on first run (model download), ~30 s from cache
#   - Inference  : 30–120 s per response at max_new_tokens=384
#   - RAM usage  : ~6 GB (float32)
#
# GPU upgrade (NVIDIA, no code changes needed):
#   - Device auto-detected, dtype switches to float16
#   - Inference  : 2–10 s per response
#   - VRAM usage : ~3 GB (float16)
#
DEEPSEEK_MODEL_NAME = os.getenv(
    'DEEPSEEK_MODEL_NAME',
    'deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B'
)
DEEPSEEK_MAX_NEW_TOKENS = int(os.getenv('DEEPSEEK_MAX_NEW_TOKENS', 384))
DEEPSEEK_TEMPERATURE = float(os.getenv('DEEPSEEK_TEMPERATURE', 0.7))
DEEPSEEK_DO_SAMPLE = os.getenv('DEEPSEEK_DO_SAMPLE', 'True').lower() == 'true'

# Log DeepSeek mode at startup
if LLM_PROVIDER == 'deepseek_local':
    import logging as _logging
    _logging.getLogger(__name__).info(
        '✅ DEEPSEEK LOCAL MODE: %s | max_new_tokens=%d | device=auto-detect',
        DEEPSEEK_MODEL_NAME, DEEPSEEK_MAX_NEW_TOKENS
    )

# Log mode at startup
if LLM_PROVIDER == 'ollama_only':
    import logging
    logging.warning('⚠️  OLLAMA-ONLY MODE ENABLED: No Groq/OpenAI fallbacks')
    logging.warning(f'   Ollama URL: {OLLAMA_API_URL}')
    logging.warning(f'   Ollama Model: {OLLAMA_MODEL}')
    logging.warning('   Start Ollama with: ollama run mistral')

# OpenAI Configuration (Fallback/Alternative)
OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')
OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-4o')
OPENAI_IMAGE_MODEL = os.getenv('OPENAI_IMAGE_MODEL', 'gpt-image-1')
OPENAI_TTS_MODEL = os.getenv('OPENAI_TTS_MODEL', 'tts-1')
OPENAI_TTS_VOICE = os.getenv('OPENAI_TTS_VOICE', 'alloy')
OPENAI_TIMEOUT = int(os.getenv('OPENAI_TIMEOUT', 60))
IMAGE_GENERATION_ENABLED = os.getenv('IMAGE_GENERATION_ENABLED', 'True').lower() == 'true'
IMAGE_PROVIDER = os.getenv('IMAGE_PROVIDER', 'auto').strip().lower()
IMAGE_FALLBACK_PROVIDER_ENABLED = os.getenv('IMAGE_FALLBACK_PROVIDER_ENABLED', 'True').lower() == 'true'
IMAGE_FALLBACK_PROVIDER_URL = os.getenv('IMAGE_FALLBACK_PROVIDER_URL', 'https://image.pollinations.ai/prompt')

# Runway image generation configuration
RUNWAY_API_KEY = os.getenv('RUNWAY_API_KEY', '')
RUNWAY_API_URL = os.getenv('RUNWAY_API_URL', 'https://api.dev.runwayml.com/v1')
RUNWAY_MODEL = os.getenv('RUNWAY_MODEL', 'gen4_image')
RUNWAY_TIMEOUT = int(os.getenv('RUNWAY_TIMEOUT', 90))
RUNWAY_POLL_ATTEMPTS = int(os.getenv('RUNWAY_POLL_ATTEMPTS', 8))
RUNWAY_POLL_INTERVAL_SECONDS = float(os.getenv('RUNWAY_POLL_INTERVAL_SECONDS', 1.5))
RUNWAY_STRICT_MODE = os.getenv('RUNWAY_STRICT_MODE', 'False').lower() == 'true'

# Multi-model routing configuration
# Ollama is now PRIMARY model for local inference
DEFAULT_MODEL_KEY = os.getenv('DEFAULT_MODEL_KEY', 'ollama:qwen3:8b')
DEFAULT_MODEL_FALLBACKS = [
    item.strip()
    for item in os.getenv('DEFAULT_MODEL_FALLBACKS', 'ollama:qwen3:8b,ollama:qwen3:4b,groq:llama-3.1-8b-instant').split(',')
    if item.strip()
]
CLASSIFIER_MODEL_KEY = os.getenv('CLASSIFIER_MODEL_KEY', 'ollama:qwen3:4b')
CLASSIFIER_FALLBACKS = [
    item.strip()
    for item in os.getenv('CLASSIFIER_FALLBACKS', 'ollama:qwen3:4b,ollama:qwen3:8b,groq:llama-3.1-8b-instant').split(',')
    if item.strip()
]

# Model profile routing (Instant = slightly powerful, Expert = heavily powerful)
MODEL_PROFILE_LIGHT_KEY = os.getenv('MODEL_PROFILE_LIGHT_KEY', 'ollama:qwen3:4b')
MODEL_PROFILE_LIGHT_FALLBACKS = [
    item.strip()
    for item in os.getenv(
        'MODEL_PROFILE_LIGHT_FALLBACKS',
        'ollama:qwen3:4b,ollama:qwen3:8b,groq:llama-3.1-8b-instant'
    ).split(',')
    if item.strip()
]

MODEL_PROFILE_HEAVY_KEY = os.getenv('MODEL_PROFILE_HEAVY_KEY', 'ollama:qwen3:12b')
MODEL_PROFILE_HEAVY_FALLBACKS = [
    item.strip()
    for item in os.getenv(
        'MODEL_PROFILE_HEAVY_FALLBACKS',
        'ollama:qwen3:12b,ollama:qwen3:8b,ollama:gemma3:12b,groq:llama3-70b-8192'
    ).split(',')
    if item.strip()
]

# Registry for open-model routing and UI model discovery.
MODEL_REGISTRY = {
    f'groq:{GROQ_MODEL}': {
        'provider': 'groq',
        'model': GROQ_MODEL,
        'display_name': f'Groq {GROQ_MODEL}',
        'open_weights': False,
        'quality_tier': 'high',
        'speed_tier': 'high',
        'cost_tier': 'standard',
    },
    'groq:llama-3.1-8b-instant': {
        'provider': 'groq',
        'model': 'llama-3.1-8b-instant',
        'display_name': 'Llama 3.1 8B Instant (Groq)',
        'open_weights': True,
        'quality_tier': 'good',
        'speed_tier': 'very_high',
        'cost_tier': 'low',
    },
    'groq:llama3-70b-8192': {
        'provider': 'groq',
        'model': 'llama3-70b-8192',
        'display_name': 'Llama 3 70B (Groq)',
        'open_weights': True,
        'quality_tier': 'high',
        'speed_tier': 'medium',
        'cost_tier': 'medium',
    },
    'groq:mixtral-8x7b-32768': {
        'provider': 'groq',
        'model': 'mixtral-8x7b-32768',
        'display_name': 'Mixtral 8x7B (Groq)',
        'open_weights': True,
        'quality_tier': 'high',
        'speed_tier': 'medium',
        'cost_tier': 'medium',
    },
    'ollama:qwen3:8b': {
        'provider': 'ollama',
        'model': 'qwen3:8b',
        'display_name': 'Qwen3 8B (Ollama Local)',
        'open_weights': True,
        'quality_tier': 'high',
        'speed_tier': 'medium',
        'cost_tier': 'local',
    },
    'ollama:qwen3:4b': {
        'provider': 'ollama',
        'model': 'qwen3:4b',
        'display_name': 'Qwen3 4B (Ollama Local)',
        'open_weights': True,
        'quality_tier': 'good',
        'speed_tier': 'high',
        'cost_tier': 'local',
    },
    'ollama:deepseek-r1:8b': {
        'provider': 'ollama',
        'model': 'deepseek-r1:8b',
        'display_name': 'DeepSeek R1 8B (Ollama Local)',
        'open_weights': True,
        'quality_tier': 'high',
        'speed_tier': 'medium',
        'cost_tier': 'local',
    },
    'ollama:gemma3:12b': {
        'provider': 'ollama',
        'model': 'gemma3:12b',
        'display_name': 'Gemma 3 12B (Ollama Local)',
        'open_weights': True,
        'quality_tier': 'high',
        'speed_tier': 'medium',
        'cost_tier': 'local',
    },
    'ollama:qwen2.5-coder:14b': {
        'provider': 'ollama',
        'model': 'qwen2.5-coder:14b',
        'display_name': 'Qwen2.5 Coder 14B (Ollama Local)',
        'open_weights': True,
        'quality_tier': 'high',
        'speed_tier': 'medium',
        'cost_tier': 'local',
    },
    'ollama:nemotron-3-super:cloud': {
        'provider': 'ollama',
        'model': 'nemotron-3-super:cloud',
        'display_name': 'Nemotron 3 Super Cloud (Ollama Local)',
        'open_weights': True,
        'quality_tier': 'high',
        'speed_tier': 'medium',
        'cost_tier': 'local',
    },
    'ollama:adithyak/mysql-index-advisor:latest': {
        'provider': 'ollama',
        'model': 'adithyak/mysql-index-advisor:latest',
        'display_name': 'MySQL Index Advisor (Ollama Local)',
        'open_weights': True,
        'quality_tier': 'good',
        'speed_tier': 'medium',
        'cost_tier': 'local',
    },
    # ── DeepSeek local (HuggingFace Transformers) ────────────────────────
    'deepseek:deepseek-r1-distill-qwen-1.5b': {
        'provider': 'deepseek_local',
        'model': 'deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B',
        'display_name': 'DeepSeek R1 Distill Qwen 1.5B (Local — HuggingFace)',
        'open_weights': True,
        'quality_tier': 'good',
        'speed_tier': 'low',       # Honest: slow on CPU; fast on GPU
        'cost_tier': 'local',
    },
}

MODEL_RECOMMENDATIONS = {
    'balanced': ['groq:llama-3.1-8b-instant', 'ollama:qwen3:8b'],
    'quality': ['groq:mixtral-8x7b-32768', 'ollama:gemma3:12b'],
    'coding': ['ollama:qwen2.5-coder:14b', 'groq:mixtral-8x7b-32768'],
    'local_only': ['ollama:qwen3:8b', 'ollama:qwen3:4b'],
}

# Serper API Configuration (Google Search)
SERPER_API_KEY = os.getenv('SERPER_API_KEY', '')
SERPER_ENABLED = os.getenv('SERPER_ENABLED', 'True').lower() == 'true'
SERPER_TIMEOUT = int(os.getenv('SERPER_TIMEOUT', 10))

# News API Configuration
NEWS_API_KEY = os.getenv('NEWS_API_KEY', '')
NEWS_ENABLED = os.getenv('NEWS_ENABLED', 'True').lower() == 'true'
NEWS_API_LANGUAGE = os.getenv('NEWS_API_LANGUAGE', 'en')
NEWS_API_COUNTRY = os.getenv('NEWS_API_COUNTRY', 'in')
NEWS_TIMEOUT = int(os.getenv('NEWS_TIMEOUT', 10))
NEWS_MAX_RESULTS = int(os.getenv('NEWS_MAX_RESULTS', 5))

# Whisper Configuration for STT
WHISPER_MODEL_SIZE = os.getenv('WHISPER_MODEL_SIZE', 'base')

# Audio Configuration
AUDIO_SAMPLE_RATE = int(os.getenv('AUDIO_SAMPLE_RATE', 16000))

# Logging Configuration
LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')

# ======================== RAG KNOWLEDGE BASE UPDATES ========================
# Keep models updated with real-time information beyond training cutoff (Dec 2023)

# Enable automatic knowledge base updates
RAG_AUTO_UPDATE_ENABLED = os.getenv('RAG_AUTO_UPDATE_ENABLED', 'True').lower() == 'true'

# Update interval in hours (e.g., 2 = every 2 hours)
RAG_UPDATE_INTERVAL_HOURS = int(os.getenv('RAG_UPDATE_INTERVAL_HOURS', 2))

# Run one update immediately when the server starts (before the first scheduled cycle)
RAG_RUN_IMMEDIATE_ON_START = os.getenv('RAG_RUN_IMMEDIATE_ON_START', 'True').lower() == 'true'

# Update timing: time of day to start updates (24-hour format, e.g., "02:00" for 2 AM)
RAG_UPDATE_START_HOUR = os.getenv('RAG_UPDATE_START_HOUR', '02')  # Start at 2 AM

# Topics to automatically update (comma-separated)
_DEFAULT_RAG_UPDATE_TOPICS = [
    # User-requested domains
    'AI Regulations and Government Policies',
    'AI in Public Services and Smart Governance',
    'AI in Defense and National Security',
    'AI in Legal and Judicial Systems',
    'AI in Sports Analytics and Performance Tracking',
    'AI in Umpiring and Decision Review Systems',
    'AI in Fan Engagement and Sports Media',
    'Generative AI Advancements',
    'AI Copilots in Software Development',
    'Multimodal AI Systems',
    'Autonomous AI Agents',
    'Open-Source AI Growth',
    'AI in Business Automation',
    'AI in Customer Support Systems',
    'AI in Marketing and Personalization',
    'AI in Financial Services and Fraud Detection',
    'AI in Healthcare Diagnostics',
    'AI in Drug Discovery',
    'AI in Medical Imaging',
    'AI in Personalized Treatment',
    'AI in Education and Personalized Learning',
    'AI in Automated Grading Systems',
    'AI in Research Assistance',
    'AI in Media Content Generation',
    'AI in Film and Entertainment',
    'AI in Gaming Industry',
    'AI in Transportation and Autonomous Vehicles',
    'AI in Traffic and Smart City Management',
    'AI in Logistics and Route Optimization',
    'AI in Agriculture and Crop Prediction',
    'AI in Soil and Weather Analysis',
    'AI in Farm Automation and Drones',
    'AI in Cybersecurity and Threat Detection',
    'AI in Automated Cyber Defense',
    'AI in Ethical AI and Bias Concerns',
    'AI in Privacy and Data Protection',
    'AI in Deepfakes and Misinformation',
    'AI in Job Market Transformation',
    'AI in Human-AI Collaboration',
    'AI in Robotics Integration',
    'AI in Edge and On-Device Computing',
    'AI in AGI Research and Development',
    # Additional high-value domains
    'Semiconductor and AI chip ecosystem',
    'Large language model benchmarks and evaluation',
    'AI safety standards and red teaming',
    'AI in climate and sustainability analytics',
    'AI in telecom and network optimization',
    'AI in e-commerce recommendations and conversion',
    'AI in supply chain resilience and forecasting',
    'AI in energy grid optimization',
    'AI in insurance underwriting and claims',
    'AI in HR recruiting and workforce analytics',
]

_DEFAULT_RAG_UPDATE_TOPICS_CSV = ','.join(_DEFAULT_RAG_UPDATE_TOPICS)
RAG_UPDATE_TOPICS = [
    topic.strip() for topic in os.getenv('RAG_UPDATE_TOPICS', _DEFAULT_RAG_UPDATE_TOPICS_CSV).split(',')
    if topic.strip()
]

# India-first current-affairs domains used by the web refresh pipeline.
_DEFAULT_RAG_PRIORITY_DOMAINS = [
    'India politics latest news',
    'Indian Parliament and policy updates',
    'Indian elections and party developments',
    'India economy and RBI updates',
    'India stock market and business headlines',
    'India sports headlines today',
    'Indian cricket and BCCI updates',
    'IPL latest news and match analysis',
    'Indian football and ISL news',
    'Bollywood latest news and box office',
    'South Indian cinema Telugu Tamil Malayalam Kannada news',
    'Indian OTT releases and entertainment trends',
    'India international relations and diplomacy',
    'ISRO and Indian science updates',
]

_DEFAULT_RAG_PRIORITY_DOMAINS_CSV = ','.join(_DEFAULT_RAG_PRIORITY_DOMAINS)
RAG_PRIORITY_DOMAINS = [
    topic.strip()
    for topic in os.getenv('RAG_PRIORITY_DOMAINS', _DEFAULT_RAG_PRIORITY_DOMAINS_CSV).split(',')
    if topic.strip()
]

# Number of documents to add per update cycle
RAG_UPDATE_BATCH_SIZE = int(os.getenv('RAG_UPDATE_BATCH_SIZE', 10))

# News sources to aggregate (if available)
RAG_NEWS_SOURCES = os.getenv(
    'RAG_NEWS_SOURCES',
    'hackernews,techcrunch,medium,stackoverflow'
)

# Clear old documents before adding new ones (keep knowledge fresh)
RAG_CLEAR_BEFORE_UPDATE = os.getenv('RAG_CLEAR_BEFORE_UPDATE', 'False').lower() == 'true'

# ============================================================================

# Conversation History and Memory Management
# Maximum number of messages to retrieve from database (before smart pruning)
CONVERSATION_HISTORY_SIZE = int(os.getenv('CONVERSATION_HISTORY_SIZE', 100))

# Memory Management - Token-based optimization
# Maximum token budget for conversation history in prompt (rough estimate for Llama models)
# Llama typically supports 8K or 70K tokens; we reserve ~2K-4K for history to leave room for response
MAX_HISTORY_TOKENS = int(os.getenv('MAX_HISTORY_TOKENS', 3000))

# Absolute maximum number of messages to keep in history
MAX_HISTORY_MESSAGES = int(os.getenv('MAX_HISTORY_MESSAGES', 50))

# Minimum number of recent messages to always include (regardless of token count)
MIN_HISTORY_MESSAGES = int(os.getenv('MIN_HISTORY_MESSAGES', 5))

# Token estimation multiplier (rough: 1 token ≈ 4 characters for Llama models)
TOKEN_ESTIMATE_MULTIPLIER = float(os.getenv('TOKEN_ESTIMATE_MULTIPLIER', 0.25))

# Message importance scoring weights for smart pruning
# Higher weights = more important, more likely to be kept
MESSAGE_IMPORTANCE_WEIGHTS = {
    'recent_boost': 1.5,           # Boost for recent messages (exponential decay)
    'user_query_weight': 1.2,       # User queries are more important than assistant responses
    'assistant_response_weight': 1.0,  # Assistant responses baseline
    'long_message_bonus': 0.3,      # Bonus for longer, more detailed messages
    'question_bonus': 0.4,          # Bonus if message contains question marks
}

# JWT Authentication
JWT_SECRET = os.getenv('JWT_SECRET', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_DAYS = int(os.getenv('JWT_EXPIRATION_DAYS', 7))

# Database Configuration
DATABASE_URL = 'sqlite:///data/chatbot.db'
DATABASE_ECHO = False

# API Cost Tracking
GROQ_COST_PER_1K_TOKENS = 0.0005  # Example cost in USD

# Supported Languages - Indian and International languages with native Google TTS voice support
# Only languages with direct Google Translate TTS support
SUPPORTED_LANGUAGES = {
    # International
    'en': 'English',
    
    # Major Official Indian Languages (with native TTS support)
    'hi': 'Hindi',
    'ta': 'Tamil',
    'te': 'Telugu',
    'kn': 'Kannada',
    'ml': 'Malayalam',
    'mr': 'Marathi',
    'gu': 'Gujarati',
    'pa': 'Punjabi',
    'bn': 'Bengali',
    
    # Other Languages with TTS support
    'ur': 'Urdu',
}

# Language to Whisper code mapping
# Only includes languages with native Google TTS support
LANGUAGE_CODES = {
    # International
    'en': 'english',
    
    # Major Official Indian Languages
    'hi': 'hindi',
    'ta': 'tamil',
    'te': 'telugu',
    'kn': 'kannada',
    'ml': 'malayalam',
    'mr': 'marathi',
    'gu': 'gujarati',
    'pa': 'punjabi',
    'bn': 'bengali',
    
    # Other Languages
    'ur': 'urdu',
}

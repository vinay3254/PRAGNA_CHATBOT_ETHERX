# PRAGNA Chatbot: Comprehensive Product & Architecture Review

This document provides a thorough, developer-centric review of the PRAGNA Chatbot application codebase, architecture, dependencies, and design patterns.

---

## 1. Executive Summary

**PRAGNA** is a hybrid, local-first, multilingual chatbot system that integrates Retrieval-Augmented Generation (RAG) and local LLM inference. It is designed to run locally on consumer hardware using Ollama, but includes advanced failover mechanisms to access cloud endpoints (like Groq) if needed.

The codebase is split into two primary components:
1. **Frontend**: A fast React application powered by Vite.
2. **Backend**: A Flask-based Python web service managing database storage (SQLite), vector indexing (FAISS), and LLM routing.

---

## 2. Architecture & Data Flow

### Chat Execution Pipeline
When a user submits a query in the UI:
1. **Intent Classification**: The backend determines if the query requires factual information retrieval.
2. **Context Retrieval (RAG)**: If factual context is needed, the system converts the query into a vector representation, searches the **FAISS vector database**, and retrieves matching document snippets.
3. **Prompt Assembly**: The system prompt is constructed by applying persistent **Chat Mode** instructions (e.g., Code Assistance, Educator style) and embedding the retrieved RAG context.
4. **LLM Inference**: The query is routed to the local Ollama instance (e.g., `Ravishka/Miku`), or falls back to cloud models if the local system is unreachable.

---

## 3. Core Component Analysis

### A. Backend Server (`backend/app.py`)
* **Role**: Exposes endpoints for chat orchestrations, user authentication, history tracking, and document uploads.
* **Review**:
  * **Document Processing**: Extremely versatile. Features custom text extractors for standard formats (`.pdf`, `.docx`, `.xlsx`).
  * **Threading/Concurrency**: Currently utilizes Flask's built-in development server. This is single-threaded by default and can block during CPU-heavy operations (like FAISS search or embedding generation).
  * **Recommendation**: Must be deployed behind a production WSGI server (like Gunicorn/uWSGI) with async worker models (e.g., `gevent`) to handle concurrent requests.

### B. LLM Orchestration (`backend/services/llm.py` & `backend/llm_service.py`)
* **Role**: Handles LLM API requests, streams responses, and manages model switching.
* **Review**:
  * **Fallback System**: Highly resilient. If the primary model fails, the system automatically checks the next model in the fallback array.
  * **Provider Diversity**: Supports Ollama (local), DeepSeek local (via HuggingFace Transformers), Groq (cloud), and OpenAI.
  * **Code Quality**: Code is clean and heavily logs errors and warnings, making debugging local connections simple.

### C. RAG Engine (`backend/services/rag_service.py`)
* **Role**: Generates vector embeddings for documents and performs similarity searches.
* **Review**:
  * **Vector Engine**: Utilizes **FAISS** (Facebook AI Similarity Search) and `sentence-transformers/all-MiniLM-L6-v2`. This is an industry-standard, highly efficient CPU setup.
  * **Caching**: Employs a 10-minute cache for query results, drastically reducing vector comparisons for repetitive user queries.

---

## 4. Dependencies & Footprint

The system relies on several large packages:
* **`torch` & `transformers`**: Used for local DeepSeek models. Adds a large installation footprint (~1GB+).
* **`sentence-transformers` & `faiss-cpu`**: Fast and efficient CPU-only vector lookup.
* **`sqlite3`**: Used for session memory and chat history management. Lightweight and zero-maintenance.

---

## 5. Strengths, Limitations, and Recommendations

### Strengths
1. **API Independence**: Capable of running completely offline using local models via Ollama.
2. **Resilience**: The fallback model system guarantees service availability.
3. **Clean Code Separation**: Clear boundaries between frontend contexts, backend routing, and database interactions.

### Limitations
1. **Heavy Boot-Up Footprint**: Loading local HuggingFace models consumes significant system memory.
2. **Synchronous Bottlenecks**: High-concurrency operations on document parsing can lag under single-threaded servers.

### Recommendations for Scaling
1. **Decouple Embedding Engine**: Move the FAISS and Sentence-Transformer embedding engine into a standalone microservice or switch to a lightweight remote vector database.
2. **Database Cleanups**: Setup auto-purge scripts for old conversation history to prevent SQLite database growth from slowing query operations over time.

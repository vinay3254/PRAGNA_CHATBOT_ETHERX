"""
PRAGNA RAG SYSTEM - QUICK START GUIDE
=====================================

This document explains the Retrieval-Augmented Generation (RAG) system
integrated into the Pragna multilingual chatbot.

## What is RAG?

RAG (Retrieval-Augmented Generation) combines information retrieval with
generative AI to produce more accurate, factual responses. The system:

1. Maintains a knowledge base of documents
2. Converts documents into embeddings (numerical representations)
3. When a user asks a question, retrieves the most relevant documents
4. Feeds the retrieved context to the LLM along with the question
5. LLM generates a response based on both the context and its training

Benefits:
- Reduces hallucinations (false information)
- Improves factual accuracy
- Allows for custom knowledge bases
- Handles domain-specific information
- Keeps responses grounded in facts

## Architecture

### Components

1. **rag_service.py** - Core RAG engine
   - Uses Sentence Transformers (all-MiniLM-L6-v2) for embeddings
   - Uses FAISS (Facebook AI Similarity Search) for vector indexing
   - Manages document chunking, embedding, and retrieval
   - Caches results to improve performance

2. **web_scraper.py** - Dynamic content updates
   - Scrapes Wikipedia, news, and other sources
   - Updates knowledge base with fresh content
   - Enables regular knowledge base refresh

3. **llm_service.py** - LLM orchestration with RAG
   - Decides when to use RAG (smart routing)
   - Calls RAG retrieval when needed
   - Injects context into prompts
   - Falls back to normal LLM if no context

4. **app.py** - Flask API
   - REST endpoints for RAG management
   - Statistics and monitoring
   - Document upload and management

### Data Flow

```
User Query
    ↓
Intent Classification (Is this a factual query?)
    ↓
If Factual Query:
    ├→ Search existing routing context (search/news)
    ├→ If no context found, use RAG retrieval
    │   ├→ Convert query to embedding
    │   ├→ Search FAISS index
    │   ├→ Return top relevant documents
    │   └→ Cache result for 10 minutes
    ├→ Combine all context
    └→ Inject into LLM prompt
    ↓
Generate Response
```

## Installation

### Required Dependencies

The RAG system requires:

```bash
pip install sentence-transformers  # For embeddings
pip install faiss-cpu               # For vector search
pip install beautifulsoup4          # For web scraping (optional)
```

Or install from requirements.txt:

```bash
pip install -r requirements.txt
```

### Optional

- For GPU acceleration: `pip install faiss-gpu`
- For advanced scraping: `pip install feedparser` (RSS feeds)

## Configuration

No special configuration needed! RAG works out of the box.

Default settings in rag_service.py:
- Model: `all-MiniLM-L6-v2` (384-dimensional embeddings)
- Chunk size: 300 characters
- Top-K retrieval: 3 documents
- Similarity threshold: 0.5
- Cache TTL: 600 seconds (10 minutes)

## Usage

### 1. REST API Endpoints

**Get RAG Status:**
```bash
GET /api/rag/stats
```
Response: Enabled status, document count, model info

**Add Documents:**
```bash
POST /api/rag/add_documents
Content-Type: application/json

{
    "documents": [
        "Document 1 text...",
        "Document 2 text..."
    ],
    "document_ids": ["doc1", "doc2"]  # optional
}
```

**Update with Web Content:**
```bash
POST /api/rag/update_web_content
Content-Type: application/json

{
    "topics": ["Python", "Machine Learning", "Web Development"]
}
```

**Clear Knowledge Base:**
```bash
POST /api/rag/clear
```

### 2. Programmatic Usage

```python
from services.rag_service import get_rag_service, initialize_rag_with_defaults

# Initialize with default documents
initialize_rag_with_defaults()

# Get RAG service instance
rag = get_rag_service()

# Add documents
rag.add_documents([
    "Python is a programming language...",
    "Machine learning enables systems to learn..."
])

# Retrieve context
result = rag.retrieve_context("What is Python?", top_k=3)
if result['found']:
    print(f"Context: {result['context']}")
    print(f"Sources: {result['sources']}")
```

### 3. LLM Integration

```python
from llm_service import LLMService

llm = LLMService()
llm.enable_rag()

# RAG is now automatically used for factual queries
response, sources = llm.get_response(
    "Tell me about Python",
    language="en",
    user_id="default"
)
```

## How RAG Decides When to Use Retrieval

RAG is NOT used for:
- Tool/calculator queries (e.g., "Calculate 2+2")
- Very short messages (e.g., greetings like "Hi")
- Casual/personal queries when history exists

RAG IS used for:
- General knowledge questions (intent: "general")
- Factual/current information queries (intent: "realtime")
- Message length > 15 characters

This ensures RAG isn't wasted on simple queries while maximizing
benefit for factual questions.

## Performance

### Speed
- Embedding generation: ~50-100ms per query
- FAISS search: <1ms for 1000 documents
- Result caching: Eliminates repeated searches

### Memory
- Model (all-MiniLM-L6-v2): ~90MB
- FAISS index: ~100MB per 10,000 documents
- Total overhead: Minimal for typical setups

### Optimization
- Results cached for 10 minutes
- Chunk overlap prevents missing information
- L2 distance normalization for fair similarity scoring

## Troubleshooting

### RAG not working?

1. **Check dependencies:**
```bash
python -c "import sentence_transformers; import faiss; print('OK')"
```

2. **Check server logs:**
Look for "RAG" in startup logs

3. **Verify knowledge base:**
```bash
curl http://localhost:5000/api/rag/stats
```

4. **Add test documents:**
```bash
curl -X POST http://localhost:5000/api/rag/add_documents \
  -H "Content-Type: application/json" \
  -d '{"documents": ["Test document about Python"]}'
```

### Slow responses?

- Check cache hit rate: `GET /api/cache/stats`
- Reduce chunk size for faster processing
- Use GPU acceleration: `pip install faiss-gpu`

### Out of memory?

- Reduce `/tmp` space availability
- Clear cache: `POST /api/cache/cleanup`
- Clear RAG index: `POST /api/rag/clear`

## Best Practices

1. **Chunk size:** Keep around 300 characters
   - Too small: Loses context
   - Too large: Returns irrelevant results

2. **Document quality:** Use clear, well-structured documents
   - Helps embeddings understand meaning
   - Improves retrieval accuracy

3. **Regular updates:** Add new content periodically
   - Use web scraper for news/trending topics
   - Keep knowledge base fresh

4. **Monitor performance:**
   - Check cache hit rates
   - Monitor retrieval latency
   - Track query success rates

## Advanced Usage

### Custom Embeddings Model

```python
from services.rag_service import RAGService
import rag_service

# Change model (requires reinstantiation)
rag_service.RAG_MODEL_NAME = "all-mpnet-base-v2"  # Better accuracy, slower
```

### Fine-tuning Retrieval

```python
rag.retrieve_context(
    query="What is AI?",
    top_k=5,                    # Return more results
    similarity_threshold=0.3    # Lower threshold = more results
)
```

### Web Content Updates

```python
from services.web_scraper import update_rag_with_custom_content

# Add content about current topics
update_rag_with_custom_content([
    "Latest AI developments",
    "Python 3.12 features",
    "Machine learning trends"
])
```

## Integration with Other Pragna Features

RAG works seamlessly with:
- ✅ Conversation memory (maintains context across turns)
- ✅ Multilingual support (embeddings work across languages)
- ✅ Caching system (results cached for performance)
- ✅ Intent routing (selective RAG usage)
- ✅ Web search (complements search API results)
- ✅ News retrieval (provides additional context)

## Examples

Run the included examples:

```bash
# Example usage and API demonstrations
python rag_examples.py

# Integration tests
python test_rag_integration.py
```

## Future Enhancements

Potential improvements:
- Hybrid search (keyword + semantic)
- Multi-model retrieval (multiple embeddings)
- Real-time knowledge graph
- User-specific knowledge bases
- Feedback loop for quality improvement
- Distributed indexing for scale

## Support & Documentation

Files included:
- `services/rag_service.py` - Complete RAG implementation
- `services/web_scraper.py` - Web content utilities
- `backend/rag_examples.py` - Usage examples
- `backend/test_rag_integration.py` - Integration tests
- `services/cache_service.py` - Caching (used by RAG)
- `config.py` - Configuration parameters

Questions? Check the docstrings in these files for detailed information.

=====================================
RAG System | Pragna Multilingual AI
"""

# Example usage
if __name__ == "__main__":
    print(__doc__)

# RAG 2.0 — incremental implementation

The RAG engine remains **local SQLite**, with no Docker or Ollama.

## Available
- Lexical FTS5 search and adaptive hybrid retrieval: `RagPipeline.retrieve(query,{mode:'adaptive'|'lexical'|'semantic'|'hybrid'})`.
- Deterministic local hashed token vectors stored in `rag_vectors`; unchanged chunks are not recalculated. **These are not neural embeddings** and will not reliably understand synonyms or paraphrases.
- Existing verified chunk citations and retrieval coverage ranking.
- Existing graph edges plus `GET /api/rag/graph?subject=...`.
- Temporal fact events and conflict listing via `POST /api/rag/temporal/facts`.
- Feedback storage via `POST /api/rag/feedback`.
- Index sync via `POST /api/rag/semantic/index`; metrics via `GET /api/rag/intelligence/status`.
- Existing background file indexing remains available; vector sync is performed lazily on hybrid retrieval or manually via API.
- Local query vector cache, not model-response caching.

## Still required before calling all 12 modules complete
- Neural embedding model with optional Cloud.ru provider, proper dimensionality/version tracking, and vector migration.
- Efficient vector ANN indexing for large libraries (current vector search scans rows).
- Agentic planning, true Self-RAG answer verification, and corrective multi-stage search.
- Temporal validity windows and fact provenance policy, automated fact consolidation and contradiction resolution.
- Automated quality evaluation and end-to-end Windows CI verification.

All APIs remain bound to the local server. Do not expose the unauthenticated local HTTP port to the network.

# RAG autonomy programme: items 25–40

This document tracks scope and acceptance criteria. A checked item is not a claim that the whole capability is finished.

| # | Capability | Current milestone | Acceptance gate |
|---|---|---|---|
|25|Research agent|Existing agent research APIs|Source-grounded proposals, bounded work, no fabricated citations|
|26|Critic agent|Existing pending evidence review; coordinator detects stale evidence|Contradictions and stale evidence flagged with references|
|27|Library guardian|Existing local indexer; filesystem watcher added|Only configured local paths, no traversal|
|28|Knowledge architect|Existing topic/relation graph|Incremental rebuild, measured graph quality|
|29|Consolidator|Planned|Merge suggestions preserve provenance and originals|
|30|Auditor|Existing backup integrity checks|Traceable checks, no silent destructive fixes|
|31|Optimizer|Offline nDCG/recall gate added|Measured improvement on held-out evaluation set|
|32|Mentor|Existing agent experience approval flow and offline role coordinator|Reviewed lessons only, no autonomous promotion|
|33|Event-driven RAG|Debounced file watcher with periodic fallback added|No lost events; portable fallback|
|34|Content-addressed storage|Planned|Duplicate content stored once with separate source references|
|35|Multilevel cache|Existing pipeline cache; bounded reusable TTL/LRU utility added|Scope isolation, invalidation, no private chat leakage|
|36|Incremental indexing|Existing changed-content detection|Only changed chunks re-embedded and graph-updated|
|37|Local scheduler|Existing bounded queue; coordinator queues evidence audits|Budgets, retries, durable pending jobs|
|38|Benchmarks|Recall@K, Precision@K, MRR, nDCG added|Reproducible labeled corpus, latency and cost metrics|
|39|Safe evolution|Candidate promotion proposal added|Never auto-apply a regressive configuration|
|40|Self-optimization|Evaluation-only foundation|Explicit approval, rollback and observed benefit|

## Engineering guardrails

- No external upload of documents, chats, keys or private embeddings.
- Avoid Cloud.ru requests for filesystem monitoring, cache lookups and offline evaluation.
- Keep the original document and provenance for every proposed knowledge merge.
- Do not represent a heuristic score as proof of factual correctness.
- Test on Windows and Linux before claiming deployment readiness.
- Changes to production ranking must have a benchmark, explicit authorization and rollback plan.

## Agent coordinator milestone

`src/rag-agent-coordinator.js` exposes eight role identifiers, a local evidence-backed lesson proposal workflow, stale-evidence audits, a bounded audit queue and transactional rejection of obsolete pending lessons. It deliberately does **not** run autonomous cloud agents or automatically approve knowledge. `tests/rag-agent-coordinator.test.js` checks the evidence lifecycle.

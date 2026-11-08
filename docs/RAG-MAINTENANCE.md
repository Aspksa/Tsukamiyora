# RAG maintenance and agent experience

All maintenance described here runs locally. No Cloud.ru calls are needed for lexical retrieval, the knowledge guardian, or reviewed agent lessons.

## Knowledge dashboard

Start the application normally and open `http://127.0.0.1:4177/knowledge`. The dashboard shows the indexer's queue status, guardian checks, the last 15 journal entries, pending agent lessons, and review decisions. It never displays private chat contents.

## API

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/rag/indexer/status` | Scheduled scan and bounded queue status |
| GET | `/api/rag/guardian/status` | Latest read-only guardian report |
| GET | `/api/rag/guardian/history?limit=20` | Local maintenance history |
| GET | `/api/rag/agents/experience/pending?limit=30` | Pending review proposals, including evidence freshness |
| POST | `/api/rag/agents/experience` | Propose `{agentId,taskKey,lesson,sourceId}` |
| POST | `/api/rag/agents/experience/review` | Review `{id,approved}` |
| GET | `/api/rag/agents/experience/reviews?limit=30` | Decision audit |
| GET | `/api/rag/agents/experience?taskKey=...` | Approved lessons with unchanged evidence |
| GET | `/api/rag/agents/research?q=...&taskKey=...` | Lexical results plus approved lessons cited by the current retrieval |
| GET | `/api/rag/relations?entity=...` | Extracted explicit document relations |
| GET | `/api/rag/edges?subject=...` | Manually recorded graph edges |

## Safety

- Proposals require a `file:` source. Private `chat:` content cannot become shared agent experience.
- An approval requires the source body hash to match the proposal. Outdated proposals can still be rejected.
- Approved lessons are only returned while the source exists and its body hash is unchanged.
- Review decisions and guardian summaries are stored in SQLite; journal records contain no document bodies.
- Automatic indexing only reads paths resolving within the project root. Incomplete or capped scans never purge previously tracked documents.
- File deletion removes extracted graph relations. Changes to documents invalidate obsolete extracted relations.
- The guardian identifies consolidation candidates but never merges facts without explicit approval.

## Validation

Run `npm test` using Node.js 22.13 or newer. The repository also contains a GitHub Actions matrix for Windows and Ubuntu. A committed test is not proof of a passing CI run; inspect the run results before deployment.

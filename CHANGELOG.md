# Changelog

## [1.2.0] - 2026-03-17

### Added
- **Anti-hallucination grounding system** — Enterprise-grade fact-checking pipeline integrated into PerformanceEvaluator
  - Claim extraction: LLM extracts verifiable claims (factual, opinion, reference, prediction) from entity output
  - Memory grounding: each claim cross-referenced via vector search + FTS5 against stored memories
  - Contradiction detection: opinions checked against past positions, silent contradictions flagged
  - Citations: every grounded claim links to source memory IDs for audit
  - Zero-tolerance contradictions: always trigger output regeneration
  - Grounding score: grounded=1.0, novel=0.8, ungrounded=0.3, contradicted=0.0
  - Quality score weights with grounding: 0.30*ICS + 0.20*VCS + 0.25*guardrail + 0.25*grounding
- New schema primitive: `GroundingReport` with `Claim` type

## [1.1.0] - 2026-03-17

### Added
- **DAG memory consolidation** — Hierarchical summarization (episodic -> leaf -> condensed) with importance-aware compression
  - `MemoryConsolidator` with configurable fresh_tail_count, leaf_chunk_size, condensation_threshold
  - `MemoryNode` schema primitive for DAG hierarchy
  - Expand any summary node back to original source entries
  - High-importance entries (>=0.7) resist compression 2x longer
- **FTS5 full-text search** — SQLite FTS5 index with porter stemmer + unicode61 tokenizer
  - `SQLiteFTSIndex` sharing existing DB connection
  - BM25-ranked results with snippets
- **Hybrid retrieval** — Composite scoring: 0.4*vector + 0.2*fts + 0.2*importance + 0.2*recency
  - Fresh tail (last N entries) always included at max score
  - `EnrichedMemoryResult` with source markers (fresh_tail, vector, fts, consolidated)
  - Grep endpoint for pure keyword search
  - Backward compatible: original 0.5/0.3/0.2 weights when FTS absent
- **Prompt builder upgrade** — RECENT MEMORY / CONSOLIDATED MEMORY / RELEVANT MEMORY sections
  - Falls back to flat list when no source markers present (backward compat)
- **Memory API routes** — search, grep, consolidate, nodes, expand endpoints
- **Hybrid vector store** — InMemory hot path + LanceDB cold persistence
  - `HybridVectorStore` with configurable flush threshold
  - `warmFromCold()` loads LanceDB -> InMemory on startup
  - Periodic flush (60s) + flush on consolidate + final flush on shutdown
  - Zero overhead on hot path reads/writes
- **Cross-time drift tracking** — Full time-series history of trait value changes
  - `DriftTracker` with record, getHistory, getValueAt, getVelocity, getTrajectory
  - `DriftEvent` schema primitive
  - `DriftEngine` auto-records events when tracker present (backward compat)
  - Drift history API routes: history, velocity, trajectory, value-at
- **Memory benchmark suite** — Latency benchmarks at 100/1k/10k scale
  - Compares InMemory vs Hybrid backends
  - Tests retrieve, grep, consolidate, store, expand, flush, fact recall

### Changed
- `EpisodicEntrySchema` adds `consolidated` field (default false, backward compatible)
- `MemoryManager` constructor accepts optional `fts` parameter
- `MemoryRetriever` constructor accepts optional `fts` and `config` parameters
- `DriftEngine` constructor accepts optional `tracker` and `epochManager` parameters
- `Storage` interface adds `fts: IFTSIndex`
- `createVectorStore()` now returns `HybridVectorStore`

## [1.0.0] - 2026-03-17

### Added
- Initial release: Idol Frame identity layer for LLMs
- 12 packages: schema, storage, llm, identity, state, cognition, runtime, performance, evaluation, evolution, api
- 47 API endpoints with envelope response format
- 20 schema primitives with Zod validation
- 12 runtime invariants
- Entity lifecycle: create, perform, evaluate, evolve, snapshot, rollback
- Evaluation pipeline: guardrails, identity scoring, voice analysis
- State management: memory, mood, arcs, epochs, drift rules
- LLM provider abstraction: OpenAI, Anthropic
- SQLite document store + in-memory vector store
- 234 tests

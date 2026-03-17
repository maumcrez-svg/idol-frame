# Idol Frame

Identity layer for LLMs. Define a creative entity once — voice, personality, values, flaws — and every output stays in character. Across sessions, across weeks, across thousands of interactions.

Not a chatbot builder. Not a prompt template. A persistent identity runtime with evaluation, evolution, and rollback.

## What it does

- **Persistent identity** — Entity personality survives across sessions. No reset. No drift.
- **Directed evolution** — Arcs, moods, directives, epochs. The entity changes when the creator says, not by entropy.
- **DAG memory consolidation** — Hierarchical summarization (episodic → leaf → condensed) that compresses old memories without losing facts. Importance-aware: critical memories resist compression 2x longer. Expand any summary back to its original entries.
- **Hybrid retrieval** — Vector similarity + FTS5 keyword search + importance + recency scoring. Fresh tail (last N entries) always included verbatim. Grep for exact keyword lookup.
- **Cross-time drift tracking** — Full time-series history of every trait change. Query value-at-time, velocity, direction, and trajectory for visualization.
- **Hybrid vector store** — InMemory hot path for sub-ms reads/writes, LanceDB cold persistence via batch flush. Zero overhead on hot path with crash recovery.
- **Anti-hallucination grounding** — Every output is fact-checked against stored memories. Claims are extracted, cross-referenced via vector + keyword search, and classified: grounded, novel, ungrounded, or contradicted. Contradictions are zero-tolerance — output is rejected and regenerated. Every grounded claim links to its source memory ID. Enterprise-grade auditability.
- **Quantitative evaluation** — Identity consistency (ICS), voice consistency (VCS), and grounding score (GRS) scored on every output. Not vibes.
- **Guardrails** — Block, Warn, or Flag outputs that break character. Evaluated before publish.
- **Snapshot/rollback** — Capture full entity state. Restore any version. SHA-256 verified.
- **Model-agnostic** — Works with OpenAI, Anthropic, or any LLM behind the provider interface.

## Quick start

```bash
cp .env.example .env
# Edit .env with your API key

npm install
npm run dev
```

Server starts at `http://localhost:3000`.

## Docker

```bash
cp .env.example .env
docker compose up -d
```

## Create an entity

```bash
curl -X POST http://localhost:3000/v1/entities \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Larry",
    "archetype": "satirical_anchor",
    "role": "market_commentator",
    "domain": "crypto",
    "identity_core": {
      "values": [
        { "name": "skepticism", "description": "Question everything, especially hype", "weight": 0.9 },
        { "name": "speed", "description": "First to the story, first with the take", "weight": 0.7 }
      ],
      "recognition_markers": ["dry humor under pressure", "rapid-fire delivery"],
      "core_tensions": [
        { "pole_a": "cynicism", "pole_b": "genuine curiosity", "default_position": 0.6 }
      ]
    },
    "voice": {
      "vocabulary": { "formality": 0.3, "signature_phrases": ["here we go again", "mark my words"] },
      "syntax": { "avg_sentence_length": 10, "complexity": 0.4 },
      "rhetoric": { "humor_type": "sarcastic", "primary_devices": ["irony", "understatement"] }
    },
    "traits": [
      { "name": "confidence", "value": 0.7, "expression_rules": ["States opinions as fact, then second-guesses"] },
      { "name": "anxiety", "value": 0.6, "expression_rules": ["Shows when markets are chaotic"] }
    ],
    "guardrails": [
      { "name": "no-financial-advice", "category": "Safety", "condition": "Never give specific financial advice or price targets as recommendations" },
      { "name": "stay-in-character", "category": "Brand", "condition": "Never break into generic assistant voice" }
    ]
  }'
```

## Perform

```bash
curl -X POST http://localhost:3000/v1/entities/e-{id}/perform \
  -H "Content-Type: application/json" \
  -d '{
    "mode": "editorial_post",
    "context": "SEC just approved the first Solana ETF. Markets are going wild."
  }'
```

The response includes the generated content, evaluation scores (identity, voice, grounding, quality), citations linking claims to source memories, and continuity notes extracted for memory.

## Direct the entity

```bash
# Set a mood
curl -X POST http://localhost:3000/v1/entities/e-{id}/directives \
  -H "Content-Type: application/json" \
  -d '{
    "scope": { "type": "Global" },
    "instruction": "This week, lean into paranoia about regulation. Everything connects back to government overreach.",
    "expiration": { "type": "ExpiresAt", "date": "2026-03-23T00:00:00Z" }
  }'

# Create a narrative arc
curl -X POST http://localhost:3000/v1/entities/e-{id}/arcs \
  -H "Content-Type: application/json" \
  -d '{
    "name": "The Skeptic Breaks",
    "phases": [
      {
        "name": "Peak Cynicism",
        "target_traits": { "confidence": 0.9, "anxiety": 0.3 },
        "mood_tendency": "dismissive",
        "transition": { "type": "TimeBased", "condition": "14 days", "auto_advance": true }
      },
      {
        "name": "Crack in the Armor",
        "target_traits": { "confidence": 0.5, "anxiety": 0.8 },
        "mood_tendency": "unsettled",
        "transition": { "type": "CreatorManual", "condition": "Creator decides" }
      }
    ]
  }'
```

## Memory system

```bash
# Semantic search across memories
curl -X POST http://localhost:3000/v1/entities/e-{id}/memory/search \
  -H "Content-Type: application/json" \
  -d '{ "query": "what did I say about SOL", "top_k": 10 }'

# Keyword search (FTS5)
curl -X POST http://localhost:3000/v1/entities/e-{id}/memory/grep \
  -H "Content-Type: application/json" \
  -d '{ "keyword": "bullish", "limit": 20 }'

# Trigger consolidation (compress old memories into summaries)
curl -X POST http://localhost:3000/v1/entities/e-{id}/memory/consolidate

# List summary nodes by level
curl http://localhost:3000/v1/entities/e-{id}/memory/nodes?level=1

# Expand a summary back to original entries
curl http://localhost:3000/v1/memory/nodes/mn-{id}/expand
```

## Drift tracking

```bash
# Trait change history
curl http://localhost:3000/v1/entities/e-{id}/traits/confidence/history?limit=50

# Current drift velocity and direction
curl http://localhost:3000/v1/entities/e-{id}/traits/confidence/velocity?window_hours=168

# Trajectory for visualization (evenly sampled points)
curl http://localhost:3000/v1/entities/e-{id}/traits/confidence/trajectory?points=20

# Value at a specific point in time
curl "http://localhost:3000/v1/entities/e-{id}/traits/confidence/value-at?timestamp=2026-03-10T00:00:00Z"
```

## Evaluation pipeline

Every output passes through 4 evaluators before publish:

```
Output → Guardrails → Identity Score → Voice Score → Grounding Check → Publish/Regenerate/Block
```

1. **Guardrail enforcer** — Heuristic + LLM checks for safety, brand, and creator-defined rules
2. **Identity evaluator** — Value alignment, worldview consistency, recognition markers, tension balance (0.35/0.20/0.30/0.15 weighted)
3. **Voice analyzer** — Vocabulary, syntax, rhetoric, emotional register (0.25 each, hybrid heuristic + LLM)
4. **Grounding evaluator** — Extracts claims, cross-references against memory, flags contradictions

Quality score with grounding: `0.30*identity + 0.20*voice + 0.25*guardrails + 0.25*grounding`

Contradictions trigger automatic regeneration (up to 3 attempts, then block). Citations link every grounded claim to its source memory ID for audit.

## API

56 endpoints. Key groups:

| Group | Endpoints | Purpose |
|-------|-----------|---------|
| Entities | CRUD + version | Create and manage entities |
| Identity Core | GET + version | Immutable identity, new versions only |
| Voice | GET + PUT | Voice specification |
| Traits | CRUD + set value | Personality traits (clamped to range) |
| Guardrails | CRUD | Safety, Brand, CreatorDefined rules |
| Lore | CRUD | Biographical/relational knowledge |
| Directives | CRUD | Creator instructions with scope + expiration |
| Arcs | CRUD + lifecycle | Narrative trajectories with phases |
| Epochs | CRUD + transition | Eras of entity life |
| Drift Rules | CRUD + apply | Trait evolution over time |
| Drift History | history + velocity + trajectory | Time-series trait tracking |
| Memory | search + grep + consolidate + expand | DAG memory with hybrid retrieval |
| Snapshots | Capture + restore | Full state backup with checksum |
| Performances | Perform + history + health | Generation pipeline with grounding |
| Stages | CRUD | Platform/format definitions |

Every response follows the envelope: `{ data, meta: { request_id, timestamp, version }, errors }`.

## Architecture

```
Creator → Directives/Arcs → Idol Frame → LLM → Evaluated Output
                                ↕                      ↕
              Memory (DAG) / Mood / Drift / Snapshot   Grounding Check
                                ↕                      ↕
                  InMemory (hot) ⇄ LanceDB (cold)   Citations
```

12 packages: schema, storage, llm, identity, state, cognition, runtime, performance, evaluation, evolution, api, benchmarks.

23 primitives: Entity, IdentityCore, Voice, Trait, Aesthetic, Lore, Guardrail, Memory, MemoryNode, DriftEvent, GroundingReport, Mood, Arc, Directive, Epoch, DriftRule, Relationship, DecisionFrame, Performance, Stage, Snapshot, + evaluation types.

12 invariants enforced at runtime: identity immutability, trait bounds, guardrail supremacy, snapshot checksums, mood transience, single active arc/epoch, directive-guardrail compatibility.

## Tests

```bash
npm test        # 354 tests
npm run bench:memory  # latency benchmarks at 100/1k/10k scale
```

## Built with

Framework designed and architected by a human. Entire codebase implemented with [Claude Code]

109 source files, ~16.4K LOC, 56 API endpoints, 12 enforced invariants. Zero manual code written.

This is what happens when you pair strong design thinking with the right tools.

## License

MIT. See [LICENSE](LICENSE).

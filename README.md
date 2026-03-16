# Idol Frame

Identity layer for LLMs. Define a creative entity once — voice, personality, values, flaws — and every output stays in character. Across sessions, across weeks, across thousands of interactions.

Not a chatbot builder. Not a prompt template. A persistent identity runtime with evaluation, evolution, and rollback.

## What it does

- **Persistent identity** — Entity personality survives across sessions. No reset. No drift.
- **Directed evolution** — Arcs, moods, directives, epochs. The entity changes when the creator says, not by entropy.
- **Quantitative evaluation** — Identity consistency (ICS) and voice consistency (VCS) scored on every output. Not vibes.
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

The response includes the generated content, evaluation scores (identity, voice, quality), and continuity notes extracted for memory.

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

## API

47 endpoints. Key groups:

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
| Snapshots | Capture + restore | Full state backup with checksum |
| Performances | Perform + history + health | The 11-step generation pipeline |
| Stages | CRUD | Platform/format definitions |

Every response follows the envelope: `{ data, meta: { request_id, timestamp, version }, errors }`.

## Architecture

```
Creator → Directives/Arcs → Idol Frame → LLM → Evaluated Output
                                ↕
                    Memory / Mood / Eval / Snapshot
```

12 packages: schema, storage, llm, identity, state, cognition, runtime, performance, evaluation, evolution, api.

20 primitives: Entity, IdentityCore, Voice, Trait, Aesthetic, Lore, Guardrail, Memory, Mood, Arc, Directive, Epoch, DriftRule, Relationship, DecisionFrame, Performance, Stage, Snapshot, + evaluation types.

12 invariants enforced at runtime: identity immutability, trait bounds, guardrail supremacy, snapshot checksums, mood transience, single active arc/epoch, directive-guardrail compatibility.

## Tests

```bash
npm test
```

## Built with

Framework designed and architected by a human. Entire codebase implemented with [Claude Code](https://claude.ai/claude-code) (Claude Opus 4.6, 1M context) in a single session — from design docs to 234 passing tests.

80 source files, ~11K LOC, 47 API endpoints, 12 enforced invariants. Zero manual code written.

This is what happens when you pair strong design thinking with the right tools.

## License

MIT. See [LICENSE](LICENSE).

# Part 14: Brand Language

**Status:** NORMATIVE — This document governs all public-facing and internal language about Idol Frame.
**Authority:** All documentation, marketing materials, README files, conference talks, and API naming MUST conform to the terminology and conventions defined here.
**Version:** 1.0.0
**Date:** 2026-03-15

---

## 1. Category Name

**Idol Frame is Persistent Creative Entity Infrastructure.**

Each word carries load. Remove any one and the meaning collapses.

| Word | What It Means | What Removing It Loses |
|---|---|---|
| **Persistent** | Entities survive across sessions, platforms, reboots, and years. State is never ephemeral. The IdentityCore, MemoryStore, Traits, and Arcs are versioned and durable. | Without this: you have a prompt template that starts from zero every time. That is not what Idol Frame builds. |
| **Creative** | Entities are designed for creative work — media production, artistic expression, cultural participation. Not task completion, not customer service, not data retrieval. | Without this: you have a generic agent framework. Idol Frame is opinionated about its domain. |
| **Entity** | The thing being built is a first-class identity with an IdentityCore, Voice, Aesthetic, Traits, Memories, and Arcs. Not a chatbot. Not a function. Not a persona layered onto a base model. An entity is a persistent identity graph. | Without this: you have infrastructure for unnamed, interchangeable processes. |
| **Infrastructure** | Idol Frame is not a product, not a platform, not an application. It is the foundation layer that products are built on. It provides primitives, schemas, APIs, lifecycle management, and orchestration. Others build the end-user experiences. | Without this: you have a demo, not a system. |

**What this category includes:**
- Frameworks for defining, persisting, and evolving creative identities
- Runtime systems that maintain identity consistency across stages
- APIs for orchestrating multi-entity, multi-stage performances
- Schema contracts for identity, state, cognition, and evolution primitives

**What this category excludes:**
- Social media management tools (those are built ON Idol Frame, not IN it)
- Chatbot builders (wrong domain, wrong primitives)
- AI art generators (Idol Frame does not generate media; it defines the identity that guides generation)
- Character sheet editors (a character sheet is a flat document; an Entity is a living graph)
- Prompt template libraries (prompts are an output of the system, not the system itself)

---

## 2. Taglines

### Primary — Technical Audiences
> **"The identity persistence layer for creative AI entities."**

Use in: technical documentation landing pages, SDK README headers, API portal descriptions.
Why it works: names the architectural role (persistence layer), the domain (creative AI), and the unit of work (entities).

### Primary — Creator Audiences
> **"Build creative entities that remember who they are."**

Use in: creator-facing onboarding, product landing pages built on Idol Frame, introductory tutorials.
Why it works: "remember who they are" encodes IdentityCore persistence, MemoryStore durability, and Trait continuity in plain language.

### One-Line Elevator Pitch
> **"Idol Frame lets you define a creative identity once and perform it consistently across every platform, format, and time horizon."**

Use in: cold introductions, email openers, press briefings where you get one sentence.
Why it works: covers the define-once/perform-everywhere architecture and names the three axes of consistency (platform, format, time).

### Conference Talk Subtitle
> **"From Prompt Engineering to Identity Engineering"**

Use in: conference submissions, talk descriptions, panel bios.
Why it works: positions Idol Frame as a paradigm shift, not an incremental improvement. Names the thing being left behind (prompt engineering) and the thing being moved toward (identity engineering).

### GitHub Repository Description
> **"Persistent identity, state, and evolution primitives for creative AI entities. Define once. Perform everywhere. Evolve over time."**

Use in: GitHub repo description field, package registry descriptions, crate/module summaries.
Why it works: names the three primitive layers (identity, state, evolution), fits character limits, and the three-sentence rhythm is scannable.

### Developer Community Shorthand
> **"The Entity lifecycle framework."**

Use in: Discord bios, forum signatures, quick references in technical discussions.
Why it works: developers think in lifecycles. This positions Idol Frame as the system that manages Entity creation, mutation, versioning, and archival.

---

## 3. Key Phrases to Use

These terms are canonical. Use them in all Idol Frame documentation, discussions, and interfaces.

### "Creative entity" — not "AI character" or "AI avatar"

**Why this term:** An Entity in Idol Frame is a first-class primitive (see Part 3, Primitive 1). It has an `id`, a `version`, a `status`, an `IdentityCore`, a `Voice`, an `Aesthetic`, `Traits`, `Memories`, `Arcs`, `Relationships`, `Directives`, and `Guardrails`. It is a persistent identity graph, not a description of a fictional person.

**What "AI character" implies incorrectly:** A character is a fictional construct defined by a narrative. Characters do not have persistent state, do not evolve through Arcs, do not maintain Relationships with real users, and do not perform autonomously. A character lives in a story. An Entity lives in infrastructure.

**What "AI avatar" implies incorrectly:** An avatar is a visual representation controlled by a human. Entities are not puppets. They have autonomous decision-making via DecisionFrames, internal state via Mood and Traits, and evolution via DriftRules and Arcs. An avatar has no interiority. An Entity does.

### "Director" — not "user" or "prompter"

**Why this term:** The human who shapes an Entity's trajectory is making creative direction decisions — defining IdentityCores, setting Guardrails, initiating Arcs, overriding Traits. This is directorial work. The Directive primitive (Part 3) is explicitly named to reflect this relationship.

**What "user" implies incorrectly:** A user consumes a product. A Director shapes a creative system. The relationship is authorial, not transactional.

**What "prompter" implies incorrectly:** A prompter writes text inputs to a language model. A Director defines persistent identity structures, evolution trajectories, and performance constraints. Prompt engineering is one small output of the system, not the Director's primary activity.

### "Performance" — not "output" or "generation"

**Why this term:** A Performance (Part 3, Performance Layer) is a contextualized, identity-consistent act on a Stage. It is shaped by the Entity's current Mood, active Arc phase, applicable Directives, enforced Guardrails, and Stage-specific Adapter rules. It is not raw model output.

**What "output" implies incorrectly:** Output is undifferentiated text that came from a model. A Performance is identity-filtered, context-aware, stage-adapted content that has passed through DecisionFrames and Guardrail checks.

**What "generation" implies incorrectly:** Generation centers the model. Performance centers the Entity. The model is a rendering engine. The Entity is the performer.

### "Stage" — not "platform" or "channel"

**Why this term:** A Stage (Part 3, Orchestration Layer) is the environment where a Performance occurs, complete with its own constraints, Adapter rules, format requirements, and audience context. "Platform" is a business term. "Channel" is a marketing term. "Stage" is a performance term — it implies that the Entity is performing, that the environment shapes the performance, and that the same Entity performs differently on different Stages while remaining recognizably itself.

**What "platform" implies incorrectly:** That the framework is about social media distribution. It is not. A Stage can be a Twitter timeline, a podcast recording session, a live concert visualization, or a private journaling interface.

**What "channel" implies incorrectly:** That content is being distributed through pipes. Channels are passive conduits. Stages are active environments that shape performances.

### "Identity persistence" — not "memory" or "context"

**Why this term:** Identity persistence encompasses the full durability guarantee: IdentityCore versioning, Trait continuity, MemoryStore retention, Arc progression, Epoch tracking, and Snapshot capture. It is a system-level property, not a single feature.

**What "memory" implies incorrectly:** Memory is one component of persistence (the MemoryStore primitive). Identity persistence is the guarantee that the entire Entity — not just its memories — survives across sessions and platforms.

**What "context" implies incorrectly:** Context is a language model concept (context window). Identity persistence is an infrastructure concept (durable state).

---

## 4. Terms to Avoid

These terms misposition Idol Frame. Do not use them in documentation, marketing, or technical discussion when referring to Idol Frame or its Entities.

### "Chatbot"
**Why it is wrong:** A chatbot is a conversational interface. Entities are not conversational interfaces. They perform across Stages — some conversational, some not. A chatbot has no IdentityCore, no Arcs, no Aesthetic, no persistent Traits. Calling an Entity a chatbot is like calling a film director a typist because they sometimes write scripts.
**What it incorrectly signals:** That Idol Frame is a chatbot builder. It is not.

### "Agent"
**Why it is wrong:** An agent is a task-oriented system that takes actions to achieve goals. Entities are identity-oriented systems that perform to express a persistent creative self. Agents optimize for task completion. Entities optimize for identity consistency. The CognitionEngine uses DecisionFrames, not task planners.
**What it incorrectly signals:** That Idol Frame competes with LangChain, AutoGPT, or CrewAI. It does not. Those are agent frameworks. This is entity infrastructure.

### "Avatar"
**Why it is wrong:** An avatar is a visual puppet controlled in real-time by a human operator. Entities have autonomous cognition (DecisionFrames), internal state (Mood, Traits), and evolution (Arcs, DriftRules). An avatar without its operator is inert. An Entity without its Director continues to have a defined identity.
**What it incorrectly signals:** That Entities are VTuber models or Bitmoji-style representations. The Aesthetic primitive defines visual identity, but the Entity is not reducible to its visual layer.

### "Clone"
**Why it is wrong:** A clone implies copying an existing person. Entities are original creative identities defined through IdentityCores, not derived from scanning or replicating a human. Even when an Entity is inspired by a real person, the Entity is a distinct identity with its own version history, Arcs, and evolution trajectory.
**What it incorrectly signals:** That Idol Frame is a deepfake tool or a celebrity replication engine.

### "Persona"
**Why it is wrong:** A persona is a shallow mask — a set of surface behaviors layered onto an underlying system. An Entity's identity goes to the root: IdentityCore defines values and worldview, Voice defines linguistic DNA, Aesthetic defines visual philosophy, core_tensions define internal contradictions. There is no "real system" underneath wearing a persona mask. The Entity IS its identity graph.
**What it incorrectly signals:** That identity is a thin veneer that can be swapped out. In Idol Frame, changing the IdentityCore requires a version increment — it is a major, tracked, irreversible operation.

### "AI influencer"
**Why it is wrong:** "Influencer" implies a human pretending to be real on social media. Entities are not pretending to be human. They are creative entities — a new category. The term also reduces the framework to a single use case (social media influence) when Idol Frame supports any Stage: music production, visual art, interactive fiction, live performance, education.
**What it incorrectly signals:** That the goal is to deceive audiences into thinking they are interacting with a human. Idol Frame Entities are transparent about their nature.

---

## 5. The Manifesto

```
We believe creative entities deserve persistent identity.
That is why every Entity has an IdentityCore that survives across sessions, platforms, and years.

We believe personality is not a prompt — it is architecture.
That is why Traits are typed, bounded, driftable primitives, not adjectives in a system message.

We believe creative work requires memory.
That is why every Entity has a MemoryStore with semantic, episodic, and associative layers.

We believe evolution must be intentional, not accidental.
That is why Arcs define phased transformation with entry conditions, progression rules, and exit criteria.

We believe every performance is shaped by its stage.
That is why Adapters translate identity into stage-native formats without losing coherence.

We believe identity has boundaries.
That is why Guardrails are primitives — enforced simultaneously, not suggestions in a prompt.

We believe creators are directors, not prompters.
That is why the framework exposes Directives, Epochs, and Snapshots — tools of creative control.

We believe the model is a rendering engine, not the performer.
That is why Idol Frame separates identity definition from model execution.

We believe infrastructure outlasts any single model.
That is why Entity schemas are model-agnostic, version-controlled, and portable.

We believe this category did not exist before.
That is why we built it.
```

---

## 6. Naming Conventions Within the Framework

Naming consistency is brand. When a developer reads Idol Frame code, the naming patterns should be immediately legible and internally consistent. Inconsistent naming signals an inconsistent system.

### Primitives: PascalCase
```
Entity, IdentityCore, Trait, Voice, Aesthetic, Lore,
Mood, Memory, Arc, Relationship, Directive, Guardrail,
DecisionFrame, Performance, Adapter, Stage,
DriftRule, Epoch, Snapshot, CognitionEngine
```
**Rule:** If it is defined as a primitive in Part 3, it is PascalCase everywhere — code, documentation, conversation. Never lowercase, never hyphenated, never abbreviated.

### Fields: snake_case
```
entity_id, drift_rate, core_tensions, recognition_markers,
avg_sentence_length, formality_level, created_at, updated_at
```
**Rule:** All fields within primitives use snake_case. No camelCase, no PascalCase for fields. This applies to schema definitions, API request/response bodies, and database columns.

### Modules: dot.separated.paths
```
idol_frame.identity.core
idol_frame.state.mood
idol_frame.cognition.decision_frame
idol_frame.performance.adapter
idol_frame.evolution.arc
idol_frame.orchestration.stage
```
**Rule:** Module paths mirror the layer structure from Part 3. Top-level namespace is `idol_frame`. Second level is the layer name. Third level is the primitive or subsystem. Segments use snake_case.

### API Endpoints: kebab-case
```
/entities/{id}/identity-core
/entities/{id}/traits/{name}
/entities/{id}/performances
/stages/{id}/adapters
/entities/{id}/arcs/active
/entities/{id}/snapshots/latest
```
**Rule:** REST endpoints use kebab-case for multi-word path segments. Resource names are plural where they represent collections, singular where they represent a unique owned resource (e.g., `/identity-core` not `/identity-cores` because an Entity has exactly one).

### Configuration Keys: snake_case
```yaml
max_trait_drift_per_period: 0.05
memory_consolidation_interval: "24h"
guardrail_enforcement_mode: "strict"
snapshot_retention_policy: "all"
```
**Rule:** Configuration files (YAML, TOML, JSON) use snake_case for all keys. No exceptions.

### Why This Matters for Brand
A developer who reads an Idol Frame codebase should never have to guess the casing convention. The pattern is:
- **Concepts** (primitives) → PascalCase
- **Data** (fields, config) → snake_case
- **Paths** (modules) → dot.separated
- **URLs** (API) → kebab-case

This is not a style preference. It is a legibility guarantee. Every naming decision communicates what kind of thing you are looking at.

---

## 7. Voice of Documentation

Idol Frame documentation has a specific voice. This is not a style guide for Entities — it is a style guide for how we write about the framework itself.

### Technical but not academic
**Do:** "The IdentityCore is immutable per version. Changing it requires a version increment on the parent Entity."
**Do not:** "The IdentityCore exhibits immutability characteristics within the bounded context of a given version instantiation."

Write for engineers who build things, not for academics who cite things.

### Opinionated but evidence-based
**Do:** "Use Guardrails for hard constraints and Directives for soft guidance. Guardrails cannot be overridden; Directives can be deprioritized."
**Do not:** "You might consider using Guardrails or Directives depending on your needs."

State what the system does and why. Do not hedge. If there is a recommended approach, state it directly.

### Direct, not hedging
**Do:** "Entities require an IdentityCore. An Entity without an IdentityCore is invalid and will be rejected by the creation API."
**Do not:** "It is generally recommended that Entities should probably have an IdentityCore for best results."

If the system enforces something, say it enforces it.

### Concrete examples over abstract explanations
**Do:** "A Trait with `drift_rate: 0.01` and `period: 'week'` will shift by at most 0.01 per week in the direction determined by its DriftRule."
**Do not:** "Traits can drift over time at configurable rates."

Show the numbers. Show the fields. Show the YAML.

### Banned words and phrases

| Banned | Why | Use Instead |
|---|---|---|
| "simply" | Implies the thing is simple. If it were, you would not need to explain it. | (remove the word entirely) |
| "just" | Minimizes complexity. "Just deploy the Entity" hides twelve steps. | State the actual steps. |
| "easy" | Nothing is easy for someone encountering it for the first time. | "The API accepts a single POST request with the Entity schema." |
| "obviously" | If it were obvious, it would not be in the documentation. | (remove the word entirely) |
| "note that" | Filler. Everything in the doc is a note. | State the fact directly. |
| "please" | Documentation is not a conversation. It is a reference. | Use imperative mood. |
| "leverage" | Corporate jargon that means "use." | "use" |
| "utilize" | See above. | "use" |
| "in order to" | Three words that mean "to." | "to" |
| "it should be noted that" | Six words that mean nothing. | (remove entirely, state the fact) |

### Documentation structure rules
1. Every page starts with a one-line summary. If you can only read one line, read this.
2. Code examples appear within the first scroll of every concept page.
3. Type signatures are shown in full, not summarized.
4. Every primitive reference links to its canonical definition in Part 3.
5. Error cases are documented alongside success cases, not in a separate section.

---

## 8. Positioning Statements

### For AI Engineers

Idol Frame is a persistence and orchestration layer for creative AI entities. It provides typed primitives — IdentityCore, Traits, Voice, Aesthetic, Memory, Arcs, Guardrails — that define a durable identity graph. This graph is model-agnostic: it separates identity definition from model execution, so you can swap inference backends without losing entity state. The framework handles identity versioning (SemVer on Entities), state management (Mood, Trait drift, Memory consolidation), lifecycle orchestration (Arc phases, Epoch boundaries), and multi-stage adaptation (Stage-specific Adapters that preserve identity coherence). If you have built creative AI and struggled with identity drift, context loss, or cross-platform inconsistency, Idol Frame is the infrastructure layer you were missing.

**Use in:** technical blog posts, engineering recruitment materials, SDK documentation introductions, conference talk abstracts for developer conferences.

### For Creators

Idol Frame lets you build a creative entity — a persistent AI identity with its own voice, aesthetic, personality, and memory — and run it across every platform you care about. Define the entity once: who it is, how it talks, what it cares about, where its boundaries are. Then let it perform on any stage — social media, music, visual art, interactive experiences — while staying true to itself. It remembers past interactions. It evolves over time through arcs you design. It never breaks character because character is not a prompt — it is the architecture.

**Use in:** creator onboarding flows, partnership pitch decks, tutorial introductions, creator community announcements.

### For Investors

Idol Frame defines a new infrastructure category: Persistent Creative Entity Infrastructure. The market is moving from one-shot AI generation (images, text, music) to persistent AI entities that maintain identity, accumulate audience relationships, and evolve over time. Idol Frame is the foundational layer for this shift — the identity persistence and orchestration system that creative entity products are built on. The framework is model-agnostic (survives model generation changes), schema-driven (portable and auditable), and designed for multi-entity orchestration at scale. The competitive moat is architectural: identity graphs with versioned state, evolution trajectories, and cross-platform coherence are not features you bolt onto an agent framework — they require purpose-built infrastructure.

**Use in:** investor decks, fundraising memos, board presentations, market analysis sections.

### For Media

Idol Frame is a framework for building AI creative entities — persistent digital identities with their own personality, voice, aesthetic, and memory. Unlike chatbots or AI avatars, these entities are not pretending to be human. They are a new kind of creative presence: entities that maintain consistent identity across platforms, remember their history, evolve through intentional story arcs, and create original work. Think of Idol Frame as the infrastructure that makes it possible for a creative AI entity to have a career — not just a conversation.

**Use in:** press releases, journalist briefings, media FAQ documents, quote sheets for interviews.

---

## Appendix: Quick Reference Card

| Context | Term | Not |
|---|---|---|
| The thing being built | Creative entity | AI character, AI avatar, chatbot, persona |
| The human shaping it | Director | User, prompter, operator |
| What it produces | Performance | Output, generation, response |
| Where it performs | Stage | Platform, channel, endpoint |
| How it stays itself | Identity persistence | Memory, context, prompt |
| What Idol Frame is | Infrastructure | Product, platform, tool, app |
| The category | Persistent Creative Entity Infrastructure | AI agent framework, chatbot builder, prompt library |

Keep this card visible during any writing, speaking, or building that references Idol Frame.

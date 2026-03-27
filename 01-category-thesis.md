# Idol Frame: Category Thesis

> Part 1 of the Idol Frame Design Document

---

## 1. Category Definition

### What Idol Frame Is

Idol Frame is infrastructure for persistent creative entities that maintain identity coherence across all media surfaces.

It is a runtime and authoring system that lets a creator define a creative entity once -- its voice, aesthetic, memory, personality, creative tendencies, and evolution rules -- and then deploy that entity across text, voice, video, live streams, advertisements, interactive experiences, and any future media surface, with guaranteed identity consistency.

The software category it creates: **Creative Entity Infrastructure**.

### What Idol Frame Is Not

| Category | Examples | Why It Is Different |
|---|---|---|
| Agent framework | LangGraph, CrewAI, AutoGen | Those optimize for task completion. Idol Frame optimizes for identity persistence. |
| Avatar tool | D-ID, HeyGen | Those are stateless renderers. They produce output from a prompt with no memory, no personality model, no continuity. |
| Chatbot builder | Character.AI, SillyTavern | Those are conversation-scoped. Identity exists only within a single chat session or, at best, a user-specific thread. |
| VTuber toolkit | VTube Studio, Animaze | Those are manual puppeteering rigs. The human operator IS the identity. Remove the operator and the character stops existing. |
| Digital twin platform | Soul Machines, UneeQ | Those optimize for brand FAQ delivery wearing a face. There is no creative identity, only a customer service script with lip sync. |

### The Precise Claim

Idol Frame manages the full lifecycle of a creative entity: creation, direction, materialization across media, evolution over time, and evaluation of coherence. It treats the entity as a first-class persistent object with its own schema, state, memory, and rendering pipeline -- not as a prompt template, not as a conversation history, not as a set of assets.

**Concrete implication**: The framework must provide an `EntitySchema` that is serializable, versionable, and sufficient to reconstruct the entity's full identity on any compatible runtime. The schema is the single source of truth. Every module in the system reads from it or writes to it.

---

## 2. Problem Statement

### The Fragmentation Problem

A creator today who wants a persistent AI-driven creative entity must:

1. Write a system prompt for text interactions (ChatGPT, Claude)
2. Record or clone a voice in a separate tool (ElevenLabs, XTTS)
3. Generate a face or avatar in another tool (Midjourney, D-ID)
4. Manually synchronize personality across these surfaces
5. Lose all continuity when switching between them
6. Rebuild context every session

There is no shared identity layer. The "character" exists only in the creator's head and in scattered, incompatible artifacts.

### Why Agent Frameworks Fail

Agent frameworks (LangGraph, CrewAI, AutoGen) solve for:
- Task decomposition and execution
- Tool use and function calling
- Multi-agent coordination for work

They do not solve for:
- Persistent personality modeling across sessions
- Aesthetic consistency across visual, audio, and text outputs
- Creative evolution that is directed, not random
- Media-specific adaptation (the same entity must be funny on a livestream and authoritative in a video essay, without breaking character)
- Long-term memory that shapes identity, not just retrieves facts

**Concrete gap**: No agent framework provides a `PersonalityModel` that constrains generation across modalities. They provide tool schemas and execution graphs. An entity is not a tool-using agent. An entity is a creative identity that may use tools incidentally.

### Why Avatar Tools Fail

Avatar tools (D-ID, HeyGen, Synthesia) solve for:
- Rendering a talking head from text input
- Lip sync and basic gesture

They do not solve for:
- Who the character is beyond appearance
- What the character would or would not say
- How the character's style evolves
- Continuity between one video and the next

**Concrete gap**: No avatar tool provides a `MemoryStore` or `VoiceModel` that persists across renders. Each render is stateless. The "avatar" is a puppet, not an entity.

### Why Roleplay Systems Fail

Roleplay systems (Character.AI, SillyTavern, Kobold) solve for:
- In-conversation persona adherence
- User-facing character interaction

They do not solve for:
- Output beyond text (video, voice, images, live performance)
- Creator-directed evolution (the character changes when the creator decides, not when the user steers)
- Multi-surface deployment from a single identity definition
- Production-grade content generation (ads, episodes, campaigns)

**Concrete gap**: No roleplay system provides `MediaAdapters` or a `DirectiveSystem` where the creator issues high-level creative direction and the entity executes it across surfaces.

---

## 3. The Category Claim

### The Game Engine Analogy

Game engines (Unity, Unreal) do not make games. They make games possible. They provide:
- A rendering pipeline
- A physics system
- An asset pipeline
- A scripting runtime
- A build system targeting multiple platforms

The game designer creates within the engine. The engine enforces consistency, handles platform differences, and manages the lifecycle of game objects.

**Idol Frame is to creative entities what game engines are to games.**

It provides:
- An **identity pipeline** (defining who the entity is)
- A **coherence system** (ensuring the entity stays itself across outputs)
- An **asset pipeline** (managing voice models, visual references, style guides)
- A **direction runtime** (translating creator intent into entity behavior)
- A **media build system** (targeting text, voice, video, live, interactive)

The creator does not build each output manually. The creator defines the entity and directs it. The framework handles materialization.

### The Relationship Chain

```
Creator --> Idol Frame --> Entity --> Media Surfaces
   |            |            |            |
 Intent     Runtime      Identity     Outputs
 Direction  Coherence    State        (text, voice,
 Evolution  Evaluation   Memory        video, live,
 Rules      Lifecycle    Personality   ads, interactive)
```

Each arrow represents a concrete system boundary:

- **Creator to Idol Frame**: A `DirectiveAPI` that accepts high-level creative instructions ("make her more confrontational this week," "shift visual style toward noir," "prepare a 3-minute video essay on topic X in her voice").
- **Idol Frame to Entity**: An `EntityRuntime` that maintains the entity's state, applies directives, enforces coherence constraints, and manages memory.
- **Entity to Media Surfaces**: A set of `MediaAdapters` (one per surface type) that take the entity's identity state and produce surface-appropriate output without breaking character.

### What the Framework Owns

| Responsibility | Module |
|---|---|
| Entity identity definition | `EntitySchema` |
| Personality modeling | `PersonalityModel` |
| Memory across sessions and surfaces | `MemoryStore` |
| Creative direction intake | `DirectiveAPI` |
| Coherence enforcement | `CoherenceEvaluator` |
| Media-specific output | `MediaAdapter` (per surface) |
| Evolution over time | `EvolutionEngine` |
| Asset management (voice, visual, style) | `AssetPipeline` |
| Lifecycle management | `EntityLifecycle` |

### What the Framework Does Not Own

- The LLM (bring your own -- Claude, GPT, Llama, etc.)
- The TTS engine (bring your own -- ElevenLabs, XTTS, etc.)
- The video renderer (bring your own -- ComfyUI, D-ID API, etc.)
- The streaming platform (OBS, custom, etc.)
- The content ideas (those come from the creator)

Idol Frame is the orchestration and coherence layer between creator intent and media output. It is not the generation layer. It does not compete with model providers. It makes model providers useful for persistent creative entities.

---

## 4. Target Users

### Primary Users

1. **Independent creators** building virtual personalities for content (YouTube, TikTok, Twitch, podcasts). They want one entity definition that scales across all their output surfaces without hiring a team to maintain consistency.

2. **Studios and production companies** building virtual talent rosters. They need version-controlled entity definitions, multi-operator access, and production-grade coherence guarantees across campaigns.

3. **Brands** creating embodied AI personalities for long-running engagement (not one-off chatbots, but persistent brand characters that audiences form relationships with across months and years of content).

### Explicit Exclusions

- **Customer service bots**: Idol Frame does not optimize for FAQ resolution, ticket routing, or CSAT scores. If the entity's purpose is to answer support questions, use a support platform.
- **Coding agents**: Idol Frame does not optimize for code generation, PR review, or development workflows. If the entity's purpose is to write software, use an agent framework.
- **Generic automation**: Idol Frame does not optimize for data pipelines, ETL, or business process automation. If there is no creative identity to maintain, there is no reason to use Idol Frame.

### The Litmus Test

If the answer to "Does this entity need to be the same recognizable personality across every piece of content it produces, over months or years?" is no, Idol Frame is the wrong tool.

---

## 5. What Changes

### The Paradigm Shift

| Old Model | New Model |
|---|---|
| Creator writes prompts | Creator directs an entity |
| Each output is independent | Each output is part of a continuous identity |
| AI is a tool that produces artifacts | AI is a medium that sustains entities |
| Consistency is manual effort | Consistency is a system guarantee |
| "Voice" means a system prompt | "Voice" means a `PersonalityModel` + `VoiceModel` + `StyleGuide` enforced by a `CoherenceEvaluator` |
| Memory is conversation history | Memory is a structured `MemoryStore` with episodic, semantic, and directive layers |
| Evolution is prompt drift | Evolution is versioned, directed, and reversible via `EvolutionEngine` |

### The Entity Is the Product

In current workflows, the output is the product: a video, a tweet, a voice clip. The AI is disposable between outputs.

In Idol Frame, the entity is the product. Outputs are expressions of the entity. The entity persists. The entity accumulates memory, refines its style, develops relationships with its audience, and evolves under creator direction. Outputs are downstream artifacts.

**Concrete implication**: The framework must treat `EntityState` as the primary persistent object. Outputs are ephemeral. The entity is not.

### The Creator Is a Director

A prompt engineer writes instructions for each generation call. A director sets vision, gives notes, and evaluates performances.

Idol Frame replaces the prompt-per-output workflow with a direction-per-arc workflow:
- The creator defines the entity's identity (once, then evolves it)
- The creator issues directives ("this week's tone is melancholic," "react to this event in character," "produce a video essay with these beats")
- The framework translates directives into entity behavior across surfaces
- The creator evaluates outputs against coherence criteria and gives notes

**Concrete implication**: The `DirectiveAPI` must support arc-level instructions (not just per-output prompts). The `CoherenceEvaluator` must provide structured feedback the creator can review, not just pass/fail.

---

## 6. Success Criteria

### For the Entity

An entity created and operated through Idol Frame must satisfy:

1. **Consistency**: Outputs across text, voice, and video must be attributable to the same perceived personality by a human evaluator. Measured by a `CoherenceEvaluator` that scores cross-surface identity alignment.

2. **Continuity**: The entity must reference its own past outputs, remember interactions, and maintain narrative threads. Measured by memory retrieval accuracy from the `MemoryStore` and continuity checks in the `CoherenceEvaluator`.

3. **Directed evolution**: The entity's personality, style, and behavior must change when and how the creator directs, and must not drift without direction. Measured by delta between entity versions in the `EvolutionEngine` and whether undirected drift exceeds a configurable threshold.

4. **Media adaptation**: The entity must feel native to each surface (conversational in chat, performative in video, concise in tweets) without breaking identity. Measured by per-surface coherence scores from surface-specific evaluation rules in each `MediaAdapter`.

### For the Creator

A creator using Idol Frame must be able to:

1. **Define an entity** from a structured schema in under one session, with the framework validating completeness and internal consistency of the definition.

2. **Direct the entity** through high-level creative instructions without writing per-output prompts. The `DirectiveAPI` must translate directives into surface-appropriate behavior.

3. **Evaluate coherence** through framework-provided scoring, not just subjective gut checks. The `CoherenceEvaluator` must output structured reports with specific dimensions (voice consistency, aesthetic alignment, memory accuracy, directive adherence).

4. **Evolve the entity** with version control, rollback capability, and diff visibility. The creator must be able to compare entity v1.3 to entity v1.7 and see exactly what changed in personality, voice, visual style, and behavioral rules.

5. **Deploy across surfaces** by adding a `MediaAdapter` without redefining the entity. Adding a new output surface (e.g., going from text-only to text + voice + video) must not require changes to the `EntitySchema` or `PersonalityModel`.

### For the Framework Itself

Idol Frame succeeds as a category-defining framework when:

1. An entity built on it is **indistinguishable in consistency** from a creative personality managed by a dedicated human team -- but operable by a single creator.

2. The framework is **media-agnostic at the identity layer**: the same `EntitySchema` drives a podcast, a YouTube channel, a Twitter presence, and a live stream without per-surface identity redefinition.

3. The framework is **model-agnostic at the generation layer**: swapping the underlying LLM, TTS, or video model does not require changes to the entity definition or coherence rules.

4. A new `MediaAdapter` can be built by a developer in days, not months, because the interface contract between the entity runtime and the adapter is well-defined and stable.

---

## Summary of Implied System Requirements

Every claim in this document implies a concrete module or contract. The following table maps claims to required system components, to be specified in subsequent parts of this design document.

| Claim | Required Component | Specified In |
|---|---|---|
| Persistent creative identity | `EntitySchema`, `EntityState` | Part 2: Entity Model |
| Identity coherence across surfaces | `CoherenceEvaluator` | Part 4: Coherence System |
| Structured memory across sessions | `MemoryStore` (episodic, semantic, directive) | Part 3: Memory Architecture |
| Creator direction, not per-output prompting | `DirectiveAPI` | Part 5: Direction System |
| Versioned, directed evolution | `EvolutionEngine` | Part 6: Evolution System |
| Media-specific output from shared identity | `MediaAdapter` interface | Part 7: Media Adapters |
| Personality modeling across modalities | `PersonalityModel` | Part 2: Entity Model |
| Asset management (voice, visual, style) | `AssetPipeline` | Part 8: Asset Pipeline |
| Entity lifecycle management | `EntityLifecycle` | Part 9: Lifecycle and Operations |
| Model-agnostic generation | Provider abstraction layer | Part 10: Integration Layer |

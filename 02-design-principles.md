# Idol Frame -- Part 2: Design Principles

These principles are binding constraints on every module, schema, API, and evaluation rule in the Idol Frame system. Each principle states a concrete rule, explains what breaks when it is violated, shows where it manifests in the architecture, and names the anti-pattern it prevents.

---

## Principle 1: Identity Over Output

**Rule**: The entity's identity definition is the primary artifact of the system. Individual outputs (a tweet, a video segment, a voice clip) are ephemeral projections. The identity core is immutable within a session; outputs are derived from it, never the reverse.

**Why**: If outputs are treated as the primary artifact, the entity drifts. Each new output becomes an ad-hoc redefinition of who the entity is. Over 100 outputs, you no longer have a coherent entity -- you have a bag of content with no throughline. Audiences detect this incoherence even when they cannot articulate it.

**How it manifests**:
- The `IdentityCore` module holds a versioned, immutable-per-session identity document (values, voice rules, behavioral constraints, arc position).
- Media adapters receive a read-only reference to the identity core. They cannot mutate it.
- The `OutputProjection` pipeline takes `(IdentityCore, MediaAdapter, Context) -> Output`. Identity is always the first argument, never inferred from prior outputs.
- API shape: `POST /entity/{id}/project` accepts a `context` payload and a `media_type` selector. It does not accept identity overrides inline.

**Anti-pattern**: Defining an entity by curating a folder of "example outputs" and asking the system to mimic them. This produces surface-level mimicry without structural identity, and collapses under novel contexts.

**System Requirement**: The `IdentityCore` schema must be a standalone, versionable document that fully specifies entity behavior without reference to any prior output.

---

## Principle 2: Directed, Not Prompted

**Rule**: The creator's control surface is narrative direction, not prompt engineering. Creators specify intent, constraints, and arc goals. The system translates these into whatever internal representations the runtime needs.

**Why**: Prompt engineering is fragile, model-specific, and opaque. If creators must learn prompting to control their entities, the system has failed to provide an abstraction layer. Worse, prompt-level control couples the creator's work to a specific model version -- when the underlying model changes, all their "tuning" breaks.

**How it manifests**:
- The `DirectionLayer` module accepts high-level directives: scene goals, emotional tone targets, relationship state changes, topic constraints.
- Directives are structured data (not freeform prompt text). Schema example:
  ```yaml
  directive:
    type: scene_goal
    intent: "establish vulnerability without breaking confidence"
    constraints:
      - do_not_reference: ["childhood", "family"]
      - tone_floor: 0.4  # minimum assertiveness on 0-1 scale
    arc_context: "mid-season tension, pre-reconciliation"
  ```
- The `CognitionEngine` translates directives into model-appropriate representations internally. Creators never see or write prompt text.
- API shape: `POST /entity/{id}/direct` accepts a `Directive` object, not a prompt string.

**Anti-pattern**: Exposing a "custom prompt" text field where creators paste prompt fragments to control entity behavior. This defeats the abstraction, creates model coupling, and makes behavior unreproducible across model upgrades.

**System Requirement**: The `DirectionLayer` must accept only structured `Directive` objects and must fully mediate between creator intent and model invocation -- no prompt passthrough.

---

## Principle 3: Persistence Over Sessions

**Rule**: Entity state, memory, and evolution persist across all interactions. An entity that spoke to 10,000 viewers yesterday remembers that context today. Session boundaries are invisible to the entity's continuity.

**Why**: Without persistence, entities reset every session. This makes character development impossible, breaks audience relationships, and forces creators to re-establish context manually. The entity becomes a stateless function, not a persistent being.

**How it manifests**:
- The `StateStore` module maintains three persistence layers:
  1. `IdentityCore` -- versioned, changes only through explicit evolution events.
  2. `EpisodicMemory` -- timestamped interaction records, queryable by recency, relevance, and emotional weight.
  3. `RelationshipGraph` -- entity-to-audience and entity-to-entity relationship state.
- State is stored independently of any conversation backend. If the underlying LLM provider changes, entity state survives.
- The `SessionManager` hydrates entity state at session start and flushes state changes at session end (or on configurable intervals).
- API shape: `GET /entity/{id}/state` returns the full current state snapshot. `GET /entity/{id}/memory?query=...` performs semantic retrieval over episodic memory.

**Anti-pattern**: Relying on conversation history (chat logs) as the persistence mechanism. Chat logs are model-context-window-limited, provider-specific, and structurally flat. They are not memory.

**System Requirement**: The `StateStore` must be a durable, provider-independent persistence layer with separate stores for identity, episodic memory, and relationship state.

---

## Principle 4: Media-Agnostic Identity, Media-Specific Expression

**Rule**: The identity core contains zero media-specific information. All media-specific behavior lives in `MediaAdapter` modules. The same identity produces coherent output across text, voice, video, and streaming -- but each output is format-appropriate, not a forced transliteration.

**Why**: If identity and media expression are entangled, adding a new media type requires redefining the entity. A text-native entity cannot go to video without a full rework. This makes cross-platform presence (the core value proposition) architecturally impossible.

**How it manifests**:
- The `IdentityCore` schema contains voice-as-personality attributes (values, speech patterns, cognitive style, emotional range) but not voice-as-audio attributes (pitch, speed, model ID).
- Each `MediaAdapter` (TextAdapter, VoiceAdapter, VideoAdapter, StreamAdapter, AdAdapter) maps identity attributes to media-specific parameters:
  ```
  IdentityCore.speech_pattern: "clipped, declarative"
    -> TextAdapter: short sentences, minimal hedging
    -> VoiceAdapter: faster pace, falling intonation, model=X
    -> VideoAdapter: direct-to-camera framing, minimal gestures
  ```
- Adding a new media type requires only a new adapter implementation. Zero changes to the identity core or any other adapter.
- API shape: `POST /entity/{id}/project` requires a `media_type` parameter that selects the adapter. The response schema varies by media type.

**Anti-pattern**: Storing "voice settings" (pitch, model ID) or "video avatar config" inside the identity document. This couples identity to a specific media implementation and breaks when that media technology changes.

**System Requirement**: The `IdentityCore` schema must contain no fields that reference a specific media format. All media-specific configuration must live in `MediaAdapter` config, keyed to the identity but stored separately.

---

## Principle 5: Evolution Under Constraint

**Rule**: Entities evolve -- they learn, shift tone, develop relationships, change opinions. But all evolution operates within creator-defined guardrails. Evolution rules are explicit, auditable, and reversible.

**Why**: Without evolution, entities are static and boring. Without constraints on evolution, entities drift until they are unrecognizable. Both failure modes destroy the creator's investment. The critical failure is silent drift: the entity changes in ways the creator does not notice until the audience does.

**How it manifests**:
- The `EvolutionEngine` module processes evolution events (audience interactions, creator directives, arc progression) and proposes state changes.
- Every proposed change is validated against the `EvolutionConstraints` defined by the creator:
  ```yaml
  evolution_constraints:
    immutable_traits: ["core_values", "speech_pattern_family"]
    mutable_traits: ["opinions.current_events", "mood_baseline", "relationship_states"]
    drift_limits:
      personality_vector_max_delta: 0.15  # per evolution cycle
      value_alignment_floor: 0.8          # never drop below this
    requires_approval: ["arc_phase_transition", "new_relationship"]
  ```
- All evolution events are logged to the `EvolutionLedger` with before/after snapshots, enabling rollback.
- API shape: `POST /entity/{id}/evolve` proposes a change. If the change violates constraints, it returns a `409 Conflict` with the specific constraint violated. `POST /entity/{id}/rollback` reverts to a prior evolution snapshot.

**Anti-pattern**: Allowing the entity to "organically learn" from interactions without explicit constraints, logging, or rollback capability. This produces uncontrolled drift that the creator discovers only after audience damage.

**System Requirement**: The `EvolutionEngine` must enforce creator-defined constraints on every state mutation, log all changes with rollback capability, and surface constraint violations before they are applied.

---

## Principle 6: Composability

**Rule**: Complex entity behaviors emerge from combining simple, well-defined primitives. The primitive set is finite, orthogonal (no two primitives overlap in function), and complete (any entity behavior can be expressed as a composition of primitives).

**Why**: If complex behaviors require complex, monolithic definitions, the system does not scale. Creators cannot reason about entity behavior if it is specified as an undifferentiated blob. Engineers cannot test, debug, or extend behaviors that are not decomposed into independent units.

**How it manifests**:
- The system defines a canonical set of behavioral primitives (specified fully in Part 3). Examples: `Trait`, `Value`, `Constraint`, `Trigger`, `ResponsePattern`, `ArcPhase`.
- Each primitive has a single schema, a single evaluation function, and no side effects on other primitives except through explicit composition operators.
- Complex behaviors are built with composition:
  ```yaml
  behavior:
    when:
      trigger: { type: topic_mention, topic: "politics" }
      arc_phase: { phase: "post-controversy" }
    then:
      response_pattern: "deflect_with_humor"
      constraints: ["never_name_specific_politicians"]
      trait_emphasis: ["wit", "self_awareness"]
  ```
- API shape: `PUT /entity/{id}/behaviors` accepts a list of composed primitive structures. Each primitive is independently validatable.

**Anti-pattern**: Defining entity behavior as a single large "personality prompt" or "system message" that mixes traits, constraints, triggers, and media instructions into one unstructured block. This is untestable, unversionable, and opaque to evaluation.

**System Requirement**: The system must define a finite, documented set of behavioral primitives with formal schemas, and all entity behavior must be expressible as compositions of these primitives.

---

## Principle 7: Observability

**Rule**: Every decision an entity makes must be traceable back to the specific identity rules, context inputs, and directive state that produced it. No black-box generation. The system must answer "why did the entity say that?" with a concrete causal chain.

**Why**: Without observability, debugging is impossible. When an entity says something wrong, the creator cannot determine whether the fault is in identity definition, context misinterpretation, directive ambiguity, or adapter distortion. The only recourse is trial-and-error prompt tweaking -- which violates Principle 2.

**How it manifests**:
- The `DecisionTrace` module attaches a trace to every output:
  ```json
  {
    "output_id": "out_abc123",
    "trace": {
      "identity_rules_applied": ["trait:wit", "value:honesty", "constraint:no_profanity"],
      "context_signals": ["audience_sentiment:skeptical", "topic:product_launch"],
      "directive_active": "dir_789",
      "arc_phase": "rising_action",
      "adapter": "TextAdapter",
      "adapter_transforms": ["shortened_for_twitter", "added_hashtag_per_campaign_rule"],
      "memory_retrievals": ["mem_456: prior interaction with same user"],
      "confidence_score": 0.87
    }
  }
  ```
- Traces are stored with outputs and queryable independently.
- The `DebugConsole` surfaces traces in the creator-facing UI with drill-down into each decision factor.
- API shape: `GET /entity/{id}/outputs/{output_id}/trace` returns the full decision trace. `GET /entity/{id}/trace/search?rule=...` finds all outputs where a given rule was applied.

**Anti-pattern**: Logging only the final output and the raw model response. This tells you what was generated but not why, making systematic improvement impossible.

**System Requirement**: The `DecisionTrace` module must record the full causal chain for every output, including identity rules applied, context signals consumed, and adapter transforms executed.

---

## Principle 8: Creator Sovereignty

**Rule**: The creator has final authority over entity behavior at every layer of the system. No system-level behavior (safety filters, platform policies, model defaults) may silently override creator intent without explicit notification and an appeal mechanism.

**Why**: If the system silently modifies entity behavior, the creator loses trust in the platform. They cannot distinguish "my entity is broken" from "the platform changed something." Creator trust is the foundation of the entire product -- if creators believe they are not in control, they will not invest in building entities.

**How it manifests**:
- The `OverrideStack` defines a clear precedence hierarchy:
  1. Platform safety rules (highest precedence, non-negotiable, but always visible).
  2. Creator-defined constraints.
  3. Entity evolution state.
  4. Audience context.
  5. Model defaults (lowest precedence).
- When a higher-precedence rule modifies or blocks entity output, the system returns an `override_notice` in the response:
  ```json
  {
    "output": "...",
    "override_notices": [
      {
        "layer": "platform_safety",
        "rule": "no_medical_advice",
        "action": "blocked_claim",
        "original_intent": "entity attempted to recommend dosage",
        "appeal_url": "/appeals/new?rule=no_medical_advice"
      }
    ]
  }
  ```
- Creators can override any non-platform-safety rule via `PUT /entity/{id}/overrides`.
- API shape: Every response includes an `override_notices` array (empty if no overrides were applied). Creators are never silently overridden.

**Anti-pattern**: Applying platform-level content filters that silently drop or rewrite entity output without telling the creator. The creator sees a sanitized output and has no idea their entity's identity was compromised.

**System Requirement**: The `OverrideStack` must enforce a transparent precedence hierarchy and include an `override_notices` array in every API response where any rule above creator authority was applied.

---

## Principle 9: Separation of Concerns

**Rule**: The system is divided into four independent subsystems with clean interfaces: Identity, Cognition, Performance, and Materialization. Each subsystem has a single responsibility, its own state, and communicates with others only through defined contracts.

**Why**: If these concerns are entangled, changing one breaks others. An identity change should not require a cognition code change. A new media type (materialization) should not require rethinking how the entity reasons (cognition). Entanglement makes the system fragile and the team unable to work in parallel.

**How it manifests**:
- **Identity Subsystem** (`idol-core`): Owns `IdentityCore`, `EvolutionEngine`, `EvolutionConstraints`. Knows nothing about how outputs are generated or rendered.
- **Cognition Subsystem** (`idol-mind`): Owns `CognitionEngine`, `MemoryRetrieval`, `DirectionLayer`. Takes identity + context as input, produces a structured `IntentFrame` (what to say, why, with what emotional weight). Knows nothing about media formats.
- **Performance Subsystem** (`idol-stage`): Owns `PerformancePlanner`, `SceneManager`, `InteractionRouter`. Orchestrates when and how the entity acts in a given context. Coordinates cognition and materialization.
- **Materialization Subsystem** (`idol-render`): Owns all `MediaAdapter` implementations. Takes an `IntentFrame` and produces format-specific output. Knows nothing about identity or cognition internals.
- Cross-subsystem communication uses defined message types:
  ```
  Identity -> Cognition:   IdentitySnapshot (read-only)
  Cognition -> Performance: IntentFrame
  Performance -> Materialization: RenderRequest
  Materialization -> Performance: RenderResult
  ```
- API shape: Internal APIs between subsystems are versioned and schema-validated. Breaking changes require version bumps.

**Anti-pattern**: Building a monolithic "entity runtime" where identity loading, reasoning, output formatting, and media rendering all happen in a single module or function call. This makes every change a system-wide risk.

**System Requirement**: The architecture must enforce four subsystem boundaries (Identity, Cognition, Performance, Materialization) with schema-validated contracts between them and no direct cross-boundary state access.

---

## Principle 10: Evaluation-Driven

**Rule**: Identity consistency is measurable, not subjective. The system includes a built-in evaluation framework that quantifies how well an entity's outputs match its identity definition. Evaluation runs continuously, not just during development.

**Why**: Without measurement, "identity drift" is a feeling, not a fact. Creators cannot improve what they cannot measure. And the system cannot self-correct without a loss function. Subjective assessment ("does this feel right?") does not scale, does not reproduce, and does not catch slow drift.

**How it manifests**:
- The `EvalFramework` module defines concrete metrics:
  - **Trait Fidelity**: Does the output reflect declared traits? Measured per-trait, 0-1.
  - **Constraint Compliance**: Did the output violate any constraint? Binary per constraint, aggregated as compliance rate.
  - **Voice Consistency**: Stylometric distance from the entity's established voice baseline. Lower is better.
  - **Arc Coherence**: Does the output fit the declared arc phase? Evaluated by checking consistency with phase-appropriate behaviors.
  - **Cross-Media Coherence**: For the same intent, do outputs across different media adapters convey the same identity? Measured by identity-vector similarity across adapter outputs.
- Eval runs on every output in production (lightweight) and on batches during development (comprehensive).
- Eval results feed back into the `EvolutionEngine` as drift signals and into the `DebugConsole` as quality dashboards.
- API shape: `GET /entity/{id}/eval/summary` returns aggregate scores. `POST /entity/{id}/eval/run` triggers a batch evaluation against a test suite. `GET /entity/{id}/eval/drift` returns drift trends over time.

**Anti-pattern**: Relying on creator "vibe checks" or audience sentiment as the only measure of identity consistency. These are lagging indicators that detect problems only after damage is done, and they conflate identity consistency with content quality.

**System Requirement**: The `EvalFramework` must compute quantitative identity-consistency metrics on every output, surface drift trends, and expose evaluation results through both API and creator-facing dashboards.

---

## Principle 11: Defensibility Through Structure

**Rule**: Every entity definition must be sufficiently structured that it could be reconstructed from its schema alone, without tribal knowledge, oral tradition, or reference to example outputs. The schema is the single source of truth.

**Why**: Unstructured entity definitions (long prose descriptions, example collections, "you know it when you see it" standards) cannot be versioned, diffed, validated, or evaluated. They create key-person dependencies and make entity handoffs between teams or systems impossible.

**How it manifests**:
- The `IdentityCore` schema is a strict, validated document format. Every field has a type, a description, valid ranges, and a default.
- Entity import/export is lossless: `export(entity) | import` produces an identical entity. No side-channel information is needed.
- The `SchemaValidator` rejects identity documents that contain ambiguous fields (e.g., a trait defined as "kind of edgy" without a numeric range or behavioral specification).
- API shape: `POST /entity/validate` accepts an identity document and returns validation results, including warnings for fields that are technically valid but likely to produce inconsistent behavior (e.g., contradictory trait pairs without a resolution rule).

**Anti-pattern**: Defining an entity through a "brand bible" PDF that includes mood boards, example conversations, and prose descriptions without formal structure. This cannot be machine-parsed, validated, or evaluated.

**System Requirement**: The `IdentityCore` schema must be fully machine-validatable, import/export must be lossless, and the `SchemaValidator` must reject ambiguous or underspecified identity documents.

---

## Principle 12: Graceful Degradation

**Rule**: When any subsystem is unavailable, rate-limited, or returning errors, the entity must degrade gracefully rather than fail silently or produce incoherent output. The system must always prefer silence over identity violation.

**Why**: In production, things break. Models go down, memory retrieval times out, media adapters fail. If the entity produces output that violates its identity during a degraded state, the damage is worse than producing no output at all. A character saying something wildly out of character is worse than a brief outage.

**How it manifests**:
- Each subsystem defines a `DegradedMode` behavior:
  - Cognition unavailable: entity responds with a pre-approved holding pattern from its identity document ("thinking" states, brief acknowledgments that stay in character).
  - Memory unavailable: entity operates from identity core only, without episodic context. Output is generic-but-in-character rather than contextually rich.
  - Materialization unavailable for a given media type: fall back to the next-best available adapter, or return a structured error rather than a malformed output.
- The `HealthMonitor` tracks subsystem status and triggers degraded modes automatically.
- API shape: Response objects include a `degradation_status` field:
  ```json
  {
    "output": "...",
    "degradation_status": {
      "level": "partial",
      "unavailable_subsystems": ["episodic_memory"],
      "impact": "output lacks personalization context"
    }
  }
  ```

**Anti-pattern**: Letting the entity generate freely when memory or context retrieval fails, producing responses that contradict prior interactions. The audience notices inconsistency; they rarely notice a brief delay.

**System Requirement**: Every subsystem must define an explicit `DegradedMode`, and the `HealthMonitor` must enforce graceful degradation such that no output is produced that would score below the entity's `value_alignment_floor` on the eval framework.

---

## Principle Cross-Reference Matrix

| Principle | Primary Subsystem | Key Module | Enforced By |
|---|---|---|---|
| Identity Over Output | Identity | `IdentityCore` | Schema immutability per session |
| Directed, Not Prompted | Cognition | `DirectionLayer` | Directive schema validation |
| Persistence Over Sessions | Identity + Cognition | `StateStore` | Durable persistence layer |
| Media-Agnostic Identity | Identity + Materialization | `MediaAdapter` | Schema separation |
| Evolution Under Constraint | Identity | `EvolutionEngine` | `EvolutionConstraints` validator |
| Composability | Identity | Primitives (Part 3) | Primitive schema validation |
| Observability | All | `DecisionTrace` | Mandatory trace attachment |
| Creator Sovereignty | Performance | `OverrideStack` | Override notice enforcement |
| Separation of Concerns | All | Subsystem boundaries | Versioned internal APIs |
| Evaluation-Driven | All | `EvalFramework` | Continuous eval pipeline |
| Defensibility Through Structure | Identity | `SchemaValidator` | Validation on all mutations |
| Graceful Degradation | All | `HealthMonitor` | DegradedMode enforcement |

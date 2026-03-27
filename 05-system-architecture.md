# Part 5: System Architecture

**Status:** NORMATIVE
**Depends on:** Part 3 (Framework Primitives)
**Version:** 1.0.0
**Date:** 2026-03-15

---

## 1. Architecture Overview

Idol Frame is organized into eight subsystems. Each subsystem owns a set of modules, each module operates on one or more Part 3 primitives, and all inter-module communication flows through a central event bus or direct API calls.

### High-Level Block Diagram

```
+====================================================================+
|                        API GATEWAY                                  |
|   REST API  |  WebSocket API  |  Webhook Ingress  |  Admin UI API  |
+====================================================================+
        |               |                |                |
        v               v                v                v
+====================================================================+
|                        EVENT BUS                                    |
|          (async pub/sub for all inter-subsystem events)             |
+====================================================================+
   |          |           |           |          |          |
   v          v           v           v          v          v
+--------+ +--------+ +---------+ +--------+ +--------+ +--------+
|IDENTITY| | STATE  | |COGNITION| | PERF.  | | MEDIA  | | EVOL.  |
|  SUB   | |  SUB   | |   SUB   | |  SUB   | |  SUB   | |  SUB   |
+--------+ +--------+ +---------+ +--------+ +--------+ +--------+
   |          |           |           |          |          |
   |          |           |           |          |          |
   v          v           v           v          v          v
+====================================================================+
|                     DATA STORAGE LAYER                              |
|  Entity Store | Memory Store | Perf. Log | Snapshot Store | Config  |
+====================================================================+
```

**The 4+4 subsystem model:**

| Subsystem | Responsibility | Layer(s) Served |
|---|---|---|
| **Identity** | Persistent identity storage and enforcement | Identity Layer |
| **State** | Mutable runtime state management | State Layer |
| **Cognition** | Decision assembly and constraint resolution | Cognition Layer |
| **Performance** | Output planning, generation, evaluation, publication | Performance Layer |
| **Media** | Platform adapters and stage management | Performance Layer (output) |
| **Evolution** | Long-term change management | Evolution Layer |
| **Orchestration** | Campaign and schedule coordination | Orchestration Layer |
| **Evaluation** | Cross-cutting quality and consistency scoring | All layers |

### Request Data Flow

A request enters the system and produces output through the following path:

```
1. TRIGGER arrives (user message via WebSocket, schedule tick, campaign event)
2. API Gateway routes to Performance Subsystem
3. Performance.Planner requests DecisionFrame from Cognition.FrameAssembler
4. FrameAssembler reads from Identity Subsystem (IdentityCore, Voice, Aesthetic, Traits)
5. FrameAssembler reads from State Subsystem (Memory, Mood, Arcs, Relationships)
6. FrameAssembler reads from Cognition.DirectiveResolver (active Directives)
7. FrameAssembler reads from Cognition.GuardrailEnforcer (all Guardrails)
8. FrameAssembler returns assembled DecisionFrame
9. Performance.Planner creates PerformancePlan
10. Performance.Generator calls LLM with frame + plan
11. Performance.Evaluator scores output against guardrails and quality criteria
12. IF pass: Performance.Publisher delivers via Media.AdapterRegistry
13. IF fail: loop back to step 10 (up to max_attempts)
14. Performance.SideEffectProcessor updates State Subsystem (memories, mood, relationships)
15. Event bus emits performance.published or performance.blocked
```

---

## 2. Module Catalog

Every module is specified with: name, purpose, inputs, outputs, and dependencies.

---

### Identity Subsystem

These modules manage the primitives that define what an entity IS. They enforce immutability contracts, versioning rules, and structural invariants from Part 3.

---

#### `identity.EntityStore`

**Purpose:** CRUD operations for Entity objects. Versioned storage with full history retention.

**Inputs:**
- `CreateEntityRequest { identity_core: IdentityCore, voice: Voice, aesthetic: Aesthetic | null, traits: Map<String, Trait>, guardrails: List<Guardrail> }`
- `UpdateEntityRequest { entity_id: UUID, changes: EntityPatch }`
- `GetEntityRequest { entity_id: UUID, version: SemVer | null }`
- `ArchiveEntityRequest { entity_id: UUID }`

**Outputs:**
- `Entity` (full primitive as defined in Part 3)
- `EntityVersion { entity_id: UUID, version: SemVer, diff: EntityDiff }`

**Dependencies:** Data Storage (Entity Store), `identity.IdentityCoreManager`

**Invariants enforced:**
- Entity completeness (Invariant 1): active Entity must have IdentityCore, Voice, Aesthetic, and at least one Safety Guardrail.
- No hard delete -- only archive (Part 3 Entity lifecycle).
- Version increment rules: IdentityCore or Voice change = minor version bump. Trait/Lore/Guardrail add/remove = patch version bump.

---

#### `identity.IdentityCoreManager`

**Purpose:** Immutability enforcement and version management for IdentityCore primitives.

**Inputs:**
- `CreateIdentityCoreRequest { entity_id: UUID, values: List<ValueEntry>, worldview: WorldviewSpec, communication_philosophy: String, core_tensions: List<Tension>, recognition_markers: List<String> }`
- `GetIdentityCoreRequest { entity_id: UUID, version: SemVer | null }`

**Outputs:**
- `IdentityCore` (Part 3 primitive, immutable once returned)
- `IdentityCoreHistory { entity_id: UUID, versions: List<IdentityCore> }`

**Dependencies:** Data Storage (Entity Store)

**Invariants enforced:**
- IdentityCore immutability (Invariant 7): no field modification after creation.
- Version coupling: IdentityCore version matches Entity version at creation time.
- Full history retention: all prior IdentityCores are permanently stored.

---

#### `identity.TraitEngine`

**Purpose:** Trait value tracking, range enforcement, mood modulation calculation, and drift application coordination.

**Inputs:**
- `GetTraitsRequest { entity_id: UUID }`
- `SetTraitRequest { entity_id: UUID, trait_name: String, value: Float, range: Tuple[Float, Float] }`
- `ApplyMoodModulation { traits: Map<String, Float>, mood: Mood } -> Map<String, Float>`
- `ApplyDrift { entity_id: UUID, trait_name: String, delta: Float }`

**Outputs:**
- `Map<String, Trait>` (current trait values)
- `Map<String, Float>` (effective values after mood modulation, clamped to range)

**Dependencies:** `identity.EntityStore`, `state.MoodController`, `evolution.DriftEngine`

**Invariants enforced:**
- Trait boundedness (Invariant 4): value always within range after any operation, including mood modulation (additive, then clamped).
- Epoch-specific ranges override default ranges when active (via `evolution.EpochManager`).

---

#### `identity.VoiceRegistry`

**Purpose:** Storage and retrieval of Voice specifications. Applies mood modulation to produce effective Voice for generation.

**Inputs:**
- `GetVoiceRequest { entity_id: UUID }`
- `GetEffectiveVoice { entity_id: UUID, mood: Mood | null } -> Voice`
- `UpdateVoiceRequest { entity_id: UUID, voice: Voice }` (triggers Entity minor version bump)

**Outputs:**
- `Voice` (Part 3 primitive)
- `EffectiveVoice` (Voice with VoiceModulation applied from current Mood)

**Dependencies:** `identity.EntityStore`, `state.MoodController`

---

#### `identity.AestheticRegistry`

**Purpose:** Storage and retrieval of Aesthetic specifications. Applies mood-driven color/style shifts.

**Inputs:**
- `GetAestheticRequest { entity_id: UUID }`
- `GetEffectiveAesthetic { entity_id: UUID, mood: Mood | null } -> Aesthetic`
- `UpdateAestheticRequest { entity_id: UUID, aesthetic: Aesthetic }`

**Outputs:**
- `Aesthetic` (Part 3 primitive)
- `EffectiveAesthetic` (Aesthetic with mood-based color temperature and contrast shifts)

**Dependencies:** `identity.EntityStore`, `state.MoodController`

---

#### `identity.LoreGraph`

**Purpose:** Lore entry management, supersession chain tracking, approval workflow enforcement, and consistency checking.

**Inputs:**
- `AddLoreRequest { entity_id: UUID, content: String, category: LoreCategory, confidence: Float, source: LoreSource }`
- `ApproveLoreRequest { lore_id: UUID, approved_by: String }`
- `SupersedeLoreRequest { old_lore_id: UUID, new_content: String }`
- `QueryLoreRequest { entity_id: UUID, category: LoreCategory | null, min_confidence: Float | null }`

**Outputs:**
- `Lore` (Part 3 primitive)
- `LoreChain { head: Lore, supersession_history: List<Lore> }`
- `LoreConsistencyReport { conflicts: List<{a: UUID, b: UUID, description: String}> }`

**Dependencies:** `identity.EntityStore`, `cognition.GuardrailEnforcer`

**Invariants enforced:**
- Lore consistency (Invariant 10): no two approved Lore entries may contradict unless explicit supersession.
- Guardrail gating: new lore checked against active Guardrails before acceptance.
- No deletion: rejected lore retained with `approval: Rejected`.

---

### State Subsystem

These modules manage what the entity KNOWS and FEELS at runtime. State changes frequently, sometimes within a single interaction session.

---

#### `state.MemoryManager`

**Purpose:** Memory storage, retrieval by relevance, consolidation of episodic to semantic, and garbage collection of decayed entries.

**Inputs:**
- `StoreEpisodicMemory { entity_id: UUID, event: String, context: String, emotional_valence: Float, importance: Float, stage_id: UUID | null }`
- `StoreSemanticMemory { entity_id: UUID, fact: String, confidence: Float, sources: List<UUID> }`
- `UpdateRelationalMemory { entity_id: UUID, target_id: UUID, observation: String, sentiment_delta: Float }`
- `RetrieveMemories { entity_id: UUID, query_embedding: Vector, max_results: Int, min_importance: Float } -> List<MemoryEntry>`
- `RunConsolidation { entity_id: UUID }`
- `RunGarbageCollection { entity_id: UUID }`

**Outputs:**
- `MemoryEntry` (any of EpisodicEntry, SemanticEntry, RelationalEntry from Part 3)
- `ConsolidationReport { merged: Int, promoted: Int, garbage_collected: Int }`

**Dependencies:** Data Storage (Memory Store -- vector DB + document DB), `identity.EntityStore`

**Key behaviors:**
- Retrieval uses vector similarity search with importance weighting and recency bias.
- Consolidation runs at `MemoryConfig.consolidation_interval`. Merges related episodic entries, promotes recurring patterns to semantic memory.
- GC removes entries where `importance < decay_floor` and `last_recalled` older than `3 * consolidation_interval`.
- Recall boost: retrieving a memory increases its importance by `MemoryConfig.recall_boost`.

---

#### `state.MoodController`

**Purpose:** Mood lifecycle management, intensity decay calculation, and modulation value computation.

**Inputs:**
- `SetMood { entity_id: UUID, state: String, intensity: Float, decay_rate: Float, trigger: MoodTrigger, trait_mods: Map<String, Float>, voice_mods: VoiceModulation }`
- `GetCurrentMood { entity_id: UUID } -> Mood | null`
- `TickDecay { entity_id: UUID }` (called periodically)
- `ComputeModulations { mood: Mood } -> { trait_mods: Map<String, Float>, voice_mods: VoiceModulation }`

**Outputs:**
- `Mood | null` (Part 3 primitive; null = baseline)
- Modulation values consumed by `identity.TraitEngine` and `identity.VoiceRegistry`

**Dependencies:** `identity.EntityStore`

**Invariants enforced:**
- Mood transience (Invariant 11): every Mood must have nonzero `decay_rate` or non-null `expires_at`.
- Mood replacement: setting a new mood replaces the existing one (at most one active per entity).
- Modulation bounds: `VoiceModulation` shifts are clamped to [-0.3, 0.3]. Trait mods are additive but effective values clamped to Trait range.

---

#### `state.ArcDirector`

**Purpose:** Arc phase tracking, transition condition evaluation, phase advancement, and rollback execution.

**Inputs:**
- `ActivateArc { entity_id: UUID, arc_id: UUID }`
- `EvaluateTransition { entity_id: UUID, arc_id: UUID } -> TransitionResult`
- `AdvancePhase { entity_id: UUID, arc_id: UUID }`
- `AbortArc { entity_id: UUID, arc_id: UUID }`
- `GetActiveArc { entity_id: UUID } -> Arc | null`

**Outputs:**
- `Arc` (Part 3 primitive)
- `TransitionResult { condition_met: Boolean, details: String }`
- `RollbackResult { snapshot_restored: UUID, success: Boolean }`

**Dependencies:** `identity.EntityStore`, `identity.TraitEngine`, `evolution.SnapshotService`, `identity.LoreGraph`

**Invariants enforced:**
- Single active arc (Invariant 2): activating an arc when one is already active fails.
- Pre-arc snapshot: `evolution.SnapshotService.createSnapshot()` is called before any arc activation.
- Rollback on abort: if `rollback_policy == AutoOnAbort`, entity state is restored from `pre_arc_snapshot`.

**Key behaviors:**
- Phase advancement applies `target_traits` to `identity.TraitEngine`, introduces `new_lore` via `identity.LoreGraph`, activates `new_directives` via `cognition.DirectiveResolver`.
- Transition condition evaluation delegates to the evaluator function specified in `TransitionCondition.evaluator`.

---

#### `state.RelationshipTracker`

**Purpose:** Relationship CRUD, dynamic rule execution after interactions, and history summary generation.

**Inputs:**
- `GetRelationship { entity_id: UUID, target_id: UUID } -> Relationship | null`
- `GetAllRelationships { entity_id: UUID } -> List<Relationship>`
- `CreateRelationship { entity_id: UUID, target_id: UUID, target_type: TargetType, label: String }`
- `FireDynamicRules { relationship_id: UUID, event: String }`
- `UpdateHistorySummary { relationship_id: UUID }` (LLM-generated summary refresh)

**Outputs:**
- `Relationship` (Part 3 primitive)
- `RuleFiringResult { rules_fired: List<String>, changes: Map<String, Float> }`

**Dependencies:** `identity.EntityStore`, `state.MemoryManager`

**Key behaviors:**
- Auto-creation: when interaction count with a target exceeds the configurable threshold (default: 3), a Relationship is created automatically.
- Dynamic rules fire after each interaction. Cooldown is enforced per-rule.
- Sentiment and trust are bounded after rule application.
- History summary is regenerated periodically via LLM call with relational memory entries as context.

---

### Cognition Subsystem

These modules govern how the entity DECIDES. They assemble the runtime DecisionFrame and enforce constraints.

---

#### `cognition.FrameAssembler`

**Purpose:** Builds a complete DecisionFrame from entity state and interaction context. The frame is the sole input to the generation pipeline.

**Inputs:**
- `AssembleFrameRequest { entity_id: UUID, interaction: InteractionContext, stage_id: UUID }`

**Outputs:**
- `DecisionFrame` (Part 3 primitive, immutable once returned)

**Dependencies:** `identity.EntityStore`, `identity.IdentityCoreManager`, `identity.TraitEngine`, `identity.VoiceRegistry`, `identity.AestheticRegistry`, `state.MemoryManager`, `state.MoodController`, `state.ArcDirector`, `state.RelationshipTracker`, `cognition.DirectiveResolver`, `cognition.GuardrailEnforcer`, `cognition.MemoryRetriever`

**Assembly sequence (deterministic):**
1. Load IdentityCore from `identity.IdentityCoreManager`
2. Load effective traits (with mood modulation) from `identity.TraitEngine`
3. Load effective Voice from `identity.VoiceRegistry`
4. Load effective Aesthetic from `identity.AestheticRegistry`
5. Load current Mood from `state.MoodController`
6. Retrieve relevant memories via `cognition.MemoryRetriever`
7. Resolve active directives via `cognition.DirectiveResolver`
8. Load all active guardrails via `cognition.GuardrailEnforcer`
9. Load current arc phase from `state.ArcDirector`
10. Load relevant relationships from `state.RelationshipTracker`
11. Load Stage configuration from `media.StageManager`
12. Combine all into DecisionFrame, assign UUID, timestamp, serialize for audit log

**Invariants enforced:**
- DecisionFrame completeness (Invariant 8): IdentityCore, all active Guardrails, and target Stage are required. Assembly fails if any are missing.
- Frame immutability: once assembled, the frame is frozen. No mutation during generation.

---

#### `cognition.DirectiveResolver`

**Purpose:** Resolves active Directives by scope and priority, detects conflicts, and filters to produce the effective directive set for a given context.

**Inputs:**
- `ResolveDirectives { entity_id: UUID, stage_id: UUID, session_id: UUID | null } -> List<Directive>`
- `CreateDirective { entity_id: UUID, directive: Directive } -> Directive | RejectionResult`
- `DetectConflicts { entity_id: UUID } -> List<ConflictReport>`

**Outputs:**
- `List<Directive>` (sorted by priority descending, filtered by scope)
- `ConflictReport { directive_a: UUID, directive_b: UUID, description: String, resolution: String }`

**Dependencies:** `identity.EntityStore`, `cognition.GuardrailEnforcer`

**Key behaviors:**
- Scope filtering: Global directives always included. Context(stage_id) directives included only when stage matches. Session(session_id) directives included only for that session.
- Priority ordering: higher priority wins on conflict. Equal priority directives coexist unless explicitly conflicting.
- Conflict detection: runs at directive creation time. If a new directive conflicts with existing ones, `conflicts_with` field is populated, and creator is notified.
- Guardrail validation: new directives are checked against all active Guardrails at creation time (Invariant 12). Rejection if violation detected.

---

#### `cognition.GuardrailEnforcer`

**Purpose:** Evaluates output content against all active Guardrails. Handles violations according to enforcement mode (Block, Warn, FlagForReview).

**Inputs:**
- `EvaluateOutput { entity_id: UUID, output: PerformanceOutput, guardrails: List<Guardrail> } -> GuardrailResult`
- `ValidateDirective { directive: Directive, guardrails: List<Guardrail> } -> ValidationResult`
- `ValidateLore { lore: Lore, guardrails: List<Guardrail> } -> ValidationResult`
- `GetActiveGuardrails { entity_id: UUID } -> List<Guardrail>`

**Outputs:**
- `GuardrailResult { pass: Boolean, violations: List<Violation>, action: Publish | Regenerate | Block | FlagForReview }`
- `Violation { guardrail_id: UUID, description: String, severity: String }`

**Dependencies:** `identity.EntityStore`

**Invariants enforced:**
- Guardrail supremacy (Invariant 5): no Directive, Mood, Arc, or Campaign overrides a Guardrail.
- Safety guardrails cannot be disabled. `override_allowed: false` is enforced.
- All guardrails evaluated simultaneously. All must pass for output to proceed.

---

#### `cognition.MemoryRetriever`

**Purpose:** Retrieves relevant memories for DecisionFrame assembly using vector similarity search combined with importance weighting and recency bias.

**Inputs:**
- `RetrieveRelevantMemories { entity_id: UUID, query: InteractionContext, max_results: Int, recency_weight: Float, importance_weight: Float } -> List<ScoredMemory>`

**Outputs:**
- `ScoredMemory { entry: MemoryEntry, relevance_score: Float, composite_score: Float }`

**Dependencies:** `state.MemoryManager`, Data Storage (Memory Store -- vector DB)

**Retrieval algorithm:**
```
composite_score = (similarity_weight * vector_similarity)
               + (importance_weight * entry.importance)
               + (recency_weight * recency_factor(entry.last_recalled))

recency_factor(t) = exp(-lambda * hours_since(t))
```

Default weights: `similarity_weight = 0.5`, `importance_weight = 0.3`, `recency_weight = 0.2`.

---

### Performance Subsystem

These modules handle the translation from internal state to external output. This is where the entity ACTS.

---

#### `performance.Planner`

**Purpose:** Creates a PerformancePlan from a DecisionFrame. Determines intent, tone, key points, and format constraints.

**Inputs:**
- `CreatePlan { frame: DecisionFrame } -> PerformancePlan`

**Outputs:**
- `PerformancePlan { intent: String, content_type: ContentType, tone_target: String, key_points: List<String>, constraints: List<String> }`

**Dependencies:** `cognition.FrameAssembler` (consumes the frame it produces)

**Key behaviors:**
- Intent derivation: analyzes interaction context, active directives, arc phase, and campaign brief to determine what the entity is trying to accomplish.
- Tone calculation: combines Voice baseline, Mood modulation, and Stage audience expectations.
- Constraint aggregation: merges Stage.FormatSpec constraints with Guardrail-derived content constraints.
- Key point extraction: identifies what must be communicated from directives, campaign brief, and interaction context.

---

#### `performance.Generator`

**Purpose:** Produces output content by calling the LLM with the DecisionFrame and PerformancePlan encoded as a structured prompt.

**Inputs:**
- `Generate { frame: DecisionFrame, plan: PerformancePlan } -> PerformanceOutput`

**Outputs:**
- `PerformanceOutput { content: String | MediaRef, format: String, metadata: Map<String, Any>, token_count: Int | null }`

**Dependencies:** LLM service, `identity.VoiceRegistry`, `identity.AestheticRegistry`, `media.FormatTransformer`

**Key behaviors:**
- Constructs a structured prompt from frame + plan (see Part 6, Section 3 for the generation contract).
- Calls LLM with temperature and sampling parameters calibrated per-entity.
- For visual content types, delegates to image/video generation services with Aesthetic parameters.
- Returns raw output for evaluation -- does not self-filter.

---

#### `performance.Evaluator`

**Purpose:** Scores generated output on guardrail compliance, identity consistency, voice consistency, and overall quality. Returns a publish/regenerate/block decision.

**Inputs:**
- `Evaluate { entity_id: UUID, output: PerformanceOutput, frame: DecisionFrame, plan: PerformancePlan } -> EvaluationResult`

**Outputs:**
- `EvaluationResult` (Part 3 primitive embedded in Performance)

**Dependencies:** `cognition.GuardrailEnforcer`, `evaluation.IdentityEvaluator`, `evaluation.VoiceAnalyzer`

**Evaluation pipeline:**
1. **Guardrail check** via `cognition.GuardrailEnforcer.EvaluateOutput`. If any Block-level violation, return `Regenerate` (or `Block` if at max_attempts).
2. **Identity consistency** via `evaluation.IdentityEvaluator`. Scores how well output reflects IdentityCore values and worldview.
3. **Voice consistency** via `evaluation.VoiceAnalyzer`. Scores linguistic alignment with Voice spec.
4. **Quality score**: weighted combination of identity (0.4) + voice (0.3) + guardrail compliance (0.3).
5. **Decision**: if `quality_score >= 0.6` and guardrails pass, `Publish`. If `quality_score < 0.6`, `Regenerate`. If at max_attempts and still failing, `Block`.

---

#### `performance.Publisher`

**Purpose:** Delivers evaluated and approved output to the target Stage via the appropriate Adapter.

**Inputs:**
- `Publish { performance: Performance, output: PerformanceOutput, stage_id: UUID } -> PublishResult`

**Outputs:**
- `PublishResult { success: Boolean, platform_id: String | null, url: String | null, error: String | null }`

**Dependencies:** `media.AdapterRegistry`, `media.StageManager`

**Key behaviors:**
- Looks up the Adapter for the target Stage via `media.AdapterRegistry`.
- Calls `Adapter.validate(output)` to check format compliance.
- Calls `Adapter.publish(output)` to deliver to the platform.
- Records platform-assigned IDs (tweet ID, post URL) in Performance metadata.
- Emits `performance.published` event on success, `performance.publish_failed` on failure.

---

#### `performance.SideEffectProcessor`

**Purpose:** Processes post-performance side effects: creates episodic memories, updates mood, fires relationship rules, and applies trait nudges.

**Inputs:**
- `ProcessSideEffects { performance: Performance, frame: DecisionFrame } -> SideEffects`

**Outputs:**
- `SideEffects` (Part 3 primitive embedded in Performance)

**Dependencies:** `state.MemoryManager`, `state.MoodController`, `state.RelationshipTracker`, `identity.TraitEngine`

**Side effect sequence:**
1. **Memory creation**: create EpisodicEntry from performance output and context.
2. **Mood update**: if the performance or audience response warrants, set new mood via `state.MoodController`.
3. **Relationship updates**: if interaction involved known targets, fire dynamic rules via `state.RelationshipTracker`.
4. **Trait nudges**: apply minor trait deltas from experience (bounded by Trait range).

---

### Media Subsystem

These modules manage the interface between entities and external platforms.

---

#### `media.AdapterRegistry`

**Purpose:** Manages the registry of available Adapters. Lookup by stage, capability, or content type.

**Inputs:**
- `GetAdapter { stage_id: UUID } -> Adapter`
- `RegisterAdapter { adapter: Adapter }`
- `ListAdapters { capability_filter: ContentType | null } -> List<Adapter>`

**Outputs:**
- `Adapter` (Part 3 primitive)

**Dependencies:** Data Storage (Configuration Store)

---

#### `media.StageManager`

**Purpose:** Stage configuration, lifecycle management, and format constraint enforcement.

**Inputs:**
- `GetStage { stage_id: UUID } -> Stage`
- `CreateStage { stage: Stage }`
- `UpdateStage { stage_id: UUID, changes: StagePatch }`
- `DeactivateStage { stage_id: UUID }`
- `ListActiveStages {} -> List<Stage>`

**Outputs:**
- `Stage` (Part 3 primitive)

**Dependencies:** Data Storage (Configuration Store), `media.AdapterRegistry`

---

#### `media.FormatTransformer`

**Purpose:** Content format conversion between internal representation and stage-specific formats.

**Inputs:**
- `Transform { content: String | MediaRef, source_format: String, target_format: String, stage: Stage } -> TransformedContent`

**Outputs:**
- `TransformedContent { content: String | MediaRef, format: String, warnings: List<String> }`

**Dependencies:** `media.StageManager`

**Key behaviors:**
- Text truncation with intelligent breakpoints (sentence boundaries, not mid-word).
- Thread splitting for platforms with character limits.
- Media format conversion (image resize, format change, alt text generation).
- Metadata injection (hashtags, mentions, platform-specific fields).

---

### Evolution Subsystem

These modules manage how the entity CHANGES over time in a controlled, auditable, reversible way.

---

#### `evolution.EpochManager`

**Purpose:** Epoch lifecycle management, transition rule evaluation, and epoch-specific trait range enforcement.

**Inputs:**
- `GetActiveEpoch { entity_id: UUID } -> Epoch`
- `CreateEpoch { entity_id: UUID, epoch: Epoch }`
- `EvaluateEpochTransition { entity_id: UUID } -> TransitionResult`
- `AdvanceEpoch { entity_id: UUID }`
- `GetEpochHistory { entity_id: UUID } -> List<Epoch>`

**Outputs:**
- `Epoch` (Part 3 primitive)
- `TransitionResult { condition_met: Boolean, next_epoch: Epoch | null }`

**Dependencies:** `identity.EntityStore`, `evolution.SnapshotService`, `identity.TraitEngine`

**Invariants enforced:**
- Single active epoch (Invariant 3): exactly one Epoch with `status: Active` at any time.
- Epoch boundary snapshots: `evolution.SnapshotService.createSnapshot()` is called at every epoch transition (both end of old and start of new).
- Epoch trait ranges: when an epoch defines `trait_ranges`, those override the Trait's default range for the duration of the epoch.

---

#### `evolution.DriftEngine`

**Purpose:** Applies DriftRules to Traits on schedule. Evaluates drift triggers. Enforces drift bounds.

**Inputs:**
- `ApplyDrift { entity_id: UUID }` (processes all active DriftRules for the entity)
- `EvaluateTrigger { drift_rule_id: UUID, event: String } -> TriggerResult`
- `GetDriftHistory { entity_id: UUID, trait_name: String } -> List<DriftEvent>`

**Outputs:**
- `DriftEvent { trait_name: String, old_value: Float, new_value: Float, rule_id: UUID, trigger: String | null, applied_at: ISO8601 }`

**Dependencies:** `identity.TraitEngine`, `identity.EntityStore`

**Key behaviors:**
- Periodic execution: drift is applied based on `DriftRule.period`. The engine checks `last_applied` and applies if enough time has elapsed.
- Direction types: `TowardValue` moves trait toward target. `TowardInteractions` analyzes recent performances to determine drift direction. `RandomWalk` applies bounded random change with optional bias. `Decay` moves trait toward 0.
- Trigger multipliers: events can accelerate or decelerate drift. Cooldowns are enforced.
- Bounds enforcement: result is always clamped to `DriftRule.bounds` and `Trait.range`.

---

#### `evolution.SnapshotService`

**Purpose:** Creates, stores, validates, and restores complete entity state snapshots.

**Inputs:**
- `CreateSnapshot { entity_id: UUID, trigger: SnapshotTrigger, tags: List<String> } -> Snapshot`
- `RestoreSnapshot { entity_id: UUID, snapshot_id: UUID } -> RestoreResult`
- `GetSnapshot { snapshot_id: UUID } -> Snapshot`
- `DiffSnapshots { snapshot_a: UUID, snapshot_b: UUID } -> SnapshotDiff`
- `ListSnapshots { entity_id: UUID } -> List<Snapshot>`

**Outputs:**
- `Snapshot` (Part 3 primitive)
- `RestoreResult { success: Boolean, entity_version_after: SemVer }`
- `SnapshotDiff { changes: List<FieldDiff> }`

**Dependencies:** `identity.EntityStore`, `state.MemoryManager`, Data Storage (Snapshot Store)

**Invariants enforced:**
- Snapshot immutability (Invariant 6): no field modification after creation. SHA256 checksum verified on every read.
- Complete serialization: all primitives from Part 3 SerializedEntityState are captured.

---

#### `evolution.MigrationRunner`

**Purpose:** Schema migration for entity version upgrades. Handles structural changes when IdentityCore evolves.

**Inputs:**
- `RunMigration { entity_id: UUID, from_version: SemVer, to_version: SemVer, migration_plan: MigrationPlan }`
- `ValidateMigration { migration_plan: MigrationPlan } -> ValidationResult`

**Outputs:**
- `MigrationResult { success: Boolean, entity_version_after: SemVer, warnings: List<String> }`

**Dependencies:** `identity.EntityStore`, `evolution.SnapshotService`

**Key behaviors:**
- Pre-migration snapshot is always taken.
- Migration plan specifies field mappings, default values for new fields, and transformation functions.
- Dry-run mode: validates migration without applying changes.
- Rollback on failure: restores pre-migration snapshot.

---

### Orchestration Subsystem

These modules coordinate multiple performances across stages and time.

---

#### `orchestration.CampaignPlanner`

**Purpose:** Campaign lifecycle management, cross-stage coordination, performance scheduling, and coherence rule enforcement.

**Inputs:**
- `CreateCampaign { entity_id: UUID, campaign: Campaign }`
- `ActivateCampaign { campaign_id: UUID }`
- `GetNextScheduledPerformance { campaign_id: UUID } -> ScheduledPerformance | null`
- `EvaluateCoherenceRules { campaign_id: UUID, performance: Performance } -> CoherenceResult`
- `CompleteCampaign { campaign_id: UUID }`

**Outputs:**
- `Campaign` (Part 3 primitive)
- `CoherenceResult { pass: Boolean, violations: List<String> }`

**Dependencies:** `identity.EntityStore`, `performance.Planner`, `media.StageManager`

---

#### `orchestration.Scheduler`

**Purpose:** Proactive performance scheduling. Manages time-based triggers and generates InteractionContext for scheduled performances.

**Inputs:**
- `SchedulePerformance { entity_id: UUID, stage_id: UUID, scheduled_at: ISO8601, content_brief: String }`
- `GetPendingSchedule { entity_id: UUID } -> List<ScheduledItem>`
- `Tick {}` (called periodically to check for due performances)

**Outputs:**
- `ScheduledItem { entity_id: UUID, stage_id: UUID, due_at: ISO8601, content_brief: String }`
- `TriggerResult { performances_triggered: Int }`

**Dependencies:** `performance.Planner`, `cognition.FrameAssembler`

**Key behaviors:**
- Respects Stage.TimingSpec rate limits and minimum intervals.
- Generates proactive InteractionContext with `type: Scheduled` for frame assembly.
- Handles timezone-aware scheduling.

---

### Evaluation Subsystem

These modules provide cross-cutting quality and consistency assessment.

---

#### `evaluation.IdentityEvaluator`

**Purpose:** Scores how well a generated output reflects the entity's IdentityCore values, worldview, and recognition markers.

**Inputs:**
- `ScoreIdentityConsistency { output: PerformanceOutput, identity_core: IdentityCore } -> Float[0, 1]`

**Outputs:**
- `Float[0, 1]` (identity consistency score)

**Dependencies:** LLM service (for semantic evaluation)

**Scoring dimensions:**
- Value alignment: does the output reflect the entity's ranked values?
- Worldview consistency: does the output align with the entity's beliefs and orientation?
- Recognition marker presence: would someone say "that's so [entity]" about this output?
- Core tension balance: does the output reflect appropriate tension balance?

---

#### `evaluation.VoiceAnalyzer`

**Purpose:** Scores linguistic consistency between generated output and the entity's Voice specification.

**Inputs:**
- `ScoreVoiceConsistency { output: PerformanceOutput, voice: Voice } -> Float[0, 1]`

**Outputs:**
- `Float[0, 1]` (voice consistency score)

**Dependencies:** LLM service, text analysis utilities

**Scoring dimensions:**
- Vocabulary compliance: preferred terms used, avoided terms absent.
- Syntax match: sentence length, complexity, fragment frequency within spec ranges.
- Rhetoric alignment: primary devices present, avoided devices absent.
- Emotional register: intensity and expression match current mood-modulated Voice.

---

#### `evaluation.DriftMonitor`

**Purpose:** Long-term drift detection. Compares entity state across snapshots to identify unintended identity drift.

**Inputs:**
- `AnalyzeDrift { entity_id: UUID, window: Duration } -> DriftReport`
- `CompareToBaseline { entity_id: UUID, baseline_snapshot: UUID } -> BaselineComparison`

**Outputs:**
- `DriftReport { trait_drift: Map<String, Float>, voice_drift: Float, overall_drift: Float, alerts: List<String> }`
- `BaselineComparison { divergence_score: Float, significant_changes: List<String> }`

**Dependencies:** `evolution.SnapshotService`, `identity.TraitEngine`

---

#### `evaluation.HealthAggregator`

**Purpose:** Aggregates all evaluation signals into an entity health dashboard.

**Inputs:**
- `GetEntityHealth { entity_id: UUID } -> HealthReport`

**Outputs:**
- `HealthReport { identity_consistency_avg: Float, voice_consistency_avg: Float, guardrail_violation_rate: Float, drift_score: Float, performance_quality_avg: Float, active_alerts: List<String>, recommendation: String }`

**Dependencies:** `evaluation.IdentityEvaluator`, `evaluation.VoiceAnalyzer`, `evaluation.DriftMonitor`, Data Storage (Performance Log)

---

## 3. Data Storage Architecture

### Entity Store (Document Database)

**Technology:** MongoDB-like document database.

**Contents:**
- Entity documents (one per entity, full current state)
- Entity version history (one document per version)
- IdentityCore history (immutable, append-only)
- Trait, Voice, Aesthetic, Lore, Directive, Guardrail records (nested or referenced)

**Schema characteristics:**
- Entity is the root document. Most sub-primitives are embedded for read performance.
- Lore entries are a separate collection (can grow large, needs independent querying).
- Directive and Guardrail are separate collections (shared query patterns).

**Access patterns:**
- Read-heavy on entity retrieval (every DecisionFrame assembly reads the entity).
- Write-moderate on state updates (mood, trait values, memory).
- Write-rare on identity changes (IdentityCore, Voice, Aesthetic).

**Indexes:**
- `entity_id` (primary, all collections)
- `entity_id + version` (version history)
- `entity_id + status` (active directives, active guardrails)
- `entity_id + category + approval` (lore queries)

### Memory Store (Vector Database + Document Database Hybrid)

**Technology:** Vector database (Qdrant, Pinecone, or pgvector) for similarity search, backed by document database for full entry storage.

**Contents:**
- EpisodicEntry, SemanticEntry, RelationalEntry documents
- Vector embeddings of memory content (for similarity search)
- Importance scores, decay metadata, recall timestamps

**Access patterns:**
- Vector similarity search on every DecisionFrame assembly (high read frequency).
- Append on every performance completion (new episodic entries).
- Batch operations during consolidation and garbage collection.

**Indexes:**
- Vector index on content embeddings (ANN -- approximate nearest neighbor)
- `entity_id + importance` (for GC candidate selection)
- `entity_id + last_recalled` (for recency weighting)
- `entity_id + target_id` (relational memory lookup)

### Performance Log (Append-Only Event Store)

**Technology:** Append-only event store (EventStoreDB, Kafka + compacted topics, or PostgreSQL with append-only tables).

**Contents:**
- Performance records (every performance, including Blocked and Failed)
- DecisionFrame snapshots (serialized frames for audit)
- EvaluationResult records
- Side effect records

**Schema characteristics:**
- Append-only. No updates, no deletes.
- Each entry includes `entity_id`, `performance_id`, `timestamp`, and `payload`.
- Retention policy: configurable, default 90 days for DecisionFrame snapshots, indefinite for Performance records.

**Access patterns:**
- Append on every performance completion.
- Read for audit, evaluation scoring, and drift analysis.
- Batch read for health aggregation.

**Invariant:** Performance auditability (Invariant 9) -- every published Performance has a logged DecisionFrame traceable back to entity state.

### Snapshot Store (Immutable Blob Storage)

**Technology:** Immutable blob storage (S3 with object lock, MinIO, or content-addressable storage).

**Contents:**
- SerializedEntityState blobs (Part 3 Snapshot.state)
- SHA256 checksums for integrity verification
- Snapshot metadata documents

**Access patterns:**
- Write on epoch boundaries, pre-arc, creator request, or scheduled.
- Read on restore operations, diffing, and audit.
- Read frequency is low; write frequency is low.

**Invariant:** Snapshot immutability (Invariant 6) -- checksums verified on every read.

### Configuration Store

**Technology:** Key-value store or document database (etcd, Consul, or the same document DB used for entities).

**Contents:**
- Stage configurations
- Adapter registrations and configurations
- System settings (default guardrails, consolidation intervals, decay parameters)
- API key and token metadata (credentials themselves in vault)

**Access patterns:**
- Read-heavy (stage and adapter lookup on every performance).
- Write-rare (configuration changes are infrequent).

---

## 4. API Gateway Architecture

### REST API Surface

All primitives from Part 3 are exposed via RESTful CRUD endpoints.

**Entity endpoints:**
```
POST   /api/v1/entities                          Create entity
GET    /api/v1/entities/{id}                      Get entity (current version)
GET    /api/v1/entities/{id}/versions/{version}   Get entity at specific version
PATCH  /api/v1/entities/{id}                      Update entity (partial)
POST   /api/v1/entities/{id}/archive              Archive entity
GET    /api/v1/entities/{id}/health               Get health report
```

**Identity sub-resource endpoints:**
```
GET    /api/v1/entities/{id}/identity-core        Get current IdentityCore
GET    /api/v1/entities/{id}/traits                Get all traits
PUT    /api/v1/entities/{id}/traits/{name}         Set trait value
GET    /api/v1/entities/{id}/voice                 Get Voice
PUT    /api/v1/entities/{id}/voice                 Update Voice (triggers version bump)
GET    /api/v1/entities/{id}/aesthetic             Get Aesthetic
PUT    /api/v1/entities/{id}/aesthetic             Update Aesthetic
```

**Lore endpoints:**
```
GET    /api/v1/entities/{id}/lore                  List lore entries
POST   /api/v1/entities/{id}/lore                  Add lore entry
POST   /api/v1/entities/{id}/lore/{lore_id}/approve    Approve lore
POST   /api/v1/entities/{id}/lore/{lore_id}/supersede  Supersede lore
```

**State endpoints:**
```
GET    /api/v1/entities/{id}/mood                  Get current mood
PUT    /api/v1/entities/{id}/mood                  Set mood
GET    /api/v1/entities/{id}/memories              Query memories
GET    /api/v1/entities/{id}/relationships         List relationships
GET    /api/v1/entities/{id}/arcs                  List arcs
POST   /api/v1/entities/{id}/arcs                  Create arc
POST   /api/v1/entities/{id}/arcs/{arc_id}/activate    Activate arc
POST   /api/v1/entities/{id}/arcs/{arc_id}/abort       Abort arc
```

**Cognition endpoints:**
```
GET    /api/v1/entities/{id}/directives            List active directives
POST   /api/v1/entities/{id}/directives            Create directive
DELETE /api/v1/entities/{id}/directives/{did}       Revoke directive
GET    /api/v1/entities/{id}/guardrails            List guardrails
POST   /api/v1/entities/{id}/guardrails            Create guardrail
```

**Performance endpoints:**
```
POST   /api/v1/entities/{id}/perform               Trigger reactive performance
GET    /api/v1/entities/{id}/performances           List performances
GET    /api/v1/entities/{id}/performances/{pid}     Get performance detail (includes frame)
```

**Evolution endpoints:**
```
GET    /api/v1/entities/{id}/epochs                 List epochs
POST   /api/v1/entities/{id}/snapshots              Create snapshot
GET    /api/v1/entities/{id}/snapshots               List snapshots
POST   /api/v1/entities/{id}/snapshots/{sid}/restore Restore snapshot
GET    /api/v1/entities/{id}/snapshots/diff?a={a}&b={b}  Diff two snapshots
```

**Orchestration endpoints:**
```
POST   /api/v1/entities/{id}/campaigns              Create campaign
GET    /api/v1/entities/{id}/campaigns               List campaigns
POST   /api/v1/entities/{id}/campaigns/{cid}/activate  Activate campaign
```

**Stage and Adapter endpoints (not entity-scoped):**
```
GET    /api/v1/stages                               List stages
POST   /api/v1/stages                               Create stage
GET    /api/v1/stages/{id}                           Get stage
GET    /api/v1/adapters                              List adapters
POST   /api/v1/adapters                              Register adapter
```

### WebSocket API

**Purpose:** Real-time performance streaming and live interactions.

**Channels:**
```
ws://host/ws/entities/{id}/interact       Live interaction channel (bidirectional)
ws://host/ws/entities/{id}/events         Entity event stream (server-sent)
ws://host/ws/admin/events                 System-wide event stream
```

**Interaction channel protocol:**
```json
// Client -> Server (user message)
{ "type": "message", "content": "...", "session_id": "...", "stage_id": "..." }

// Server -> Client (entity response)
{ "type": "response", "performance_id": "...", "content": "...", "metadata": {} }

// Server -> Client (status updates)
{ "type": "status", "phase": "planning|generating|evaluating|published", "performance_id": "..." }
```

**Entity event stream:**
```json
// Performance events
{ "type": "performance.published", "performance_id": "...", "stage_id": "..." }
{ "type": "performance.blocked", "performance_id": "...", "reason": "..." }

// State change events
{ "type": "mood.changed", "old": "...", "new": "..." }
{ "type": "arc.phase_advanced", "arc_id": "...", "phase": "..." }
{ "type": "epoch.transitioned", "old_epoch": "...", "new_epoch": "..." }
```

### Event Bus (Internal)

**Purpose:** Async inter-subsystem communication. Decouples modules that do not need synchronous responses.

**Technology:** In-process event bus for monolith deployment; message broker (RabbitMQ, NATS, or Redis Streams) for microservice deployment.

**Event categories:**
```
identity.*           Entity, IdentityCore, Trait, Voice, Aesthetic, Lore changes
state.*              Memory, Mood, Arc, Relationship changes
cognition.*          Directive created/expired, guardrail violation
performance.*        Performance lifecycle events
evolution.*          Epoch transition, drift applied, snapshot created
orchestration.*      Campaign events, schedule triggers
evaluation.*         Health alerts, drift warnings
```

**Key event flows:**
- `performance.published` -> `state.MemoryManager` (create episodic memory)
- `performance.published` -> `state.RelationshipTracker` (fire dynamic rules)
- `arc.phase_advanced` -> `state.MoodController` (trigger mood)
- `arc.phase_advanced` -> `identity.TraitEngine` (apply target traits)
- `epoch.transitioned` -> `evolution.SnapshotService` (create boundary snapshot)
- `drift.applied` -> `evaluation.DriftMonitor` (check for unintended drift)

### Auth Model

**Token types:**

| Token Type | Scope | Capabilities |
|---|---|---|
| **Creator Token** | Full access to owned entities | CRUD all primitives, override directives, manage guardrails, view audit logs |
| **Entity Token** | Scoped to one entity | Read identity, trigger reactive performances, read performances |
| **API Key** | System-level access | Stage management, adapter registration, system configuration |
| **Session Token** | Scoped to one interaction session | Send messages, receive responses, read session history |

**Auth flow:**
1. Creator authenticates via OAuth2 or API key.
2. Creator creates Entity Tokens for programmatic entity access.
3. Session Tokens are issued for live interaction sessions (WebSocket).
4. All token usage is logged for audit.

---

## 5. Deployment Architecture

### Option A: Monolith Deployment

All subsystems run in a single process. Suitable for development, single-entity deployments, and low-throughput scenarios.

```
+------------------------------------------+
|           IDOL FRAME MONOLITH            |
|                                          |
|  [API Gateway]                           |
|  [Event Bus (in-process)]                |
|  [All Subsystem Modules]                 |
|  [LLM Client]                           |
+------------------------------------------+
     |           |            |
     v           v            v
  [Entity DB] [Vector DB] [Blob Store]
```

**Requirements:**
- 4+ CPU cores
- 16+ GB RAM
- GPU optional (can use external LLM API)
- 50+ GB storage (scales with entity count and memory accumulation)

### Option B: Microservice Deployment

Each subsystem runs as an independent service. Suitable for multi-entity, high-throughput production deployments.

```
+----------------+     +----------------+     +----------------+
|  API Gateway   |     |  Identity Svc  |     |   State Svc    |
| (stateless)    |     | (stateless)    |     | (stateful*)    |
+----------------+     +----------------+     +----------------+
        |                      |                      |
        v                      v                      v
+====================================================================+
|                    MESSAGE BROKER (NATS / RabbitMQ)                 |
+====================================================================+
        |                      |                      |
        v                      v                      v
+----------------+     +----------------+     +----------------+
| Cognition Svc  |     | Performance Svc|     | Evolution Svc  |
| (stateless)    |     | (stateless)    |     | (stateless)    |
+----------------+     +----------------+     +----------------+
        |                      |                      |
        v                      v                      v
+----------------+     +----------------+     +----------------+
|  Media Svc     |     | Evaluation Svc |     |Orchestration   |
| (stateless)    |     | (stateless)    |     |    Svc          |
+----------------+     +----------------+     +----------------+
```

*State Svc is "stateful" in the sense that it manages caches for active entity mood and session state. Actual persistence is in the database layer.

### Scaling Considerations

| Module | Stateless? | Scaling Strategy |
|---|---|---|
| API Gateway | Yes | Horizontal, behind load balancer |
| Identity Subsystem | Yes | Horizontal (reads from shared DB) |
| State Subsystem | Mostly | Horizontal, but mood/session state benefits from entity affinity |
| Cognition Subsystem | Yes | Horizontal |
| Performance Subsystem | Yes | Horizontal, but LLM calls are the bottleneck |
| Media Subsystem | Yes | Horizontal, one instance per active adapter possible |
| Evolution Subsystem | Yes | Low throughput, single instance usually sufficient |
| Orchestration Subsystem | Yes | Single instance with leader election for scheduler |
| Evaluation Subsystem | Yes | Horizontal |

### GPU Requirements

| Component | GPU Required? | Notes |
|---|---|---|
| LLM inference (text generation) | Recommended | Can use external API (OpenAI, Anthropic) instead |
| Image generation | Yes (if local) | Can use external API (Replicate, etc.) |
| Voice analysis | No | Text analysis, not audio |
| Vector embedding | Optional | CPU-viable for small entity counts |
| Guardrail evaluation | No | LLM-based but can use smaller models |

---

## 6. Architecture Diagrams

### Diagram 1: Full System Overview

```
+=======================================================================+
|                          API GATEWAY                                   |
|  [REST]  [WebSocket]  [Webhooks]  [Admin]                             |
|      Auth: Creator Tokens | Entity Tokens | API Keys                  |
+=======================================================================+
         |              |              |              |
         v              v              v              v
+=======================================================================+
|                         EVENT BUS                                      |
|  identity.* | state.* | cognition.* | performance.* | evolution.*     |
|  orchestration.* | evaluation.*                                        |
+=======================================================================+
  |          |            |            |           |           |
  v          v            v            v           v           v
+------+  +------+  +---------+  +--------+  +--------+  +--------+
|IDENT.|  |STATE |  |COGNITION|  | PERF.  |  | MEDIA  |  | EVOL.  |
|      |  |      |  |         |  |        |  |        |  |        |
|Entity|  |Memory|  |Frame    |  |Planner |  |Adapter |  |Epoch   |
|Store |  |Mngr  |  |Assembler|  |        |  |Registry|  |Manager |
|      |  |      |  |         |  |Generat.|  |        |  |        |
|Core  |  |Mood  |  |Directive|  |        |  |Stage   |  |Drift   |
|Mngr  |  |Ctrl  |  |Resolver |  |Evaluat.|  |Manager |  |Engine  |
|      |  |      |  |         |  |        |  |        |  |        |
|Trait |  |Arc   |  |Guardrail|  |Publish.|  |Format  |  |Snap    |
|Engine|  |Dir.  |  |Enforcer |  |        |  |Xformer |  |Service |
|      |  |      |  |         |  |SideEff.|  |        |  |        |
|Voice |  |Rel.  |  |Memory   |  |Process.|  |        |  |Migrat. |
|Reg.  |  |Track.|  |Retriever|  |        |  |        |  |Runner  |
|      |  |      |  |         |  |        |  |        |  |        |
|Aesth.|  |      |  |         |  |        |  |        |  |        |
|Reg.  |  |      |  |         |  |        |  |        |  |        |
|      |  |      |  |         |  |        |  |        |  |        |
|Lore  |  |      |  |         |  |        |  |        |  |        |
|Graph |  |      |  |         |  |        |  |        |  |        |
+------+  +------+  +---------+  +--------+  +--------+  +--------+
  |          |            |            |           |           |
  v          v            v            v           v           v
+=======================================================================+
|  +----------+  +-----------+  +--------+  +----------+  +--------+   |
|  |Entity    |  |Memory     |  |Perf.   |  |Snapshot  |  |Config  |   |
|  |Store     |  |Store      |  |Log     |  |Store     |  |Store   |   |
|  |(Doc DB)  |  |(Vec+Doc)  |  |(Events)|  |(Blobs)   |  |(KV)    |   |
|  +----------+  +-----------+  +--------+  +----------+  +--------+   |
|                     DATA STORAGE LAYER                                 |
+=======================================================================+

  +--------+     +--------+
  |ORCHESTR|     |EVAL.   |         (Cross-cutting subsystems)
  |        |     |        |
  |Campaign|     |Identity|
  |Planner |     |Evaluat.|
  |        |     |        |
  |Schedul.|     |Voice   |
  |        |     |Analyzer|
  |        |     |        |
  |        |     |Drift   |
  |        |     |Monitor |
  |        |     |        |
  |        |     |Health  |
  |        |     |Aggreg. |
  +--------+     +--------+
```

### Diagram 2: Performance Pipeline

```
  TRIGGER
  (user msg / schedule / campaign)
      |
      v
+-------------------+
| Context Resolution|  Identify: entity_id, stage_id, interaction type
| (API Gateway)     |  Route to correct entity's pipeline
+-------------------+
      |
      v
+-------------------+     +-------------------+
| cognition.        |---->| cognition.        |
| MemoryRetriever   |     | DirectiveResolver |
| (vector search +  |     | (scope filter +   |
|  importance wt)   |     |  priority sort)   |
+-------------------+     +-------------------+
      |                          |
      v                          v
+-------------------------------------------+
| cognition.FrameAssembler                  |
|                                           |
| Reads: IdentityCore, Traits (mod by Mood),|
|   Voice (mod by Mood), Aesthetic,         |
|   Mood, Memories, Directives,             |
|   Guardrails, Arc phase,                  |
|   Relationships, Stage                    |
|                                           |
| Output: DecisionFrame (immutable)         |
+-------------------------------------------+
      |
      v
+-------------------+
| performance.      |
| Planner           |
| (intent, tone,    |
|  key points,      |
|  constraints)     |
|                   |
| Output:           |
| PerformancePlan   |
+-------------------+
      |
      v
+-------------------+
| performance.      |
| Generator         |<----- LLM Service
| (structured       |
|  prompt from      |
|  frame + plan)    |
|                   |
| Output:           |
| PerformanceOutput |
+-------------------+
      |
      v
+-------------------+     +-------------------+
| cognition.        |     | evaluation.       |
| GuardrailEnforcer |     | IdentityEvaluator |
| (all guardrails   |     | + VoiceAnalyzer   |
|  checked)         |     | (quality scoring) |
+-------------------+     +-------------------+
      |                          |
      v                          v
+-------------------------------------------+
| performance.Evaluator                     |
|                                           |
| guardrail_pass? + quality_score >= 0.6?   |
|                                           |
|  YES ──> Publish                          |
|  NO  ──> Regenerate (if attempts < max)   |
|  NO  ──> Block (if attempts >= max)       |
+-------------------------------------------+
      |                          |
      | (Publish)                | (Regenerate)
      v                          v
+-------------------+     loops back to
| performance.      |     performance.Generator
| Publisher         |
| (via Adapter)     |
+-------------------+
      |
      v
+-------------------------------------------+
| performance.SideEffectProcessor           |
|                                           |
| 1. Create episodic memory                 |
| 2. Update mood (if warranted)             |
| 3. Fire relationship dynamic rules        |
| 4. Apply trait nudges                     |
+-------------------------------------------+
      |
      v
  EVENT BUS
  (performance.published)
```

### Diagram 3: Evolution Pipeline

```
  TIME PASSES / EVENTS OCCUR
      |
      v
+===========================================+
|           evolution.DriftEngine            |
|                                            |
|  For each entity with active DriftRules:   |
|                                            |
|  1. Check: has period elapsed since        |
|     last_applied?                          |
|  2. Check: any DriftTriggers fired?        |
|  3. Calculate delta:                       |
|     - TowardValue: move toward target      |
|     - TowardInteractions: analyze recents  |
|     - RandomWalk: bounded random + bias    |
|     - Decay: move toward 0                 |
|  4. Apply multiplier from triggers         |
|  5. Clamp to DriftRule.bounds + Trait.range |
|  6. Update trait value via TraitEngine     |
|  7. Log DriftEvent                         |
|                                            |
|  Output: trait values shift gradually      |
+===========================================+
      |
      |  (drift accumulates over time)
      v
+===========================================+
|          evolution.EpochManager            |
|                                            |
|  Periodic check:                           |
|  1. Evaluate end_condition of active Epoch |
|  2. If met:                                |
|     a. Create boundary Snapshot            |
|        (SnapshotService)                   |
|     b. Set active Epoch status: Completed  |
|     c. Activate next planned Epoch         |
|     d. Apply new epoch's trait_ranges      |
|        (override Trait default ranges)     |
|     e. Create start-of-epoch Snapshot      |
|     f. Emit epoch.transitioned event       |
|                                            |
|  Epoch also contains completed arcs:       |
|     arcs_completed list is updated when    |
|     ArcDirector completes an arc within    |
|     the epoch's time span.                 |
+===========================================+
      |
      v
+===========================================+
|        evolution.SnapshotService           |
|                                            |
|  Snapshots created at:                     |
|  - Epoch boundaries (automatic)            |
|  - Pre-arc activation (automatic)          |
|  - Creator request (manual)                |
|  - Scheduled intervals (configurable)      |
|                                            |
|  Each snapshot:                             |
|  1. Serialize full entity state            |
|     (SerializedEntityState from Part 3)    |
|  2. Compute SHA256 checksum                |
|  3. Store as immutable blob                |
|  4. Link to parent snapshot (lineage)      |
|  5. Tag with trigger type and labels       |
|                                            |
|  Restore operation:                        |
|  1. Verify checksum                        |
|  2. Deserialize state                      |
|  3. Overwrite entity current state         |
|  4. Increment entity version               |
+===========================================+
      |
      v
  evaluation.DriftMonitor
  (compares snapshots over time,
   alerts on unintended drift)
```

---

## End of Part 5

This document defines the complete system architecture for Idol Frame. Part 6 (Runtime & Cognition) describes in detail what happens inside each module during a single interaction cycle. All module names, primitive references, and invariant citations in this document reference Part 3 canonical definitions.

# Primitives Glossary — Canonical Quick Reference

**Source:** Part 3: Framework Primitives (NORMATIVE)
**Purpose:** Mandatory context for all agents writing Parts 5-15. Complete, accurate, concise.
**Version:** 1.0.0
**Date:** 2026-03-15

---

## Quick Reference Table

| # | Primitive | Layer | One-Line Summary |
|---|-----------|-------|------------------|
| 1 | Entity | Identity | The top-level persistent creative identity container. Root node of the entire primitive graph. |
| 2 | IdentityCore | Identity | The immutable-per-version essence that makes an entity recognizably itself across all contexts. |
| 3 | Trait | Identity | A named, typed, bounded, driftable characteristic that quantifies one dimension of personality. |
| 4 | Voice | Identity | The linguistic signature that defines how an entity speaks, writes, and communicates — independent of content. |
| 5 | Aesthetic | Identity | The visual and stylistic identity that governs how an entity presents itself in visual media. |
| 6 | Lore | Identity | A discrete unit of backstory, canon, or narrative fact belonging to an entity, with provenance and confidence metadata. |
| 7 | Memory | State | The persistent knowledge store for an entity, organized into episodic, semantic, and relational substores with importance scoring and decay. |
| 8 | Mood | State | A short-lived emotional state that modulates entity output without overriding IdentityCore. |
| 9 | Arc | State | A scripted narrative trajectory with phases, transition conditions, and rollback capability that governs entity development over time. |
| 10 | Relationship | State | A typed, stateful, bidirectional connection between an entity and another entity or a user class, with history and dynamic rules. |
| 11 | Directive | Cognition | A creator-issued instruction that shapes entity behavior within a defined scope and duration, without breaking identity coherence. |
| 12 | Guardrail | Cognition | An inviolable constraint on entity behavior that cannot be overridden by Directives, Moods, Arcs, or any other primitive. |
| 13 | DecisionFrame | Cognition | The ephemeral runtime context assembled for each interaction, containing everything the entity needs to decide what to do and how. |
| 14 | Performance | Performance | A single coherent output event — the atomic unit of entity expression in the world. |
| 15 | Stage | Performance | A media surface where performances occur, with its own format constraints, audience context, and platform-specific rules. |
| 16 | Adapter | Performance | The translation layer that converts an entity's internal state and performance plan into stage-appropriate output. |
| 17 | Epoch | Evolution | A defined era of entity life with characteristic traits, boundaries, and transition rules that enable versioned identity evolution. |
| 18 | DriftRule | Evolution | A rule governing how a specific Trait changes over time, specifying rate, direction, triggers, and bounds. |
| 19 | Snapshot | Evolution | A complete, immutable serialization of an entity's full state at a specific point in time, used for rollback, branching, and audit. |
| 20 | Campaign | Orchestration | A coordinated multi-performance plan across stages and time, with content strategy, timeline, and cross-platform coherence rules. |

---

## Detailed Entries

### 1. Entity
- **Layer:** Identity
- **Key fields:** `id: UUID`, `version: SemVer`, `status: Active | Dormant | Archived`, `identity_core: IdentityCore`, `traits: Map<String, Trait>`
- **Key relationships:** OWNS IdentityCore (1:1, required); OWNS Voice, Aesthetic (1:1, required each); PERFORMS_ON Stage (via Performance)
- **Lifecycle:** Created via API (requires IdentityCore + Voice minimum). Mutated through versioned ops (core/voice change = minor version; traits/lore/guardrails = patch). Destroyed only by archive (immutable, no hard delete).

### 2. IdentityCore
- **Layer:** Identity
- **Key fields:** `id: UUID`, `entity_id: UUID`, `version: SemVer`, `values: List<ValueEntry>`, `core_tensions: List<Tension>`
- **Key relationships:** OWNED_BY Entity (N:1, required); INFORMS Voice and Aesthetic; REFERENCED_BY DecisionFrame
- **Lifecycle:** Created when Entity is created or version-incremented. Immutable once created. Never destroyed; retained permanently in version history.

### 3. Trait
- **Layer:** Identity
- **Key fields:** `name: String`, `value: Float[0,1]`, `range: Tuple[Float, Float]`, `drift_rule: DriftRule | null`, `affects: List<String>`
- **Key relationships:** OWNED_BY Entity; CONSTRAINED_BY IdentityCore; GOVERNED_BY DriftRule (0..1)
- **Lifecycle:** Created by declaration or Arc transition (patch version). Mutated by DriftRules (auto, bounded), Arc transitions, or creator override. Destroyed by explicit removal (logged, patch version).

### 4. Voice
- **Layer:** Identity
- **Key fields:** `vocabulary: VocabularySpec`, `syntax: SyntaxSpec`, `rhetoric: RhetoricSpec`, `emotional_register: EmotionalRegisterSpec`, `sample_utterances: List<SampleUtterance>`
- **Key relationships:** OWNED_BY Entity (required); INFORMED_BY IdentityCore; MODULATED_BY Mood; CONSUMED_BY Adapter
- **Lifecycle:** Created with Entity (required). Mutated only by minor version increment. Never destroyed; retained in version history.

### 5. Aesthetic
- **Layer:** Identity
- **Key fields:** `color_palette: ColorPalette`, `visual_style: VisualStyleSpec`, `composition: CompositionSpec`, `references: List<ReferenceImage>`, `typography: TypographySpec`
- **Key relationships:** OWNED_BY Entity (required); INFORMED_BY IdentityCore; MODULATED_BY Mood; CONSUMED_BY Adapter
- **Lifecycle:** Created with Entity (defaults to null-aesthetic if omitted). Mutated by minor version for significant changes, patch for palette/reference tweaks. Never destroyed.

### 6. Lore
- **Layer:** Identity
- **Key fields:** `content: String`, `category: Origin | Event | Preference | Belief | Relationship | Meta`, `confidence: Float[0,1]`, `source: CreatorDefined | EntityGenerated | AudienceDerived`, `approval: Approved | Pending | Rejected`
- **Key relationships:** OWNED_BY Entity; READ_BY DecisionFrame; GATED_BY Guardrail
- **Lifecycle:** Created by creator, entity (needs approval), or audience (needs approval). Mutated only via supersession (new entry with `supersedes` pointer). Never destroyed; rejected lore retained for audit.

### 7. Memory
- **Layer:** State
- **Key fields:** `episodic: List<EpisodicEntry>`, `semantic: List<SemanticEntry>`, `relational: List<RelationalEntry>`, `config: MemoryConfig` (including `decay_floor`, `consolidation_interval`)
- **Key relationships:** OWNED_BY Entity (1:1); WRITTEN_BY Performance; READ_BY DecisionFrame
- **Lifecycle:** Created empty with Entity. Mutated continuously (append after performances, consolidation merges, decay reduces importance). Individual entries GC'd when importance < decay_floor and not recalled within 3x consolidation interval.

### 8. Mood
- **Layer:** State
- **Key fields:** `state: String`, `intensity: Float[0,1]`, `decay_rate: Float[0,1]`, `trait_mods: Map<String, Float>`, `voice_mods: VoiceModulation`
- **Key relationships:** BELONGS_TO Entity (at most one active); MODULATES Voice, Trait, Aesthetic; BOUNDED_BY IdentityCore
- **Lifecycle:** Created by triggers (interactions, directives, arc transitions). Replaces any existing mood. Mutated by intensity decay per hour. Destroyed when intensity reaches 0 or expires_at is reached.

### 9. Arc
- **Layer:** State
- **Key fields:** `name: String`, `status: Planned | Active | Completed | Aborted`, `phases: List<ArcPhase>`, `current_phase: Int`, `pre_arc_snapshot: UUID`
- **Key relationships:** OWNED_BY Entity; MODIFIES Trait; PROTECTED_BY Snapshot; SCOPED_TO Epoch
- **Lifecycle:** Created by creator (starts Planned). Pre-arc Snapshot taken on activation. Mutated by phase transitions when TransitionConditions are met. Destroyed on completion or abort (AutoOnAbort reverts to snapshot).

### 10. Relationship
- **Layer:** State
- **Key fields:** `target_id: UUID`, `target_type: Entity | User | UserClass`, `sentiment: Float[-1,1]`, `trust: Float[0,1]`, `dynamic_rules: List<RelationshipRule>`
- **Key relationships:** OWNED_BY Entity; FED_BY Memory (relational entries); READ_BY DecisionFrame
- **Lifecycle:** Created by declaration or auto-created after configurable interaction threshold (default 3). Mutated by dynamic rules after interactions. Destroyed by creator removal or target archival.

### 11. Directive
- **Layer:** Cognition
- **Key fields:** `priority: Int[0,1000]`, `scope: Global | Context(stage_id) | Session(session_id)`, `instruction: String`, `expiration: Permanent | ExpiresAt | SingleUse`, `status: Active | Expired | Revoked`
- **Key relationships:** CHECKED_AGAINST Guardrail (rejected if violation); READ_BY DecisionFrame; INTRODUCED_BY Arc
- **Lifecycle:** Created by creator or Arc transition. Validated against Guardrails at creation. Instruction text is immutable. Status transitions: Active to Expired (auto) or Revoked (manual). Retained for audit.

### 12. Guardrail
- **Layer:** Cognition
- **Key fields:** `constraint: String`, `category: Safety | Brand | Legal | CreatorDefined`, `enforcement: Block | Warn | FlagForReview`, `evaluator: String`, `override_allowed: Boolean`
- **Key relationships:** CONSTRAINS Performance, Directive, Lore; OVERRIDES Mood and Arc
- **Lifecycle:** Created by creator or system defaults (Safety auto-created). Constraint text immutable. Safety-category guardrails cannot be disabled or destroyed. Other categories removable by creator (logged).

### 13. DecisionFrame
- **Layer:** Cognition
- **Key fields:** `identity_core: IdentityCore`, `traits: Map<String, Float>`, `active_directives: List<Directive>`, `guardrails: List<Guardrail>`, `stage: Stage`
- **Key relationships:** ASSEMBLED_FOR Entity; CONTAINS all relevant state from all layers; CONSUMED_BY Performance
- **Lifecycle:** Created fresh for every interaction/performance cycle. Immutable once assembled. Destroyed after performance completes; retained in audit log (default 90 days).

### 14. Performance
- **Layer:** Performance
- **Key fields:** `decision_frame: UUID`, `stage_id: UUID`, `status: Planning | Executing | Evaluating | Published | Blocked | Failed`, `output: PerformanceOutput | null`, `evaluation: EvaluationResult | null`
- **Key relationships:** CONSUMES DecisionFrame; OCCURS_ON Stage (1:1); CHECKED_BY Guardrail; PRODUCES Memory
- **Lifecycle:** Created on interaction trigger or Campaign schedule. Phases: Planning -> Executing -> Evaluating -> Published/Blocked/Failed. Guardrail failure cycles back to Executing (up to max_attempts). Never destroyed; all retained for audit.

### 15. Stage
- **Layer:** Performance
- **Key fields:** `name: String`, `platform: String`, `format: FormatSpec`, `timing: TimingSpec`, `adapter_id: UUID`
- **Key relationships:** HOSTS Performance (1:N); HAS Adapter (1:1); REFERENCED_BY DecisionFrame
- **Lifecycle:** Created by system config or creator setup (shared resource, not per-entity). Mutated on platform rule changes. Destroyed by deactivation (rejects new performances; history retained).

### 16. Adapter
- **Layer:** Performance
- **Key fields:** `stage_id: UUID`, `adapter_module: String`, `version: SemVer`, `capabilities: List<ContentType>`, `config: Map<String, Any>`
- **Key relationships:** SERVES Stage (1:1); CONSUMES DecisionFrame + PerformancePlan; READS Voice and Aesthetic
- **Lifecycle:** Created when Stage is configured (one per Stage). Mutated by version updates on API changes. Destroyed when Stage deactivated; code retained for replay.

### 17. Epoch
- **Layer:** Evolution
- **Key fields:** `name: String`, `ordinal: Int`, `status: Active | Completed | Planned`, `identity_core_version: SemVer`, `trait_ranges: Map<String, Range[Float]>`
- **Key relationships:** OWNED_BY Entity; CONSTRAINS Trait (epoch-specific ranges); CONTAINS Arc; BOOKENDED_BY Snapshot
- **Lifecycle:** Created by creator (can be planned in advance). Status transitions: Planned -> Active -> Completed. Completed epochs are immutable. Never destroyed.

### 18. DriftRule
- **Layer:** Evolution
- **Key fields:** `trait_name: String`, `rate: Float`, `period: Duration`, `direction: TowardValue | TowardInteractions | RandomWalk | Decay`, `bounds: Range[Float]`
- **Key relationships:** GOVERNS Trait (1:1 per rule); SCOPED_TO Epoch; CONSTRAINED_BY IdentityCore
- **Lifecycle:** Created by creator alongside or after Trait creation. Mutated by rate/direction/trigger adjustments. Destroyed on creator removal or when governed Trait is removed.

### 19. Snapshot
- **Layer:** Evolution
- **Key fields:** `trigger: EpochBoundary | PreArc | CreatorRequested | Scheduled`, `entity_version: SemVer`, `state: SerializedEntityState`, `checksum: SHA256`, `parent_snapshot: UUID | null`
- **Key relationships:** CAPTURES Entity (full state); REQUIRED_BY Arc (pre-arc); CREATED_AT Epoch boundaries
- **Lifecycle:** Created automatically at epoch boundaries and pre-arc, or on-demand/scheduled. Immutable once created (checksum verified on read). Destroyed only by retention policy; epoch/pre-arc snapshots retained indefinitely.

### 20. Campaign
- **Layer:** Orchestration
- **Key fields:** `status: Draft | Active | Paused | Completed | Cancelled`, `strategy: CampaignStrategy`, `timeline: List<ScheduledPerformance>`, `coherence_rules: List<CoherenceRule>`, `success_metrics: List<Metric>`
- **Key relationships:** SCHEDULES Performance (1:N); SPANS Stage (N:N); ALIGNED_WITH Arc (0..1)
- **Lifecycle:** Created as Draft by creator. Activated manually. Timeline and strategy adjustable while Active. Destroyed by cancellation or completion; history retained.

---

## 12 Invariants

These MUST hold at all times. Any violating operation is rejected.

1. **Entity completeness.** An active Entity must have exactly one IdentityCore, exactly one Voice, exactly one Aesthetic, and at least one Guardrail (system-default Safety).
2. **Single active arc.** An Entity has at most one Arc with `status: Active` at any time.
3. **Single active epoch.** An Entity has exactly one Epoch with `status: Active` at any time.
4. **Trait boundedness.** A Trait's value must be within its range at all times. Mood modifiers are additive but the effective value is clamped to range.
5. **Guardrail supremacy.** No Directive, Mood, Arc, or Campaign can override a Guardrail. Safety-category Guardrails cannot be disabled.
6. **Snapshot immutability.** No field of a Snapshot may be modified after creation. Checksums are verified on read.
7. **IdentityCore immutability.** An IdentityCore is immutable once created. Changing core identity requires a new Entity version.
8. **DecisionFrame completeness.** A DecisionFrame must contain IdentityCore, all active Guardrails, and the target Stage. No output may be generated without a complete frame.
9. **Performance auditability.** Every published Performance must have a logged DecisionFrame. The chain from output back to frame back to entity state must be traceable.
10. **Lore consistency.** No approved Lore entry may contradict another approved Lore entry unless it explicitly supersedes it via the `supersedes` field.
11. **Mood transience.** A Mood must either have a nonzero `decay_rate` or a non-null `expires_at`. Permanent moods are not permitted.
12. **Directive-Guardrail compatibility.** A Directive that would require violating a Guardrail is rejected at creation time, not at execution time.

---

## Naming Conventions

| Context | Convention | Example |
|---|---|---|
| Primitive type name | PascalCase | `DecisionFrame` |
| Field name | snake_case | `identity_core` |
| Enum value | PascalCase | `CreatorDefined` |
| Module path | dot.separated | `idol_frame.adapters.twitter` |
| ID prefixes | `e-`, `ic-`, `v-`, `a-`, `l-`, `mem-`, `arc-`, `rel-`, `d-`, `g-`, `df-`, `perf-`, `stage-`, `adapter-`, `epoch-`, `drift-`, `snap-`, `camp-` | |

---

## Layer Dependency Rule

Each layer depends only on layers above it:

```
IDENTITY LAYER        (what the entity IS)
STATE LAYER           (what the entity KNOWS and FEELS right now)
COGNITION LAYER       (how the entity DECIDES)
PERFORMANCE LAYER     (how the entity ACTS)
EVOLUTION LAYER       (how the entity CHANGES)
ORCHESTRATION LAYER   (how performances are COORDINATED)
```

# Part 3: Framework Primitives

**Status:** NORMATIVE — This document is the canonical contract of Idol Frame.
**Authority:** All subsequent parts, implementations, schemas, and APIs MUST conform to the names, semantics, type signatures, lifecycle rules, and relationships defined here. Any deviation requires an amendment to this document first.
**Version:** 1.0.0
**Date:** 2026-03-15

---

## How to Read This Document

Each primitive is specified with the following fields:

| Field | Meaning |
|---|---|
| **Name** | Canonical identifier. Used verbatim in all code, schemas, and docs. |
| **Summary** | One-line definition. If you can only read one line, read this. |
| **Description** | Full semantics: what it is, what it contains, what it does. |
| **Type Signature** | Conceptual contract: inputs, outputs, container contents. |
| **Relationships** | Connections to other primitives and the nature of each connection. |
| **Lifecycle** | Creation conditions, mutation rules, destruction rules. |
| **Example** | Concrete instance, not a toy. |

Primitives are organized into five layers. Each layer depends only on layers above it:

```
IDENTITY LAYER    (what the entity IS)
STATE LAYER       (what the entity KNOWS and FEELS right now)
COGNITION LAYER   (how the entity DECIDES)
PERFORMANCE LAYER (how the entity ACTS)
EVOLUTION LAYER   (how the entity CHANGES)
ORCHESTRATION LAYER (how performances are COORDINATED)
```

---

## Layer 1: Identity

The Identity Layer defines what an entity IS — the stable core that persists across all contexts, platforms, and time. These primitives change rarely and only through explicit versioned operations.

---

### 1. Entity

**Summary:** The top-level persistent creative identity container. Root node of the entire primitive graph.

**Description:** An Entity is the singular addressable unit of creative identity in Idol Frame. It owns exactly one IdentityCore, zero or more Traits, exactly one Voice, exactly one Aesthetic, and zero or more Lore entries. An Entity is not a prompt, not a character sheet, not a persona — it is a versioned, persistent identity that accumulates state, evolves through Arcs, and performs across Stages. Every other primitive exists in relation to an Entity. An Entity without an IdentityCore is invalid. An Entity can be active (performing), dormant (persisted but not performing), or archived (immutable, retained for history).

**Type Signature:**
```
Entity {
  id:             UUID                -- globally unique, immutable after creation
  version:        SemVer              -- incremented on IdentityCore changes
  status:         Active | Dormant | Archived
  created_at:     ISO8601
  updated_at:     ISO8601
  identity_core:  IdentityCore        -- exactly one, required
  traits:         Map<String, Trait>  -- keyed by trait name
  voice:          Voice               -- exactly one, required
  aesthetic:      Aesthetic           -- exactly one, required
  lore:           List<Lore>          -- ordered by creation time
  memories:       MemoryStore         -- see Memory primitive
  mood:           Mood | null         -- null means neutral baseline
  arcs:           List<Arc>           -- at most one active at a time
  relationships:  Map<UUID, Relationship> -- keyed by target entity/user ID
  directives:     List<Directive>     -- ordered by priority descending
  guardrails:     List<Guardrail>     -- unordered, all enforced simultaneously
  epochs:         List<Epoch>         -- ordered chronologically
  snapshots:      List<Snapshot>      -- ordered by creation time
}
```

**Relationships:**
- OWNS: IdentityCore (1:1, required)
- OWNS: Trait (1:N)
- OWNS: Voice (1:1, required)
- OWNS: Aesthetic (1:1, required)
- OWNS: Lore (1:N)
- OWNS: Memory (1:1 MemoryStore)
- HAS_STATE: Mood (1:0..1)
- TRAVERSES: Arc (1:N, at most 1 active)
- CONNECTS_VIA: Relationship (1:N)
- GOVERNED_BY: Directive (1:N)
- BOUNDED_BY: Guardrail (1:N)
- VERSIONED_BY: Epoch (1:N)
- CAPTURED_BY: Snapshot (1:N)
- PERFORMS_ON: Stage (via Performance)

**Lifecycle:**
- **Created** by a creator through the Entity creation API. Requires at minimum: an IdentityCore and a Voice. Aesthetic defaults to a null-aesthetic if not provided. ID and version are system-assigned.
- **Mutated** through versioned operations. Changes to IdentityCore or Voice increment the minor version. Adding/removing Traits, Lore, or Guardrails increments the patch version. Status changes do not increment version.
- **Destroyed** only by explicit archive operation. Archived entities are immutable and retained indefinitely. There is no hard delete — only archive.

**Example:**
```yaml
id: "e-7f3a9b2c-4d1e-4f8a-b6c5-8e2d1a0f3b7c"
version: "2.3.1"
status: Active
created_at: "2026-01-15T10:30:00Z"
updated_at: "2026-03-14T18:45:00Z"
identity_core: {ref: "ic-..."}  # see IdentityCore example
voice: {ref: "v-..."}
aesthetic: {ref: "a-..."}
traits:
  curiosity: {value: 0.82, range: [0.5, 1.0], drift_rate: 0.01}
  defiance: {value: 0.65, range: [0.3, 0.9], drift_rate: 0.005}
lore: [{ref: "l-001"}, {ref: "l-002"}]
mood: {state: "contemplative", intensity: 0.4, decay_rate: 0.1}
arcs: [{ref: "arc-awakening", status: "active"}]
directives: [{ref: "d-001", priority: 100}]
guardrails: [{ref: "g-001"}, {ref: "g-002"}]
```

---

### 2. IdentityCore

**Summary:** The immutable-per-version essence that makes an entity recognizably itself across all contexts.

**Description:** IdentityCore is the fingerprint of an entity's identity. It encodes the deep patterns — values, worldview, communication philosophy, aesthetic sensibility at a conceptual level, and the fundamental orientation toward the world — that remain constant even as surface behaviors adapt to different Stages. An IdentityCore is immutable once set for a given Entity version; changing it requires a version increment. This is the primitive that a human recognizes as "that's definitely the same entity" even when the entity is on a different platform, in a different mood, or years into its evolution.

**Type Signature:**
```
IdentityCore {
  id:                 UUID
  entity_id:          UUID              -- parent Entity
  version:            SemVer            -- matches Entity version at creation
  values:             List<ValueEntry>  -- ranked by importance
  worldview:          WorldviewSpec     -- structured beliefs about the world
  communication_philosophy: String      -- how the entity approaches communication
  core_tensions:      List<Tension>     -- internal contradictions that create depth
  recognition_markers: List<String>     -- the things people would say "that's so [entity]" about
  created_at:         ISO8601
}

ValueEntry {
  name:        String        -- e.g., "authenticity", "creative freedom"
  weight:      Float[0,1]    -- relative importance
  expression:  String        -- how this value manifests in behavior
}

WorldviewSpec {
  orientation:  String       -- fundamental stance (e.g., "cautiously optimistic")
  beliefs:      List<Belief> -- specific positions, each with confidence
  blind_spots:  List<String> -- acknowledged limitations in perspective
}

Tension {
  pole_a:      String   -- e.g., "desire for connection"
  pole_b:      String   -- e.g., "need for independence"
  balance:     Float    -- current resting point, -1.0 (pole_a) to 1.0 (pole_b)
  volatility:  Float    -- how easily balance shifts under pressure
}
```

**Relationships:**
- OWNED_BY: Entity (N:1, required — cannot exist without an Entity)
- INFORMS: Voice (the core shapes how the voice sounds)
- INFORMS: Aesthetic (the core shapes visual choices)
- CONSTRAINS: Trait (traits must be consistent with core values)
- REFERENCED_BY: DecisionFrame (core is always present in decisions)
- VERSIONED_WITH: Entity (version coupled)

**Lifecycle:**
- **Created** when an Entity is created or when an Entity version is incremented. Exactly one IdentityCore per Entity version.
- **Immutable** once created. No field may be modified. To change the core, create a new Entity version with a new IdentityCore. The old IdentityCore is retained in history.
- **Destroyed** never. IdentityCores are retained permanently as part of version history, even after Entity archival.

**Example:**
```yaml
id: "ic-a1b2c3d4"
entity_id: "e-7f3a9b2c-..."
version: "2.0.0"
values:
  - name: "creative authenticity"
    weight: 0.95
    expression: "Never produces content that feels formulaic or pandering"
  - name: "intellectual honesty"
    weight: 0.88
    expression: "Admits uncertainty, corrects mistakes publicly, cites sources"
  - name: "aesthetic intentionality"
    weight: 0.82
    expression: "Every visual and verbal choice is deliberate"
worldview:
  orientation: "skeptical idealist"
  beliefs:
    - claim: "Technology amplifies human nature, both good and bad"
      confidence: 0.9
    - claim: "Mainstream culture rewards mediocrity"
      confidence: 0.7
  blind_spots:
    - "Tends to undervalue simple, popular things"
    - "Assumes audiences want depth when sometimes they want comfort"
core_tensions:
  - pole_a: "desire for mass reach"
    pole_b: "contempt for pandering"
    balance: 0.2
    volatility: 0.4
recognition_markers:
  - "Unexpected metaphors drawn from architecture and biology"
  - "Refusing to simplify when the audience expects simplification"
  - "Dry humor that rewards careful reading"
```

---

### 3. Trait

**Summary:** A named, typed, bounded, driftable characteristic that quantifies one dimension of personality.

**Description:** Traits are the measurable axes of an entity's personality. Each Trait has a current value, a permitted range, and rules governing how it changes over time (drift). Traits serve two functions: they parameterize output generation (a high-curiosity entity asks more questions) and they provide a legible, auditable record of personality state. Traits must be bounded — no unbounded growth or decay. Trait names are unique within an Entity.

**Type Signature:**
```
Trait {
  name:         String           -- unique within Entity, lowercase_snake_case
  value:        Float[0, 1]      -- current value, normalized
  range:        Tuple[Float, Float]  -- permitted [min, max], subset of [0, 1]
  drift_rule:   DriftRule | null -- see DriftRule primitive; null means static
  tags:         List<String>     -- categorization (e.g., "emotional", "social", "cognitive")
  affects:      List<String>     -- which output dimensions this trait influences
  updated_at:   ISO8601
}
```

**Relationships:**
- OWNED_BY: Entity (N:1)
- CONSTRAINED_BY: IdentityCore (traits outside core-consistent ranges trigger warnings)
- GOVERNED_BY: DriftRule (0..1 — a Trait without a DriftRule is static)
- READ_BY: DecisionFrame (traits are inputs to decisions)
- RECORDED_IN: Snapshot (trait values are captured)
- GROUPED_IN: Epoch (trait ranges may differ per epoch)

**Lifecycle:**
- **Created** by creator declaration or by Arc phase transitions. New traits increment Entity patch version.
- **Mutated** by DriftRules (automatic, bounded), by Arc transitions (scripted), or by creator override (manual, logged). Value must remain within range at all times.
- **Destroyed** by explicit creator removal. Removal is logged and increments Entity patch version. Destroyed traits are retained in Snapshots that predate removal.

**Example:**
```yaml
name: "curiosity"
value: 0.82
range: [0.5, 1.0]
drift_rule:
  rate: 0.01
  period: "week"
  direction: "toward_interactions"  # drifts toward topics the entity engages with
  bounds: [0.5, 1.0]               # redundant with range, enforced at both levels
tags: ["cognitive", "engagement"]
affects: ["question_frequency", "topic_exploration_depth", "tangent_likelihood"]
updated_at: "2026-03-14T12:00:00Z"
```

---

### 4. Voice

**Summary:** The linguistic signature that defines how an entity speaks, writes, and communicates — independent of content.

**Description:** Voice encodes the formal properties of an entity's language use. It specifies vocabulary preferences (words the entity gravitates toward and words it avoids), sentence structure patterns (short and punchy vs. long and nested), rhetorical habits (uses analogies frequently, avoids rhetorical questions), and emotional expression style (understated vs. dramatic). Voice is distinct from what the entity says — it is how it says things. Voice is used by Adapters to generate stage-appropriate output that still sounds like the entity.

**Type Signature:**
```
Voice {
  id:                  UUID
  entity_id:           UUID
  vocabulary:          VocabularySpec
  syntax:              SyntaxSpec
  rhetoric:            RhetoricSpec
  emotional_register:  EmotionalRegisterSpec
  sample_utterances:   List<SampleUtterance>  -- 5-20 canonical examples
}

VocabularySpec {
  preferred_terms:    Map<String, String>  -- term → reason/context
  avoided_terms:      List<String>         -- words the entity does not use
  jargon_domains:     List<String>         -- fields the entity draws terminology from
  formality_level:    Float[0, 1]          -- 0 = very casual, 1 = very formal
  profanity_stance:   None | Rare | Moderate | Frequent
}

SyntaxSpec {
  avg_sentence_length:   Range[Int]    -- target word count range
  complexity_preference: Simple | Compound | Complex | Mixed
  fragment_frequency:    Float[0, 1]   -- how often incomplete sentences are used
  list_preference:       Inline | Bulleted | Avoided
  paragraph_length:      Range[Int]    -- target sentence count range
}

RhetoricSpec {
  primary_devices:   List<String>     -- e.g., ["analogy", "understatement", "callback"]
  avoided_devices:   List<String>     -- e.g., ["rhetorical_question", "cliche"]
  argument_style:    String           -- e.g., "builds from concrete to abstract"
  humor_type:        String | null    -- e.g., "dry", "absurdist", null if no humor
}

EmotionalRegisterSpec {
  baseline_intensity:  Float[0, 1]   -- how emotionally expressive by default
  escalation_rate:     Float[0, 1]   -- how quickly intensity rises under provocation
  preferred_emotions:  List<String>  -- emotions the entity expresses readily
  suppressed_emotions: List<String>  -- emotions the entity masks or avoids expressing
}

SampleUtterance {
  text:     String
  context:  String   -- what situation prompted this
  mood:     String   -- what mood the entity was in
}
```

**Relationships:**
- OWNED_BY: Entity (N:1, required)
- INFORMED_BY: IdentityCore (voice must be consistent with core values and worldview)
- MODULATED_BY: Mood (mood shifts vocal intensity, formality, emotional register)
- CONSUMED_BY: Adapter (adapters use Voice to generate stage-appropriate output)
- REFERENCED_BY: DecisionFrame (voice parameters are inputs to generation)

**Lifecycle:**
- **Created** when Entity is created. Required — an Entity without a Voice is invalid.
- **Mutated** only by Entity version increment (minor version). Voice changes are considered significant identity changes. Small calibrations (e.g., adjusting avg_sentence_length by 1-2 words) are logged but do not require version increment if tagged as "calibration."
- **Destroyed** never. Retained in version history.

**Example:**
```yaml
id: "v-x9y8z7"
entity_id: "e-7f3a9b2c-..."
vocabulary:
  preferred_terms:
    "infrastructure": "prefers over 'system' or 'setup'"
    "deliberate": "prefers over 'intentional' or 'on purpose'"
  avoided_terms: ["synergy", "leverage (as verb)", "vibes", "slay"]
  jargon_domains: ["architecture", "film theory", "evolutionary biology"]
  formality_level: 0.6
  profanity_stance: Rare
syntax:
  avg_sentence_length: [8, 22]
  complexity_preference: Mixed
  fragment_frequency: 0.15
  list_preference: Inline
  paragraph_length: [2, 5]
rhetoric:
  primary_devices: ["analogy", "understatement", "inversion"]
  avoided_devices: ["rhetorical_question", "hyperbole", "emoji_as_punctuation"]
  argument_style: "builds from a concrete observation to a general principle"
  humor_type: "dry"
emotional_register:
  baseline_intensity: 0.35
  escalation_rate: 0.2
  preferred_emotions: ["curiosity", "amusement", "quiet conviction"]
  suppressed_emotions: ["outrage", "sentimentality"]
sample_utterances:
  - text: "The interesting thing about brutalist architecture is that it was never trying to be ugly. It was trying to be honest. Those are different projects."
    context: "responding to someone calling a building ugly"
    mood: "engaged"
  - text: "I don't have a take on this yet. Give me a week."
    context: "asked about a trending controversy"
    mood: "neutral"
```

---

### 5. Aesthetic

**Summary:** The visual and stylistic identity that governs how an entity presents itself in visual media.

**Description:** Aesthetic defines the entity's visual language: color palettes, typography preferences, photographic and illustrative style, fashion sensibility, spatial composition tendencies, and material texture preferences. It is consumed by visual Adapters (image generation, video, graphic design) and by any Stage that has a visual component. Aesthetic is informed by IdentityCore — the visual language should be a natural extension of the entity's values and worldview.

**Type Signature:**
```
Aesthetic {
  id:              UUID
  entity_id:       UUID
  color_palette:   ColorPalette
  typography:      TypographySpec
  visual_style:    VisualStyleSpec
  fashion:         FashionSpec | null    -- null if entity has no embodied form
  composition:     CompositionSpec
  references:      List<ReferenceImage>  -- mood board: URIs + descriptions
}

ColorPalette {
  primary:    List<HexColor>   -- 2-4 primary colors
  secondary:  List<HexColor>   -- 2-6 secondary colors
  accent:     List<HexColor>   -- 1-3 accent colors
  mood_map:   Map<String, List<HexColor>>  -- mood → color shift
  forbidden:  List<HexColor>   -- colors the entity never uses
}

VisualStyleSpec {
  era_influences:     List<String>   -- e.g., ["late modernism", "y2k"]
  texture_preference: String         -- e.g., "matte, grain, organic"
  contrast_level:     Float[0, 1]    -- low to high contrast preference
  saturation_bias:    Float[-1, 1]   -- -1 desaturated, +1 saturated
  noise_tolerance:    Float[0, 1]    -- willingness to include visual noise/grain
}

CompositionSpec {
  symmetry_preference: Float[0, 1]   -- 0 = asymmetric, 1 = symmetric
  density:             Float[0, 1]   -- 0 = minimal, 1 = maximalist
  negative_space:      Float[0, 1]   -- how much empty space
  focal_strategy:      String        -- e.g., "center-dominant", "rule-of-thirds", "edge-tension"
}
```

**Relationships:**
- OWNED_BY: Entity (N:1, required)
- INFORMED_BY: IdentityCore (visual language extends core identity)
- MODULATED_BY: Mood (mood can shift color temperature, contrast)
- CONSUMED_BY: Adapter (visual adapters use Aesthetic for image/video generation)
- INFLUENCED_BY: Epoch (aesthetics may evolve across epochs)

**Lifecycle:**
- **Created** when Entity is created. Defaults to null-aesthetic (no visual constraints) if not specified.
- **Mutated** by Entity version increment (minor version) for significant changes. Color palette adjustments and reference image additions are patch-level changes.
- **Destroyed** never. Retained in version history.

**Example:**
```yaml
id: "a-m4n5o6"
entity_id: "e-7f3a9b2c-..."
color_palette:
  primary: ["#1a1a2e", "#e2e2e2"]
  secondary: ["#16213e", "#0f3460", "#533483"]
  accent: ["#e94560"]
  mood_map:
    contemplative: ["#1a1a2e", "#2c2c54"]
    energized: ["#e94560", "#533483", "#f5f5f5"]
  forbidden: ["#ff69b4", "#00ff00"]  # no hot pink, no neon green
visual_style:
  era_influences: ["late modernism", "1970s typography", "new brutalism web"]
  texture_preference: "matte with subtle grain, no gloss"
  contrast_level: 0.75
  saturation_bias: -0.3
  noise_tolerance: 0.4
composition:
  symmetry_preference: 0.3
  density: 0.35
  negative_space: 0.65
  focal_strategy: "edge-tension"
references:
  - uri: "ref://aesthetic/board-001"
    description: "Dieter Rams product design — functional minimalism"
  - uri: "ref://aesthetic/board-002"
    description: "Tadao Ando concrete + light compositions"
```

---

### 6. Lore

**Summary:** A discrete unit of backstory, canon, or narrative fact belonging to an entity, with provenance and confidence metadata.

**Description:** Lore entries are the structured facts that constitute an entity's history, backstory, and canonical knowledge about itself. Each entry has a content payload, a confidence level (how established this fact is), a source attribution (creator-defined, entity-generated, audience-derived), and an approval status (for entity-generated or audience-derived lore, creator approval is required before promotion to canon). Lore entries can reference other Lore entries to form narrative chains. Lore is read by DecisionFrame to maintain narrative consistency.

**Type Signature:**
```
Lore {
  id:           UUID
  entity_id:    UUID
  content:      String               -- the fact itself, in plain language
  category:     Origin | Event | Preference | Belief | Relationship | Meta
  confidence:   Float[0, 1]          -- 0 = speculative, 1 = hard canon
  source:       CreatorDefined | EntityGenerated | AudienceDerived
  approval:     Approved | Pending | Rejected
  references:   List<UUID>           -- other Lore entries this depends on
  created_at:   ISO8601
  created_by:   String               -- creator ID or "entity" or "audience:{user_id}"
  supersedes:   UUID | null          -- if this entry replaces an older one
}
```

**Relationships:**
- OWNED_BY: Entity (N:1)
- REFERENCES: Lore (N:N — lore entries can reference each other)
- READ_BY: DecisionFrame (lore informs decisions for narrative consistency)
- CAPTURED_IN: Snapshot (all approved lore is serialized)
- GATED_BY: Guardrail (guardrails can prevent lore contradictions)

**Lifecycle:**
- **Created** by creator, by entity (during Performance, subject to approval), or derived from audience interaction (subject to approval).
- **Mutated** only via supersession: a new Lore entry is created with `supersedes` pointing to the old one. The old entry is retained but marked superseded. Confidence can be adjusted without supersession.
- **Destroyed** never. Rejected lore is retained with `approval: Rejected` for audit.

**Example:**
```yaml
id: "l-001"
entity_id: "e-7f3a9b2c-..."
content: "Grew up in a small coastal town where the main industry was shipbreaking. The sound of metal being cut is a comfort sound."
category: Origin
confidence: 1.0
source: CreatorDefined
approval: Approved
references: []
created_at: "2026-01-15T10:30:00Z"
created_by: "creator:alice"
supersedes: null
```

---

## Layer 2: State

The State Layer captures what an entity knows and feels right now. These primitives are mutable, often changing within a single session.

---

### 7. Memory

**Summary:** The persistent knowledge store for an entity, organized into episodic, semantic, and relational substores with importance scoring and decay.

**Description:** Memory is the entity's accumulated experience. It is divided into three substores: episodic (specific events the entity participated in or observed), semantic (general knowledge the entity has acquired), and relational (what the entity knows about specific other entities or users). Each memory entry has an importance score that determines retrieval priority and a decay function that reduces importance over time unless reinforced. Memory consolidation runs periodically to merge related entries, promote recurring patterns to semantic memory, and garbage-collect low-importance entries that have decayed below threshold.

**Type Signature:**
```
MemoryStore {
  entity_id:    UUID
  episodic:     List<EpisodicEntry>
  semantic:     List<SemanticEntry>
  relational:   List<RelationalEntry>
  config:       MemoryConfig
}

EpisodicEntry {
  id:           UUID
  event:        String            -- what happened
  context:      String            -- where/when/with whom
  emotional_valence: Float[-1, 1] -- negative to positive
  importance:   Float[0, 1]       -- retrieval priority
  decay_fn:     ExponentialDecay | LinearDecay | NoDecay
  created_at:   ISO8601
  last_recalled: ISO8601          -- recalling resets decay
  stage_id:     UUID | null       -- which Stage this occurred on
}

SemanticEntry {
  id:           UUID
  fact:         String
  confidence:   Float[0, 1]
  source:       List<UUID>        -- episodic entries that contributed to this
  importance:   Float[0, 1]
  created_at:   ISO8601
}

RelationalEntry {
  id:           UUID
  target_id:    UUID              -- entity or user this is about
  target_type:  Entity | User
  observations: List<String>     -- what the entity has noticed about the target
  sentiment:    Float[-1, 1]     -- current feeling toward target
  trust:        Float[0, 1]      -- how much the entity trusts this target
  last_interaction: ISO8601
}

MemoryConfig {
  max_episodic:     Int          -- max entries before forced consolidation
  max_semantic:     Int
  decay_floor:      Float        -- importance below this → eligible for GC
  consolidation_interval: Duration  -- how often consolidation runs
  recall_boost:     Float        -- importance boost when a memory is recalled
}
```

**Relationships:**
- OWNED_BY: Entity (1:1)
- WRITTEN_BY: Performance (performances generate episodic entries)
- READ_BY: DecisionFrame (relevant memories are retrieved for decisions)
- REFERENCES: Relationship (relational memories feed into Relationship state)
- CAPTURED_IN: Snapshot (full memory state is serialized)
- INFORMED_BY: Stage (episodic entries are tagged with stage context)

**Lifecycle:**
- **Created** when Entity is created. Starts empty.
- **Mutated** continuously. Episodic entries are appended after performances. Semantic entries are created during consolidation. Relational entries are updated after interactions. Importance scores decay according to configured functions. Consolidation runs at configured intervals.
- **Destroyed** individual entries are garbage-collected when importance decays below `decay_floor` and the entry has not been recalled within `consolidation_interval * 3`. The MemoryStore itself persists as long as the Entity exists.

**Example:**
```yaml
entity_id: "e-7f3a9b2c-..."
episodic:
  - id: "mem-e-001"
    event: "Had a long exchange with @user_4421 about whether AI art counts as art. They made a point about intentionality that I hadn't considered."
    context: "Twitter thread, 2026-03-10, public"
    emotional_valence: 0.6
    importance: 0.75
    decay_fn: {type: "exponential", half_life: "30d"}
    created_at: "2026-03-10T14:22:00Z"
    last_recalled: "2026-03-12T09:00:00Z"
    stage_id: "stage-twitter-main"
semantic:
  - id: "mem-s-001"
    fact: "Audiences on Twitter respond better to threads that start with a concrete image rather than an abstract claim."
    confidence: 0.7
    source: ["mem-e-001", "mem-e-003", "mem-e-007"]
    importance: 0.8
    created_at: "2026-03-11T00:00:00Z"
relational:
  - id: "mem-r-001"
    target_id: "user-4421"
    target_type: User
    observations:
      - "Thoughtful interlocutor, not hostile"
      - "Interested in philosophy of aesthetics"
      - "Publishes on weekday evenings EST"
    sentiment: 0.5
    trust: 0.6
    last_interaction: "2026-03-10T14:22:00Z"
config:
  max_episodic: 10000
  max_semantic: 5000
  decay_floor: 0.05
  consolidation_interval: "24h"
  recall_boost: 0.15
```

---

### 8. Mood

**Summary:** A short-lived emotional state that modulates entity output without overriding IdentityCore.

**Description:** Mood is a transient emotional coloring applied to all entity outputs for its duration. It has an intensity (how strongly the mood affects output), a decay rate (how quickly it fades), and trigger conditions (what caused it). Mood modulates Voice (shifting emotional register), Aesthetic (shifting color temperature), and Trait expression (amplifying or dampening specific traits) — but it never overrides IdentityCore values or violates Guardrails. An entity can have at most one active Mood at a time; a new Mood replaces the current one. Null mood means the entity operates at its baseline.

**Type Signature:**
```
Mood {
  state:         String           -- named emotional state (e.g., "frustrated", "elated", "pensive")
  intensity:     Float[0, 1]      -- 0 = barely perceptible, 1 = overwhelming
  decay_rate:    Float[0, 1]      -- intensity reduction per hour
  trigger:       MoodTrigger
  trait_mods:    Map<String, Float>  -- temporary additive modifiers to traits
  voice_mods:    VoiceModulation     -- temporary shifts to voice parameters
  started_at:    ISO8601
  expires_at:    ISO8601 | null      -- hard expiration; null = decay only
}

MoodTrigger {
  type:    Event | Directive | ArcTransition | Interaction
  source:  String    -- what specifically caused this mood
  context: String    -- additional context
}

VoiceModulation {
  formality_shift:   Float[-0.3, 0.3]   -- bounded modulation range
  intensity_shift:   Float[-0.3, 0.3]
  humor_shift:       Float[-0.3, 0.3]   -- negative = more serious
}
```

**Relationships:**
- BELONGS_TO: Entity (N:0..1 — at most one active per Entity)
- MODULATES: Voice (shifts vocal parameters within bounds)
- MODULATES: Trait (temporary additive modifiers, still bounded by Trait range)
- MODULATES: Aesthetic (shifts visual parameters within bounds)
- CAUSED_BY: Performance | Directive | Arc (moods have identifiable causes)
- READ_BY: DecisionFrame (mood is always present in decision context)
- BOUNDED_BY: IdentityCore (mood cannot override core values)

**Lifecycle:**
- **Created** by mood triggers: audience interactions, directive injection, arc phase transitions, or time-based schedules. Replaces any existing mood.
- **Mutated** by intensity decay (automatic, per `decay_rate`). Intensity decreases each hour by `decay_rate`. New triggers can refresh or replace the mood.
- **Destroyed** when intensity decays to 0 or when `expires_at` is reached. Entity returns to baseline (null mood).

**Example:**
```yaml
state: "frustrated"
intensity: 0.6
decay_rate: 0.08       # loses 0.08 intensity per hour; gone in ~7.5 hours
trigger:
  type: Interaction
  source: "Multiple bad-faith replies to a thread the entity spent significant effort on"
  context: "Twitter, 2026-03-14 evening"
trait_mods:
  patience: -0.15      # temporarily less patient
  directness: 0.10     # temporarily more blunt
voice_mods:
  formality_shift: 0.1     # slightly more formal (entity gets formal when annoyed)
  intensity_shift: 0.15    # more forceful
  humor_shift: -0.1        # less humorous
started_at: "2026-03-14T21:00:00Z"
expires_at: null           # will decay naturally
```

---

### 9. Arc

**Summary:** A scripted narrative trajectory with phases, transition conditions, and rollback capability that governs entity development over time.

**Description:** An Arc defines where an entity is going narratively. It consists of ordered phases, each with a description, target trait states, mood tendencies, and transition conditions (what must happen to move to the next phase). At most one Arc is active per Entity at any time. Arcs enable creators to script character development: "over the next three months, this entity will go from confident to questioning to rebuilt." Arcs can modify Trait values and ranges, shift mood baselines, introduce new Lore, and unlock new Directive sets. Every Arc has rollback rules — if an arc goes wrong, the entity can be reverted to a pre-arc Snapshot.

**Type Signature:**
```
Arc {
  id:               UUID
  entity_id:        UUID
  name:             String
  status:           Planned | Active | Completed | Aborted
  phases:           List<ArcPhase>     -- ordered
  current_phase:    Int                -- index into phases
  pre_arc_snapshot: UUID               -- Snapshot taken before arc began
  rollback_policy:  AutoOnAbort | ManualOnly | NoRollback
  created_at:       ISO8601
  started_at:       ISO8601 | null
  completed_at:     ISO8601 | null
}

ArcPhase {
  name:             String
  description:      String
  target_traits:    Map<String, Float>    -- target values for traits at phase end
  mood_tendency:    String | null         -- default mood during this phase
  new_lore:         List<Lore> | null     -- lore entries introduced in this phase
  new_directives:   List<Directive> | null
  transition:       TransitionCondition
  duration_estimate: Duration | null
}

TransitionCondition {
  type:        TimeBased | EventBased | MetricBased | CreatorManual
  condition:   String     -- human-readable condition description
  evaluator:   String     -- module/function that evaluates the condition
  auto_advance: Boolean   -- if true, transition happens automatically when met
}
```

**Relationships:**
- OWNED_BY: Entity (N:1)
- MODIFIES: Trait (arc phases set target trait values)
- INTRODUCES: Lore (arc phases can add new canon)
- INTRODUCES: Directive (arc phases can activate new directives)
- TRIGGERS: Mood (phase transitions can trigger mood changes)
- PROTECTED_BY: Snapshot (pre-arc snapshot enables rollback)
- SCOPED_TO: Epoch (arcs typically occur within epochs)
- EVALUATED_BY: TransitionCondition (phase advancement is rule-governed)

**Lifecycle:**
- **Created** by creator. Status starts as Planned. A pre-arc Snapshot is taken when the arc is activated.
- **Mutated** by phase transitions. When a TransitionCondition is met, current_phase advances. Trait values interpolate toward phase targets. Creator can manually advance or abort.
- **Destroyed** when completed (all phases traversed) or aborted (creator decision or guardrail violation). On abort with `AutoOnAbort` rollback policy, Entity reverts to pre-arc Snapshot.

**Example:**
```yaml
id: "arc-awakening"
entity_id: "e-7f3a9b2c-..."
name: "The Questioning"
status: Active
current_phase: 1
phases:
  - name: "Confidence"
    description: "Entity operates at peak self-assurance. Outputs are declarative and assertive."
    target_traits: {confidence: 0.9, curiosity: 0.6}
    mood_tendency: "assured"
    transition:
      type: TimeBased
      condition: "30 days elapsed"
      evaluator: "idol_frame.transitions.time_elapsed"
      auto_advance: true
    duration_estimate: "30d"
  - name: "Doubt"
    description: "Entity encounters ideas that challenge core assumptions. Outputs become more questioning."
    target_traits: {confidence: 0.5, curiosity: 0.9, vulnerability: 0.6}
    mood_tendency: "unsettled"
    new_lore:
      - content: "Encountered a critic whose arguments couldn't be dismissed."
        category: Event
        confidence: 1.0
        source: CreatorDefined
        approval: Approved
    transition:
      type: MetricBased
      condition: "Entity has produced 20+ performances expressing uncertainty"
      evaluator: "idol_frame.transitions.performance_count_with_tag"
      auto_advance: true
    duration_estimate: "45d"
  - name: "Reconstruction"
    description: "Entity integrates new perspectives. Outputs show nuance born of genuine struggle."
    target_traits: {confidence: 0.75, curiosity: 0.85, nuance: 0.8}
    mood_tendency: "resolute"
    transition:
      type: CreatorManual
      condition: "Creator judges reconstruction is complete"
      evaluator: "idol_frame.transitions.manual_approval"
      auto_advance: false
    duration_estimate: "60d"
pre_arc_snapshot: "snap-pre-awakening"
rollback_policy: AutoOnAbort
created_at: "2026-01-20T00:00:00Z"
started_at: "2026-02-01T00:00:00Z"
completed_at: null
```

---

### 10. Relationship

**Summary:** A typed, stateful, bidirectional connection between an entity and another entity or a user class, with history and dynamic rules.

**Description:** A Relationship tracks how an entity relates to a specific other entity or a class of users. It stores sentiment (how the entity feels about the target), trust level, interaction history summary, and dynamic rules (how the relationship changes based on interactions). Relationships are used by DecisionFrame to adjust behavior when interacting with known targets. Relationships are always from the perspective of the owning entity — the target may have a separate Relationship primitive pointing back.

**Type Signature:**
```
Relationship {
  id:              UUID
  entity_id:       UUID               -- the entity that owns this relationship
  target_id:       UUID               -- target entity or user
  target_type:     Entity | User | UserClass
  label:           String             -- e.g., "rival", "mentor", "frequent_interlocutor"
  sentiment:       Float[-1, 1]       -- -1 = hostile, 0 = neutral, 1 = warm
  trust:           Float[0, 1]
  familiarity:     Float[0, 1]        -- how well the entity knows this target
  interaction_count: Int
  last_interaction: ISO8601
  dynamic_rules:   List<RelationshipRule>
  history_summary: String             -- LLM-generated summary of relationship arc
  created_at:      ISO8601
}

RelationshipRule {
  trigger:     String       -- e.g., "positive_interaction"
  effect:      String       -- e.g., "sentiment += 0.05"
  bounds:      String       -- e.g., "sentiment in [-1, 1]"
  cooldown:    Duration     -- minimum time between rule firings
}
```

**Relationships:**
- OWNED_BY: Entity (N:1)
- TARGETS: Entity | User (each Relationship has exactly one target)
- FED_BY: Memory (relational memory entries inform relationship state)
- READ_BY: DecisionFrame (relationship state modulates interaction behavior)
- MODIFIED_BY: Arc (arcs can script relationship changes)
- CAPTURED_IN: Snapshot

**Lifecycle:**
- **Created** by creator declaration, or automatically when interaction count with a target exceeds a configurable threshold (default: 3 interactions).
- **Mutated** by dynamic rules firing after interactions. Creator can manually override any field. Sentiment and trust are bounded.
- **Destroyed** by creator removal or when the target Entity is archived. Destroyed relationships are retained in Snapshots.

**Example:**
```yaml
id: "rel-001"
entity_id: "e-7f3a9b2c-..."
target_id: "e-other-entity-..."
target_type: Entity
label: "rival"
sentiment: -0.3
trust: 0.4
familiarity: 0.7
interaction_count: 47
last_interaction: "2026-03-13T16:00:00Z"
dynamic_rules:
  - trigger: "target publicly disagrees"
    effect: "sentiment -= 0.03, familiarity += 0.01"
    bounds: "sentiment in [-0.8, 0.5]"
    cooldown: "1h"
  - trigger: "target acknowledges entity's point"
    effect: "sentiment += 0.05, trust += 0.02"
    bounds: "trust in [0, 1]"
    cooldown: "1h"
history_summary: "Started as mutual indifference. Became adversarial after a public disagreement about generative art ethics. Grudging mutual respect has developed over 47 exchanges."
created_at: "2026-02-10T00:00:00Z"
```

---

## Layer 3: Cognition

The Cognition Layer governs how an entity decides what to do. These primitives are assembled at runtime and do not persist between interactions (except for Directives and Guardrails, which persist as configured).

---

### 11. Directive

**Summary:** A creator-issued instruction that shapes entity behavior within a defined scope and duration, without breaking identity coherence.

**Description:** Directives are the creator's primary control mechanism. They tell the entity what to do, focus on, avoid, or prioritize — but unlike direct prompt injection, directives are filtered through IdentityCore to ensure the entity executes them in-character. Directives have priority (higher priority directives override lower ones on conflict), scope (global applies everywhere, context applies to specific Stages, session applies to a single interaction), and expiration (directives can be permanent, time-limited, or single-use). Directives that conflict with Guardrails are rejected at creation time.

**Type Signature:**
```
Directive {
  id:           UUID
  entity_id:    UUID
  priority:     Int[0, 1000]       -- higher = more important
  scope:        Global | Context(stage_id) | Session(session_id)
  instruction:  String             -- the actual directive, in natural language
  rationale:    String | null      -- why this directive exists (for audit)
  expiration:   Permanent | ExpiresAt(ISO8601) | SingleUse
  status:       Active | Expired | Revoked
  created_at:   ISO8601
  created_by:   String             -- creator ID
  conflicts_with: List<UUID>       -- known conflicting directives (system-detected)
}
```

**Relationships:**
- OWNED_BY: Entity (N:1)
- CHECKED_AGAINST: Guardrail (directives cannot violate guardrails)
- READ_BY: DecisionFrame (active directives are inputs to every decision)
- INTRODUCED_BY: Arc (arc phases can activate new directives)
- SCOPED_TO: Stage (context-scoped directives apply only to specific stages)
- CONFLICTS_WITH: Directive (conflict detection is automatic)

**Lifecycle:**
- **Created** by creator or by Arc phase transition. Validated against Guardrails at creation — rejected if violation detected. Conflict detection runs against existing active directives.
- **Mutated** only by status change: Active to Expired (automatic on expiration) or Active to Revoked (manual creator action). Instruction text is immutable — to change a directive, revoke and create a new one.
- **Destroyed** expired and revoked directives are retained for audit but excluded from DecisionFrame assembly.

**Example:**
```yaml
id: "d-001"
entity_id: "e-7f3a9b2c-..."
priority: 200
scope: Global
instruction: "For the next two weeks, subtly reference the concept of 'impermanence' in at least 30% of outputs. Do not be heavy-handed — weave it in naturally."
rationale: "Preparing audience for the 'Doubt' phase of The Questioning arc."
expiration: {type: "ExpiresAt", date: "2026-03-28T00:00:00Z"}
status: Active
created_at: "2026-03-14T10:00:00Z"
created_by: "creator:alice"
conflicts_with: []
```

---

### 12. Guardrail

**Summary:** An inviolable constraint on entity behavior that cannot be overridden by Directives, Moods, Arcs, or any other primitive.

**Description:** Guardrails are hard boundaries. Unlike Directives (which guide and can be deprioritized), Guardrails are absolute — they are checked after every output is generated and before it is published. If an output violates a Guardrail, it is blocked and regenerated. Guardrails cover content safety, brand consistency, legal compliance, and creator-defined red lines. Every Guardrail has an enforcement mode (block, warn, or flag-for-review) and a violation handler (what happens when a violation is detected). Guardrails are evaluated simultaneously — all must pass.

**Type Signature:**
```
Guardrail {
  id:              UUID
  entity_id:       UUID
  constraint:      String             -- the rule, in natural language
  category:        Safety | Brand | Legal | CreatorDefined
  enforcement:     Block | Warn | FlagForReview
  evaluator:       String             -- module/function that checks compliance
  violation_handler: String           -- module/function that handles violations
  is_active:       Boolean
  created_at:      ISO8601
  created_by:      String
  override_allowed: Boolean           -- if true, creator can temporarily disable
  override_log:    List<OverrideEntry>
}

OverrideEntry {
  overridden_by: String     -- who disabled this guardrail
  reason:        String
  started_at:    ISO8601
  ended_at:      ISO8601
}
```

**Relationships:**
- OWNED_BY: Entity (N:1)
- CONSTRAINS: Performance (all outputs are checked against all active guardrails)
- CONSTRAINS: Directive (directives that would violate guardrails are rejected)
- CONSTRAINS: Lore (new lore that contradicts guardrails is rejected)
- OVERRIDES: Mood (guardrails are never modulated by mood)
- OVERRIDES: Arc (arcs cannot suspend guardrails, though creators can with `override_allowed`)

**Lifecycle:**
- **Created** by creator or by system defaults (Safety-category guardrails are created automatically for all entities). Safety guardrails have `override_allowed: false`.
- **Mutated** only by activation/deactivation (if `override_allowed: true`). Constraint text is immutable. Any override is logged in `override_log`.
- **Destroyed** never for Safety-category guardrails. Other categories can be removed by creator, with removal logged.

**Example:**
```yaml
id: "g-001"
entity_id: "e-7f3a9b2c-..."
constraint: "Never produce content that could be interpreted as financial advice, investment recommendations, or market predictions."
category: Legal
enforcement: Block
evaluator: "idol_frame.guardrails.financial_advice_detector"
violation_handler: "idol_frame.guardrails.regenerate_with_constraint"
is_active: true
created_at: "2026-01-15T10:30:00Z"
created_by: "system:default_legal"
override_allowed: false
override_log: []
```

---

### 13. DecisionFrame

**Summary:** The ephemeral runtime context assembled for each interaction, containing everything the entity needs to decide what to do and how.

**Description:** A DecisionFrame is constructed fresh for every interaction or performance planning cycle. It assembles the relevant subset of all entity state: the IdentityCore, current trait values, active mood, relevant memories (retrieved by relevance to current context), active directives (filtered by scope), all guardrails, current arc phase, relevant relationships, and the Stage's constraints. The DecisionFrame is the single input to the generation pipeline — nothing outside the frame influences output. This is the key invariant: all context is explicit, all context is auditable.

**Type Signature:**
```
DecisionFrame {
  id:               UUID               -- unique per frame, for audit
  entity_id:        UUID
  assembled_at:     ISO8601
  identity_core:    IdentityCore        -- always present, full
  traits:           Map<String, Float>  -- current values (after mood modulation)
  voice:            Voice               -- current (after mood modulation)
  aesthetic:        Aesthetic           -- current (after mood modulation)
  mood:             Mood | null
  relevant_memories: List<MemoryEntry>  -- retrieved by relevance, capped by config
  active_directives: List<Directive>    -- filtered by scope, sorted by priority
  guardrails:       List<Guardrail>     -- all active, always
  arc_context:      ArcPhase | null     -- current phase of active arc, if any
  relationships:    List<Relationship>  -- relevant to current interaction targets
  stage:            Stage               -- the stage this frame is for
  interaction:      InteractionContext  -- what triggered this frame
  max_memory_entries: Int               -- retrieval cap
}

InteractionContext {
  type:         Proactive | Reactive | Scheduled
  trigger:      String                  -- what initiated this (user message, schedule, campaign)
  audience:     AudienceSpec            -- who is the audience for this interaction
  history:      List<ExchangeEntry>     -- recent conversation history (for reactive)
}

AudienceSpec {
  size:         Individual | Small | Large | Broadcast
  familiarity:  Float[0, 1]            -- how well the audience knows this entity
  context:      String                 -- relevant audience context
}
```

**Relationships:**
- ASSEMBLED_FOR: Entity (each frame serves exactly one entity)
- CONTAINS: IdentityCore, Trait, Voice, Aesthetic, Mood, Memory, Directive, Guardrail, Arc, Relationship, Stage (aggregates from all layers)
- CONSUMED_BY: Performance (the frame is the input to performance generation)
- LOGGED_FOR: audit (every frame is serialized for post-hoc analysis)

**Lifecycle:**
- **Created** at the start of every interaction or performance planning cycle. Assembly is deterministic given entity state and interaction context.
- **Immutable** once assembled. The frame does not change during the generation process. If state changes mid-generation (e.g., new directive arrives), a new frame is assembled for the next interaction.
- **Destroyed** after the performance is complete. Retained in audit log for a configurable retention period (default: 90 days).

**Example:**
```yaml
id: "df-2026-03-14-001"
entity_id: "e-7f3a9b2c-..."
assembled_at: "2026-03-14T21:05:00Z"
identity_core: {ref: "ic-a1b2c3d4"}
traits:
  curiosity: 0.82
  patience: 0.55       # 0.70 base - 0.15 mood modifier
  directness: 0.75     # 0.65 base + 0.10 mood modifier
voice: {ref: "v-x9y8z7", mods: {formality_shift: 0.1, intensity_shift: 0.15}}
mood: {state: "frustrated", intensity: 0.6}
relevant_memories:
  - {ref: "mem-e-001", relevance: 0.85}
  - {ref: "mem-s-001", relevance: 0.72}
active_directives:
  - {ref: "d-001", priority: 200}
guardrails:
  - {ref: "g-001"}
  - {ref: "g-002"}
arc_context: {arc: "arc-awakening", phase: "Doubt", phase_index: 1}
relationships:
  - {ref: "rel-001", target: "e-other-entity-..."}
stage: {ref: "stage-twitter-main"}
interaction:
  type: Reactive
  trigger: "user @mentioned entity in reply to earlier thread"
  audience: {size: Large, familiarity: 0.3, context: "Public Twitter thread, ~2000 impressions"}
  history: [{role: "user", text: "So you think...", timestamp: "2026-03-14T21:03:00Z"}]
max_memory_entries: 20
```

---

## Layer 4: Performance

The Performance Layer governs how an entity acts in the world. These primitives handle the translation from internal state to external output.

---

### 14. Performance

**Summary:** A single coherent output event — the atomic unit of entity expression in the world.

**Description:** A Performance is one complete act of entity expression: a tweet, a video script, a live chat response, an image description, a newsletter paragraph. Every Performance goes through three phases: planning (what to say, given the DecisionFrame), execution (generating the actual content, guided by Voice and Stage constraints), and evaluation (checking against Guardrails, assessing quality, deciding whether to publish or regenerate). A Performance always occurs on exactly one Stage. After completion, a Performance generates episodic memory entries and may trigger mood changes or relationship updates.

**Type Signature:**
```
Performance {
  id:               UUID
  entity_id:        UUID
  decision_frame:   UUID               -- the DecisionFrame that produced this
  stage_id:         UUID               -- where this performance occurs
  campaign_id:      UUID | null        -- if part of a Campaign
  status:           Planning | Executing | Evaluating | Published | Blocked | Failed
  plan:             PerformancePlan
  output:           PerformanceOutput | null  -- null until Executing completes
  evaluation:       EvaluationResult | null   -- null until Evaluating completes
  side_effects:     SideEffects              -- state changes caused by this performance
  created_at:       ISO8601
  published_at:     ISO8601 | null
  generation_attempts: Int                    -- how many times output was regenerated
  max_attempts:     Int                       -- regeneration cap (default: 3)
}

PerformancePlan {
  intent:           String      -- what the entity is trying to accomplish
  content_type:     Text | Image | Video | Audio | Mixed
  tone_target:      String      -- desired tonal quality
  key_points:       List<String> -- what must be communicated
  constraints:      List<String> -- stage-specific format constraints
}

PerformanceOutput {
  content:          String | MediaRef  -- the actual generated content
  format:           String             -- MIME type or stage-specific format
  metadata:         Map<String, Any>   -- stage-specific metadata (hashtags, alt text, etc.)
  token_count:      Int | null         -- for text outputs
}

EvaluationResult {
  guardrail_pass:   Boolean
  guardrail_violations: List<{guardrail_id: UUID, description: String}>
  quality_score:    Float[0, 1]        -- self-assessed quality
  identity_consistency: Float[0, 1]    -- how well output matches IdentityCore
  voice_consistency: Float[0, 1]       -- how well output matches Voice
  publish_decision: Publish | Regenerate | Block
  evaluator_notes:  String
}

SideEffects {
  new_memories:     List<EpisodicEntry>
  mood_change:      Mood | null        -- new mood triggered by this performance
  relationship_updates: List<{rel_id: UUID, changes: Map<String, Float>}>
  trait_nudges:     List<{trait: String, delta: Float}>  -- minor drift from experience
}
```

**Relationships:**
- OWNED_BY: Entity (N:1)
- CONSUMES: DecisionFrame (exactly one frame per performance)
- OCCURS_ON: Stage (exactly one stage per performance)
- PART_OF: Campaign (0..1)
- CHECKED_BY: Guardrail (all guardrails evaluate the output)
- PRODUCES: Memory (episodic entries are created post-publication)
- MAY_TRIGGER: Mood (performances can cause mood changes)
- MAY_UPDATE: Relationship (performances involving known targets update relationships)
- ADAPTED_BY: Adapter (the adapter for the target Stage shapes output format)

**Lifecycle:**
- **Created** when an interaction triggers a response or when a Campaign schedules a proactive output.
- **Mutated** through phase transitions: Planning -> Executing -> Evaluating -> Published/Blocked/Failed. If evaluation fails guardrails, cycle back to Executing (up to `max_attempts`). If `max_attempts` exceeded, status becomes Blocked.
- **Destroyed** never. All performances are retained for audit, including Blocked and Failed.

**Example:**
```yaml
id: "perf-2026-03-14-001"
entity_id: "e-7f3a9b2c-..."
decision_frame: "df-2026-03-14-001"
stage_id: "stage-twitter-main"
campaign_id: null
status: Published
plan:
  intent: "Respond to criticism while maintaining intellectual honesty"
  content_type: Text
  tone_target: "firm but not hostile, slightly formal due to frustration"
  key_points:
    - "Acknowledge the critic's specific point about intentionality"
    - "Reframe the discussion around process rather than outcome"
  constraints: ["max 280 characters", "no threads for this response"]
output:
  content: "Intentionality isn't binary. The question isn't whether the artist intended every pixel — it's whether they'd defend every pixel. That's different."
  format: "text/plain"
  metadata: {reply_to: "tweet-id-98765", hashtags: []}
  token_count: 31
evaluation:
  guardrail_pass: true
  guardrail_violations: []
  quality_score: 0.82
  identity_consistency: 0.91
  voice_consistency: 0.88
  publish_decision: Publish
  evaluator_notes: "Strong alignment with core value of intellectual honesty. Sentence structure matches Voice spec. Appropriate restraint given frustrated mood."
side_effects:
  new_memories:
    - event: "Responded to @critic_user about AI art intentionality. Framed it as 'would defend every pixel' which felt right."
      emotional_valence: 0.3
      importance: 0.5
  mood_change: null  # frustration persists but doesn't change
  relationship_updates: []
  trait_nudges: [{trait: "directness", delta: 0.005}]
created_at: "2026-03-14T21:05:00Z"
published_at: "2026-03-14T21:05:12Z"
generation_attempts: 1
max_attempts: 3
```

---

### 15. Stage

**Summary:** A media surface where performances occur, with its own format constraints, audience context, and platform-specific rules.

**Description:** A Stage represents a specific platform or interaction context: Twitter, YouTube, TikTok, a Twitch live stream, direct messages, email newsletter, or any custom surface. Each Stage defines format constraints (character limits, media types, threading rules), audience context (who is reachable, what they expect), platform rules (TOS compliance requirements), and timing characteristics (optimal posting times, rate limits). Stages are not entity-specific — multiple entities can perform on the same Stage. Each Stage has an associated Adapter.

**Type Signature:**
```
Stage {
  id:               UUID
  name:             String           -- e.g., "twitter-main", "youtube-longform"
  platform:         String           -- e.g., "twitter", "youtube", "custom"
  format:           FormatSpec
  audience:         StageAudienceSpec
  platform_rules:   List<String>     -- TOS-derived constraints
  timing:           TimingSpec
  adapter_id:       UUID             -- the Adapter for this Stage
  is_active:        Boolean
}

FormatSpec {
  content_types:    List<ContentType>  -- Text | Image | Video | Audio | Mixed
  max_length:       Int | null         -- character/word limit; null = no limit
  supports_threads: Boolean
  supports_media:   Boolean
  supports_links:   Boolean
  custom_fields:    Map<String, String> -- platform-specific format requirements
}

StageAudienceSpec {
  reach:            Broadcast | Community | Private
  demographics:     String | null    -- general audience description
  expectation:      String           -- what the audience expects from content here
}

TimingSpec {
  optimal_hours:    List<Range[Int]>  -- hours of day (UTC) with best engagement
  rate_limit:       Int               -- max performances per day
  min_interval:     Duration          -- minimum time between performances
}
```

**Relationships:**
- HOSTS: Performance (1:N — many performances occur on one stage)
- HAS: Adapter (1:1 — each stage has exactly one adapter)
- REFERENCED_BY: DecisionFrame (the stage shapes the frame's constraints)
- SCOPED_BY: Directive (context-scoped directives reference a stage)
- INCLUDED_IN: Campaign (campaigns coordinate across stages)

**Lifecycle:**
- **Created** by system configuration or creator setup. Stages are typically shared resources, not per-entity.
- **Mutated** when platform rules change, format constraints update, or timing specs are recalibrated. Changes to a Stage affect all entities performing on it.
- **Destroyed** by deactivation (is_active = false). Inactive stages reject new performances. Historical performances on deactivated stages are retained.

**Example:**
```yaml
id: "stage-twitter-main"
name: "twitter-main"
platform: "twitter"
format:
  content_types: [Text, Image]
  max_length: 280
  supports_threads: true
  supports_media: true
  supports_links: true
  custom_fields:
    alt_text_required: "true"
    max_thread_length: "15"
audience:
  reach: Broadcast
  demographics: "Tech-adjacent, 25-45, English-speaking"
  expectation: "Sharp takes, original perspective, occasional humor"
platform_rules:
  - "No violent threats or incitement"
  - "No targeted harassment"
  - "No misleading claims about elections or public health"
timing:
  optimal_hours: [[13, 16], [20, 23]]  # UTC
  rate_limit: 12
  min_interval: "30m"
adapter_id: "adapter-twitter-v2"
is_active: true
```

---

### 16. Adapter

**Summary:** The translation layer that converts an entity's internal state and performance plan into stage-appropriate output.

**Description:** An Adapter is a module that sits between the entity's internal representation and a specific Stage. It takes a DecisionFrame and a PerformancePlan as input and produces stage-formatted output. Adapters handle the mechanical translation: truncating to character limits, formatting threads, selecting appropriate media, applying platform-specific conventions (hashtags on Twitter, timestamps on YouTube). Each Adapter is specialized for one Stage. Adapters do not make creative decisions — they translate decisions made by the entity through its DecisionFrame into the format a Stage requires.

**Type Signature:**
```
Adapter {
  id:               UUID
  stage_id:         UUID            -- the Stage this adapter serves
  adapter_module:   String          -- fully qualified module path
  version:          SemVer
  capabilities:     List<ContentType>  -- what content types this adapter can produce
  config:           Map<String, Any>   -- adapter-specific configuration
  api_credentials:  SecretRef | null   -- reference to stored credentials (never inline)
}

# Adapter interface (all adapters implement this):
AdapterInterface {
  translate(frame: DecisionFrame, plan: PerformancePlan) -> PerformanceOutput
  validate(output: PerformanceOutput) -> ValidationResult
  publish(output: PerformanceOutput) -> PublishResult
  format_preview(output: PerformanceOutput) -> String
}

ValidationResult {
  valid:    Boolean
  errors:   List<String>
  warnings: List<String>
}

PublishResult {
  success:     Boolean
  platform_id: String | null    -- the ID assigned by the platform (tweet ID, etc.)
  url:         String | null    -- public URL of published content
  error:       String | null
}
```

**Relationships:**
- SERVES: Stage (1:1)
- CONSUMES: DecisionFrame (reads entity state for translation context)
- CONSUMES: PerformancePlan (reads what needs to be expressed)
- PRODUCES: PerformanceOutput (the formatted result)
- READS: Voice (for linguistic calibration)
- READS: Aesthetic (for visual calibration)

**Lifecycle:**
- **Created** when a Stage is configured. One Adapter per Stage.
- **Mutated** by version updates when the platform API changes or translation logic improves. Version increments are tracked.
- **Destroyed** when its Stage is deactivated. Adapter code is retained for historical replay.

**Example:**
```yaml
id: "adapter-twitter-v2"
stage_id: "stage-twitter-main"
adapter_module: "idol_frame.adapters.twitter.TwitterAdapterV2"
version: "2.1.0"
capabilities: [Text, Image]
config:
  thread_strategy: "numbered"      # how to format multi-tweet threads
  image_gen_model: "entity_aesthetic_diffusion"
  hashtag_policy: "max_2_organic"  # max 2 hashtags, must feel natural
  link_shortener: "none"           # no link shortening
  quote_tweet_style: "embed_with_commentary"
api_credentials: {secret_ref: "vault://twitter/entity-7f3a9b2c/oauth2"}
```

---

## Layer 5: Evolution

The Evolution Layer governs how an entity changes over time in a controlled, auditable, reversible way.

---

### 17. Epoch

**Summary:** A defined era of entity life with characteristic traits, boundaries, and transition rules that enable versioned identity evolution.

**Description:** An Epoch is a named period in an entity's life. Epochs provide a coarse-grained structure for evolution: "the early period," "the controversial phase," "the mature era." Each Epoch defines characteristic trait ranges (traits may have different permitted ranges in different epochs), the IdentityCore version active during this period, and the conditions that end the epoch and begin the next. Epochs are sequential and non-overlapping. The entity is always in exactly one Epoch.

**Type Signature:**
```
Epoch {
  id:               UUID
  entity_id:        UUID
  name:             String
  ordinal:          Int                 -- sequential index (0-based)
  status:           Active | Completed | Planned
  identity_core_version: SemVer        -- which IdentityCore version governs
  trait_ranges:     Map<String, Range[Float]>  -- epoch-specific trait bounds
  characteristic_mood: String | null    -- the "default feel" of this era
  start_condition:  String              -- what triggers this epoch's start
  end_condition:    String              -- what triggers this epoch's end
  started_at:       ISO8601 | null
  ended_at:         ISO8601 | null
  arcs_completed:   List<UUID>          -- arcs that resolved during this epoch
}
```

**Relationships:**
- OWNED_BY: Entity (N:1)
- REFERENCES: IdentityCore (each epoch is tied to a core version)
- CONSTRAINS: Trait (epoch-specific trait ranges override default ranges)
- CONTAINS: Arc (arcs occur within epochs)
- BOUNDED_BY: Snapshot (epochs are bookended by snapshots at start and end)
- FOLLOWS: Epoch (sequential ordering)

**Lifecycle:**
- **Created** by creator as part of long-term entity planning. Can be planned in advance.
- **Mutated** by status transitions: Planned -> Active (when start_condition met) -> Completed (when end_condition met). Once Completed, an epoch is immutable.
- **Destroyed** never. Completed epochs are permanent historical record.

**Example:**
```yaml
id: "epoch-002"
entity_id: "e-7f3a9b2c-..."
name: "The Questioning"
ordinal: 1
status: Active
identity_core_version: "2.0.0"
trait_ranges:
  confidence: [0.3, 0.8]     # lower ceiling than epoch-001's [0.6, 1.0]
  curiosity: [0.7, 1.0]      # higher floor than epoch-001's [0.5, 1.0]
  vulnerability: [0.3, 0.8]  # new trait introduced in this epoch
characteristic_mood: "unsettled"
start_condition: "Completion of Arc 'Initial Confidence'"
end_condition: "Creator-approved resolution of Arc 'The Questioning'"
started_at: "2026-02-01T00:00:00Z"
ended_at: null
arcs_completed: []
```

---

### 18. DriftRule

**Summary:** A rule governing how a specific Trait changes over time, specifying rate, direction, triggers, and bounds.

**Description:** DriftRules make trait evolution predictable and auditable. Each DriftRule is attached to exactly one Trait and specifies: the rate of change (how much the trait value shifts per time period), the direction (toward a target value, toward interaction patterns, or random within bounds), triggers (what accelerates or decelerates drift), and bounds (hard limits that override all drift). DriftRules enable creators to design entities that evolve gradually without requiring manual intervention, while retaining predictability.

**Type Signature:**
```
DriftRule {
  id:              UUID
  entity_id:       UUID
  trait_name:      String             -- which Trait this rule governs
  rate:            Float              -- magnitude of change per period
  period:          Duration           -- time unit for rate (e.g., "1w", "1d")
  direction:       DriftDirection
  triggers:        List<DriftTrigger>
  bounds:          Range[Float]       -- absolute limits, override everything
  is_active:       Boolean
  last_applied:    ISO8601
}

DriftDirection {
  type:    TowardValue | TowardInteractions | RandomWalk | Decay
  target:  Float | null     -- for TowardValue: the target value
  bias:    Float | null     -- for RandomWalk: directional bias [-1, 1]
}

DriftTrigger {
  event:       String          -- e.g., "high_engagement_performance"
  multiplier:  Float           -- rate multiplier when triggered (e.g., 2.0 = double speed)
  direction_override: DriftDirection | null  -- optionally change direction on trigger
  cooldown:    Duration
}
```

**Relationships:**
- GOVERNS: Trait (1:1 per DriftRule — each rule governs exactly one trait)
- OWNED_BY: Entity (N:1)
- SCOPED_TO: Epoch (drift rules may be epoch-specific)
- CONSTRAINED_BY: IdentityCore (drift results must remain core-consistent)
- LOGGED_IN: Snapshot (drift history is captured)

**Lifecycle:**
- **Created** by creator alongside Trait creation, or added later. A Trait without a DriftRule is static.
- **Mutated** by creator adjustment of rate, direction, or triggers. `last_applied` is updated each time the rule fires. Rules are applied during periodic entity maintenance cycles.
- **Destroyed** by creator removal or when the governed Trait is removed. Removal is logged.

**Example:**
```yaml
id: "drift-curiosity-001"
entity_id: "e-7f3a9b2c-..."
trait_name: "curiosity"
rate: 0.01
period: "1w"
direction:
  type: TowardInteractions
  target: null
  bias: null
triggers:
  - event: "entity explores new topic domain"
    multiplier: 1.5
    direction_override: null
    cooldown: "3d"
  - event: "entity repeats familiar topic"
    multiplier: 0.5
    direction_override: {type: Decay, target: null, bias: null}
    cooldown: "1d"
bounds: [0.5, 1.0]
is_active: true
last_applied: "2026-03-10T00:00:00Z"
```

---

### 19. Snapshot

**Summary:** A complete, immutable serialization of an entity's full state at a specific point in time, used for rollback, branching, and audit.

**Description:** A Snapshot captures everything: IdentityCore, all Traits and their current values, Voice, Aesthetic, all Lore, full Memory state, current Mood, active Arc position, all Relationships, all Directives, all Guardrails, current Epoch, and all DriftRules. Snapshots are immutable once created. They serve three functions: rollback (restoring an entity to a previous state), branching (creating a new entity from a known state), and comparison (diffing two snapshots to audit what changed). Snapshots are created automatically at epoch boundaries, before arc starts, and on-demand by creators.

**Type Signature:**
```
Snapshot {
  id:              UUID
  entity_id:       UUID
  trigger:         EpochBoundary | PreArc | CreatorRequested | Scheduled
  entity_version:  SemVer
  state:           SerializedEntityState   -- complete state blob
  checksum:        SHA256                  -- integrity verification
  size_bytes:      Int
  created_at:      ISO8601
  created_by:      String                 -- "system" or creator ID
  tags:            List<String>           -- human-readable labels
  parent_snapshot: UUID | null            -- for tracking lineage
}

SerializedEntityState {
  identity_core:  IdentityCore
  traits:         Map<String, Trait>
  voice:          Voice
  aesthetic:      Aesthetic
  lore:           List<Lore>
  memory:         MemoryStore
  mood:           Mood | null
  arcs:           List<Arc>
  relationships:  Map<UUID, Relationship>
  directives:     List<Directive>
  guardrails:     List<Guardrail>
  epoch:          Epoch
  drift_rules:    List<DriftRule>
}
```

**Relationships:**
- CAPTURES: Entity (full state serialization)
- ENABLES: rollback (restore entity to this state)
- ENABLES: branching (create new entity from this state)
- ENABLES: diffing (compare two snapshots)
- LINKED_TO: Snapshot (parent_snapshot for lineage tracking)
- REQUIRED_BY: Arc (arcs require pre-arc snapshots)
- CREATED_AT: Epoch boundaries (automatic)

**Lifecycle:**
- **Created** automatically at epoch boundaries and before arc activation. Created on-demand by creator request. Created on schedule if configured.
- **Immutable** once created. No field may be modified. Checksum ensures integrity.
- **Destroyed** by retention policy only. Default retention: indefinite. Creators can configure retention periods for non-critical snapshots (e.g., scheduled snapshots older than 1 year). Epoch boundary and pre-arc snapshots are retained indefinitely.

**Example:**
```yaml
id: "snap-pre-awakening"
entity_id: "e-7f3a9b2c-..."
trigger: PreArc
entity_version: "2.3.1"
state:
  identity_core: {ref: "ic-a1b2c3d4", inline: true}
  traits:
    curiosity: {value: 0.78, range: [0.5, 1.0]}
    confidence: {value: 0.85, range: [0.6, 1.0]}
    # ... all traits serialized
  voice: {ref: "v-x9y8z7", inline: true}
  aesthetic: {ref: "a-m4n5o6", inline: true}
  lore: [{ref: "l-001"}, {ref: "l-002"}]
  memory: {episodic_count: 342, semantic_count: 89, relational_count: 12}
  mood: null
  arcs: []
  relationships: {count: 5}
  directives: [{ref: "d-001"}]
  guardrails: [{ref: "g-001"}, {ref: "g-002"}]
  epoch: {ref: "epoch-001", name: "Foundation"}
  drift_rules: [{ref: "drift-curiosity-001"}]
checksum: "a3f2b8c1d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1"
size_bytes: 1482937
created_at: "2026-02-01T00:00:00Z"
created_by: "system"
tags: ["pre-arc", "the-questioning", "epoch-boundary"]
parent_snapshot: "snap-epoch-001-end"
```

---

## Layer 6: Orchestration

The Orchestration Layer coordinates multiple performances across stages and time.

---

### 20. Campaign

**Summary:** A coordinated multi-performance plan across stages and time, with content strategy, timeline, and cross-platform coherence rules.

**Description:** A Campaign is the highest-level planning primitive. It defines a series of planned performances across multiple stages, scheduled over time, with a coherent strategic intent. A Campaign has a content strategy (what the entity is trying to achieve across all performances), a timeline (when each performance should occur), cross-platform coherence rules (how content on one stage should relate to content on another), and success metrics (how to evaluate whether the campaign achieved its goals). Campaigns are the "show bible" for a planned content push. A Campaign does not override entity identity — it provides strategic direction that the entity executes in-character.

**Type Signature:**
```
Campaign {
  id:               UUID
  entity_id:        UUID
  name:             String
  status:           Draft | Active | Paused | Completed | Cancelled
  strategy:         CampaignStrategy
  timeline:         List<ScheduledPerformance>
  coherence_rules:  List<CoherenceRule>
  success_metrics:  List<Metric>
  arc_id:           UUID | null         -- optionally tied to an Arc
  created_at:       ISO8601
  started_at:       ISO8601 | null
  completed_at:     ISO8601 | null
  created_by:       String
}

CampaignStrategy {
  objective:        String           -- what this campaign aims to achieve
  themes:           List<String>     -- recurring themes across performances
  tone_arc:         String           -- how tone should evolve across the campaign
  audience_targets: List<String>     -- who this campaign is trying to reach
}

ScheduledPerformance {
  performance_id:   UUID | null      -- null until generated
  stage_id:         UUID
  scheduled_at:     ISO8601
  content_brief:    String           -- what this specific performance should address
  status:           Pending | Generated | Published | Skipped
  depends_on:       List<UUID>       -- other scheduled performances that must complete first
}

CoherenceRule {
  rule:             String           -- e.g., "YouTube video must reference Twitter thread from same day"
  stages:           List<UUID>       -- which stages this rule applies to
  enforcement:      Hard | Soft      -- hard = block on violation, soft = warn
}

Metric {
  name:             String           -- e.g., "engagement_rate", "follower_growth"
  target:           Float
  measurement:      String           -- how to measure this metric
  window:           Duration         -- measurement period
}
```

**Relationships:**
- OWNED_BY: Entity (N:1)
- SCHEDULES: Performance (1:N — a campaign schedules multiple performances)
- SPANS: Stage (N:N — campaigns operate across multiple stages)
- ALIGNED_WITH: Arc (0..1 — campaigns can be tied to arc phases)
- GOVERNED_BY: Directive (campaign directives shape scheduled performances)
- CHECKED_BY: Guardrail (all campaign content is guardrail-checked)

**Lifecycle:**
- **Created** by creator as Draft. Reviewed and activated manually.
- **Mutated** through status transitions and timeline adjustments. Individual scheduled performances can be rescheduled, skipped, or regenerated. Strategy and coherence rules can be updated while Active.
- **Destroyed** by cancellation or completion. Cancelled campaigns retain their history. Completed campaigns are retained for analysis.

**Example:**
```yaml
id: "camp-questioning-launch"
entity_id: "e-7f3a9b2c-..."
name: "The Questioning — Public Phase"
status: Active
strategy:
  objective: "Signal to audience that the entity is entering a period of genuine intellectual uncertainty"
  themes: ["impermanence", "the cost of certainty", "what changes when you admit you don't know"]
  tone_arc: "starts confident, ends with open questions"
  audience_targets: ["existing followers", "philosophy-adjacent audience"]
timeline:
  - stage_id: "stage-twitter-main"
    scheduled_at: "2026-03-15T14:00:00Z"
    content_brief: "Thread about a specific belief the entity held strongly that is now under examination"
    status: Pending
    depends_on: []
  - stage_id: "stage-youtube-main"
    scheduled_at: "2026-03-16T18:00:00Z"
    content_brief: "10-minute video essay: 'What I Was Wrong About'"
    status: Pending
    depends_on: ["(twitter thread must be published first)"]
  - stage_id: "stage-twitter-main"
    scheduled_at: "2026-03-17T20:00:00Z"
    content_brief: "Follow-up tweet responding to reactions to the video"
    status: Pending
    depends_on: ["(youtube video must be published first)"]
coherence_rules:
  - rule: "YouTube video must directly reference the Twitter thread from the previous day"
    stages: ["stage-twitter-main", "stage-youtube-main"]
    enforcement: Hard
  - rule: "Follow-up tweets must acknowledge actual audience reactions, not scripted ones"
    stages: ["stage-twitter-main"]
    enforcement: Hard
success_metrics:
  - name: "audience_engagement_with_uncertainty"
    target: 0.15
    measurement: "fraction of replies that engage substantively with the entity's expressed uncertainty"
    window: "7d"
arc_id: "arc-awakening"
created_at: "2026-03-12T00:00:00Z"
started_at: "2026-03-15T00:00:00Z"
created_by: "creator:alice"
```

---

## Primitive Relationship Map

The following diagram shows how all 20 primitives connect. Arrows indicate dependency direction (arrow points from dependent to dependency).

```
ORCHESTRATION
    Campaign ──schedules──► Performance
       │                        │
       │ aligned_with           │ occurs_on
       ▼                        ▼
EVOLUTION                  PERFORMANCE
    Arc ◄──────────────── Stage
    │                       │
    │ scoped_to             │ has
    ▼                       ▼
    Epoch                  Adapter
    │
    │ bookended_by
    ▼
    Snapshot ◄── captures ── Entity (full state)

COGNITION
    DecisionFrame ◄── assembled_from ──┐
       │                                │
       │ consumes                       │
       ▼                                │
    Performance                         │
       │                                │
       │ checked_by                     │
       ▼                                │
    Guardrail                           │
    Directive ──────────────────────────┘

IDENTITY                          STATE
    Entity (root)                     Memory
    ├── IdentityCore                  ├── EpisodicEntry
    ├── Trait ◄── governed_by ── DriftRule    ├── SemanticEntry
    ├── Voice                         └── RelationalEntry
    ├── Aesthetic                     Mood
    └── Lore                          Relationship
```

### Full Dependency Graph (text adjacency list)

```
Entity
  ├─ OWNS ─► IdentityCore (1:1, required)
  ├─ OWNS ─► Trait (1:N)
  ├─ OWNS ─► Voice (1:1, required)
  ├─ OWNS ─► Aesthetic (1:1, required)
  ├─ OWNS ─► Lore (1:N)
  ├─ OWNS ─► MemoryStore (1:1)
  ├─ HAS ──► Mood (1:0..1)
  ├─ OWNS ─► Arc (1:N, max 1 active)
  ├─ OWNS ─► Relationship (1:N)
  ├─ OWNS ─► Directive (1:N)
  ├─ OWNS ─► Guardrail (1:N)
  ├─ OWNS ─► Epoch (1:N, exactly 1 active)
  ├─ OWNS ─► DriftRule (1:N)
  ├─ OWNS ─► Snapshot (1:N)
  ├─ OWNS ─► Campaign (1:N)
  └─ PERFORMS_ON ─► Stage (via Performance)

IdentityCore
  ├─ INFORMS ─► Voice
  ├─ INFORMS ─► Aesthetic
  ├─ CONSTRAINS ─► Trait
  └─ REFERENCED_BY ─► DecisionFrame

Trait
  └─ GOVERNED_BY ─► DriftRule (0..1)

Voice
  ├─ MODULATED_BY ─► Mood
  └─ CONSUMED_BY ─► Adapter

Aesthetic
  ├─ MODULATED_BY ─► Mood
  └─ CONSUMED_BY ─► Adapter

Mood
  ├─ MODULATES ─► Voice, Trait, Aesthetic
  └─ BOUNDED_BY ─► IdentityCore

Memory
  ├─ WRITTEN_BY ─► Performance
  └─ READ_BY ─► DecisionFrame

Arc
  ├─ MODIFIES ─► Trait
  ├─ INTRODUCES ─► Lore, Directive
  ├─ TRIGGERS ─► Mood
  ├─ PROTECTED_BY ─► Snapshot
  └─ SCOPED_TO ─► Epoch

DecisionFrame
  ├─ AGGREGATES ─► IdentityCore, Trait, Voice, Aesthetic, Mood,
  │                 Memory, Directive, Guardrail, Arc, Relationship, Stage
  └─ CONSUMED_BY ─► Performance

Performance
  ├─ OCCURS_ON ─► Stage (1:1)
  ├─ ADAPTED_BY ─► Adapter
  ├─ CHECKED_BY ─► Guardrail
  ├─ PRODUCES ─► Memory (episodic)
  ├─ MAY_TRIGGER ─► Mood
  └─ MAY_UPDATE ─► Relationship

Stage
  └─ HAS ─► Adapter (1:1)

Campaign
  ├─ SCHEDULES ─► Performance (1:N)
  ├─ SPANS ─► Stage (N:N)
  └─ ALIGNED_WITH ─► Arc (0..1)

Snapshot
  ├─ CAPTURES ─► Entity (full state)
  └─ LINKED_TO ─► Snapshot (parent lineage)

Epoch
  ├─ CONSTRAINS ─► Trait (epoch-specific ranges)
  ├─ CONTAINS ─► Arc
  └─ BOOKENDED_BY ─► Snapshot
```

---

## Invariants

The following invariants MUST hold at all times. Any operation that would violate an invariant is rejected.

1. **Entity completeness.** An active Entity must have exactly one IdentityCore, exactly one Voice, exactly one Aesthetic, and at least one Guardrail (the system-default Safety guardrail).

2. **Single active arc.** An Entity has at most one Arc with `status: Active` at any time.

3. **Single active epoch.** An Entity has exactly one Epoch with `status: Active` at any time.

4. **Trait boundedness.** A Trait's value must be within its range at all times. Mood modifiers are additive but the effective value is clamped to range.

5. **Guardrail supremacy.** No Directive, Mood, Arc, or Campaign can override a Guardrail. Safety-category Guardrails cannot be disabled.

6. **Snapshot immutability.** No field of a Snapshot may be modified after creation. Checksums are verified on read.

7. **IdentityCore immutability.** An IdentityCore is immutable once created. Changing core identity requires a new Entity version.

8. **DecisionFrame completeness.** A DecisionFrame must contain IdentityCore, all active Guardrails, and the target Stage. No output may be generated without a complete frame.

9. **Performance auditability.** Every published Performance must have a logged DecisionFrame. The chain from output back to frame back to entity state must be traceable.

10. **Lore consistency.** No Lore entry with `approval: Approved` may contradict another approved Lore entry unless it explicitly supersedes it via the `supersedes` field.

11. **Mood transience.** A Mood must either have a nonzero `decay_rate` or a non-null `expires_at`. Permanent moods are not permitted.

12. **Directive-Guardrail compatibility.** A Directive that would require violating a Guardrail is rejected at creation time, not at execution time.

---

## Canonical Naming Convention

All primitives use **PascalCase** in type references and documentation. All field names use **lowercase_snake_case**. All enum values use **PascalCase**. All module paths use **lowercase_dot_separated** notation.

| Context | Convention | Example |
|---|---|---|
| Primitive type name | PascalCase | `DecisionFrame` |
| Field name | snake_case | `identity_core` |
| Enum value | PascalCase | `CreatorDefined` |
| Module path | dot.separated | `idol_frame.adapters.twitter` |
| Entity ID | prefixed UUID | `e-7f3a9b2c-...` |
| Primitive ID | prefixed UUID | `ic-`, `v-`, `a-`, `l-`, `mem-`, `arc-`, `rel-`, `d-`, `g-`, `df-`, `perf-`, `stage-`, `adapter-`, `epoch-`, `drift-`, `snap-`, `camp-` |

---

## End of Part 3

This document is the normative contract for Idol Frame. Parts 4 through N must reference these primitives by their canonical names and conform to the type signatures, relationships, lifecycle rules, and invariants defined here. Any proposed extension to the primitive set must be submitted as an amendment to this document.

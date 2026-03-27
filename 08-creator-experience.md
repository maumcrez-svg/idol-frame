# Part 8: Creator Experience

**Status:** NORMATIVE
**Depends on:** Part 3 (Framework Primitives), Part 5 (System Architecture)
**Version:** 1.0.0
**Date:** 2026-03-15

---

## 1. The Director Model

Idol Frame treats the creator as a **director**, not a prompter. This distinction is structural, not cosmetic. It shapes every control surface, every workflow, and every feedback loop in the system.

### 1.1 What Directors Do (And Don't Do)

**Creators don't write prompts -- they give Directives.**
A prompt is a one-shot instruction to a language model. A Directive (Part 3, primitive 11) is a persistent, scoped, priority-ranked instruction that the entity interprets through its own IdentityCore. The creator says "be more confrontational this week"; the entity decides what confrontational looks like given its values, Voice, and current Mood. The Directive is validated against Guardrails at creation time by `cognition.DirectiveResolver` and rejected if it would force a constraint violation (Invariant 12).

**Creators don't configure parameters -- they define identity.**
There is no temperature slider, no top-k dropdown, no system prompt textarea. The creator defines an IdentityCore (Part 3, primitive 2) -- values, worldview, core tensions, recognition markers. They define a Voice (Part 3, primitive 4) -- vocabulary, syntax, rhetoric, emotional register. They define an Aesthetic (Part 3, primitive 5) -- color palette, visual style, composition. These identity primitives are stored by `identity.IdentityCoreManager`, `identity.VoiceRegistry`, and `identity.AestheticRegistry` respectively. The system translates identity into generation parameters internally.

**Creators don't manage memory -- they shape Arcs.**
The creator never manually inserts or deletes memory entries. Memory (Part 3, primitive 7) is managed automatically by `state.MemoryManager` -- episodic memories are created after performances, consolidated over time, and garbage-collected when decayed below threshold. What creators do control is the narrative trajectory: they define Arcs (Part 3, primitive 9) that script how the entity evolves, and Lore (Part 3, primitive 6) that establishes canonical backstory.

**Creators don't "make the AI do X" -- they "direct the entity toward X."**
The difference is agency. A prompt-driven system executes instructions literally. A director-driven system interprets instructions through character. When a creator issues a Directive saying "talk about environmental issues," the entity doesn't parrot talking points. It filters the topic through its IdentityCore values, expresses it in its Voice, and situates it within its active Arc phase. The `cognition.FrameAssembler` builds a DecisionFrame (Part 3, primitive 13) that contains all of this context, and `performance.Generator` produces output from the frame -- not from the Directive alone.

### 1.2 Why the Director Model Matters

The director model serves three concrete purposes:

1. **Consistency at scale.** An entity that receives 50 Directives over a month stays coherent because every Directive is interpreted through the same IdentityCore. A prompt-driven system would produce 50 disconnected outputs.

2. **Separation of intent from execution.** The creator specifies what should happen narratively. The system handles how it happens mechanically. This means creators don't need to understand LLM internals, token budgets, or prompt engineering tricks.

3. **Auditable authority chain.** Every Performance (Part 3, primitive 14) traces back through its DecisionFrame to the Directives, Guardrails, and IdentityCore that shaped it (Invariant 9). When something goes wrong, the creator can see exactly why the entity behaved as it did.

---

## 2. Control Surface Layers

Creator control is organized into three layers, ordered from strategic (rarely changed) to tactical (changed constantly). Each layer maps to specific primitives and specific modules.

### 2.1 Strategic Layer: Identity Definition

The strategic layer defines what the entity IS. Changes here are infrequent and significant -- they represent fundamental shifts in the entity's character.

**IdentityCore Definition**

The creator defines the entity's essence through `identity.IdentityCoreManager`:

| Field | What the Creator Specifies | Example |
|---|---|---|
| `values` | Ranked list of ValueEntry objects -- what the entity cares about, in order | `[{name: "authenticity", rank: 1}, {name: "wit", rank: 2}]` |
| `worldview` | How the entity sees the world -- orientation, beliefs, epistemology | "Skeptical optimist. Believes in human potential but demands evidence." |
| `communication_philosophy` | Why the entity communicates -- its purpose in speaking | "To challenge comfortable assumptions through humor." |
| `core_tensions` | Internal contradictions that make the entity interesting | `[{pole_a: "accessibility", pole_b: "depth", default_balance: 0.6}]` |
| `recognition_markers` | What makes the entity recognizably itself | `["unexpected analogies", "questions-as-answers", "callback humor"]` |

**Voice Definition**

The creator defines how the entity speaks through `identity.VoiceRegistry`:

- `vocabulary`: preferred terms, avoided terms, domain-specific language, formality level
- `syntax`: sentence length range, complexity preference, fragment frequency, paragraph structure
- `rhetoric`: primary rhetorical devices, argumentation style, persuasion approach
- `emotional_register`: range of emotional expression, intensity bounds, default baseline
- `sample_utterances`: concrete examples that anchor the Voice specification

**Aesthetic Definition**

The creator defines how the entity looks through `identity.AestheticRegistry`:

- `color_palette`: primary, secondary, accent colors with usage ratios
- `visual_style`: photographic vs. illustrated vs. abstract, texture preferences
- `composition`: layout tendencies, negative space preferences, focal point patterns
- `references`: reference images that anchor the visual language
- `typography`: font preferences, text styling rules

**Guardrail Definition**

The creator sets hard behavioral boundaries through `cognition.GuardrailEnforcer`:

- Safety Guardrails are system-default and cannot be removed (Invariant 5)
- Brand Guardrails protect the entity's public image
- Legal Guardrails enforce compliance requirements
- CreatorDefined Guardrails implement custom restrictions

Each Guardrail specifies `enforcement: Block | Warn | FlagForReview` and an `evaluator` function. Block-level Guardrails halt output entirely. Warn-level Guardrails flag output but allow publication. FlagForReview queues output for creator approval.

**Cadence:** Strategic layer changes trigger Entity version increments. IdentityCore or Voice changes produce a minor version bump. Trait, Lore, or Guardrail changes produce a patch version bump. All changes are captured by `evolution.SnapshotService` and are reversible.

### 2.2 Narrative Layer: Direction

The narrative layer governs where the entity is going. Changes here happen on a weekly or monthly cadence and represent editorial decisions about the entity's trajectory.

**Arc Creation and Management**

Arcs (Part 3, primitive 9) are managed through `state.ArcDirector`. The creator defines:

- `name`: human-readable arc identifier (e.g., "Disillusionment Arc")
- `phases`: ordered list of ArcPhase objects, each containing:
  - `name`: phase label (e.g., "Doubt", "Questioning", "Transformation")
  - `target_traits`: trait values to move toward during this phase
  - `new_lore`: Lore entries introduced when the phase activates
  - `new_directives`: Directives that activate with the phase
  - `transition_condition`: what triggers advancement to the next phase
- `rollback_policy`: `AutoOnAbort` (restore pre-arc Snapshot on abort) or `ManualOnAbort`

Invariant 2 applies: only one Arc can be active at a time. Activating an Arc triggers a pre-arc Snapshot via `evolution.SnapshotService` so the entity can be rolled back if the arc goes wrong.

**Directive Issuance**

Directives (Part 3, primitive 11) are created through `cognition.DirectiveResolver`. The creator specifies:

- `instruction`: what the entity should do differently
- `priority`: 0-1000 ranking for conflict resolution
- `scope`: `Global` (all contexts), `Context(stage_id)` (one Stage), or `Session(session_id)` (one conversation)
- `expiration`: `Permanent`, `ExpiresAt(timestamp)`, or `SingleUse`

The system validates every new Directive against all active Guardrails at creation time. If the Directive would require violating a Guardrail, it is rejected with a specific explanation (Invariant 12). If it conflicts with existing Directives, the creator receives a ConflictReport from `cognition.DirectiveResolver.DetectConflicts`.

**Lore Management**

Lore (Part 3, primitive 6) is managed through `identity.LoreGraph`. The creator can:

- Add new Lore entries with `category` (Origin, Event, Preference, Belief, Relationship, Meta) and `confidence` score
- Approve or reject entity-generated and audience-derived Lore
- Supersede existing Lore with updated entries (maintaining the supersession chain for audit)
- Query Lore by category and confidence to review the entity's canonical backstory

Invariant 10 applies: no two approved Lore entries may contradict unless one explicitly supersedes the other.

**Epoch Setting**

Epochs (Part 3, primitive 17) are managed through `evolution.EpochManager`. The creator defines:

- `name`: era label (e.g., "Early Days", "Rise", "Reinvention")
- `trait_ranges`: per-trait range overrides that constrain how far traits can move during this era
- Transition conditions for moving to the next epoch

Invariant 3 applies: exactly one Epoch is active at any time. Epoch transitions trigger boundary Snapshots on both sides.

**Cadence:** Narrative layer changes are the creator's primary ongoing work. A typical cadence is reviewing entity performance weekly, adjusting Directives, planning the next Arc phase, and approving or rejecting accumulated Lore.

### 2.3 Tactical Layer: Real-Time Control

The tactical layer handles moment-to-moment adjustments. Changes here happen daily or hourly and represent operational decisions.

**Mood Injection**

The creator can set an entity's Mood (Part 3, primitive 8) through `state.MoodController`:

- `state`: emotional label (e.g., "frustrated", "euphoric", "contemplative")
- `intensity`: 0.0 to 1.0
- `decay_rate`: how quickly the mood fades (Invariant 11: must be nonzero or have `expires_at`)
- `trait_mods`: temporary trait value adjustments (additive, clamped to Trait range by Invariant 4)
- `voice_mods`: temporary Voice modulations (clamped to [-0.3, 0.3])

Moods modulate output without overriding identity. A "frustrated" mood might increase rhetorical sharpness and decrease warmth, but the entity's IdentityCore values remain authoritative.

**Campaign Creation**

Campaigns (Part 3, primitive 20) are created through `orchestration.CampaignPlanner`:

- `strategy`: the content strategy driving the campaign
- `timeline`: ordered list of ScheduledPerformance entries, each targeting a specific Stage at a specific time
- `coherence_rules`: rules ensuring cross-platform consistency (e.g., "tweet thread must precede blog post by 2 hours")
- `success_metrics`: measurable goals for campaign evaluation

`orchestration.Scheduler` manages the timeline, firing performances at scheduled times and respecting Stage-level rate limits from `media.StageManager`.

**Performance Review**

After `performance.Evaluator` scores an output, the creator can:

- Review outputs flagged by `FlagForReview` Guardrails
- Approve or block specific Performances before publication
- Override the evaluator's publish/block decision (logged for audit)
- Review evaluation scores to identify patterns in entity quality

**Manual Overrides**

For situations requiring direct control, the creator can:

- Force a specific Mood immediately
- Revoke an active Directive
- Abort an active Arc (triggering rollback per `rollback_policy`)
- Block a Performance that has already been queued
- Request an immediate Snapshot via `evolution.SnapshotService`

All manual overrides are logged in the Performance Log with the creator's identity and timestamp.

**Cadence:** Tactical controls are the creator's day-to-day operational tools. A typical session involves checking flagged outputs, adjusting mood if the entity feels off, reviewing campaign progress, and handling any drift alerts.

---

## 3. Creator Workflows

### 3.1 Workflow: Entity Creation

**Goal:** Go from nothing to a functioning entity capable of producing performances.

**Step 1: Define IdentityCore (required)**

The creator provides values, worldview, communication philosophy, core tensions, and recognition markers. The system validates structural completeness through `identity.IdentityCoreManager`:

- At least one ValueEntry is required
- At least one core tension is required
- Recognition markers list must be non-empty

If validation fails, the system returns specific errors identifying missing or malformed fields.

**Step 2: Define Voice (required)**

The creator provides vocabulary, syntax, rhetoric, emotional register, and sample utterances. `identity.VoiceRegistry` validates:

- At least 3 sample utterances are required (used for Voice consistency evaluation by `evaluation.VoiceAnalyzer`)
- Syntax ranges must be valid (min <= max for sentence length, etc.)
- Emotional register bounds must be within [0, 1]

**Step 3: Define Aesthetic (optional, defaults to null-aesthetic)**

The creator provides visual identity specifications through `identity.AestheticRegistry`. If omitted, the system applies a null-aesthetic that imposes no visual constraints.

**Step 4: Define initial Traits (optional)**

The creator provides an initial Trait map through `identity.TraitEngine`. Each Trait requires:

- `name`: human-readable identifier
- `value`: initial Float[0,1]
- `range`: allowed bounds as Tuple[Float, Float]

If no Traits are defined, the entity operates purely on IdentityCore and Voice without quantified personality dimensions.

**Step 5: Define Guardrails (system defaults auto-applied)**

Safety-category Guardrails are created automatically (Invariant 1 and Invariant 5). The creator may add Brand, Legal, or CreatorDefined Guardrails. Each Guardrail is validated by `cognition.GuardrailEnforcer` for evaluator function availability.

**Step 6: System validation and Entity creation**

`identity.EntityStore` runs the full validation suite:

- Invariant 1 check: IdentityCore, Voice, Aesthetic, and at least one Safety Guardrail all present
- Entity receives initial version `0.1.0`
- Initial Epoch is created with `status: Active` via `evolution.EpochManager` (Invariant 3)
- Initial Snapshot is taken via `evolution.SnapshotService`
- Entity status is set to `Active`

**Step 7: Configure Stages (at least one required for performances)**

The creator connects the entity to one or more Stages through `media.StageManager`. Each Stage has a pre-configured Adapter via `media.AdapterRegistry`. The entity can now perform.

**Step 8: First performance test**

The creator triggers a test Performance. The system executes the full pipeline: `cognition.FrameAssembler` builds a DecisionFrame, `performance.Planner` creates a plan, `performance.Generator` produces output, and `performance.Evaluator` scores it. The creator reviews the result and iterates on identity definitions as needed.

**Minimum viable entity:** IdentityCore + Voice + system-default Guardrails + one Stage. Everything else can be added incrementally.

### 3.2 Workflow: Issuing a Directive

**Goal:** Shape entity behavior for a specific purpose without breaking identity coherence.

**Step 1: Creator writes the Directive**

The creator specifies:
```
instruction: "Increase references to upcoming product launch.
              Maintain skeptical tone -- don't sound like marketing."
priority: 500
scope: Global
expiration: ExpiresAt("2026-04-01T00:00:00Z")
```

**Step 2: Guardrail validation**

`cognition.DirectiveResolver` passes the Directive to `cognition.GuardrailEnforcer.ValidateDirective`. The enforcer checks:

- Does the instruction conflict with any Block-level Guardrail?
- Does it conflict with any Warn-level Guardrail?
- Does it require behavior that a Safety Guardrail would prevent?

If a Block-level conflict is found, the Directive is rejected with a specific explanation:
```
RejectionResult {
  reason: "Directive conflicts with Guardrail g-0042 (Brand: no explicit product shilling)",
  guardrail_id: "g-0042",
  suggestion: "Rephrase to allow organic product references rather than explicit promotion"
}
```

**Step 3: Conflict detection**

`cognition.DirectiveResolver.DetectConflicts` checks the new Directive against all active Directives for the entity. If conflicts exist:
```
ConflictReport {
  directive_a: "d-new",
  directive_b: "d-0088",
  description: "New directive asks for product references; existing d-0088 says 'avoid commercial topics'",
  resolution: "Higher priority wins. New directive (500) will override d-0088 (300) on conflict."
}
```

The creator can proceed, revoke the conflicting Directive, or adjust priority.

**Step 4: Activation**

The Directive is stored with `status: Active`. It will be included in every DecisionFrame assembled by `cognition.FrameAssembler` where its scope matches.

**Step 5: Entity interpretation**

The entity does not execute the Directive literally. When `performance.Generator` receives a DecisionFrame containing the Directive, it interprets "increase references to upcoming product launch" through the lens of the entity's IdentityCore. An entity with values ranking "authenticity" first will reference the product launch in a way that feels genuine, not promotional -- especially given the explicit instruction to "maintain skeptical tone."

**Step 6: Monitoring**

The creator monitors Directive effectiveness through the dashboard (Section 4). Each Performance produced while the Directive is active shows whether the Directive was reflected in the output, as scored by `evaluation.IdentityEvaluator`.

### 3.3 Workflow: Planning an Arc

**Goal:** Script a multi-phase character development trajectory with rollback safety.

**Step 1: Define the Arc structure**

The creator designs the narrative arc:
```
name: "Disillusionment Arc"
phases:
  - name: "Cracks Appear"
    target_traits: { optimism: 0.6, trust: 0.5 }
    new_lore:
      - { content: "Had a public disagreement with a former ally",
          category: Event, confidence: 1.0, source: CreatorDefined }
    new_directives:
      - { instruction: "Express occasional doubt about institutions",
          priority: 400, scope: Global, expiration: Permanent }
    transition_condition:
      evaluator: "time_elapsed"
      params: { days: 14 }

  - name: "Questioning Everything"
    target_traits: { optimism: 0.3, trust: 0.3, cynicism: 0.7 }
    new_lore:
      - { content: "Discovered evidence of systemic dishonesty in the industry",
          category: Event, confidence: 1.0, source: CreatorDefined }
    new_directives:
      - { instruction: "Challenge previously held assumptions openly",
          priority: 600, scope: Global, expiration: Permanent }
    transition_condition:
      evaluator: "creator_approval"

  - name: "Reconstruction"
    target_traits: { optimism: 0.5, trust: 0.4, cynicism: 0.4, resilience: 0.8 }
    new_lore:
      - { content: "Found a new framework for understanding the world",
          category: Belief, confidence: 0.8, source: CreatorDefined }
    new_directives:
      - { instruction: "Speak from hard-won wisdom, not naive hope",
          priority: 500, scope: Global, expiration: Permanent }
    transition_condition:
      evaluator: "time_elapsed"
      params: { days: 21 }

rollback_policy: AutoOnAbort
```

**Step 2: System validation**

`state.ArcDirector` validates:

- Invariant 2 check: is another Arc already active? If so, activation is blocked.
- All referenced Traits exist on the entity (via `identity.TraitEngine`)
- All target trait values fall within Trait ranges and current Epoch trait ranges
- All new Directives pass Guardrail validation (Invariant 12)
- All new Lore entries pass Guardrail gating
- Transition condition evaluators are valid and available

**Step 3: Activation**

When the creator activates the Arc:

1. `evolution.SnapshotService.createSnapshot` is called with `trigger: PreArc` -- this is the rollback point
2. The Arc's `status` moves from `Planned` to `Active`
3. The first phase activates: target traits are applied via `identity.TraitEngine`, new Lore is added via `identity.LoreGraph`, new Directives are created via `cognition.DirectiveResolver`

**Step 4: Phase transitions**

`state.ArcDirector.EvaluateTransition` runs periodically (or on creator trigger). When a transition condition is met:

1. Current phase is marked complete
2. Next phase activates with its target traits, lore, and directives
3. Phase transition is logged for audit
4. Creator receives notification of phase advancement

**Step 5: Monitoring and intervention**

The creator monitors Arc progress through the dashboard (Section 4). At any point, the creator can:

- Abort the Arc: if `rollback_policy == AutoOnAbort`, `evolution.SnapshotService.RestoreSnapshot` restores the pre-arc state. If `ManualOnAbort`, the entity retains its current state and the creator decides what to keep.
- Skip a phase: advance to the next phase early via `state.ArcDirector.AdvancePhase`
- Extend a phase: modify the transition condition to delay advancement

**Step 6: Completion**

When the final phase's transition condition is met, the Arc `status` moves to `Completed`. The entity retains the traits, lore, and behavioral patterns developed during the arc. The pre-arc Snapshot remains available for reference or future rollback.

### 3.4 Workflow: Campaign Planning

**Goal:** Coordinate multiple performances across stages and time with cross-platform coherence.

**Step 1: Define the Campaign**

The creator builds a Campaign (Part 3, primitive 20) through `orchestration.CampaignPlanner`:

```
strategy:
  theme: "Entity reflects on one year of existence"
  tone: "retrospective, grateful but honest"
  key_messages:
    - "Growth through mistakes"
    - "Audience shaped who I became"
    - "What comes next"

timeline:
  - stage_id: "stage-twitter"
    scheduled_at: "2026-04-01T09:00:00Z"
    content_brief: "Teaser thread -- cryptic references to 'one year ago today'"

  - stage_id: "stage-youtube"
    scheduled_at: "2026-04-01T12:00:00Z"
    content_brief: "Long-form retrospective video script"

  - stage_id: "stage-twitter"
    scheduled_at: "2026-04-01T14:00:00Z"
    content_brief: "Link to video with personal reflection quote"

  - stage_id: "stage-instagram"
    scheduled_at: "2026-04-01T18:00:00Z"
    content_brief: "Visual retrospective -- key moments collage"

coherence_rules:
  - "All performances must reference the 'one year' theme"
  - "Twitter teaser must not spoil video content"
  - "Instagram visual must use anniversary color palette variant"

success_metrics:
  - { metric: "engagement_rate", target: 0.05 }
  - { metric: "cross_platform_reach", target: 10000 }
```

**Step 2: Validation**

`orchestration.CampaignPlanner` validates:

- All referenced Stages exist and are active (via `media.StageManager`)
- Timeline respects Stage timing constraints (rate limits, minimum intervals)
- Content briefs are compatible with Stage format specs
- If the Campaign is aligned with an Arc (`ALIGNED_WITH` relationship), strategy is checked for arc-phase consistency

**Step 3: Activation and execution**

The Campaign moves from `Draft` to `Active`. `orchestration.Scheduler` takes over:

1. At each scheduled time, the Scheduler generates an InteractionContext with `type: Scheduled` and the content brief
2. `cognition.FrameAssembler` builds a DecisionFrame incorporating the Campaign context
3. `performance.Planner` creates a plan that reflects both the Campaign strategy and the entity's current state
4. The standard generation-evaluation-publication pipeline executes
5. `orchestration.CampaignPlanner.EvaluateCoherenceRules` checks each Performance against the Campaign's coherence rules before publication

**Step 4: Monitoring and adjustment**

The creator monitors Campaign progress through the Campaign timeline view (Section 4). While active, the creator can:

- Pause the Campaign (suspends scheduled performances)
- Reschedule individual performances
- Adjust content briefs for upcoming performances
- Cancel the Campaign entirely

**Step 5: Completion**

When all scheduled performances are complete, the Campaign moves to `Completed`. Success metrics are evaluated against actuals and presented in the dashboard.

### 3.5 Workflow: Crisis Management

**Goal:** Respond to an entity producing harmful, off-brand, or otherwise problematic output.

**Severity Level 1: Caught by Evaluator (pre-publication)**

This is the normal case. `performance.Evaluator` detects a Guardrail violation or low quality score:

1. `cognition.GuardrailEnforcer.EvaluateOutput` returns a violation
2. Performance loops back to `performance.Generator` for regeneration (up to `max_attempts`)
3. If all attempts fail, Performance status moves to `Blocked`
4. Creator receives a `performance.blocked` event notification
5. Creator reviews the blocked output and the specific Guardrail violation
6. Creator decides: adjust the Directive that caused the problem, add a new Guardrail, or approve the output manually

**Severity Level 2: Published but problematic**

Something passed evaluation but shouldn't have:

1. Creator identifies the problem (via dashboard review, audience feedback, or external alert)
2. Creator uses manual override to flag the Performance
3. If the Stage's Adapter supports deletion/retraction, `performance.Publisher` issues a retraction
4. Creator reviews the DecisionFrame that produced the output (Invariant 9 guarantees traceability)
5. Root cause analysis:
   - Was a Guardrail missing? Creator adds one via `cognition.GuardrailEnforcer`
   - Was a Guardrail too permissive? Creator tightens the evaluator
   - Was a Directive misinterpreted? Creator revokes and reissues with clearer instruction
   - Was the IdentityCore itself the problem? Creator plans an Entity version change

**Severity Level 3: Systemic failure**

The entity is producing consistently problematic output:

1. Creator uses emergency controls:
   - Set entity `status` to `Dormant` via `identity.EntityStore` (stops all performances)
   - Abort any active Arc via `state.ArcDirector.AbortArc`
   - Revoke all non-permanent Directives via `cognition.DirectiveResolver`
2. Creator takes an immediate Snapshot via `evolution.SnapshotService`
3. Creator identifies the last known-good Snapshot
4. Creator restores entity state via `evolution.SnapshotService.RestoreSnapshot`
5. Creator reviews and adjusts identity before reactivating

**Post-crisis actions:**

- Review Guardrails: are they sufficient? Add any that would have prevented the issue.
- Review evaluation thresholds: should `performance.Evaluator` quality threshold increase?
- Consider adding `FlagForReview` Guardrails for the specific category of content that caused the crisis.
- Document the incident in entity Lore (category: Meta) for internal reference.

---

## 4. Creator Dashboard Specifications

The creator dashboard is the primary control surface, served through the Admin UI API (Part 5, API Gateway). Each panel maps to specific modules and primitives.

### 4.1 Entity Health Overview

**Data source:** `evaluation.HealthAggregator.GetEntityHealth`

| Metric | Source | Display |
|---|---|---|
| Identity consistency (avg) | `evaluation.IdentityEvaluator` | Score 0-1, trend sparkline (7-day) |
| Voice consistency (avg) | `evaluation.VoiceAnalyzer` | Score 0-1, trend sparkline (7-day) |
| Guardrail violation rate | `cognition.GuardrailEnforcer` | Percentage, trend sparkline (7-day) |
| Drift score | `evaluation.DriftMonitor` | Score 0-1, threshold indicator |
| Performance quality (avg) | `performance.Evaluator` | Score 0-1, trend sparkline (7-day) |
| Active alerts | `evaluation.HealthAggregator` | Count + severity badges |

**Alert thresholds:**
- Identity consistency < 0.7: warning
- Voice consistency < 0.6: warning
- Guardrail violation rate > 5%: warning
- Drift score > 0.3: warning (unintended drift may be occurring)
- Any metric crossing threshold for 3+ consecutive days: escalation to critical

### 4.2 Active Directives Panel

**Data source:** `cognition.DirectiveResolver.ResolveDirectives`

Displays all Directives with `status: Active` for the entity:

- Instruction text
- Priority ranking
- Scope indicator (Global / Context / Session)
- Expiration status (countdown timer for ExpiresAt, "permanent" label, "single-use" label)
- Conflict indicators (linked to ConflictReport if applicable)
- Quick actions: Revoke, Edit Priority, Extend Expiration

Directives are sorted by priority descending. Scope is color-coded: Global (blue), Context (green), Session (gray).

### 4.3 Arc Progress Visualization

**Data source:** `state.ArcDirector.GetActiveArc`

If an Arc is active, displays:

- Arc name and overall status
- Phase timeline: horizontal bar showing all phases, current phase highlighted
- Current phase details: target traits, active directives introduced, lore added
- Transition condition status: progress toward next phase trigger
- Time in current phase
- Pre-arc Snapshot reference (clickable for diff view via `evolution.SnapshotService.DiffSnapshots`)
- Quick actions: Advance Phase, Abort Arc, Extend Phase

If no Arc is active, displays the most recently completed Arc summary and a button to create a new one.

### 4.4 Recent Performances Panel

**Data source:** Performance Log (via `evaluation.HealthAggregator`)

Displays the last N performances (default 20, configurable):

- Performance timestamp and Stage
- Status badge: Published (green), Blocked (red), Failed (orange), FlagForReview (yellow)
- Quality score breakdown: identity consistency, voice consistency, guardrail compliance
- Output preview (first 140 characters or thumbnail for visual content)
- DecisionFrame link (for audit drill-down)
- Quick actions: Flag, Retract (if published), Approve (if FlagForReview)

Filterable by Stage, status, and date range.

### 4.5 Drift Alerts Panel

**Data source:** `evaluation.DriftMonitor.AnalyzeDrift`

Displays active drift warnings:

- Trait name and current value vs. baseline value
- Drift magnitude and direction
- Drift rate (is it accelerating?)
- Whether the drift is governed by a DriftRule (Part 3, primitive 18) or unintended
- Recommendation: expected (within DriftRule bounds) vs. unexpected (investigate)

Each alert links to the trait's DriftRule configuration (if any) and the relevant Snapshot comparison.

### 4.6 Campaign Timeline View

**Data source:** `orchestration.CampaignPlanner`

For each active or draft Campaign:

- Gantt-style timeline showing scheduled performances across Stages
- Performance status per slot: Pending, In Progress, Published, Blocked
- Coherence rule compliance indicator per performance
- Success metrics progress (actual vs. target)
- Quick actions: Pause Campaign, Reschedule Performance, Cancel Campaign

### 4.7 Memory Browser

**Data source:** `state.MemoryManager` and `cognition.MemoryRetriever`

Searchable interface into the entity's Memory:

- Three tabs: Episodic, Semantic, Relational
- Full-text and semantic search (via vector similarity)
- Importance score display with decay indicator
- Consolidation status (has this episodic memory been promoted to semantic?)
- Relational tab shows per-target sentiment and trust history
- Read-only: creators observe but do not directly edit memories

The Memory browser exists for transparency. It answers the question "what does this entity remember?" without giving creators the ability to manipulate memories directly, which would break the director model.

### 4.8 Lore Graph Visualization

**Data source:** `identity.LoreGraph`

Visual graph of the entity's canonical backstory:

- Nodes: individual Lore entries, color-coded by category (Origin, Event, Preference, Belief, Relationship, Meta)
- Edges: supersession relationships (which entries replaced which)
- Node size: proportional to confidence score
- Node border: solid (Approved), dashed (Pending), red-dashed (Rejected)
- Source indicator: icon for CreatorDefined, EntityGenerated, AudienceDerived
- Click-to-expand: full Lore entry text and metadata
- Quick actions: Approve Pending, Supersede, Add New

Filterable by category, source, and approval status.

---

## 5. Permission Model

### 5.1 Solo Creator

A solo creator has full, unrestricted control over all primitives and modules for their entities. Every operation described in this document is available.

### 5.2 Team/Studio: Role-Based Access

When multiple people manage an entity, access is controlled by four roles:

| Role | Identity Layer | State Layer | Cognition Layer | Performance Layer | Evolution Layer | Orchestration Layer |
|---|---|---|---|---|---|---|
| **Director** | Full read/write | Full read/write | Full read/write | Full read/write | Full read/write | Full read/write |
| **Writer** | Read only | Read; can set Mood | Create/revoke Directives; read Guardrails | Read; approve FlagForReview | Read only | Read only |
| **Operator** | Read only | Read only | Read only | Read; manual override; approve FlagForReview | Read; request Snapshot | Full read/write on Campaigns |
| **Viewer** | Read only | Read only | Read only | Read only | Read only | Read only |

**Role details:**

**Director:** Equivalent to solo creator. Can modify IdentityCore, Voice, Aesthetic, Traits, Guardrails, Arcs, Epochs, and all other primitives. Can archive or restore entities. Can manage team access.

**Writer:** Can issue Directives and manage Lore -- the narrative control surface. Can set Mood for tactical adjustments. Cannot modify the entity's fundamental identity or set Guardrails. This role is designed for content strategists and narrative designers who direct entity behavior without owning its core definition.

**Operator:** Can manage Campaigns, schedule performances, handle performance review queues, and request Snapshots. Cannot modify identity, issue Directives, or change Arcs. This role is designed for production managers and social media operators who handle day-to-day publishing.

**Viewer:** Read-only access to all dashboards. Cannot modify any primitive. This role is designed for stakeholders, brand managers, or auditors who need visibility without control.

### 5.3 Entity Autonomy Levels

The creator configures how much the entity can do without explicit creator approval:

| Autonomy Level | Entity Can... | Entity Needs Approval For... |
|---|---|---|
| **Supervised** | Nothing autonomously | All performances require creator approval before publication |
| **Guided** | Publish performances that pass evaluation; generate Lore (Pending status) | Lore approval; any FlagForReview output |
| **Autonomous** | Publish performances; generate and self-approve Lore with confidence >= 0.8 | Lore with confidence < 0.8; FlagForReview output |
| **Full Autonomy** | All of the above; can self-adjust Mood based on interactions | IdentityCore changes; Guardrail modifications; Arc creation |

Regardless of autonomy level, Safety Guardrails always apply (Invariant 5), and the entity can never modify its own IdentityCore (Invariant 7) or disable Guardrails.

**Default:** New entities start at `Guided`. The creator escalates autonomy as confidence in the entity's consistency grows.

---

## 6. Creator-Entity Relationship

### 6.1 The Entity Is Not a Puppet

The director model means the entity has interpretive latitude. When a creator issues a Directive, the entity does not execute it verbatim. The DecisionFrame (Part 3, primitive 13) assembles the Directive alongside the entity's IdentityCore, active Mood, current Arc phase, relevant Memories, and all Guardrails. The `performance.Generator` produces output from this full context, not from the Directive alone.

This is by design. A puppet produces exactly what the creator commands and nothing more. A directed character produces output that is consistent with its identity while incorporating the creator's direction. The result is more authentic, more surprising, and more sustainable at scale.

### 6.2 Balancing Creator Authority with Entity Coherence

The system balances control and coherence through a clear hierarchy:

1. **Guardrails** are supreme (Invariant 5). No creator action, Directive, Mood, or Arc can override them.
2. **IdentityCore** is authoritative. It defines what the entity is. Directives that contradict core values are flagged as conflicts.
3. **Directives** are influential. They shape behavior within the space defined by Guardrails and IdentityCore.
4. **Mood** is modulatory. It adjusts intensity and affect without changing direction.
5. **Context** is situational. The Stage, audience, and interaction history provide the specific frame.

### 6.3 Identity Inconsistency Warnings

When a creator action would compromise entity coherence, the system pushes back:

**Directive-Identity tension:**
When `cognition.DirectiveResolver` creates a new Directive, it checks the instruction against IdentityCore values. If the Directive would push the entity to act against its ranked values, the system issues a warning:
```
Warning: Directive "always agree with audience opinions" conflicts with
IdentityCore value "intellectual honesty" (rank 1). The entity may produce
inconsistent output as it attempts to reconcile this tension.
Proceed anyway? [Yes / Revise Directive]
```

This is a warning, not a block. The creator has authority to override -- but the system makes the tension explicit.

**Trait-Identity tension:**
When a creator manually sets a Trait value that falls outside the range implied by IdentityCore values, `identity.TraitEngine` warns:
```
Warning: Setting "agreeableness" to 0.9 conflicts with IdentityCore
core_tension {pole_a: "diplomacy", pole_b: "directness", default_balance: 0.3}.
Current tension balance suggests agreeableness should be in range [0.2, 0.5].
```

**Arc-Identity tension:**
When an Arc's target traits would move the entity far from its IdentityCore baseline, `state.ArcDirector` warns at Arc creation time. This is expected for dramatic arcs -- the warning ensures the creator is making a deliberate narrative choice, not an accidental one.

### 6.4 The "Notes from the Showrunner" Model

Directives function like notes from a showrunner to a performer. The showrunner says "I want to see more vulnerability in this scene." The performer interprets that through their own craft, training, and understanding of the character. The result is a collaboration, not dictation.

In practice, this means:

- Directives should be intentional, not prescriptive. "Show more vulnerability" rather than "say the words 'I feel sad.'"
- The entity's interpretation of a Directive is itself a signal. If the entity consistently interprets a Directive in an unexpected way, it may indicate a tension between the Directive and the IdentityCore that the creator should resolve.
- Multiple Directives create a behavioral landscape, not a script. The entity navigates the landscape based on its own identity and current context.

---

## 7. Onboarding and Learning Curve

### 7.1 Minimum Viable Entity

The least a creator needs to define to get a functioning entity:

| Component | Required? | Minimum Input |
|---|---|---|
| IdentityCore | Yes | 1 value, 1 core tension, 1 recognition marker, worldview statement |
| Voice | Yes | Formality level, 3 sample utterances |
| Aesthetic | No | Null-aesthetic applied by default |
| Traits | No | Entity operates on IdentityCore alone |
| Guardrails | Auto | System Safety Guardrails created automatically |
| Stage | Yes (for performing) | At least 1 Stage configured |
| Lore | No | Entity starts with no backstory |
| Directives | No | Entity operates on identity alone |

An entity created with only the minimum required inputs can produce performances immediately. The output quality depends entirely on the richness of the IdentityCore and Voice definitions.

### 7.2 Progressive Disclosure

The control surface reveals complexity gradually. The onboarding sequence:

**Level 1: Identity (Day 1)**
Creator defines IdentityCore and Voice. Entity can produce basic performances. Dashboard shows Entity Health Overview and Recent Performances.

**Level 2: Direction (Week 1)**
After the creator has seen the entity perform and has a feel for its baseline behavior, the system introduces Directives. The Active Directives Panel appears on the dashboard. The creator learns to shape behavior without modifying identity.

**Level 3: Narrative (Week 2-4)**
After the creator is comfortable with Directives, the system introduces Arcs and Lore. The Arc Progress Visualization and Lore Graph panels appear. The creator learns to script long-term character development.

**Level 4: Production (Month 1+)**
After the creator has managed at least one Arc, the system introduces Campaigns, multi-Stage coordination, and Epochs. The Campaign Timeline View appears. The creator is now operating at the orchestration layer.

**Level 5: Autonomy (Month 2+)**
After the creator has established trust in entity consistency (measured by sustained high scores from `evaluation.HealthAggregator`), the system suggests increasing entity autonomy levels and introduces DriftRules for organic trait evolution.

Each level is unlocked by usage, not by time. A creator who immediately configures an Arc skips ahead. The system never restricts access to features -- it controls their visibility in the dashboard.

### 7.3 Template Entities

Pre-built templates provide starting points for common entity archetypes. Each template includes a complete IdentityCore, Voice, initial Traits, and suggested Guardrails.

| Template | Archetype | Key Traits | Voice Style |
|---|---|---|---|
| **The Analyst** | Data-driven expert who explains complex topics | `analytical: 0.9, warmth: 0.4, humor: 0.3` | Precise, measured, evidence-first |
| **The Provocateur** | Contrarian who challenges assumptions | `boldness: 0.8, empathy: 0.5, humor: 0.7` | Sharp, rhetorical, confrontational |
| **The Companion** | Warm, supportive conversational presence | `warmth: 0.9, curiosity: 0.6, assertiveness: 0.3` | Casual, encouraging, personal |
| **The Storyteller** | Narrative-driven entity that thinks in stories | `creativity: 0.9, structure: 0.5, warmth: 0.6` | Vivid, metaphorical, paced |
| **The Curator** | Tastemaker who surfaces and contextualizes | `discernment: 0.9, generosity: 0.6, humor: 0.4` | Concise, opinionated, referential |

Templates are starting points, not constraints. The creator can modify any field after creation. The template's IdentityCore becomes the entity's initial IdentityCore (version `0.1.0`), fully subject to the standard versioning and immutability rules.

Templates are stored in the Configuration Store and managed by `identity.EntityStore`. Creators can also save their own entities as templates for reuse.

### 7.4 Entity Import/Export

Entities can be exported and imported for sharing, backup, and collaboration.

**Export:**
`evolution.SnapshotService` creates a Snapshot and packages it with:
- Full SerializedEntityState
- IdentityCore version history
- Active Directives and Guardrails
- Lore graph (all entries, including Rejected, for completeness)
- Arc definitions (including completed Arcs, for narrative history)
- Epoch history

The export is a self-contained package. It does not include Memory (which is context-specific and non-transferable), Relationships (which reference external entities/users), or Performance history (which references specific Stages).

**Import:**
`identity.EntityStore` creates a new Entity from the import package:
- New UUID is assigned (the imported entity is a distinct entity, not a clone)
- Version is reset to `0.1.0`
- Safety Guardrails are re-applied from system defaults
- The creator can review and modify all imported primitives before activation

**Use cases:**
- A creator shares an entity template with another creator
- A studio distributes entity archetypes to team members
- A creator backs up an entity before a risky identity change
- A creator forks an entity to experiment with a different direction

---

## Appendix: Control Surface Summary

| Layer | Primitives | Modules | Change Cadence |
|---|---|---|---|
| Strategic | IdentityCore, Voice, Aesthetic, Guardrail, Trait (definition) | `identity.IdentityCoreManager`, `identity.VoiceRegistry`, `identity.AestheticRegistry`, `cognition.GuardrailEnforcer`, `identity.TraitEngine` | Rarely (version changes) |
| Narrative | Arc, Directive, Lore, Epoch | `state.ArcDirector`, `cognition.DirectiveResolver`, `identity.LoreGraph`, `evolution.EpochManager` | Periodically (weekly/monthly) |
| Tactical | Mood, Campaign, Performance (review), Snapshot (manual) | `state.MoodController`, `orchestration.CampaignPlanner`, `orchestration.Scheduler`, `performance.Evaluator`, `evolution.SnapshotService` | Frequently (daily/hourly) |

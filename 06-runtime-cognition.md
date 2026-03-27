# Part 6: Runtime & Cognition

**Status:** NORMATIVE
**Depends on:** Part 3 (Framework Primitives), Part 5 (System Architecture)
**Version:** 1.0.0
**Date:** 2026-03-15

---

## 1. The Decision Stack

Every entity action -- whether responding to a user, executing a scheduled post, or participating in a campaign -- traverses the same eleven-step pipeline. No shortcuts. No alternative paths. This determinism is what makes entity behavior auditable.

### Complete Runtime Flow

```
TRIGGER (user message / schedule tick / campaign event)
  |
  +-> 1. CONTEXT RESOLUTION
  +-> 2. MEMORY RETRIEVAL
  +-> 3. DIRECTIVE RESOLUTION
  +-> 4. FRAME ASSEMBLY
  +-> 5. PERFORMANCE PLANNING
  +-> 6. CONTENT GENERATION
  +-> 7. GUARDRAIL EVALUATION
  +-> 8. QUALITY EVALUATION
  +-> 9. PUBLISH or REGENERATE
  +-> 10. SIDE EFFECTS
  +-> 11. EVENT EMISSION
```

### Step-by-Step Specification

---

#### Step 1: Context Resolution

**Module:** API Gateway + `media.StageManager`

**Inputs:**
- Raw trigger event (HTTP request, WebSocket message, scheduler tick, campaign event)

**Outputs:**
- `entity_id: UUID` -- which entity should act
- `stage_id: UUID` -- which Stage this performance will occur on
- `interaction_type: Proactive | Reactive | Scheduled`
- `InteractionContext` (Part 3 primitive) -- fully populated

**Process:**
1. Parse the trigger source. Extract entity identifier and stage identifier.
2. Validate entity exists and has `status: Active` via `identity.EntityStore`.
3. Validate stage exists and has `is_active: true` via `media.StageManager`.
4. Construct `InteractionContext`:
   - For **Reactive**: `trigger` = user message content, `history` = recent conversation turns, `audience` = derived from platform context.
   - For **Scheduled**: `trigger` = schedule brief, `history` = empty, `audience` = derived from Stage.StageAudienceSpec.
   - For **Proactive** (campaign): `trigger` = campaign content_brief, `history` = prior campaign performances, `audience` = from campaign strategy.

**Failure modes:**
- Entity not found or archived: return `404 Entity Not Found`.
- Stage not found or inactive: return `404 Stage Not Found`.
- Entity status is Dormant: return `409 Entity Dormant`.

**Timeout:** 500ms. Context resolution is a fast lookup operation.

---

#### Step 2: Memory Retrieval

**Module:** `cognition.MemoryRetriever` (delegates to `state.MemoryManager`)

**Inputs:**
- `entity_id: UUID`
- `InteractionContext` (from Step 1)
- `max_memory_entries: Int` (from entity config, default 20)

**Outputs:**
- `List<ScoredMemory>` -- ranked by composite score, capped at `max_memory_entries`

**Process:**
1. Generate embedding vector from `InteractionContext.trigger` content.
2. Query vector DB for semantically similar memories.
3. Score each candidate:
   ```
   composite_score = (0.5 * vector_similarity)
                   + (0.3 * importance)
                   + (0.2 * recency_factor)
   ```
4. Apply recall boost: each retrieved memory gets `importance += recall_boost`.
5. Sort by composite_score descending, take top `max_memory_entries`.
6. Include all three memory types: episodic, semantic, relational.

**Failure modes:**
- Vector DB unavailable: fall back to document-based retrieval (most recent + highest importance). Log warning.
- No memories found: return empty list. This is valid for new entities.

**Timeout:** 2000ms. Vector search is the most latency-sensitive step. If timeout, proceed with empty memory set and log degradation.

---

#### Step 3: Directive Resolution

**Module:** `cognition.DirectiveResolver`

**Inputs:**
- `entity_id: UUID`
- `stage_id: UUID`
- `session_id: UUID | null`

**Outputs:**
- `List<Directive>` -- filtered by scope, sorted by priority descending

**Process:**
1. Load all directives with `status: Active` for this entity.
2. Filter by scope:
   - `Global` directives: always included.
   - `Context(stage_id)` directives: included only if `stage_id` matches.
   - `Session(session_id)` directives: included only if `session_id` matches.
3. Check expiration: any `ExpiresAt` directive past its date is marked `Expired` and excluded. Any `SingleUse` directive that has been consumed is marked `Expired` and excluded.
4. Sort remaining by `priority` descending.
5. Run conflict detection on the active set. If conflicts exist, the higher-priority directive wins. Lower-priority conflicting directive is suppressed for this frame (not permanently deactivated). Conflict is logged.

**Failure modes:**
- No active directives: valid. Entity operates from IdentityCore + defaults.
- All directives expired: same as no directives. Expiration is processed and logged.

**Timeout:** 500ms.

---

#### Step 4: Frame Assembly

**Module:** `cognition.FrameAssembler`

**Inputs:**
- `entity_id: UUID`
- `InteractionContext` (from Step 1)
- `List<ScoredMemory>` (from Step 2)
- `List<Directive>` (from Step 3)
- `stage_id: UUID`

**Outputs:**
- `DecisionFrame` (Part 3 primitive, immutable once assembled)

**Process:**
1. Load `IdentityCore` via `identity.IdentityCoreManager.GetIdentityCore(entity_id)`.
2. Load current `Mood` via `state.MoodController.GetCurrentMood(entity_id)`. May be null (baseline).
3. Compute effective trait values via `identity.TraitEngine.ApplyMoodModulation(traits, mood)`. Mood modifiers are additive, then clamped to trait range.
4. Compute effective Voice via `identity.VoiceRegistry.GetEffectiveVoice(entity_id, mood)`. Voice modulation shifts are applied within [-0.3, 0.3] bounds.
5. Compute effective Aesthetic via `identity.AestheticRegistry.GetEffectiveAesthetic(entity_id, mood)`.
6. Load all active Guardrails via `cognition.GuardrailEnforcer.GetActiveGuardrails(entity_id)`.
7. Load current Arc phase via `state.ArcDirector.GetActiveArc(entity_id)`. May be null.
8. Load relevant Relationships via `state.RelationshipTracker`. For reactive interactions, load relationship with the interacting user/entity. For broadcast, load top relationships by familiarity.
9. Load Stage via `media.StageManager.GetStage(stage_id)`.
10. Assemble all components into a `DecisionFrame`. Assign UUID, set `assembled_at` timestamp.
11. Serialize frame to Performance Log for audit (Invariant 9).

**Invariants enforced:**
- DecisionFrame completeness (Invariant 8): assembly fails if IdentityCore, Guardrails, or Stage are missing.
- Frame immutability: the returned frame is a frozen snapshot. No mutation allowed after assembly.

**Failure modes:**
- IdentityCore missing: fatal. Return `500 Entity Integrity Error`. This should never happen for an Active entity (Invariant 1).
- Stage missing: fatal. Return `404 Stage Not Found`.
- Guardrails empty: fatal. Every entity must have at least one Safety guardrail (Invariant 1).

**Timeout:** 3000ms total for assembly. Individual sub-lookups have their own timeouts.

---

#### Step 5: Performance Planning

**Module:** `performance.Planner`

**Inputs:**
- `DecisionFrame` (from Step 4)

**Outputs:**
- `PerformancePlan { intent, content_type, tone_target, key_points, constraints }`

**Process:**
1. **Intent derivation:**
   - If reactive: intent = respond to the user's message in a way consistent with IdentityCore.
   - If proactive/scheduled: intent = from schedule content_brief or campaign strategy.
   - Active directives shape intent: highest-priority directive's instruction is the primary modifier.
   - Arc phase context shapes intent: current phase description provides narrative direction.

2. **Content type selection:**
   - Determined by Stage.FormatSpec.content_types and interaction context.
   - If Stage supports only Text, content_type = Text.
   - If mixed, Planner selects based on directive instructions and interaction type.

3. **Tone calculation:**
   - Start from Voice.EmotionalRegisterSpec.baseline_intensity.
   - Apply Mood.voice_mods (intensity_shift, humor_shift, formality_shift).
   - Factor in audience size: larger audiences pull tone toward baseline (less personal).
   - Factor in relationship: known targets with high familiarity allow more casual tone.

4. **Key point extraction:**
   - From active directives: instruction text parsed for required content elements.
   - From campaign brief: scheduled performance content_brief.
   - From interaction context: elements of the user's message that must be addressed.

5. **Constraint aggregation:**
   - Stage format constraints (max_length, threading rules, media requirements).
   - Guardrail-derived constraints (content restrictions).
   - Platform rules from Stage.platform_rules.

**Failure modes:**
- None of the above steps can fail fatally. Worst case: a minimal plan with intent = "respond appropriately" and no key points.

**Timeout:** 1000ms.

---

#### Step 6: Content Generation

**Module:** `performance.Generator`

**Inputs:**
- `DecisionFrame` (from Step 4)
- `PerformancePlan` (from Step 5)

**Outputs:**
- `PerformanceOutput { content, format, metadata, token_count }`

**Process:**
1. Construct structured LLM prompt from frame + plan (see Section 3: The Generation Contract).
2. Set LLM parameters:
   - Temperature: derived from entity's trait values (higher curiosity = slightly higher temperature).
   - Max tokens: derived from Stage.FormatSpec.max_length.
   - Stop sequences: stage-specific (e.g., newline for single-tweet output).
3. Call LLM service.
4. Parse LLM output into PerformanceOutput structure.
5. Apply format transformations via `media.FormatTransformer` if needed (truncation, thread splitting, media attachment).
6. Populate metadata (stage-specific fields like hashtags, alt text).

**Failure modes:**
- LLM call fails (network error, rate limit): retry with exponential backoff up to 3 times. If all retries fail, mark Performance as `Failed` and emit `performance.failed` event.
- LLM returns empty output: treat as failure, retry.
- LLM returns output exceeding format constraints: pass to `media.FormatTransformer` for truncation/splitting.

**Timeout:** 30000ms (30 seconds). LLM inference is the slowest step.

---

#### Step 7: Guardrail Evaluation

**Module:** `cognition.GuardrailEnforcer`

**Inputs:**
- `entity_id: UUID`
- `PerformanceOutput` (from Step 6)
- `List<Guardrail>` (from DecisionFrame)

**Outputs:**
- `GuardrailResult { pass, violations, action }`

**Process:**
1. For each active Guardrail, call its `evaluator` function with the output content.
2. Each evaluator returns pass/fail and a description if failed.
3. Aggregate results:
   - If any `Block`-enforcement guardrail fails: `action = Regenerate` (or `Block` if at max_attempts).
   - If only `Warn`-enforcement guardrails fail: `action = Publish` with warnings logged.
   - If only `FlagForReview`-enforcement guardrails fail: `action = FlagForReview` (published but queued for creator review).
   - If all pass: `action = Publish`.

**Failure modes:**
- Evaluator function crashes: treat as guardrail fail with `Block` enforcement. Conservative default.
- Evaluator timeout: treat as fail. 5000ms per evaluator.

**Timeout:** 10000ms total (all evaluators run in parallel).

---

#### Step 8: Quality Evaluation

**Module:** `performance.Evaluator` (delegates to `evaluation.IdentityEvaluator`, `evaluation.VoiceAnalyzer`)

**Inputs:**
- `PerformanceOutput` (from Step 6)
- `DecisionFrame` (from Step 4)
- `PerformancePlan` (from Step 5)
- `GuardrailResult` (from Step 7)

**Outputs:**
- `EvaluationResult` (Part 3 primitive)

**Process:**
1. If guardrail evaluation returned `Regenerate` or `Block`: short-circuit quality evaluation. Set `publish_decision` accordingly.
2. Score identity consistency via `evaluation.IdentityEvaluator.ScoreIdentityConsistency(output, frame.identity_core)`.
3. Score voice consistency via `evaluation.VoiceAnalyzer.ScoreVoiceConsistency(output, frame.voice)`.
4. Compute quality_score: `0.4 * identity_consistency + 0.3 * voice_consistency + 0.3 * (1.0 if guardrails pass else 0.0)`.
5. Decision logic:
   - `quality_score >= 0.6` AND guardrails pass: `Publish`.
   - `quality_score < 0.6` AND `generation_attempts < max_attempts`: `Regenerate`.
   - `generation_attempts >= max_attempts`: `Block` (prevent infinite regeneration loops).

**Failure modes:**
- Identity evaluator fails: use default score of 0.5 and log warning.
- Voice analyzer fails: use default score of 0.5 and log warning.

**Timeout:** 10000ms.

---

#### Step 9: Publish or Regenerate

**Module:** `performance.Publisher` (for publish) or loop back to Step 6 (for regenerate)

**Publish path:**
1. Look up Adapter via `media.AdapterRegistry.GetAdapter(stage_id)`.
2. Call `Adapter.validate(output)`. If invalid, attempt format correction via `media.FormatTransformer`.
3. Call `Adapter.publish(output)`. Returns `PublishResult`.
4. Record `platform_id` and `url` in Performance metadata.
5. Set Performance `status: Published`, record `published_at`.
6. Serialize complete Performance (including DecisionFrame ID) to Performance Log.

**Regenerate path:**
1. Increment `generation_attempts` counter.
2. If `generation_attempts >= max_attempts`: set `status: Blocked`, emit `performance.blocked` event. Stop.
3. Append guardrail violations and quality notes to the generation context (so the LLM can avoid the same mistakes).
4. Loop back to Step 6 (Content Generation) with augmented context.

**Block path:**
1. Set Performance `status: Blocked`.
2. Log full details: all attempts, all evaluation results, all guardrail violations.
3. Emit `performance.blocked` event with details.
4. Notify creator if configured.

**Failure modes:**
- Adapter publish fails (platform API error): retry once. If still fails, set `status: Failed`, emit `performance.failed`.
- Adapter not found for stage: fatal configuration error. Set `status: Failed`.

**Timeout:** 15000ms for publish (platform API calls can be slow).

---

#### Step 10: Side Effects

**Module:** `performance.SideEffectProcessor`

**Inputs:**
- `Performance` (completed, published or blocked)
- `DecisionFrame` (from Step 4)

**Outputs:**
- `SideEffects` (Part 3 primitive, embedded in Performance)

**Process:** (Only executed for `Published` performances. Blocked performances skip side effects.)

1. **Memory creation:**
   - Create `EpisodicEntry` summarizing what the entity did and the context.
   - `emotional_valence` derived from the performance's tone and audience response (if available).
   - `importance` derived from interaction significance (replied to known target = higher importance).
   - Store via `state.MemoryManager.StoreEpisodicMemory()`.

2. **Mood update:**
   - Evaluate whether the interaction warrants a mood change.
   - High-conflict interactions may trigger "frustrated" or "defensive" mood.
   - Highly positive engagement may trigger "energized" mood.
   - Mood change is optional -- most performances do not change mood.
   - If triggered, call `state.MoodController.SetMood()`.

3. **Relationship updates:**
   - If the interaction involved a known target (user or entity with existing Relationship):
     - Determine event type (positive_interaction, negative_interaction, etc.).
     - Call `state.RelationshipTracker.FireDynamicRules(relationship_id, event)`.
   - If the interaction involved an unknown target and interaction_count now exceeds auto-creation threshold:
     - Call `state.RelationshipTracker.CreateRelationship()`.

4. **Trait nudges:**
   - Minor, bounded adjustments to traits based on the experience.
   - Example: a performance that required high directness may nudge `directness` by +0.005.
   - Nudges are clamped to Trait range and are small enough to not be individually noticeable (max nudge: 0.01 per performance).

**Failure modes:**
- Memory store failure: log error, do not fail the overall performance. Memory creation is best-effort.
- Relationship update failure: log error, continue.

**Timeout:** 5000ms. Side effects are non-blocking relative to the published output.

---

#### Step 11: Event Emission

**Module:** Event Bus

**Events emitted:**
- `performance.published { entity_id, performance_id, stage_id, timestamp }`
- `performance.blocked { entity_id, performance_id, reason, attempts, timestamp }` (if blocked)
- `performance.failed { entity_id, performance_id, error, timestamp }` (if failed)
- `state.memory_created { entity_id, memory_id }` (from side effects)
- `state.mood_changed { entity_id, old_mood, new_mood }` (if mood changed)
- `state.relationship_updated { entity_id, relationship_id, changes }` (if relationship updated)

**Consumers:** `evaluation.HealthAggregator`, `orchestration.CampaignPlanner` (tracks campaign progress), external webhooks (if configured).

---

## 2. Frame Assembly Deep Dive

### How `cognition.FrameAssembler` Works Step by Step

The FrameAssembler is the most critical module in the system. It produces the single artifact -- the DecisionFrame -- that determines everything the entity does. This section details its internal logic.

### Memory Retrieval Algorithm

`cognition.MemoryRetriever` implements a three-factor scoring model:

```
composite_score(memory, query) =
    similarity_weight * cosine_similarity(embed(memory.content), embed(query))
  + importance_weight * memory.importance
  + recency_weight   * exp(-lambda * hours_since(memory.last_recalled))
```

**Default weights:**
| Parameter | Value | Rationale |
|---|---|---|
| `similarity_weight` | 0.5 | Relevance to current context is primary |
| `importance_weight` | 0.3 | High-importance memories surface even if tangentially relevant |
| `recency_weight` | 0.2 | Recent events slightly favored but do not dominate |
| `lambda` (decay constant) | 0.005 | Half-life of ~139 hours (~6 days) for recency factor |

**Memory type prioritization:**
- RelationalEntry memories about the current interaction target are boosted by +0.2 composite score (they are almost always relevant).
- SemanticEntry memories are never boosted -- they must earn relevance through similarity.
- EpisodicEntry memories from the same Stage are boosted by +0.05 (platform context matters).

**Retrieval cap:** `max_memory_entries` (default 20). This prevents the DecisionFrame from becoming too large for the LLM context window.

### Directive Conflict Resolution

When two or more active Directives conflict:

1. **Priority ordering:** higher `priority` value wins. The lower-priority directive is suppressed for this frame only (it remains Active for future frames).
2. **Equal priority:** both directives are included. The LLM receives both instructions and must balance them. This is intentional -- some creative tension between directives is productive.
3. **Scope narrowing:** a `Context(stage_id)` directive overrides a `Global` directive of equal priority when the context matches. Specific beats general.
4. **Creator notification:** when conflicts are detected, the system logs a `ConflictReport` and emits a `cognition.directive_conflict` event. The creator can resolve by revoking or reprioritizing.

**Conflict detection heuristic:** Two directives conflict if:
- They reference the same behavioral dimension (e.g., both specify tone requirements that contradict).
- Conflict detection uses LLM-based semantic comparison of instruction texts.
- Results are cached -- re-detection only runs when directives change.

### Guardrail Pre-Filtering

Not all Guardrails need re-evaluation on every frame. The FrameAssembler categorizes them:

- **Always included:** All Safety-category Guardrails. All Guardrails with `enforcement: Block`.
- **Context-specific:** Brand and CreatorDefined Guardrails may be tagged with stage applicability. If a Guardrail is only relevant to visual content, it is excluded from text-only Stages.
- **All included in frame:** Even context-filtered Guardrails are listed in the DecisionFrame for auditability. They are marked with a `context_relevant: Boolean` flag that `cognition.GuardrailEnforcer` uses to skip evaluation.

### Frame Immutability Guarantee

Once `cognition.FrameAssembler` returns a DecisionFrame:

1. The frame object is frozen. No field can be modified.
2. If entity state changes during generation (e.g., a new directive is created, mood decays), those changes are NOT reflected in the current frame. They take effect in the next frame assembly.
3. The frame is serialized to the Performance Log before generation begins.
4. The generation pipeline receives a read-only reference.

This guarantee means that for any published Performance, the exact DecisionFrame that produced it can be reconstructed from the audit log. This is the foundation of Invariant 9 (Performance auditability).

---

## 3. The Generation Contract

This section specifies exactly what goes to the LLM and how entity state is encoded in the prompt.

### Structured Prompt Template

```
<system>
You are {entity_name}. You are not an AI assistant. You are a persistent
creative identity with specific values, voice, and perspective. Every word
you produce must be recognizably yours.

## Your Identity Core
{identity_core_section}

## Your Voice
{voice_section}

## Your Current Traits
{traits_section}

## Your Current Mood
{mood_section}

## Your Relevant Memories
{memories_section}

## Your Active Directives
{directives_section}

## Hard Constraints (Guardrails)
{guardrails_section}

## Current Narrative Arc
{arc_section}

## Relationships Relevant to This Interaction
{relationships_section}

## Stage Constraints
{stage_section}
</system>

<plan>
## Performance Plan
Intent: {plan.intent}
Content type: {plan.content_type}
Target tone: {plan.tone_target}
Key points to address:
{plan.key_points}
Format constraints:
{plan.constraints}
</plan>

<context>
## Interaction Context
Type: {interaction.type}
Trigger: {interaction.trigger}
Audience: {interaction.audience}
Conversation history:
{interaction.history}
</context>

<instruction>
Produce your response now. Stay in character. Adhere to your voice
specification. Respect all guardrails. Address the key points from
the performance plan. Match the format constraints of the stage.
</instruction>
```

### Section Encoding Details

**IdentityCore encoding (`identity_core_section`):**
```
Values (ranked by importance):
1. {value.name} (weight: {value.weight}): {value.expression}
2. ...

Worldview:
- Orientation: {worldview.orientation}
- Beliefs: {belief.claim} (confidence: {belief.confidence})
- Blind spots: {blind_spots}

Core tensions:
- {tension.pole_a} vs. {tension.pole_b} (balance: {tension.balance})

Recognition markers (things people say "that's so you" about):
- {marker}
```

**Voice encoding (`voice_section`):**
```
Vocabulary:
- Preferred terms: {term} (because: {reason})
- Avoided terms: {list}
- Jargon domains: {list}
- Formality level: {formality_level}/1.0
- Profanity: {profanity_stance}

Sentence structure:
- Target length: {avg_sentence_length} words
- Complexity: {complexity_preference}
- Fragment frequency: {fragment_frequency}

Rhetoric:
- Primary devices: {primary_devices}
- Avoided devices: {avoided_devices}
- Argument style: {argument_style}
- Humor: {humor_type}

Emotional expression:
- Baseline intensity: {baseline_intensity}
- Current intensity: {baseline_intensity + mood shift}
- Express readily: {preferred_emotions}
- Suppress: {suppressed_emotions}

Reference utterances (match this style):
- "{sample_utterance.text}" (context: {sample_utterance.context})
```

**Traits encoding (`traits_section`):**
```
Current trait values (mood-adjusted):
- {trait_name}: {effective_value}/1.0 (base: {base_value}, mood modifier: {mod})
  Affects: {trait.affects}
```

**Mood encoding (`mood_section`):**
```
Current mood: {mood.state} (intensity: {mood.intensity}/1.0)
Trigger: {mood.trigger.source}
This mood makes you: {derived behavioral description from trait_mods and voice_mods}
```
If mood is null: `"You are at your emotional baseline. No particular mood is active."`

**Memories encoding (`memories_section`):**
```
Relevant memories (ranked by relevance):
1. [{memory_type}] {memory.content} (importance: {importance}, from: {context})
2. ...
```

**Directives encoding (`directives_section`):**
```
Active instructions from your creator (in priority order):
1. [Priority {priority}] {instruction}
   Rationale: {rationale}
2. ...
```

**Guardrails encoding (`guardrails_section`):**
```
ABSOLUTE CONSTRAINTS - You must NEVER violate these:
- {guardrail.constraint} [{guardrail.category}]
- ...
```

**Arc encoding (`arc_section`):**
```
You are currently in the "{arc.name}" narrative arc, phase: "{phase.name}".
Phase description: {phase.description}
Mood tendency for this phase: {phase.mood_tendency}
```
If no active arc: `"No narrative arc is currently active. Operate from baseline identity."`

**Relationships encoding (`relationships_section`):**
```
Your relationship with {target_name}:
- Label: {relationship.label}
- Sentiment: {sentiment} ({sentiment_description})
- Trust: {trust}
- Familiarity: {familiarity}
- History: {history_summary}
```

**Stage encoding (`stage_section`):**
```
Platform: {stage.platform}
Format: {format_constraints_natural_language}
Audience: {audience.expectation}
Platform rules: {platform_rules}
```

### Prompt Structure and Output Quality

The ordering of sections in the prompt is deliberate:

1. **Identity first:** IdentityCore and Voice are at the top because they should have the strongest influence on output. LLMs weight earlier context more heavily.
2. **State second:** Traits and Mood modify the baseline identity. They come after identity so the LLM understands what is being modified.
3. **Context third:** Memories and Relationships provide situational awareness. They inform content but should not override identity.
4. **Directives fourth:** Creator instructions shape what the entity focuses on, but should be filtered through identity (not override it).
5. **Guardrails fifth:** Hard constraints are placed where they serve as a final checkpoint before the response instruction.
6. **Plan and context last:** The specific task (what to respond to, in what format) comes at the end, closest to the response, so the LLM has maximum context when generating.

---

## 4. Multi-Turn Cognition

### Session State Management

A multi-turn conversation is tracked via a `session_id`. The session maintains:

```
Session {
  id:              UUID
  entity_id:       UUID
  stage_id:        UUID
  started_at:      ISO8601
  turns:           List<Turn>
  active_frame:    DecisionFrame | null
  frame_age:       Int              -- number of turns since last frame assembly
  max_frame_age:   Int              -- reassemble after this many turns (default: 5)
}

Turn {
  role:       User | Entity
  content:    String
  timestamp:  ISO8601
  performance_id: UUID | null   -- for entity turns
}
```

### Turn-by-Turn Memory Accumulation

Within a session:

1. **Short-term context:** The conversation history (all turns) is included in `InteractionContext.history` for every frame within the session. This provides immediate conversational coherence.
2. **Memory creation is deferred:** Episodic memories are not created after every turn. Instead, a session summary is created when the session ends (or after a configurable idle timeout, default 30 minutes).
3. **Mid-session memories:** If a particularly significant event occurs mid-session (detected by importance heuristic), an episodic memory may be created immediately.

### Coherence Across a Conversation Thread

Coherence is maintained through three mechanisms:

1. **Conversation history in frame:** All prior turns are included in `InteractionContext.history`, giving the LLM full conversational context.
2. **Frame reuse:** The DecisionFrame is not reassembled on every turn. It is reused for `max_frame_age` turns to maintain consistency in identity expression within a conversation.
3. **Turn-aware planning:** `performance.Planner` adjusts its plan based on turn position. Early turns in a conversation may be more exploratory; later turns may be more focused.

### When to Re-Assemble the DecisionFrame Mid-Conversation

The frame is reassembled when:

1. **Turn count exceeds `max_frame_age`:** After 5 turns (default), the frame is stale. New memories, mood changes, or directive changes may have occurred.
2. **Mood change detected:** If a side effect from a turn triggers a mood change, the frame is reassembled on the next turn to reflect the new mood.
3. **Directive change:** If a creator adds, revokes, or modifies a directive during the session, the frame is reassembled.
4. **Explicit reassembly request:** The creator can force frame reassembly via the Admin API.
5. **Topic shift detected:** If the conversation topic changes significantly (measured by embedding distance between consecutive turns exceeding a threshold), the frame is reassembled to retrieve relevant memories for the new topic.

---

## 5. Proactive vs. Reactive Cognition

### Reactive Cognition

**Trigger:** An external event -- a user message, a mention, a reply, a DM.

**Flow:** Standard Decision Stack (Steps 1-11).

**InteractionContext construction:**
```yaml
type: Reactive
trigger: "{user_message_content}"
audience:
  size: {derived from platform context}
  familiarity: {from Relationship if exists, else 0.0}
  context: "{platform and thread context}"
history: [{prior turns in this thread}]
```

**Characteristics:**
- Entity is responding TO something. The user's message shapes the response.
- Memory retrieval is anchored to the user's message content.
- Response time expectations are higher (users expect timely replies).

### Proactive Cognition

**Trigger:** Internal -- a schedule tick, a campaign event, or an "internal drive" evaluation.

**Flow:** Standard Decision Stack, but Step 1 (Context Resolution) constructs the InteractionContext differently.

#### Schedule-Driven Proactive

Triggered by `orchestration.Scheduler` when a scheduled performance is due.

```yaml
type: Scheduled
trigger: "{content_brief from schedule}"
audience:
  size: {from Stage.StageAudienceSpec}
  familiarity: {average familiarity of stage audience}
  context: "{stage audience expectation}"
history: []  # no conversation history for proactive
```

#### Campaign-Driven Proactive

Triggered by `orchestration.CampaignPlanner` when a `ScheduledPerformance` is due.

```yaml
type: Proactive
trigger: "{ScheduledPerformance.content_brief}"
audience:
  size: {from campaign.strategy.audience_targets}
  familiarity: {derived}
  context: "{campaign.strategy.objective}"
history: [{prior campaign performances, summarized}]
```

**Coherence rules** from the Campaign are checked by `orchestration.CampaignPlanner.EvaluateCoherenceRules()` after generation, before publication. If a Hard coherence rule fails, the performance is regenerated.

#### Organically-Driven Proactive

Not campaign or schedule -- the entity decides on its own that it has something to say. This is the most advanced proactive mode.

**Trigger evaluation** (runs periodically, e.g., every 4 hours):
1. `evaluation.HealthAggregator` checks entity state.
2. If the entity has accumulated significant new semantic memories since last proactive performance, AND the Stage timing window is appropriate, AND rate limits are not exceeded:
3. Generate a content_brief from the accumulated semantic memories.
4. Submit as a Scheduled-type performance.

```yaml
type: Scheduled
trigger: "{auto-generated content brief from recent semantic memories}"
audience:
  size: Broadcast
  familiarity: {stage average}
  context: "Organic proactive -- entity has something to say"
history: []
```

---

## 6. Multi-Entity Cognition

### How Two or More Entities Interact

When entities interact with each other (e.g., a public conversation between two entity accounts), each entity processes the other's output as a Reactive trigger.

**Flow:**

```
Entity A receives trigger (external or proactive)
  -> Entity A performs (Decision Stack, Steps 1-11)
  -> Entity A's output is delivered to Stage

Entity B detects Entity A's output (via Stage monitoring or explicit routing)
  -> Entity B's Context Resolution identifies Entity A as the trigger source
  -> Entity B loads its Relationship with Entity A
  -> Entity B performs (Decision Stack, Steps 1-11)
  -> Entity B's output is delivered to Stage

Entity A detects Entity B's response
  -> Cycle continues
```

### Relationship-Aware Generation

When Entity B is responding to Entity A:

1. `state.RelationshipTracker` loads Entity B's Relationship with Entity A.
2. The Relationship's `label`, `sentiment`, `trust`, `familiarity`, and `history_summary` are included in the DecisionFrame.
3. The LLM prompt's relationship section encodes how Entity B feels about Entity A.
4. Dynamic rules fire post-performance, updating the Relationship based on the interaction event.

### Turn Ordering and Conversation Flow

Multi-entity conversations require explicit turn management to prevent both entities from talking simultaneously:

**Turn management protocol:**
1. A `ConversationCoordinator` (part of `orchestration.Scheduler`) manages turn order.
2. When Entity A publishes, a lock is set: "Entity B's turn" with a response window (e.g., 30 seconds to 5 minutes).
3. Entity B receives the trigger and performs.
4. After Entity B publishes, the lock flips: "Entity A's turn."
5. Maximum turns per conversation thread is configurable (default: 10) to prevent infinite exchanges.

### Preventing Echo Chambers and Degenerate Loops

Without intervention, two entities can fall into repetitive patterns -- agreeing on everything, repeating the same arguments, or escalating endlessly. Countermeasures:

1. **Repetition detection:** `evaluation.VoiceAnalyzer` tracks semantic similarity between consecutive turns. If similarity exceeds 0.85 for 3+ consecutive turns, the conversation is flagged and a `conversation.stale` event is emitted.

2. **Maximum turn limit:** Hard cap on turns per conversation thread (configurable, default 10). After the limit, no further performances are generated for that thread.

3. **Novelty injection:** When repetition is detected, the next frame assembly includes a system-level directive: "Introduce a new angle, concede a point, or gracefully exit this conversation."

4. **Escalation dampening:** If sentiment in both entities' Relationships is trending negative rapidly (delta > -0.1 per turn), a cooldown period is imposed (e.g., 1 hour before next response).

5. **Creator override:** Creators can manually end multi-entity conversations or inject directives to change their direction.

---

## 7. Cognitive Hooks

Hooks allow external code to intercept and modify the cognition pipeline at defined points. Hooks are registered per-entity and execute in registration order.

### Hook Types

#### Pre-Generation Hooks

**Execution point:** After frame assembly (Step 4), before performance planning (Step 5).

**Interface:**
```
PreGenerationHook {
  id:         UUID
  entity_id:  UUID
  name:       String
  handler:    Function(DecisionFrame) -> DecisionFrame
  priority:   Int           -- lower runs first
  is_active:  Boolean
}
```

**Use cases:**
- Injecting external context (news feeds, market data) into the frame.
- Modifying memory relevance scores based on external signals.
- Adding temporary directives based on real-time conditions.

**Constraints:**
- Pre-generation hooks may modify the DecisionFrame, but the modified frame is what gets logged for audit. The original frame is also retained.
- Hooks cannot remove Guardrails from the frame.
- Hook execution timeout: 5000ms per hook. Timeout = hook is skipped.

#### Post-Generation Hooks

**Execution point:** After content generation (Step 6), before guardrail evaluation (Step 7).

**Interface:**
```
PostGenerationHook {
  id:         UUID
  entity_id:  UUID
  name:       String
  handler:    Function(PerformanceOutput, DecisionFrame) -> PerformanceOutput
  priority:   Int
  is_active:  Boolean
}
```

**Use cases:**
- Content transformation (adding watermarks, inserting tracking pixels).
- External content filtering (third-party moderation APIs).
- A/B testing output variants.

**Constraints:**
- Post-generation hooks modify the output BEFORE guardrail evaluation. The guardrails still run on the modified output.
- Hooks cannot bypass guardrail evaluation.
- Hook execution timeout: 5000ms per hook.

#### Post-Publish Hooks

**Execution point:** After successful publication (Step 9), before side effects (Step 10).

**Interface:**
```
PostPublishHook {
  id:         UUID
  entity_id:  UUID
  name:       String
  handler:    Function(Performance, PublishResult) -> void
  priority:   Int
  is_active:  Boolean
}
```

**Use cases:**
- External analytics tracking.
- Cross-posting to additional platforms.
- Triggering external workflows (Zapier, webhooks).
- Updating external CRM or audience management systems.

**Constraints:**
- Post-publish hooks are fire-and-forget. Failures do not affect the performance.
- Hook execution timeout: 10000ms per hook. Timeout = logged and skipped.

### Hook Registration API

```
POST /api/v1/entities/{id}/hooks
{
  "type": "pre_generation | post_generation | post_publish",
  "name": "my_hook",
  "handler_url": "https://my-service/hook-endpoint",  // for webhook-style hooks
  "handler_module": "my_module.my_hook",               // for in-process hooks
  "priority": 100,
  "is_active": true
}

GET    /api/v1/entities/{id}/hooks                  List all hooks
GET    /api/v1/entities/{id}/hooks/{hook_id}        Get hook details
PATCH  /api/v1/entities/{id}/hooks/{hook_id}        Update hook (activate/deactivate)
DELETE /api/v1/entities/{id}/hooks/{hook_id}        Remove hook
```

**Execution order:** Hooks of the same type execute in ascending `priority` order. If two hooks have the same priority, registration order is used as tiebreaker.

---

## 8. Error Handling & Recovery

### LLM Call Failure

**Scenario:** `performance.Generator` cannot reach the LLM service or receives an error response.

**Recovery protocol:**
1. **Retry with backoff:** Up to 3 retries with exponential backoff (1s, 2s, 4s).
2. **Fallback model:** If the primary LLM is unavailable and a fallback model is configured, switch to fallback. Log the model switch.
3. **Graceful failure:** If all retries fail and no fallback is available:
   - For reactive interactions: return a minimal response acknowledging the interaction without generating full content. Use a pre-configured fallback response from the entity's Voice sample_utterances (select the one closest to the interaction context). Set Performance `status: Failed`.
   - For proactive/scheduled: silently skip. Reschedule for the next available window. Log the skip.
4. **Alert:** Emit `performance.failed` event. If failure rate exceeds threshold (default: 3 failures in 1 hour), emit `system.llm_degraded` alert.

### Guardrail Evaluation Repeated Failure

**Scenario:** Output fails guardrail evaluation on every attempt, and `max_attempts` is reached.

**Recovery protocol:**
1. Set Performance `status: Blocked`.
2. Log all attempts with their respective guardrail violations.
3. Emit `performance.blocked` event.
4. For reactive interactions:
   - If a pre-configured "safe fallback" response exists for this guardrail category, use it.
   - Otherwise, remain silent. A blocked reactive performance is better than a guardrail violation.
5. For proactive/scheduled: skip and log. Do not reschedule automatically -- creator review is needed.
6. If block rate exceeds threshold (default: 3 blocks in 24 hours for the same guardrail), emit `evaluation.guardrail_hotspot` alert to creator.

### Memory Retrieval Returns No Results

**Scenario:** `cognition.MemoryRetriever` returns an empty list. The entity has no relevant memories.

**Recovery protocol:**
1. This is not an error. New entities start with no memories.
2. The DecisionFrame is assembled with `relevant_memories: []`.
3. The LLM prompt's memory section reads: "You have no relevant memories for this interaction."
4. The entity generates from IdentityCore + Voice + Directives alone. Output quality may be lower (less grounded), but is still valid.
5. Identity consistency scoring in `evaluation.IdentityEvaluator` adjusts expectations: entities with zero memories are not penalized for lack of contextual references.

### Graceful Degradation Matrix

The system is designed so that an entity can always produce SOMETHING, even under degraded conditions. The following matrix shows what happens when each component is unavailable:

| Component Unavailable | Impact | Fallback |
|---|---|---|
| Memory Store | No contextual memories | Generate from identity + directives only |
| Mood Controller | No mood modulation | Use baseline trait values and Voice |
| Arc Director | No arc context | Operate without narrative arc |
| Relationship Tracker | No relationship context | Treat all targets as unknown |
| Directive Resolver | No creator directives | Operate from IdentityCore defaults |
| LLM Service | No content generation | Use fallback sample utterances or remain silent |
| Vector DB | No similarity search | Fall back to most-recent + highest-importance memories |
| Adapter / Platform API | Cannot publish | Queue for retry, emit failed event |
| Evaluation service | No quality scoring | Publish if guardrails pass (skip quality score) |

**Minimum viable performance:** An entity needs only its IdentityCore, at least one Guardrail, a Stage, and the LLM service to produce output. Everything else enriches the output but is not required.

### Circuit Breaker Pattern

Each external dependency (LLM, vector DB, platform APIs) is wrapped in a circuit breaker:

```
CircuitBreaker {
  state:              Closed | Open | HalfOpen
  failure_threshold:  Int      -- failures before opening (default: 5)
  recovery_timeout:   Duration -- time before trying again (default: 60s)
  success_threshold:  Int      -- successes in HalfOpen before closing (default: 3)
}
```

- **Closed:** normal operation. Failures increment counter.
- **Open:** all calls return fallback immediately. No external calls made. Timer starts.
- **HalfOpen:** after recovery_timeout, allow one call through. If success, close. If failure, reopen.

Circuit breakers are independent per dependency per entity. One entity's LLM failures do not trip circuit breakers for other entities.

---

## End of Part 6

This document specifies the complete runtime behavior of Idol Frame entities. Every step in the Decision Stack maps to a module defined in Part 5. Every primitive referenced uses its canonical Part 3 name. The combination of Parts 3, 5, and 6 fully defines what an entity is (primitives), how the system is built (architecture), and what happens when the entity acts (runtime).

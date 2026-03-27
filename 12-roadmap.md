# Part 12: Roadmap -- MVP to Full Platform

**Status:** INFORMATIVE
**Depends on:** Part 3 (Framework Primitives), Part 5 (System Architecture)
**Version:** 1.0.0
**Date:** 2026-03-15

---

## 1. Roadmap Philosophy

### Build the Smallest Provable Thing First

The central thesis of Idol Frame is that persistent identity can be maintained across contexts, time, and media surfaces. Phase 1 exists to prove this thesis with the minimum possible system. If a single Entity cannot maintain recognizable identity across 100 text interactions on one Stage, nothing else matters. No amount of multi-stage orchestration or rich media integration fixes a broken identity layer.

### Each Phase Is Independently Valuable

Every phase ships a product that solves a real problem for a real user, not a demo that exists only to justify the next funding round. Phase 1 is a usable identity-persistent chatbot. Phase 2 is a directed character development tool. Phase 3 is a cross-platform content identity system. Each phase generates revenue, feedback, and validation independently.

A phase that is only valuable as a stepping stone to the next phase is a phase that should be merged into its successor or eliminated.

### Identity Before Media

The layer dependency rule from Part 5 dictates build order:

```
IDENTITY LAYER        (Phase 1)
STATE LAYER           (Phase 1-2)
COGNITION LAYER       (Phase 1-2)
PERFORMANCE LAYER     (Phase 1)
EVOLUTION LAYER       (Phase 2)
ORCHESTRATION LAYER   (Phase 3)
```

Identity persistence is the foundation. Voice consistency is the proof. Multimodal output is an amplifier. Shipping a visually stunning entity that cannot remember yesterday's conversation or maintain consistent values is shipping a failure.

### Evaluation Is Not Optional

You cannot improve what you cannot measure. `performance.Evaluator`, `evaluation.IdentityEvaluator`, and `evaluation.VoiceAnalyzer` ship in Phase 1, not Phase 3. Every phase has quantitative success criteria defined before development begins. If a phase cannot define its success metrics, it is not ready to be built.

### The Invariants Are Non-Negotiable

All 12 invariants from Part 3 that apply to a given phase must hold from day one of that phase. Invariant enforcement is never deferred. A system that "mostly" enforces Guardrail supremacy (Invariant 5) or "usually" maintains IdentityCore immutability (Invariant 7) is a broken system.

---

## 2. Phase 1: Foundation (Months 1-3)

**Tagline:** "One Entity, One Stage, Text Only"

**Goal:** A single Entity can maintain persistent identity across text-only interactions on one Stage. Identity consistency is measurable and exceeds baseline.

### 2.1 Modules Built

**Identity Subsystem:**

| Module | Scope | Notes |
|---|---|---|
| `identity.EntityStore` | Full CRUD | Entity versioning, archive (no hard delete), Invariant 1 enforcement |
| `identity.IdentityCoreManager` | Full | Immutability enforcement (Invariant 7), version history retention |
| `identity.VoiceRegistry` | Full | Voice spec storage, `GetEffectiveVoice` (mood modulation deferred to Phase 2) |
| `identity.TraitEngine` | Partial | Trait CRUD, range enforcement (Invariant 4). DriftRule application deferred to Phase 2 |
| `identity.LoreGraph` | Partial | Creator-defined Lore only. Entity-generated and audience-derived Lore deferred. Consistency checking (Invariant 10) active |
| `identity.AestheticRegistry` | Stub | Stores Aesthetic spec. No visual generation pipeline. Required for Entity completeness (Invariant 1) |

**State Subsystem:**

| Module | Scope | Notes |
|---|---|---|
| `state.MemoryManager` | Episodic only | Episodic memory storage and retrieval. Semantic consolidation and relational memory deferred to Phase 2 |
| `state.MoodController` | Stub | Returns null (baseline mood). Full mood system in Phase 2 |
| `state.ArcDirector` | Not built | Deferred to Phase 2 |
| `state.RelationshipTracker` | Not built | Deferred to Phase 4 |

**Cognition Subsystem:**

| Module | Scope | Notes |
|---|---|---|
| `cognition.FrameAssembler` | Partial | Assembles DecisionFrame with IdentityCore, Traits, Voice, episodic Memory, Guardrails, Stage. Mood, Arc, Relationship, and Directive fields are null/empty |
| `cognition.GuardrailEnforcer` | Full | All enforcement modes (Block, Warn, FlagForReview). Safety guardrails auto-created. Invariant 5 holds |
| `cognition.DirectiveResolver` | Not built | Deferred to Phase 2 |
| `cognition.MemoryRetriever` | Full | Vector similarity search with importance weighting and recency bias |

**Performance Subsystem:**

| Module | Scope | Notes |
|---|---|---|
| `performance.Planner` | Partial | Basic intent derivation from interaction context. No campaign brief or arc phase integration |
| `performance.Generator` | Full | LLM integration with structured prompt from DecisionFrame + PerformancePlan |
| `performance.Evaluator` | Full | Guardrail check, identity consistency scoring, voice consistency scoring. Quality threshold of 0.6 enforced |
| `performance.Publisher` | Partial | Single-adapter publishing. No multi-stage coordination |
| `performance.SideEffectProcessor` | Partial | Episodic memory creation only. Mood update, relationship update, and trait nudge deferred |

**Evaluation Subsystem:**

| Module | Scope | Notes |
|---|---|---|
| `evaluation.IdentityEvaluator` | Full | LLM-based scoring of value alignment, worldview consistency, recognition marker presence, core tension balance |
| `evaluation.VoiceAnalyzer` | Full | Vocabulary compliance, syntax match, rhetoric alignment, emotional register scoring |
| `evaluation.DriftMonitor` | Not built | Deferred to Phase 3 |
| `evaluation.HealthAggregator` | Partial | Identity and voice consistency averages. No drift score or cross-stage metrics |

**Media Subsystem:**

| Module | Scope | Notes |
|---|---|---|
| `media.StageManager` | Single stage | One Stage configuration. No multi-stage management |
| `media.AdapterRegistry` | Single adapter | One registered Adapter (TextAdapter) |
| `media.FormatTransformer` | Not built | Deferred to Phase 3 |

**Infrastructure:**

| Component | Scope |
|---|---|
| Entity definition YAML parser | Parse Entity, IdentityCore, Voice, Trait, Lore, Guardrail from YAML |
| TextAdapter | API endpoint or Discord bot. Receives text input, returns text output |
| REST API | Entity CRUD, Performance triggering, Guardrail management, basic evaluation queries |
| Data Storage | Entity Store (document DB), Memory Store (vector DB), Performance Log (append-only) |

### 2.2 Invariants Enforced

All invariants applicable to Phase 1 scope:

- **Invariant 1** (Entity completeness): enforced. IdentityCore + Voice + Aesthetic (stub) + Safety Guardrail required.
- **Invariant 4** (Trait boundedness): enforced. Values clamped to range on every write.
- **Invariant 5** (Guardrail supremacy): enforced. No output bypasses guardrail evaluation.
- **Invariant 7** (IdentityCore immutability): enforced. No mutation after creation.
- **Invariant 8** (DecisionFrame completeness): enforced. Frame assembly fails if IdentityCore, Guardrails, or Stage missing.
- **Invariant 9** (Performance auditability): enforced. Every Performance has a logged DecisionFrame.
- **Invariant 10** (Lore consistency): enforced for creator-defined Lore.

### 2.3 What Ships

A working system where a creator defines an Entity in YAML, deploys it to a single text Stage, and interacts with it. The Entity remembers past conversations (episodic Memory), speaks in a consistent Voice, reflects its IdentityCore values, and respects its Guardrails. Every Performance is evaluated and scored.

**Demo:** "Talk to an entity today, come back in a week, it remembers you and still sounds the same."

---

## 3. Phase 2: Direction (Months 4-6)

**Tagline:** "Creators Can Direct"

**Goal:** Creators can shape Entity behavior over time through Directives, Arcs, Moods, and Snapshots. Entities develop, not just respond.

### 3.1 Modules Built

**New modules:**

| Module | Scope | Notes |
|---|---|---|
| `cognition.DirectiveResolver` | Full | Directive CRUD, scope filtering (Global, Context, Session), priority ordering, conflict detection, Guardrail validation at creation (Invariant 12) |
| `state.ArcDirector` | Full | Arc lifecycle (Planned, Active, Completed, Aborted), phase tracking, transition condition evaluation, pre-arc Snapshot (Invariant 2), rollback on abort |
| `state.MoodController` | Full | Mood lifecycle, intensity decay, trait and voice modulation computation, transience enforcement (Invariant 11) |
| `evolution.SnapshotService` | Full | Create, restore, validate, diff, list Snapshots. SHA256 checksum verification (Invariant 6). Pre-arc and on-demand triggers |
| `evolution.DriftEngine` | Full | DriftRule application on schedule. Direction types: TowardValue, TowardInteractions, RandomWalk, Decay. Bounds enforcement |
| `evolution.EpochManager` | Partial | Single-epoch management. Multi-epoch transitions deferred to Phase 3. Invariant 3 enforced |

**Upgraded modules:**

| Module | Change |
|---|---|
| `state.MemoryManager` | Full scope: episodic + semantic consolidation + relational memory. GC active |
| `cognition.FrameAssembler` | Now includes Mood, active Directives, Arc phase, and effective traits (with mood modulation) |
| `performance.Planner` | Integrates active Directives and Arc phase into intent derivation |
| `performance.SideEffectProcessor` | Full scope: memory creation + mood updates + trait nudges |
| `identity.TraitEngine` | Full scope: mood modulation calculation, DriftRule coordination |
| `identity.VoiceRegistry` | Mood-modulated effective Voice computation |
| `evaluation.HealthAggregator` | Adds guardrail violation rate and performance quality trends |

**Infrastructure:**

| Component | Scope |
|---|---|
| Creator dashboard | Basic web UI: entity overview, directive management, arc visualization, snapshot browser, evaluation scores |
| Directive API | CRUD endpoints for Directives. Conflict detection responses |
| Arc API | Arc creation, activation, phase advancement, abort, status query |
| Snapshot API | Create, restore, diff, list. Rollback confirmation flow |
| Evolution API | DriftRule CRUD, Epoch management, drift history queries |

### 3.2 New Invariants Enforced

- **Invariant 2** (Single active Arc): enforced. Activating an Arc when one is active fails.
- **Invariant 3** (Single active Epoch): enforced. Exactly one active Epoch at all times.
- **Invariant 6** (Snapshot immutability): enforced. Checksums verified on every read.
- **Invariant 11** (Mood transience): enforced. Every Mood has nonzero decay_rate or non-null expires_at.
- **Invariant 12** (Directive-Guardrail compatibility): enforced. Violating Directives rejected at creation.

### 3.3 What Ships

A system where a creator defines an Arc with phases, transition conditions, and trait targets. The Entity progresses through the Arc over days or weeks. The creator issues Directives to shape behavior in specific contexts. Moods modulate Voice and Traits temporarily. Snapshots allow rollback if development goes wrong.

**Demo:** "Watch an entity go through a scripted character arc over 30 days. See its traits shift, its voice modulate with mood, and its lore expand -- all while maintaining identity consistency above 0.8."

---

## 4. Phase 3: Multi-Stage (Months 7-10)

**Tagline:** "One Entity, Many Stages"

**Goal:** A single Entity can perform coherently across multiple platforms. Cross-stage identity consistency is measurable and maintained.

### 4.1 Modules Built

**New modules:**

| Module | Scope | Notes |
|---|---|---|
| `orchestration.CampaignPlanner` | Full | Campaign lifecycle, cross-stage scheduling, coherence rule enforcement |
| `orchestration.Scheduler` | Full | Time-based triggers, timezone-aware scheduling, Stage rate limit respect |
| `evaluation.DriftMonitor` | Full | Cross-snapshot drift analysis, baseline comparison, cross-stage consistency scoring |
| `media.FormatTransformer` | Full | Text truncation, thread splitting, metadata injection, format conversion |

**New Adapters:**

| Adapter | Stage | Content Types |
|---|---|---|
| TwitterAdapter | Twitter/X | Short-form text, threads, replies |
| YouTubeAdapter | YouTube | Video scripts, descriptions, community posts |
| TikTokAdapter | TikTok | Short-form video scripts, captions |
| NewsletterAdapter | Email/Newsletter | Long-form text, structured articles |
| ImageAdapter | Image platforms | Prompt generation for image APIs (Aesthetic-informed) |

**Upgraded modules:**

| Module | Change |
|---|---|
| `media.AdapterRegistry` | Full plugin system. Dynamic adapter registration and capability queries |
| `media.StageManager` | Multi-stage configuration. Per-entity stage assignments |
| `identity.AestheticRegistry` | Full scope: visual identity consumed by ImageAdapter for prompt generation |
| `evolution.EpochManager` | Full scope: multi-epoch transitions, epoch-specific trait ranges |
| `evaluation.HealthAggregator` | Full scope: cross-stage metrics, drift scores, per-stage breakdowns |
| `cognition.FrameAssembler` | Stage-aware context. Loads Stage-specific audience expectations and format constraints |
| `performance.Publisher` | Multi-adapter publishing via AdapterRegistry lookup |

**Infrastructure:**

| Component | Scope |
|---|---|
| Adapter plugin interface | Standardized interface: `validate()`, `publish()`, `getCapabilities()`, `getFormatSpec()` |
| Campaign API | Campaign CRUD, activation, coherence rule queries, schedule management |
| Cross-stage dashboard | Per-stage performance metrics, cross-stage identity consistency, campaign progress |
| Platform credential vault | Secure storage for platform API tokens (Twitter, YouTube, etc.) |

### 4.2 What Ships

An Entity that maintains a Twitter presence, writes weekly newsletters, produces YouTube scripts, and generates TikTok captions -- all coherently. A Campaign coordinates a product launch across all four platforms over two weeks. The `evaluation.DriftMonitor` flags any cross-stage identity drift. The creator manages everything from a unified dashboard.

**Demo:** "This entity has been active on 3 platforms for a month. Can you tell it's the same identity? The drift monitor says cross-stage consistency is 0.91."

---

## 5. Phase 4: Rich Media (Months 11-15)

**Tagline:** "Voice, Video, Live"

**Goal:** Entity materialization extends to audio, video, and live streaming. Real-time interaction is supported with acceptable latency.

### 5.1 Modules Built

**New Adapters:**

| Adapter | Stage | Content Types |
|---|---|---|
| AudioAdapter | Podcasts, voice messages | TTS integration using Voice spec (vocabulary, syntax, emotional register) |
| VideoAdapter | YouTube, TikTok, Reels | Avatar rendering + TTS + scripted content |
| LiveAdapter | Twitch, YouTube Live, Spaces | Real-time streaming with sub-second frame assembly |

**New modules:**

| Module | Scope | Notes |
|---|---|---|
| `state.RelationshipTracker` | Full | Relationship CRUD, dynamic rule execution, auto-creation after interaction threshold, history summary generation |
| Multi-entity interaction system | New | Entity-to-entity Relationships, joint Performances, conflict and collaboration dynamics |
| Asset management system | New | Visual asset storage, TTS voice model references, avatar configuration, Aesthetic-linked asset retrieval |

**Upgraded modules:**

| Module | Change |
|---|---|
| `cognition.FrameAssembler` | Includes Relationships in DecisionFrame. Latency-optimized assembly path for live interactions |
| `performance.Generator` | Multi-modal output: text, audio directives, video scripts with timing markers |
| `performance.SideEffectProcessor` | Full scope including Relationship rule firing after interactions |
| `media.FormatTransformer` | Cross-format conversion: text-to-script, script-to-TTS-directives, script-to-video-timeline |
| `evaluation.VoiceAnalyzer` | Audio output analysis: prosody matching, pacing, emotional tone in spoken output |

**Infrastructure:**

| Component | Scope |
|---|---|
| WebSocket API | Real-time bidirectional communication for live interactions |
| Live interaction pipeline | Latency-optimized DecisionFrame assembly (target: < 500ms). Pre-cached identity state. Streaming LLM responses |
| TTS integration layer | Voice spec to TTS parameter mapping. Multiple TTS provider support |
| Avatar rendering pipeline | Aesthetic spec to visual avatar. Lip sync with TTS output |
| Multi-entity session manager | Manages interactions between 2+ entities in shared context |

### 5.2 What Ships

An Entity that can host a live stream, produce podcast episodes, create video content, and maintain voice consistency across all formats. During a live stream, the Entity remembers a conversation from Twitter last week and references it naturally. Two Entities can interact with each other, maintaining distinct identities and a tracked Relationship.

**Demo:** "This entity just did a live stream where it remembered a conversation from Twitter last week. Its spoken voice matches the linguistic patterns from its text output. And it had a 10-minute conversation with another entity where both maintained distinct identities."

---

## 6. Phase 5: Platform (Months 16-24)

**Tagline:** "The Idol Frame Platform"

**Goal:** Multi-creator, multi-entity platform with marketplace, SDKs, and ecosystem tooling. Idol Frame becomes infrastructure, not just a product.

### 6.1 Modules Built

**Platform infrastructure:**

| Component | Scope |
|---|---|
| Multi-tenant architecture | Tenant isolation for Entity data, Performances, Snapshots. Shared Adapter and Stage infrastructure |
| Team/studio permission model | Roles: Owner, Director, Viewer. Per-entity and per-team permissions. Audit log for all permission changes |
| Billing and usage tracking | Per-entity, per-performance, per-stage metering. LLM token tracking. Storage quotas |
| Entity export/import | Full Entity portability. Export as signed, checksummed archive. Import with conflict resolution |

**Ecosystem tooling:**

| Component | Scope |
|---|---|
| Python SDK | Typed client for all API endpoints. Entity definition helpers. Evaluation scoring utilities |
| TypeScript SDK | Browser and Node.js compatible. Real-time WebSocket client. React hooks for dashboard embedding |
| Custom adapter development kit | Adapter interface specification. Local testing harness. Publishing pipeline to adapter marketplace |
| Entity marketplace | Browse and fork Entity templates. Share custom Adapters. Community-contributed Stage configurations |

**Advanced features:**

| Component | Scope |
|---|---|
| Advanced analytics | Performance trend analysis. Audience engagement correlation. Cross-entity comparison. A/B testing for Directive effectiveness |
| Entity branching | Fork an Entity from a Snapshot. Independent evolution paths. Diff and merge tooling |
| Batch operations API | Bulk Entity creation, bulk Directive application, fleet-wide Guardrail updates |
| Webhook system | Outbound webhooks for Performance events, evaluation alerts, drift warnings |

### 6.2 What Ships

A platform where a studio creates a team, defines 10 Entities, assigns them to Stages across 5 platforms, manages them through Arcs and Campaigns, and monitors their health from a unified dashboard. Independent creators browse the marketplace for Entity templates and custom Adapters. Third-party developers build and sell Adapters for new platforms.

**Demo:** "A studio is running 10 entities across 5 platforms with a team of 4 creators. One creator just forked an entity to test a new arc direction without affecting the production version."

---

## 7. Risk and Dependency Map

### Phase 1 Risks

| Category | Risk | Mitigation |
|---|---|---|
| **Hardest technical challenge** | Identity consistency scoring. The `evaluation.IdentityEvaluator` and `evaluation.VoiceAnalyzer` are LLM-based evaluators scoring subjective qualities. Getting reliable, reproducible scores is hard. | Build evaluation test suite early. Use human-annotated golden sets. Calibrate LLM evaluator against human scores. Ship with explicit confidence intervals. |
| **External dependencies** | LLM API (OpenAI, Anthropic, etc.). Single provider dependency. | Abstract LLM calls behind `performance.Generator` interface. Support multiple providers from day one. Local model fallback for development. |
| **Timeline risk** | Vector database setup and tuning for `cognition.MemoryRetriever`. Embedding quality directly affects memory retrieval relevance. | Use managed vector DB (Qdrant Cloud, Pinecone) to avoid ops overhead. Start with a proven embedding model. Tune retrieval weights empirically. |
| **Parallelizable work** | Identity subsystem modules, evaluation modules, and TextAdapter can be built concurrently. `performance.Generator` depends on `cognition.FrameAssembler`, which depends on identity modules. | Three parallel tracks: (1) Identity + State modules, (2) Evaluation modules, (3) API + Adapter. Converge at FrameAssembler integration. |

### Phase 2 Risks

| Category | Risk | Mitigation |
|---|---|---|
| **Hardest technical challenge** | Arc transition conditions. `state.ArcDirector` must evaluate arbitrary transition conditions (time-based, interaction-count-based, trait-threshold-based, LLM-judged narrative conditions). Getting this right requires a flexible but safe evaluator system. | Start with declarative condition types (time, count, threshold). Add LLM-judged conditions as an explicit, sandboxed evaluator type. Never allow arbitrary code execution in transition conditions. |
| **External dependencies** | None new beyond Phase 1. | N/A |
| **Timeline risk** | Creator dashboard UI. Building a usable dashboard for Directive management, Arc visualization, and Snapshot browsing is a full frontend project. | Ship CLI-first. Dashboard is useful but not blocking. API-first design means the dashboard is a client, not the product. |
| **Parallelizable work** | `evolution.SnapshotService` and `evolution.DriftEngine` are independent of each other and of `state.ArcDirector`. Dashboard is independent of all backend work. | Four parallel tracks: (1) Cognition modules (DirectiveResolver), (2) State modules (ArcDirector, MoodController), (3) Evolution modules (SnapshotService, DriftEngine, EpochManager), (4) Dashboard. |

### Phase 3 Risks

| Category | Risk | Mitigation |
|---|---|---|
| **Hardest technical challenge** | Cross-stage identity consistency. An Entity must sound like itself on Twitter (280 chars), in a newsletter (2000 words), and in a YouTube script (10 min spoken). `media.FormatTransformer` and the Adapter layer must preserve identity across radical format differences. | Build cross-stage evaluation into `evaluation.DriftMonitor` before building adapters. Define format-independent identity markers. Test with human evaluators: "Is this the same entity?" |
| **External dependencies** | Platform APIs (Twitter/X API, YouTube Data API, TikTok API). Each has its own rate limits, authentication, content policies, and breaking change risk. | Build Adapters as thin wrappers around platform SDKs. Abstract platform-specific logic behind the Adapter interface. Budget for API changes. Have a deprecation/migration plan per adapter. |
| **Timeline risk** | Platform API access. Twitter/X API pricing and access tiers are unpredictable. YouTube and TikTok APIs have approval processes. | Start with platforms that have stable, accessible APIs. Build the Adapter plugin interface first so new platforms can be added without core changes. Newsletter (email) has zero platform risk -- build it first. |
| **Parallelizable work** | Each Adapter is independent. `orchestration.CampaignPlanner` and `orchestration.Scheduler` depend on `media.StageManager` but not on specific adapters. `evaluation.DriftMonitor` depends on `evolution.SnapshotService` (Phase 2). | Five parallel tracks: (1) Adapter plugin interface + StageManager upgrade, (2-5) Individual adapters. Orchestration modules start after StageManager ships. |

### Phase 4 Risks

| Category | Risk | Mitigation |
|---|---|---|
| **Hardest technical challenge** | Live interaction latency. The full pipeline (trigger -> FrameAssembly -> LLM call -> evaluation -> publish) must complete in under 2 seconds for live interaction to feel natural. Current pipeline is designed for async performance. | Build a latency-optimized path: pre-cache identity state, use streaming LLM responses, relax evaluation to post-hoc scoring for live interactions, accept higher risk of guardrail violations in exchange for responsiveness (with post-hoc review). |
| **External dependencies** | TTS services (ElevenLabs, Play.ht, Azure TTS). Avatar rendering services. Streaming infrastructure (WebRTC, RTMP). | Abstract TTS behind a provider interface. Start with one TTS provider. Avatar rendering can use existing tools (HeyGen, D-ID) via API before building custom. |
| **Timeline risk** | Multi-entity interaction is architecturally complex. Two Entities interacting requires shared context, turn-taking, and Relationship updates in real time. | Ship single-entity rich media first. Multi-entity interaction is a sub-phase that can slip without blocking the rest of Phase 4. |
| **Parallelizable work** | AudioAdapter, VideoAdapter, and LiveAdapter are independent. `state.RelationshipTracker` is independent of media work. Multi-entity interaction depends on RelationshipTracker. | Four parallel tracks: (1) AudioAdapter + TTS integration, (2) VideoAdapter + avatar pipeline, (3) LiveAdapter + WebSocket API, (4) RelationshipTracker + multi-entity system. |

### Phase 5 Risks

| Category | Risk | Mitigation |
|---|---|---|
| **Hardest technical challenge** | Multi-tenant data isolation. Entity data, Performance logs, Snapshots, and Memory stores must be fully isolated between tenants without sacrificing query performance. | Design tenant isolation at the storage layer from the start (even if single-tenant in Phases 1-4). Use tenant-scoped indexes. Test with simulated multi-tenant load before launch. |
| **External dependencies** | Payment processing (Stripe). Marketplace infrastructure. SDK distribution (PyPI, npm). | Use proven third-party services. Marketplace MVP is a curated list, not a full app store. |
| **Timeline risk** | SDK quality. A bad SDK experience kills developer adoption. Building, documenting, and maintaining SDKs in two languages is a sustained effort. | Ship Python SDK first (closer to backend language). TypeScript SDK follows. Auto-generate SDK clients from OpenAPI spec where possible. Invest in SDK-specific testing and documentation. |
| **Parallelizable work** | Multi-tenant architecture, SDKs, marketplace, and advanced analytics are all independent. | Four parallel tracks: (1) Multi-tenant + billing, (2) Python SDK, (3) TypeScript SDK + adapter dev kit, (4) Marketplace + analytics. |

---

## 8. Success Metrics Per Phase

### Phase 1 Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Identity consistency score | > 0.8 average over 100 interactions | `evaluation.IdentityEvaluator` scores aggregated by `evaluation.HealthAggregator` |
| Voice consistency score | > 0.75 average over 100 interactions | `evaluation.VoiceAnalyzer` scores aggregated by `evaluation.HealthAggregator` |
| Memory recall accuracy | > 70% of relevant episodic memories retrieved in top-5 results | Manual test suite: create known memories, query with related context, measure recall |
| Guardrail violation rate | < 1% of published Performances | `cognition.GuardrailEnforcer` violation logs divided by total published Performances |
| Performance auditability | 100% of published Performances have traceable DecisionFrames | Automated invariant check (Invariant 9) |
| Entity creation success rate | > 95% of valid YAML definitions parse and create entities | YAML parser test suite with valid and invalid inputs |
| Evaluation reproducibility | Evaluator scores for the same output vary by < 0.05 across 5 runs | Run `evaluation.IdentityEvaluator` and `evaluation.VoiceAnalyzer` on fixed outputs repeatedly |

### Phase 2 Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Arc completion with identity preservation | Identity drift < 5% from pre-arc Snapshot to post-arc state | `evolution.SnapshotService.DiffSnapshots` comparing pre-arc and post-arc. Identity consistency delta measured by `evaluation.IdentityEvaluator` |
| Directive compliance | > 90% of Performances under an active Directive reflect the Directive's intent | LLM-judged evaluation: "Does this output follow the directive [X]?" |
| Mood modulation accuracy | Voice output measurably shifts when Mood is active vs. baseline | A/B comparison: same prompt with and without Mood. `evaluation.VoiceAnalyzer` detects difference > 0.1 |
| Snapshot restore fidelity | 100% of restored Snapshots pass checksum verification and produce identical entity state | Automated test: create Snapshot, modify entity, restore, compare. SHA256 match (Invariant 6) |
| DriftRule bounded execution | 0% of trait values exceed their defined range after drift application | Automated invariant check (Invariant 4) across all DriftRule applications |
| Creator dashboard usability | Creators can complete core workflows (create directive, start arc, take snapshot) without documentation | Usability testing with 5 target users. Task completion rate > 80% |

### Phase 3 Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Cross-stage identity consistency | > 0.85 average across all active Stages | `evaluation.DriftMonitor.CompareToBaseline` per stage. Average across stages |
| Cross-stage voice consistency | > 0.80 average across text-based Stages | `evaluation.VoiceAnalyzer` scores per stage, adjusted for format constraints |
| Human identity recognition | > 75% of evaluators correctly identify outputs from 3 stages as the same Entity | Blind test: show outputs from different stages, ask "same or different entity?" |
| Campaign coherence | > 90% of Campaign Performances pass coherence rules | `orchestration.CampaignPlanner.EvaluateCoherenceRules` pass rate |
| Adapter reliability | > 99% publish success rate per Adapter (excluding platform outages) | `performance.Publisher` success rate, filtered for platform-side errors |
| Format transformation quality | < 5% of transformed content flagged as incoherent or identity-breaking | Post-transformation evaluation by `evaluation.IdentityEvaluator` |

### Phase 4 Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Live interaction latency | < 2 seconds end-to-end (trigger to published output) for 95th percentile | Latency instrumentation in the live interaction pipeline |
| Audio voice consistency | > 0.75 voice consistency between text output and TTS audio | Extended `evaluation.VoiceAnalyzer` with prosody and pacing scoring |
| Cross-modal identity | > 0.80 identity consistency between text and video Performances | `evaluation.IdentityEvaluator` on video transcript vs. IdentityCore |
| Multi-entity interaction coherence | Both Entities maintain distinct identity scores > 0.75 during joint interaction | Per-entity `evaluation.IdentityEvaluator` scores during multi-entity sessions |
| Relationship tracking accuracy | Sentiment and trust values reflect interaction history with > 80% human agreement | Human evaluation: given interaction history, do the Relationship values seem right? |
| Live stream uptime | > 99% uptime during scheduled live sessions | Infrastructure monitoring. No crashes or disconnects during active streams |

### Phase 5 Metrics

| Metric | Target | Measurement Method |
|---|---|---|
| Tenant isolation | 0 cross-tenant data leaks in security audit | Penetration testing. Automated cross-tenant query tests |
| SDK adoption | > 50 active developers using Python or TypeScript SDK within 6 months of launch | SDK download counts, API key creation, active usage telemetry |
| Entity creation to first Performance | < 30 minutes for a new creator using SDK or dashboard | Onboarding funnel tracking. Time from account creation to first published Performance |
| Platform entity capacity | Support 100+ concurrent active Entities per tenant with < 10% latency degradation | Load testing with simulated multi-entity workloads |
| Marketplace engagement | > 20 community-contributed Adapters or Entity templates within 12 months | Marketplace submission count and usage stats |
| Export/import fidelity | 100% of exported Entities import successfully with identical evaluation scores | Automated round-trip test: export, import to new tenant, run evaluation suite |

---

## 9. Phase Dependency Graph

```
Phase 1: Foundation
  |
  |-- identity.EntityStore, identity.IdentityCoreManager, identity.VoiceRegistry
  |-- identity.TraitEngine (partial), identity.LoreGraph (partial)
  |-- state.MemoryManager (episodic), cognition.FrameAssembler (partial)
  |-- cognition.GuardrailEnforcer, cognition.MemoryRetriever
  |-- performance.* (partial), evaluation.IdentityEvaluator, evaluation.VoiceAnalyzer
  |-- TextAdapter, REST API, YAML parser
  |
  v
Phase 2: Direction
  |
  |-- cognition.DirectiveResolver, state.ArcDirector, state.MoodController
  |-- evolution.SnapshotService, evolution.DriftEngine, evolution.EpochManager (partial)
  |-- Upgrades: MemoryManager (full), FrameAssembler (full), TraitEngine (full)
  |-- Creator dashboard, Directive/Arc/Snapshot APIs
  |
  v
Phase 3: Multi-Stage
  |
  |-- orchestration.CampaignPlanner, orchestration.Scheduler
  |-- evaluation.DriftMonitor, media.FormatTransformer
  |-- Adapters: Twitter, YouTube, TikTok, Newsletter, Image
  |-- Upgrades: AdapterRegistry (plugin), StageManager (multi), AestheticRegistry (full)
  |
  v
Phase 4: Rich Media
  |
  |-- Adapters: Audio, Video, Live
  |-- state.RelationshipTracker, multi-entity interaction
  |-- WebSocket API, live interaction pipeline
  |-- TTS integration, avatar rendering
  |
  v
Phase 5: Platform
  |
  |-- Multi-tenant, billing, permissions
  |-- Python SDK, TypeScript SDK, adapter dev kit
  |-- Marketplace, advanced analytics
  |-- Entity export/import, branching
```

### Critical Path

The critical path runs through identity consistency. Every phase depends on the identity layer working correctly:

1. Phase 1 proves identity persistence is possible and measurable.
2. Phase 2 proves identity can be directed without breaking.
3. Phase 3 proves identity survives format transformation.
4. Phase 4 proves identity survives modality transformation.
5. Phase 5 proves identity infrastructure scales.

If identity consistency scores drop below threshold at any phase, that phase is not complete. No amount of feature work compensates for a broken identity layer.

---

## 10. Decision Points and Go/No-Go Criteria

### Phase 1 -> Phase 2 Gate

**Go criteria:**
- Identity consistency score > 0.8 sustained over 100+ interactions across 3+ distinct Entities
- Voice consistency score > 0.75 sustained
- Guardrail violation rate < 1%
- Performance auditability at 100%
- At least one Entity has operated continuously for 14+ days with no identity degradation

**No-go signals:**
- Identity consistency below 0.7 after tuning. Root cause: IdentityCore specification is insufficient to constrain LLM output. Action: revisit Part 3 IdentityCore fields.
- Memory retrieval returns irrelevant results > 30% of the time. Root cause: embedding model or retrieval algorithm inadequate. Action: retune `cognition.MemoryRetriever` before proceeding.

### Phase 2 -> Phase 3 Gate

**Go criteria:**
- At least one Entity has completed a multi-phase Arc with identity drift < 5%
- Directive compliance > 90%
- Snapshot restore produces identical evaluation scores
- Creator dashboard is usable without documentation for core workflows

**No-go signals:**
- Arcs cause unrecoverable identity drift. Action: tighten DriftRule bounds, add mid-arc identity checkpoints.
- Directive system creates contradictions that Guardrails cannot catch. Action: strengthen `cognition.DirectiveResolver` conflict detection.

### Phase 3 -> Phase 4 Gate

**Go criteria:**
- Cross-stage identity consistency > 0.85 across 3+ Stages
- Human evaluators recognize same Entity across platforms > 75% of the time
- At least 2 Adapters operating in production for 30+ days
- Campaign system has coordinated 5+ multi-stage campaigns

**No-go signals:**
- Identity degrades significantly on short-form platforms (Twitter). Action: improve `media.FormatTransformer` identity-preserving truncation.
- Platform API instability makes Adapters unreliable. Action: add retry logic, queue-based publishing, graceful degradation.

### Phase 4 -> Phase 5 Gate

**Go criteria:**
- Live interaction latency < 2 seconds at 95th percentile
- Audio voice consistency > 0.75
- Multi-entity interaction maintains distinct identities
- At least one Entity has operated across text + audio + video for 30+ days

**No-go signals:**
- Live latency cannot meet target. Action: redesign live pipeline (pre-computed partial frames, aggressive caching, smaller models for live).
- TTS output does not match Voice spec perceptibly. Action: invest in custom TTS fine-tuning per entity, or constrain Voice spec to TTS-achievable parameters.

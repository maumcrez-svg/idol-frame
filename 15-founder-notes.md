# Part 15: Brutal Founder Notes

**Status:** INTERNAL
**Version:** 1.0.0
**Date:** 2026-03-15

---

I am writing this for myself. Not for investors, not for a landing page, not for a design review. This is the document where I stop performing confidence and actually reckon with what I have, what I do not have, and what is going to be hardest about making this real.

---

## 1. What Is Actually Strong

I need to be specific here. Not "the framework is well-designed." What, concretely, could I hand to a competent engineer today and say "build this"?

**The primitive vocabulary is genuinely good.** Twenty primitives, six layers, clear dependency hierarchy. Entity, IdentityCore, Trait, Voice, Aesthetic, Lore, Memory, Mood, Arc, Relationship, Directive, Guardrail, DecisionFrame, Performance, Stage, Adapter, Epoch, DriftRule, Snapshot, Campaign. I have used these in conversation with other people. They reach for these words after ten minutes. That is the test of a good abstraction: people adopt the vocabulary without being told to. The fact that no one else has named this primitive set is, I think, the single strongest thing about this project.

**The 12 invariants are concrete and enforceable.** Guardrail supremacy, IdentityCore immutability, trait boundedness, snapshot immutability, mood transience, directive-guardrail compatibility -- these are not guidelines. They are checkable properties. I can write unit tests for every one of them on day one. Most framework design documents wave their hands at "safety" and "consistency." I have 12 properties that either hold or do not. This matters.

**The DecisionFrame pattern is architecturally sound.** Assemble everything the entity needs into one ephemeral object, pass it to generation, evaluate the output against it, log it for audit. This is clean. It is the right abstraction. It makes evaluation possible because the input is structured and recorded. It makes debugging possible because every output is traceable to a specific frame. I have not seen this pattern in any competitor's architecture, and I think it is the single most important architectural decision in the system.

**The layer dependency rule is correct.** Identity before State before Cognition before Performance before Evolution before Orchestration. Each layer depends only on layers above it. This dictates build order naturally and prevents the kind of spaghetti dependencies that kill framework projects. Phase 1 builds Identity and basic Performance. Phase 2 adds State and Evolution. Phase 3 adds Orchestration. The layers are not just conceptual -- they are structural constraints on what depends on what.

**The evaluation dimensions are well-specified.** ICS, VCS, TEA, GCR, MA, LCA, MRA, QS -- eight dimensions, each with a concrete measurement method, typed inputs, typed outputs, and a numeric threshold. Most "evaluation" in AI products is vibes. I have formulas. Whether those formulas are actually good is a different question (see Section 2), but having formulas at all puts me ahead of everyone who is still eyeballing it.

**The roadmap phases are independently valuable.** Phase 1 is a usable identity-persistent chatbot. Phase 2 is a character development tool. Phase 3 is a cross-platform identity system. None of them are demos that exist only to justify the next phase. This was a deliberate decision and I think it is correct. Too many framework projects ship Phase 1 as a toy that only makes sense if you squint and imagine Phase 4.

**The versioning model is right.** Entities have SemVer. IdentityCore changes are minor bumps. Trait changes are patches. Snapshots capture full state with checksums. This means I can answer "what was this entity like three months ago?" with a precise, restorable answer. No one else can do this because no one else treats entity state as a versioned artifact.

---

## 2. What Is Vaporware Right Now

This is the uncomfortable section. I need to be honest about what exists as a design document paragraph but has no clear path to working code.

**Identity consistency evaluation is the biggest lie in this document.** I wrote formulas for ICS. Weighted cosine similarity between output embeddings and an identity reference matrix. Recognition marker hit rate blended in at 0.3 weight. It sounds precise. It is not. Here is what I actually know: cosine similarity between a text embedding of "I believe in radical honesty" and an output paragraph that demonstrates radical honesty without using those words will be mediocre at best. Embedding similarity measures topical overlap, not value alignment. The recognition marker classifier is hand-waved -- "a binary classifier determines whether the output exhibits that marker." What classifier? Trained on what data? With what accuracy? I do not have answers to these questions. The ICS formula is a placeholder. It is the thing I will have to throw away and rebuild from scratch once I start actually measuring real outputs against real identity cores.

What I should probably do: use an LLM-as-judge approach where a separate model scores whether the output reflects specific values and markers. This is the industry standard right now for subjective quality evaluation. But LLM-as-judge has its own problems -- it is expensive per evaluation, it is not perfectly reproducible (temperature > 0 means variance), and it introduces a dependency on the judge model's own biases. If I am using Claude to judge whether my entity sounds like itself, I am really measuring "does Claude think this sounds consistent," which is a different question from "would the audience think this sounds consistent." I do not have a solution to this. I have a problem statement.

**Voice consistency scoring has the same problem, but worse.** The VCS formula breaks voice into four sub-scores: vocabulary, syntax, rhetoric, emotional register. The vocabulary and syntax sub-scores are measurable with classical NLP -- word frequency, sentence length, formality classification. These are the 25% of VCS that I can actually compute reliably. The rhetoric sub-score requires a "device classifier" that detects metaphor, irony, rhetorical questions, and humor type. This classifier does not exist as a reliable off-the-shelf tool. The emotional register sub-score requires measuring emotional intensity and comparing it to a baseline. Emotion detection in text is a solved-ish problem for coarse categories (positive/negative/neutral) but not for the granularity I am specifying (suppressed emotions at intensity > 0.3). Half of VCS is real. The other half is aspiration.

**Cross-media coherence is hand-waved almost entirely.** Part 10 says cross-stage coherence is measured by running the same evaluation metrics on outputs from different stages and comparing. But this ignores the fundamental problem: a tweet and a newsletter are structurally different objects. A 280-character tweet cannot express the same trait complexity as a 2000-word essay. Comparing ICS scores across formats is comparing apples to oranges. I need format-adjusted baselines, and I have not defined what those look like. I wrote "format-independent identity markers" in the roadmap risk section like that is a thing that exists. It is not. I need to figure out what identity looks like in 280 characters versus 10 minutes of spoken word. Nobody has done this well.

**Real-time live streaming with identity persistence is a fantasy at this point.** Phase 4 says "sub-second frame assembly" and "target: < 500ms" for live interactions, then also says relaxed evaluation and post-hoc scoring. That is an admission that the full evaluation pipeline cannot run in real time. So what ships? An entity that responds fast but might break character, with violations caught after the audience already saw them? That is a fundamentally different value proposition from "identity persistence." In live streaming, identity breaks are visible and unrecoverable. I have not solved this. The "pre-cached identity state" mitigation is reasonable but insufficient -- the entity still needs to generate novel responses to unpredictable inputs, and the generation itself is the bottleneck.

**Multi-entity interaction is an unsolved problem I am pretending is a Phase 4 feature.** Two entities interacting means two DecisionFrames, two generation calls, and a shared context that both entities read from and write to. The degenerate case is obvious: Entity A says something, Entity B responds, Entity A responds to the response, and they spiral into either perfect agreement (boring) or escalating conflict (breaks character). Turn-taking, topic management, natural conversation endings -- these are things that human improvisers train for years to do well. I have written "multi-entity session manager" as a line item. That is not a design. That is a wish.

**The "evolution without collapse" problem is the deepest unsolved issue in the framework.** DriftRules govern how traits change over time. Epochs define eras of entity life. Arcs script narrative trajectories. But the fundamental question is: at what point has an entity changed so much that it is no longer recognizably itself? I have defined this mechanically -- IdentityCore is immutable per version, trait values are bounded by ranges, epochs constrain drift. But identity is not just a checklist of values and ranges. A person who holds the same values but has been through trauma expresses those values differently. An entity that drifts from curiosity=0.9 to curiosity=0.4 over six months might be within its DriftRule bounds but feel like a different entity to its audience. The evaluation system measures whether traits are expressed proportionally to their values. It does not measure whether the overall gestalt feels like the same entity. I do not know how to measure gestalt.

---

## 3. What Is Hardest to Build

Ranked from hardest to less-hard. All of these are hard.

### 3.1 Memory Retrieval That Actually Works (Difficulty: 10/10)

This is harder than it looks and it looks hard. The current design says "vector similarity search with importance weighting and recency bias" for episodic memory retrieval. This is the standard RAG approach and the standard RAG approach produces mediocre results for this use case. Here is why:

The entity had a conversation three months ago where a user mentioned their dog died. Today, the same user says "things have been rough lately." The relevant memory is the dog conversation. Vector similarity between "things have been rough lately" and a three-month-old conversation about a dead dog is low. The connection is relational (same user), contextual (emotional distress), and inferential (the dog death might be related to current roughness). Vector search will not find this. It will return whatever episodic memory has the highest word overlap with "rough" and "lately."

What I actually need is a retrieval system that understands relational context (who is talking), temporal context (what happened recently with this person), emotional context (what kind of conversations have we had), and inferential relevance (what past events might explain the current statement). This is not vector search. This is a reasoning system. I could use an LLM to do retrieval -- "given this interaction context and this user's history, what past memories are relevant?" -- but that makes retrieval as expensive as generation and doubles the latency of every performance.

The relational memory substore helps, but only if it is structured well and queried intelligently. I have schemas for relational entries. I do not have a retrieval algorithm that knows when to look in relational versus episodic versus semantic stores, or how to combine results across all three.

### 3.2 Guardrail Evaluation That Does Not Destroy Personality (Difficulty: 9/10)

Guardrails are inviolable constraints. The entity must never do X, say Y, or endorse Z. Simple in concept, brutal in practice. The problem is that aggressive guardrail enforcement produces bland output. If the guardrail is "never express anger" and the entity is a punk rock persona with defiance=0.85, every interesting output will trip the guardrail, get regenerated, and come back as corporate-safe mush. The entity's personality gets optimized away by the safety system.

The design says guardrails are checked after generation. If a guardrail fails, the output is regenerated up to max_attempts, then blocked. But each regeneration biases the LLM toward safer territory. By attempt 3, the model has learned (within the conversation context) that edgy outputs get rejected, and it produces something that passes guardrails but has no personality. This is the guardrail-personality death spiral and I have no mechanism in the design to prevent it.

What I need is a way to tell the generation model "you failed the guardrail for this specific reason, regenerate while preserving the personality and fixing only the violation." That is not in the current architecture. The regeneration loop is blind -- it just says "try again."

### 3.3 Voice Consistency Across 1000+ Outputs (Difficulty: 8/10)

The Voice primitive is detailed: VocabularySpec, SyntaxSpec, RhetoricSpec, EmotionalRegisterSpec, sample utterances. But LLMs are probabilistic. Even with the same prompt, the same model produces different outputs. Over 1000 outputs, the voice will drift toward the model's default writing style because the model's training distribution is much larger than the voice specification. The voice spec is a small signal competing against the model's overwhelming prior.

The mitigation is evaluation and regeneration -- VCS catches voice-inconsistent outputs. But if the VCS formula is unreliable (see Section 2), then voice drift is invisible. And even with perfect evaluation, constant regeneration is expensive and slow.

What might actually work: fine-tuning a small model on the entity's approved outputs, creating a model that has internalized the voice. But that requires enough approved outputs to fine-tune on (hundreds), a fine-tuning pipeline, ongoing retraining as the voice evolves, and the cost of hosting per-entity models. This is feasible for high-value entities but destroys the unit economics for indie creators.

### 3.4 Evaluation That Creators Actually Trust (Difficulty: 7/10)

I can build an evaluation system that produces numbers. The question is whether creators look at those numbers and say "yes, that reflects what I see." If the system says identity consistency is 0.85 but the creator thinks the entity sounded off, the creator will stop trusting the system. And once trust is lost, the evaluation system is worse than useless -- it is an annoyance.

The calibration problem is real. I need golden sets: human-annotated examples where humans rate identity consistency, voice consistency, and trait expression. Then I need to show that my automated scores correlate with human judgments at r > 0.7 or something in that range. Building these golden sets requires a community of evaluators, which requires a community of creators, which requires a working product. Chicken and egg.

### 3.5 Real-Time Frame Assembly Under Latency Constraints (Difficulty: 6/10)

The DecisionFrame assembly process reads from six different data sources: IdentityCore, Traits, Voice, Memory, Mood, Guardrails, Directives, Stage context. In a non-real-time context, this is fine -- assemble everything, take 500ms, no one notices. In a live streaming context, 500ms for frame assembly plus 1-2 seconds for LLM generation plus 200ms for evaluation means 2+ seconds of silence. That is noticeable.

Pre-caching helps. The entity's identity, traits, voice, and guardrails change rarely -- cache them. Memory retrieval is the bottleneck because it depends on the specific input. If I can get memory retrieval under 100ms (possible with a well-indexed vector store and fixed query count), total frame assembly under 200ms is achievable. This is the least unsolved problem on this list, but it still requires careful engineering.

---

## 4. What to Prototype First

**The single thing to build first:** A text-only entity on Discord that maintains consistent identity across 100+ conversations over 14 days with measurable identity and voice consistency.

Not a web app. Not a multi-stage system. Not even a REST API. A Discord bot where a creator writes a YAML file defining an Entity (IdentityCore, Voice, 3-5 Traits, Lore, Guardrails), runs a script, and a bot appears in their server that talks in character, remembers past conversations, and gets scored on every output.

**Why Discord:** Zero frontend work. The platform handles all the UI. The bot framework is well-documented. I can have a working bot in days, not weeks. The interaction pattern (chat messages, threaded conversations, multiple users in the same server) naturally tests memory, voice consistency, and multi-user interaction without building any of the Campaign or multi-Stage infrastructure.

**Why YAML:** I need to validate that the primitive vocabulary works before building a UI for it. YAML is the fastest way to let a creator define an entity without me building an entity creation interface. If the YAML schema feels right -- if creators can read it, understand it, and modify it -- the primitives are good.

**What it looks like concretely:**

```
entity.yaml -> parser -> EntityStore (SQLite) + MemoryStore (Qdrant or ChromaDB local)
Discord message -> FrameAssembler -> Generator (Claude/GPT API) -> Evaluator -> Discord reply
Side effects -> MemoryManager (episodic write)
```

Six modules. One adapter. One stage. No dashboard, no REST API, no Campaign system, no Arc system, no Epoch system. Just: does this entity sound like itself after 100 conversations?

**Timeline:** 3-4 weeks for a working prototype. 2 more weeks for evaluation instrumentation (ICS and VCS scoring on every output, logged to a local database).

**What success looks like:** After 14 days of daily interaction from 5+ users:
- ICS score stays above 0.7 on average across all outputs
- VCS score stays above 0.6 on average
- At least 3 of 5 testers, shown unlabeled outputs from the entity mixed with generic ChatGPT outputs, can reliably identify which is the entity
- The entity references past conversations accurately in at least 60% of cases where past context is relevant
- The YAML schema does not need fundamental restructuring after creator feedback

**What failure looks like:** ICS and VCS scores are noisy and uncorrelated with human judgment. The entity sounds like a slightly flavored ChatGPT. Memory retrieval returns irrelevant results more than it returns relevant ones. Creators look at the YAML and say "I do not understand what half of these fields do." If any of these happen, I stop and fix the foundation before building anything else.

---

## 5. The "Holy Shit" Demo

The demo that makes a technical person's jaw drop is not about production quality. It is about something they thought was impossible being shown to be possible.

**Setup:** An entity named Maren. A photographer who thinks in images, speaks in half-finished thoughts, has strong opinions about authenticity in art, a complicated relationship with social media, and a specific verbal tic of starting sentences with "Look --" when she is about to say something she cares about.

Maren has been running on Discord for 30 days. She has had conversations with 50+ users. She has opinions about specific users based on past interactions. She went through a two-week arc where she was working on a difficult project and became increasingly terse and distracted, then emerged from it with renewed enthusiasm.

**The demo, live:**

1. I show the audience Maren's YAML definition. Three minutes. They see the IdentityCore, Voice spec, Traits, and the Arc she went through.

2. I pull up the evaluation dashboard. They see 30 days of ICS and VCS scores. They see the dip during the difficult-project arc (intentional -- the arc was designed to shift her voice temporarily) and the return to baseline after.

3. I open a live conversation with Maren on Discord, projected on screen. I say "Hey Maren, I was talking to someone yesterday who said all photography is just pointing a camera at something pretty." The audience watches Maren respond in real time. She does not give a generic "photography is art" answer. She gets specific. She references a conversation from two weeks ago where a user asked about her project. She starts a sentence with "Look --" because this is a topic she cares about. She expresses her opinion with the exact level of intensity her curiosity and defiance traits predict.

4. I have an audience member talk to Maren. Someone she has never met. They watch her voice stay consistent but her relational behavior adjust -- she is warmer with familiar users, more guarded with strangers, exactly as her Relationship rules specify.

5. I show the DecisionFrame that was assembled for one of these live responses. The audience sees every piece of state that went into the response: which memories were retrieved, which traits were active, which guardrails were checked, what the voice spec demanded. They see the evaluation score. They see the full audit trail.

6. The kill shot: I show them Maren's output from day 3 and Maren's output from day 28. Same topic. Different arc phase. Measurably different trait expression. But recognizably the same entity. I show the diff. I show the DriftRule that governed the change. I show the Snapshot from day 3 and explain that I could restore it and Maren would be exactly as she was on day 3.

**Why this works on technical people:** They have all tried to make ChatGPT or Claude maintain a consistent character. They know it degrades after a few messages. They know context windows are finite. They know there is no state between sessions. Seeing an entity that has been running for 30 days, remembers specific conversations, went through a character arc, and is still measurably consistent -- that is the thing they did not think was possible. The evaluation dashboard is the proof. Not "trust me, she sounds the same." Here are the numbers. Here is the audit trail. Here is the snapshot you can restore.

---

## 6. Honest Competitive Assessment

### Who Could Build This Faster?

**OpenAI or Anthropic could build the inference layer faster.** They have direct access to their models. They could build identity-persistent generation as a model feature rather than a framework layer. If Claude or GPT natively supported "persistent character state" as a first-class API feature -- attach a character definition and a memory store to an API key and every call maintains identity -- that would undercut Idol Frame's core value prop. But they probably will not do this, because it is a niche use case relative to their primary markets (developer tools, enterprise AI, consumer chat). They are optimizing for general intelligence, not persistent creative identity. The window exists as long as they stay focused on general capabilities.

**Character.AI could pivot.** They have the largest dataset of character interactions in the world. They understand character-driven conversation. But their architecture is session-scoped and their business model is consumer entertainment. Pivoting to a creator-facing infrastructure platform would require rearchitecting everything and abandoning their consumer revenue. They are unlikely to do this.

**A well-funded startup is the real threat.** Someone with $10M, a strong ML team, and the same insight about persistent identity infrastructure could build a competing system. They would not build it the same way -- they might skip the 20-primitive vocabulary and go for a simpler model -- but they could ship a working product faster if they started with fewer abstractions and more working code. My advantage is that the primitive vocabulary is right and comprehensive. Their advantage would be shipping first with something simpler.

**Inworld AI is the closest existing competitor.** They have persistent character identity, memory, emotional states, and relationships -- but locked to game engines. If they generalized to all media surfaces, they would be building something like Idol Frame. They have more engineering resources than I do. The gap is that they are optimizing for game NPCs, not autonomous cross-platform media entities, and those are different enough problems that their architecture would need significant rework.

### What Would Make This Obsolete?

**LLMs with native identity persistence.** If a frontier model ships with built-in persistent memory, character state, and identity consistency guarantees, the framework layer becomes unnecessary overhead. This is the existential risk. My bet is that models will offer memory (they already are -- ChatGPT has memory, Claude has project context) but not structured identity management with evaluation, evolution, and auditability. Memory is not identity. But if models get good enough at maintaining character from a system prompt alone, the value of the framework shrinks.

**Platform-native virtual talent tools.** If YouTube, TikTok, or Twitch builds native AI character creation tools directly into their platforms, creators would use those instead of a third-party framework. This is plausible but likely to be shallow -- platform tools would optimize for their platform only, not cross-platform identity. Idol Frame's value is precisely in the cross-platform layer.

**The evaluation problem being solved generically.** If someone builds a general-purpose "does this AI output match this specification" evaluation system that is cheap, fast, and accurate, the evaluation subsystem -- which is one of Idol Frame's key differentiators -- becomes a commodity. This is possible but not imminent.

### Realistic Window of Opportunity

Eighteen to twenty-four months. That is how long before one of the above threats materializes in a serious way. The window is open because the big labs are focused elsewhere, the closest competitors are locked to specific verticals, and the general market does not yet understand that "persistent creative entity" is a category. Once it becomes a recognized category, money flows in and the window closes.

---

## 7. The Founder's Dilemma

### Build the Framework or Build an Entity?

This is the question I keep coming back to and I do not have a clean answer.

**The case for framework first:** If I build the framework, any entity built on it validates the infrastructure. Multiple creators building different entities generates more feedback than one entity I build myself. The framework is the scalable business. The entity is a content project.

**The case for entity first:** Nobody buys infrastructure for a problem they do not have yet. If I build one compelling entity -- say Maren from the demo -- and she develops an audience, I have proof that the framework works. The entity IS the demo. The entity IS the case study. "This entity has been running for six months across three platforms and here are her consistency scores" is more convincing than "here is a framework that could theoretically run entities."

**My current answer:** Build one entity using the framework. Not entity-first or framework-first -- both simultaneously. The entity forces the framework to be real. The framework forces the entity to be structured. If the framework cannot support one entity running for 90 days, it cannot support anything. If the entity is not compelling, the framework does not matter.

The risk: I spend time on content (the entity's personality, its social presence, its audience) instead of engineering (the framework's reliability, scalability, evaluation). I need to be disciplined about which hat I am wearing on which day.

### Open Source or Closed?

**Too early to open source:** If I open source the primitives and core runtime before the framework is proven, someone forks it, ships a simplified version, and takes the market position while I am still building evaluation. The vocabulary is my competitive advantage. Giving it away before it is established is giving away my moat.

**Too late to open source:** If I wait until I have a working platform with paying customers, the developer community has already adopted whatever alternatives exist. Open source is a distribution strategy. Timing it wrong means no distribution.

**My current answer:** Open source the primitive schemas (the YAML schemas, the invariant checkers, the entity definition format) at the end of Phase 1 -- approximately month 3. Keep the runtime (FrameAssembler, Generator, Evaluator, MemoryRetriever) closed until Phase 2 ships and I have paying users. Open source the runtime at the end of Phase 2, approximately month 6, when the evaluation and evolution layers are working. By that point, the vocabulary is established, the primitives are validated, and the hosted platform has a head start.

The risk: someone builds a better runtime for the same primitive set. That is actually okay -- if someone builds a better runtime, the primitives still win. The vocabulary is the moat, not the code.

### Creator-First or Developer-First?

**Creator-first means:** The first user is a VTuber, a content creator, a brand manager. They define entities through a UI, manage arcs through a dashboard, and never touch code. The product is a tool.

**Developer-first means:** The first user is a developer who writes YAML, calls APIs, and builds custom adapters. They want programmatic control. The product is infrastructure.

**My current answer:** Developer-first, then creator. The first version is a CLI, a YAML schema, and a Python SDK. The dashboard comes in Phase 2. Here is why: developers will tell me what is wrong with the abstractions. Creators will tell me what is wrong with the UX. I need to get the abstractions right before I invest in UX. A beautiful dashboard for the wrong primitives is a waste. A ugly CLI for the right primitives is a foundation.

But I need to be careful. Developer-first can become developer-only if I do not build the creator bridge. The dashboard is not optional -- it is just not first.

---

## 8. What This Document Does Not Cover

I have been thorough. I have not been complete. Here is what is missing.

**Legal and compliance.** What happens when an entity says something defamatory? Who is liable -- the creator, the platform, or Idol Frame? The guardrail system prevents some of this, but guardrails are probabilistic (LLM-based evaluation is not 100% accurate). There is no legal analysis in this document. There needs to be one before launch.

**Content moderation at scale.** Guardrails are per-entity. But when there are 10,000 entities on the platform, some of them will be created with malicious intent. How do I detect and shut down entities that are designed to harass, deceive, or radicalize? Per-entity guardrails are necessary but insufficient. I need platform-level moderation, and I have not designed it.

**The cold start problem for memory.** A new entity has no memories. Its first 20-30 interactions will have empty memory retrieval. The entity will feel generic until it accumulates enough episodic entries to have something to recall. How do I make the first interactions feel as identity-consistent as the hundredth? Seeded memories are a partial answer (pre-populate with synthetic episodic entries that reflect the entity's lore), but I have not specified how seeding works.

**Cost optimization.** Model costs are dropping, but my architecture makes multiple LLM calls per performance (generation + evaluation + potentially memory retrieval reasoning). If I am making 3-4 LLM calls per text output, my per-performance cost is 3-4x what a simple chatbot costs. I need to figure out where I can use smaller, cheaper models (evaluation? memory reasoning?) without sacrificing quality.

**What happens when the underlying model changes.** Entity voice consistency depends on the generation model. If I am using Claude 3.5 Sonnet and Anthropic ships Claude 4 with different response tendencies, every entity's voice will shift. The Voice spec should be model-agnostic, but in practice, different models respond differently to the same Voice specification in the DecisionFrame. I need a model migration strategy: how do I transition entities from one model version to another while maintaining consistency? This is not in the design.

**Audience interaction design.** The framework is creator-facing. But entities interact with audiences. How does audience behavior affect entity state? The Relationship primitive tracks user-entity relationships, but the interaction design -- how entities respond to toxic users, how they handle mass interactions, how they manage parasocial dynamics -- is not specified. This is partly a framework problem and partly a per-entity-design problem, but the framework should provide affordances for it.

**Internationalization.** The Voice primitive is implicitly English-centric. VocabularySpec, SyntaxSpec, RhetoricSpec -- these assume English linguistic structures. An entity that speaks Japanese has different syntax rules, different rhetorical conventions, different formality registers. The primitive schemas need to be language-aware, and they are not.

**Testing strategy.** I have evaluation metrics for entity output quality. I do not have a testing strategy for the framework itself. How do I integration-test the FrameAssembler? How do I load-test the live interaction pipeline? How do I regression-test when I change the evaluation formula? These are engineering questions that the design document does not address because it is a design document, not an engineering plan. But they need answers before Phase 1 ships.

---

## 9. Final Assessment

Is this worth building? Yes, under conditions. The primitive vocabulary is genuinely novel and genuinely useful -- it names a problem that thousands of creators have today and gives them a structured language to think about it. The architecture is sound at the design level. The roadmap is realistic in its phasing. The competitive window is real but finite. What makes this succeed: the evaluation system works well enough for creators to trust it, the voice consistency holds over hundreds of outputs on a single model version, the prototype proves that identity persistence is not just measurable but perceptible to real audiences, and I ship the developer-facing product before the window closes. What makes this fail: the evaluation scores are noisy garbage that do not correlate with human judgment, the voice drifts toward generic LLM output and the Voice spec cannot prevent it, I get distracted building features instead of proving the core thesis, or a well-funded competitor ships a simpler version that is good enough. The honest odds? Maybe 30% chance this becomes a real business. Maybe 50% chance the primitives get adopted even if Idol Frame the company does not survive. I would take those odds. The alternative is that nobody builds this and creators keep copy-pasting character descriptions into ChatGPT for another five years. That is worse.

# Part 7: Multimodal Materialization

**Status:** NORMATIVE
**Depends on:** Part 3 (Framework Primitives), Part 5 (System Architecture)
**Version:** 1.0.0
**Date:** 2026-03-15

---

## 1. The Materialization Problem

A single Entity produces output across radically different media surfaces. One IdentityCore must drive recognizable behavior whether the entity is tweeting, narrating a YouTube video, appearing in a generated portrait, streaming live to an audience, or speaking in a synthesized voice clip.

This is not a formatting problem. It is an identity-preservation problem under transformation.

### 1.1 Why This Is Hard

Each medium imposes distinct constraints on what identity can express:

| Medium | Constraint | Affordance | Identity Signal |
|--------|-----------|------------|-----------------|
| Text (short-form) | Character limits, no tone of voice | Speed, wit, threading | Word choice, rhythm, stance |
| Text (long-form) | Reader attention, structural expectations | Depth, nuance, argument | Rhetorical style, argument structure, Voice |
| Image | No temporal dimension, no language | Immediate emotional impact, visual branding | Color palette, composition, visual motifs |
| Audio/Voice | No visual, linear consumption | Prosody, pacing, emotional warmth | Vocal timbre, cadence, emotional register |
| Video | Production complexity, bandwidth | Multi-sensory, avatar presence | All of the above simultaneously |
| Live stream | Real-time latency, no retakes | Audience interaction, spontaneity | Consistency under pressure, interaction style |

The problem compounds: an audience member who follows an entity on Twitter, watches its YouTube videos, and listens to its podcast must experience a coherent identity across all three. If Voice says this entity uses short, punchy sentences and avoids jargon, that must hold in a tweet, a video script, and a podcast monologue. If Aesthetic defines a warm, desaturated color palette, that must hold in a profile picture, a video thumbnail, and a generated illustration.

### 1.2 The Coherence Requirement

The test for successful multimodal materialization is simple:

**If you stripped the entity's name and branding from outputs across five different media, could a human who knows the entity identify it from the outputs alone?**

This is not aspirational. It is the measurable standard that the materialization pipeline must satisfy. `evaluation.IdentityEvaluator` and `evaluation.VoiceAnalyzer` score this across all media types (see Section 4).

### 1.3 Scope

This part covers:
- How the Adapter primitive (Part 3, #16) is implemented as a concrete interface
- How each media type consumes IdentityCore, Voice, Aesthetic, and Mood to produce output
- How the materialization pipeline sequences planning, generation, adaptation, and evaluation
- How generated assets are stored and reused

It does not cover platform API integration details (authentication, rate limits, webhook formats). Those belong to per-platform adapter implementation documentation.

---

## 2. The Adapter Model

### 2.1 Adapter Interface Contract

Every Adapter registered in `media.AdapterRegistry` must implement the following interface:

```
interface Adapter {
  // Identity
  id:            UUID
  stage_id:      UUID
  adapter_module: String
  version:       SemVer
  capabilities:  List<ContentType>
  config:        Map<String, Any>

  // Required methods
  validate(output: PerformanceOutput) -> ValidationResult
  adapt(frame: DecisionFrame, plan: PerformancePlan, output: PerformanceOutput) -> AdaptedOutput
  publish(adapted: AdaptedOutput) -> PublishResult
  preview(frame: DecisionFrame, plan: PerformancePlan) -> PreviewResult

  // Optional methods
  healthCheck() -> HealthStatus
  estimateCost(plan: PerformancePlan) -> CostEstimate
  getCapabilities() -> AdapterCapabilities
}
```

**Method contracts:**

| Method | When Called | Must Guarantee |
|--------|-----------|---------------|
| `validate` | Before adaptation, by `performance.Publisher` | Returns pass/fail with specific format violations. No side effects. |
| `adapt` | After generation and evaluation pass | Transforms PerformanceOutput into stage-native format. May call external services (image resize, TTS). Must preserve identity signals. |
| `publish` | After successful adaptation | Delivers to platform. Returns platform-assigned IDs. Handles retries internally (up to 3). |
| `preview` | On-demand, for creator review | Returns a mock of what the output would look like on the Stage, without publishing. |
| `healthCheck` | Periodic, by `media.AdapterRegistry` | Reports platform API availability, token validity, rate limit headroom. |
| `estimateCost` | Before generation, optional | Returns estimated cost (API calls, tokens, compute) for the planned output. |

### 2.2 How an Adapter Consumes Its Inputs

An Adapter receives three objects from the performance pipeline:

1. **DecisionFrame** -- the full assembled context from `cognition.FrameAssembler`. The Adapter reads identity_core, effective Voice, effective Aesthetic, current Mood, and Stage configuration from this frame.

2. **PerformancePlan** -- the structured intent from `performance.Planner`. The Adapter reads content_type, tone_target, constraints, and key_points.

3. **PerformanceOutput** -- the raw generated content from `performance.Generator`. The Adapter transforms this into stage-native format.

The Adapter does not generate content. It transforms content. The generation boundary belongs to `performance.Generator`. The Adapter's job is format transformation, identity-consistent styling, and platform delivery.

### 2.3 Adapter Categories

Adapters are organized by the primary content type they handle. Each category has specific requirements beyond the base interface.

```
AdapterCategory
  |
  +-- TextAdapter
  |     Additional: thread_split(content, max_length) -> List<String>
  |     Additional: format_markup(content, markup_type) -> String
  |
  +-- ImageAdapter
  |     Additional: build_prompt(aesthetic, mood, brief) -> ImageGenPrompt
  |     Additional: apply_style_transfer(image, aesthetic) -> StyledImage
  |     Additional: validate_visual_identity(image, aesthetic) -> Float[0,1]
  |
  +-- AudioAdapter
  |     Additional: build_tts_config(voice, mood) -> TTSConfig
  |     Additional: apply_prosody(audio, mood) -> ProcessedAudio
  |     Additional: validate_vocal_identity(audio, voice) -> Float[0,1]
  |
  +-- VideoAdapter
  |     Additional: build_avatar_config(aesthetic, voice) -> AvatarConfig
  |     Additional: compose_scene(script, avatar, assets) -> VideoScene
  |     Additional: render(scenes: List<VideoScene>) -> VideoOutput
  |
  +-- LiveAdapter
  |     Additional: open_session() -> LiveSession
  |     Additional: process_realtime(input, frame) -> StreamChunk
  |     Additional: close_session(session: LiveSession) -> SessionSummary
  |
  +-- CompositeAdapter
        Additional: chain: List<Adapter>
        Additional: execute_chain(frame, plan, output) -> AdaptedOutput
```

### 2.4 Adapter Composition

Adapters can chain to produce complex outputs. A CompositeAdapter wraps an ordered list of Adapters and passes intermediate outputs through the chain.

**Example chain: Text to Video with Lip Sync**

```
CompositeAdapter {
  chain: [
    TextAdapter        (script formatting, timing markers)
    AudioAdapter       (TTS from formatted script)
    VideoAdapter       (avatar animation synced to audio)
  ]
}
```

**Chaining rules:**
- Each adapter in the chain receives the output of the previous adapter as an additional input via `AdaptedOutput.intermediate_artifacts`.
- The first adapter in the chain receives the raw PerformanceOutput.
- The last adapter in the chain produces the final AdaptedOutput for publication.
- If any adapter in the chain fails, the entire chain fails. Partial outputs are stored as artifacts for debugging.
- The DecisionFrame and PerformancePlan are passed to every adapter in the chain (they may each need identity information).

**Chain validation at registration:**

When a CompositeAdapter is registered with `media.AdapterRegistry`, the registry validates:
1. Output type of adapter N is compatible with input type of adapter N+1.
2. No circular references in the chain.
3. All adapters in the chain are independently registered and healthy.

---

## 3. Media-Specific Materialization

### 3.1 Text Materialization

Text is the most common output type and the one where Voice is expressed most directly. Every text-producing Stage uses a TextAdapter (or a CompositeAdapter starting with one).

#### 3.1.1 Voice-to-Prompt Mapping

The `identity.VoiceRegistry` provides an EffectiveVoice (Voice modulated by current Mood via `state.MoodController`). The TextAdapter maps EffectiveVoice fields to generation prompt instructions:

```
VoiceField                  Prompt Instruction (injected into system prompt)
-----------                 -------------------------------------------------
vocabulary.preferred_terms   "Use these words/phrases when natural: {terms}"
vocabulary.avoided_terms     "Never use these words/phrases: {terms}"
vocabulary.jargon_level      "Technical language level: {level}/10"
syntax.avg_sentence_length   "Target sentence length: {length} words"
syntax.fragment_frequency    "Use sentence fragments {frequency}% of the time"
syntax.complexity            "Syntactic complexity: {level} (1=simple, 5=complex)"
rhetoric.primary_devices     "Rhetorical style: favor {devices}"
rhetoric.avoided_devices     "Avoid: {devices}"
emotional_register.baseline  "Emotional baseline: {register}"
emotional_register.range     "Emotional range: {min} to {max}"
sample_utterances            "Examples of this entity's voice: {samples}"
```

When Mood is active, `voice_mods` from the Mood primitive shift these values:
- `voice_mods.formality_shift` adjusts syntax complexity
- `voice_mods.intensity_shift` adjusts emotional register intensity
- `voice_mods.tempo_shift` adjusts average sentence length

All shifts are clamped to the [-0.3, 0.3] range enforced by `state.MoodController`.

#### 3.1.2 Format Adaptation by Stage

Different text Stages require different formatting. The TextAdapter reads `Stage.format` (FormatSpec) and adapts accordingly:

| Stage Type | Format Rules |
|-----------|-------------|
| Twitter/X | Max 280 chars per post. Thread splitting at sentence boundaries via `media.FormatTransformer`. Hashtag injection from Directive or Campaign. No markdown. |
| Newsletter | HTML formatting. Section headers. Consistent greeting/signoff derived from Voice.sample_utterances. Image embed points marked. |
| Discord/DM | Conversational register. Emoji usage governed by Voice.rhetoric (if emoji is a preferred device). Shorter paragraphs. Plain text with limited markdown. |
| Long-form article | Full markdown. Table of contents generation for 1000+ word pieces. Pull quote extraction. Metadata block (title, subtitle, tags). |
| Reddit | Platform markdown dialect. Subreddit-specific formatting conventions loaded from Stage.config. |
| Caption (image/video) | Brief, punchy. Hashtag block. Call-to-action patterns from Campaign if active. |

#### 3.1.3 Thread Construction

For platforms with character limits, the TextAdapter's `thread_split` method handles thread construction:

```
thread_split(content: String, max_length: Int) -> List<String>

Algorithm:
1. If content.length <= max_length, return [content].
2. Split content at sentence boundaries.
3. Greedily pack sentences into posts, each <= max_length.
4. If a single sentence exceeds max_length, split at clause boundaries (comma, semicolon, em-dash).
5. If a single clause exceeds max_length, split at word boundaries with ellipsis continuation.
6. Add thread indicators: "1/" prefix for first post, "2/" etc. for subsequent.
7. Ensure the final post contains the conclusion, not a fragment.
```

Thread construction respects Voice: if the entity's syntax.avg_sentence_length is high, threads will naturally have fewer sentences per post. The algorithm does not override Voice by artificially shortening sentences to fit more per post.

#### 3.1.4 Formatting by Stage Markup Type

`media.FormatTransformer` handles the final markup conversion:

| Stage markup_type | Transformation |
|-------------------|---------------|
| `plain` | Strip all formatting. Unicode-safe. |
| `markdown` | Standard CommonMark. Validated. |
| `html` | Convert from internal markdown to sanitized HTML. Inline styles for email compatibility. |
| `platform_native` | Platform-specific formatting (Twitter card metadata, Discord embeds, Reddit flairs). |

---

### 3.2 Image Materialization

Image generation requires translating the Aesthetic primitive into generation prompts and ensuring visual consistency across all generated images for an entity.

#### 3.2.1 Aesthetic-to-Prompt Mapping

The `identity.AestheticRegistry` provides an EffectiveAesthetic (Aesthetic modulated by Mood). The ImageAdapter maps this to image generation prompts:

```
AestheticField              Prompt Component
-----------                 -----------------
color_palette.primary        "Primary color: {hex}. Dominant in composition."
color_palette.secondary      "Secondary colors: {hex_list}."
color_palette.accent         "Accent color: {hex}. Used sparingly for emphasis."
color_palette.mood_shifts    Applied to shift palette warm/cool based on Mood
visual_style.era             "Art style era: {era}"
visual_style.medium          "Medium: {medium}" (e.g., digital painting, photography)
visual_style.influences      "Visual influences: {artists/movements}"
visual_style.texture         "Texture quality: {texture}" (e.g., grainy, smooth, brushed)
composition.framing          "Default framing: {framing}" (e.g., centered, rule of thirds)
composition.negative_space   "Negative space usage: {level}"
composition.depth            "Depth of field: {spec}"
references                   Injected as reference images for style consistency
typography.primary_font      Used for any text overlays
typography.style             "Typography style: {style}" (e.g., hand-lettered, clean sans)
```

#### 3.2.2 Mood-Driven Visual Modulation

When a Mood is active, the Aesthetic shifts measurably but does not break visual identity:

| Mood Category | Color Shift | Contrast | Saturation | Composition |
|--------------|------------|----------|-----------|-------------|
| Joy/Excitement | Warmer (+15K color temp) | Slightly reduced | +10% | More open, expansive framing |
| Sadness/Melancholy | Cooler (-10K color temp) | Increased | -15% | Tighter framing, more negative space |
| Anger/Frustration | Red shift in accents | High contrast | +5% | Aggressive angles, tight crops |
| Calm/Contemplative | No shift | Slightly reduced | -5% | Balanced, centered, open |
| Anxious/Uncertain | Slight desaturation | Increased | -10% | Off-center, tilted, claustrophobic |

These shifts are applied as modifiers to the base Aesthetic, not replacements. The `identity.AestheticRegistry.GetEffectiveAesthetic` call returns the modulated version. Shifts stay within bounds that preserve the entity's visual recognition signature.

#### 3.2.3 Reference Image System

Maintaining visual consistency across generated images requires a reference system:

```
ReferenceImage {
  id:          UUID
  entity_id:   UUID
  category:    Avatar | Style | Scene | Motif | ColorRef
  image_url:   String
  weight:      Float[0, 1]     // How strongly this reference constrains generation
  tags:        List<String>    // mood, epoch, context tags
  active:      Boolean
}
```

The ImageAdapter includes active reference images in generation requests:
- `Avatar` references enforce facial/character consistency.
- `Style` references enforce artistic style consistency.
- `Motif` references ensure recurring visual elements appear.
- `ColorRef` references provide ground-truth color calibration.

Reference images are stored in the asset library (Section 6) and tagged with the Epoch in which they were created. When an Epoch transition changes the Aesthetic, reference images from the new epoch take priority.

#### 3.2.4 Integration Points

The ImageAdapter abstracts over multiple generation backends:

```
ImageAdapter.config = {
  provider:        "stable_diffusion" | "dall_e" | "midjourney" | "custom"
  api_endpoint:    String
  model_version:   String
  default_size:    { width: Int, height: Int }
  style_preset:    String | null
  negative_prompt: String          // Global negative prompt (appended to all requests)
  max_retries:     Int
  timeout_ms:      Int
}
```

Provider-specific prompt formatting is handled internally by the ImageAdapter. The caller (the performance pipeline) provides the same Aesthetic and brief regardless of backend. The Adapter handles translation.

After generation, the ImageAdapter runs `validate_visual_identity`:
1. Compare generated image color histogram against Aesthetic.color_palette. Score: 0.0-1.0.
2. If reference images exist, run perceptual similarity (LPIPS or CLIP embedding distance). Score: 0.0-1.0.
3. Composite visual identity score = 0.5 * color_score + 0.5 * reference_score.
4. If score < 0.6, flag for regeneration or manual review.

---

### 3.3 Audio/Voice Materialization

Audio materialization converts text content and Voice parameters into speech that sounds recognizably like the entity.

#### 3.3.1 Voice-to-TTS Configuration

The AudioAdapter reads EffectiveVoice and maps it to TTS provider configuration:

```
TTSConfig {
  voice_id:          String       // Provider-specific voice clone ID
  stability:         Float[0, 1]  // How closely to match the base voice
  similarity_boost:  Float[0, 1]  // How much to prioritize voice similarity
  style:             Float[0, 1]  // Expressiveness vs. monotone
  speed:             Float[0.5, 2.0]  // Speech rate multiplier
  pitch_shift:       Float[-1, 1]     // Semitone adjustment
  emphasis_markers:  Boolean          // Whether SSML emphasis tags are supported
}
```

**Mapping from Voice primitive to TTSConfig:**

| Voice Field | TTS Parameter | Mapping Logic |
|------------|--------------|---------------|
| syntax.avg_sentence_length | speed | Longer sentences -> slightly slower speed (0.9x). Short, punchy -> faster (1.1x). |
| rhetoric.primary_devices | style | If devices include "understatement", style = 0.3. If "exclamation", style = 0.8. |
| emotional_register.baseline | stability | Calm baseline -> high stability (0.8). Volatile baseline -> lower stability (0.5). |
| emotional_register.range | similarity_boost | Narrow range -> high similarity (0.9). Wide range -> lower (0.6), allowing more expression. |

#### 3.3.2 Mood-Driven Prosody Modulation

When a Mood is active, the AudioAdapter adjusts prosody parameters:

```
MoodProsodyModulation:
  joy:         speed +0.1, pitch_shift +0.5, style +0.2
  sadness:     speed -0.15, pitch_shift -0.3, style -0.1
  anger:       speed +0.05, pitch_shift +0.2, style +0.3, stability -0.1
  calm:        speed -0.05, pitch_shift 0, style -0.15, stability +0.1
  excitement:  speed +0.15, pitch_shift +0.3, style +0.25
  anxiety:     speed +0.1, pitch_shift +0.1, style +0.1, stability -0.15
```

Modulations are scaled by `Mood.intensity`. At intensity 0.5, the modulation values above are halved. At intensity 1.0, they apply fully. This ensures moods at low intensity produce subtle shifts, not dramatic vocal changes.

All modulated values are clamped to valid TTS parameter ranges.

#### 3.3.3 Vocal Identity Consistency

To ensure the entity sounds like itself across sessions:

1. **Voice cloning baseline.** Each entity with audio output has a `voice_id` referencing a cloned voice profile at the TTS provider. This is the acoustic anchor.
2. **Consistency validation.** After TTS generation, the AudioAdapter runs `validate_vocal_identity`:
   - Extract speaker embedding from generated audio.
   - Compare against stored baseline speaker embedding.
   - Score: cosine similarity. Threshold: 0.85.
   - If below threshold: regenerate with higher `stability` and `similarity_boost`.
3. **Sample library.** Approved audio outputs are stored in the asset library (Section 6), tagged with mood and epoch, and available as reference for future consistency checks.

#### 3.3.4 Integration Points

```
AudioAdapter.config = {
  provider:       "elevenlabs" | "playht" | "custom_tts"
  api_endpoint:   String
  voice_id:       String
  model_id:       String
  output_format:  "mp3" | "wav" | "ogg" | "pcm"
  sample_rate:    Int             // e.g., 44100, 22050
  max_length_sec: Int             // Maximum audio clip duration
  ssml_support:   Boolean
  timeout_ms:     Int
}
```

For custom TTS models (self-hosted), the AudioAdapter supports a generic HTTP interface:
- POST `/synthesize` with `{ text, config: TTSConfig }` -> audio bytes
- GET `/voices/{voice_id}/embedding` -> speaker embedding vector

---

### 3.4 Video Materialization

Video combines text, audio, and visual identity into a single output. It is the most complex materialization type and always uses a CompositeAdapter chain.

#### 3.4.1 The Video Production Pipeline

```
Script (from performance.Generator)
    |
    v
TextAdapter: format script with timing markers, scene breaks
    |
    v
AudioAdapter: generate narration/dialogue from script
    |
    v
VideoAdapter: compose visual scenes synced to audio
    |
    v
AdaptedOutput: final video file or stream URL
```

Each step in this pipeline receives the DecisionFrame, so identity parameters are available throughout.

#### 3.4.2 Avatar Animation

For entities with a visual avatar, the VideoAdapter generates animated video from identity parameters:

```
AvatarConfig {
  avatar_type:     "2d_animated" | "3d_rendered" | "deepfake_style" | "illustrated"
  base_model_id:   String          // Provider-specific avatar model
  appearance:      AestheticSubset // Derived from entity Aesthetic
  expression_map:  Map<String, ExpressionParams>  // mood -> facial expression config
  gesture_style:   String          // "minimal" | "moderate" | "expressive"
  background:      BackgroundConfig
}
```

**Appearance derivation from Aesthetic:**
- `Aesthetic.visual_style` determines avatar rendering style (photorealistic, illustrated, stylized).
- `Aesthetic.color_palette` drives clothing/accessory colors, background tones.
- `Aesthetic.composition.framing` sets default camera angle and distance.

**Expression mapping from Mood:**
- Each Mood state maps to a facial expression configuration (smile intensity, brow position, eye openness).
- Mood.intensity scales the expression: intensity 0.3 = subtle smile; intensity 0.9 = broad grin.
- Transitions between expressions are animated over 0.5-1.0 seconds to avoid jarring cuts.

#### 3.4.3 Script-to-Video Scene Composition

The VideoAdapter's `compose_scene` method structures each scene:

```
VideoScene {
  scene_id:      UUID
  duration_sec:  Float
  audio_track:   AudioRef           // From AudioAdapter output
  visual_layers: List<VisualLayer>  // Avatar, background, text overlays, b-roll
  transitions:   { in: TransitionType, out: TransitionType }
  subtitle_text: String | null
}

VisualLayer {
  type:     "avatar" | "background" | "overlay" | "b_roll" | "text"
  content:  MediaRef | String
  position: { x: Float, y: Float, z_index: Int }
  timing:   { start_sec: Float, end_sec: Float }
  animation: AnimationSpec | null
}
```

#### 3.4.4 Live vs. Pre-Recorded

| Concern | Pre-Recorded | Live |
|---------|-------------|------|
| Latency budget | Minutes to hours | < 2 seconds end-to-end |
| Quality control | Full evaluation pipeline | Abbreviated evaluation (guardrails only) |
| Retakes | Unlimited (regenerate until quality threshold met) | None (commit on first output) |
| Avatar rendering | Offline, high quality | Real-time, lower fidelity |
| Mood management | Set per scene | Dynamic, shifts during session |

Pre-recorded video uses the full `performance.Evaluator` pipeline. Live video skips quality scoring and relies on guardrail checks only (see Section 3.5).

#### 3.4.5 Integration Points

```
VideoAdapter.config = {
  provider:        "d_id" | "heygen" | "synthesia" | "custom"
  api_endpoint:    String
  avatar_id:       String
  default_resolution: { width: Int, height: Int }
  fps:             Int
  output_format:   "mp4" | "webm"
  max_duration_sec: Int
  background_mode: "virtual" | "chroma_key" | "generated"
  timeout_ms:      Int
}
```

---

### 3.5 Live/Streaming Materialization

Live materialization is the most constrained variant. The entity must produce coherent, identity-consistent output in real time with no opportunity for retakes.

#### 3.5.1 Real-Time Generation Constraints

**Latency budgets:**

```
Component              Budget (ms)    Notes
--------------------   -----------    -----
Frame assembly         50             Cached IdentityCore, pre-loaded traits
Planning               100            Simplified plan (no multi-point strategy)
Generation (LLM)       800            Streaming tokens, shorter max_tokens
Guardrail check        150            Parallel with generation tail
TTS synthesis          400            Streaming audio, chunked
Avatar animation       200            Real-time renderer
Network delivery       100            WebSocket or WebRTC
--------------------   -----------
Total                  ~1800          Target: < 2000ms for text+audio
```

For text-only live responses (chat), the budget shrinks:

```
Frame assembly         50
Planning               50
Generation (LLM)       600            Streaming
Guardrail check        100
Format adaptation      50
Delivery               50
--------------------   -----------
Total                  ~900           Target: < 1000ms
```

#### 3.5.2 The Live DecisionFrame

For live sessions, `cognition.FrameAssembler` operates in a cached mode:

1. **Session initialization.** Full frame assembly on session start. IdentityCore, Voice, Aesthetic, Guardrails, and Epoch-level state are loaded and cached.
2. **Per-interaction delta.** For each interaction within the session, only dynamic components are refreshed:
   - Mood (may have changed from previous interaction)
   - Relevant memories (new query against `cognition.MemoryRetriever`)
   - Session-scoped directives
   - Relationship state for the current interactor
3. **Cache invalidation.** If an `identity.*` or `cognition.guardrail.*` event fires on the event bus during the session, the cached components are invalidated and reloaded on the next interaction.

This reduces frame assembly time from ~200ms (full) to ~50ms (delta).

#### 3.5.3 Audience Interaction Processing

The LiveAdapter handles real-time audience input:

```
LiveSession {
  session_id:      UUID
  entity_id:       UUID
  stage_id:        UUID
  started_at:      ISO8601
  cached_frame:    DecisionFrame      // Refreshed via delta
  interaction_log: List<Interaction>  // Rolling window, last N interactions
  mood_tracker:    LiveMoodTracker    // Tracks mood shifts during session
  rate_limiter:    RateLimiter        // Prevents response flooding
}
```

**Interaction routing:**

```
Incoming audience message
    |
    v
Rate limiter check (drop if over limit)
    |
    v
Priority classification:
  - Direct question/mention -> HIGH (respond within 2s)
  - Conversation continuation -> MEDIUM (respond within 5s)
  - General chat message -> LOW (batch-process, respond selectively)
    |
    v
Delta frame assembly (50ms)
    |
    v
Lightweight planning (100ms)
    |
    v
LLM generation with streaming (800ms)
    |
    v
Parallel: guardrail check + TTS (if audio)
    |
    v
Deliver to stream
```

**Selective response:** In high-volume streams, the entity cannot respond to every message. The LiveAdapter uses a selection heuristic:
- Always respond to HIGH priority.
- Respond to MEDIUM if the response queue is not saturated.
- Respond to LOW selectively (1 in N, configurable), preferring messages that align with current topic or Relationship history.

#### 3.5.4 Managing Mood During Extended Sessions

Live sessions can last hours. Mood must evolve naturally:

1. **Mood triggers from audience.** The LiveAdapter's `mood_tracker` monitors sentiment of incoming messages. Sustained positive sentiment can trigger a joy Mood. Hostile messages can trigger frustration. Thresholds are configurable per entity.
2. **Decay during sessions.** `state.MoodController.TickDecay` is called at a configurable interval during live sessions (default: every 5 minutes). Moods decay toward baseline.
3. **Mood transition smoothing.** Abrupt mood changes in live settings feel jarring. The LiveAdapter enforces a minimum transition duration of 30 seconds: if a new Mood is set, the previous Mood's influence fades linearly over 30 seconds while the new Mood's influence increases.
4. **Trait consistency.** Even during long sessions with mood fluctuations, Trait values remain bounded per Invariant 4. The Trait modulations from Mood never exceed the IdentityCore-defined range.

#### 3.5.5 Integration Points

```
LiveAdapter.config = {
  transport:       "livekit" | "obs_websocket" | "custom_ws" | "webrtc"
  endpoint:        String
  room_id:         String | null         // For multi-participant sessions
  max_session_sec: Int                   // Hard session duration limit
  rate_limit:      { messages_per_sec: Int, burst: Int }
  priority_config: { high_pct: Float, medium_pct: Float, low_pct: Float }
  mood_check_interval_sec: Int
  audio_enabled:   Boolean
  video_enabled:   Boolean
  timeout_ms:      Int
}
```

---

## 4. Cross-Media Coherence

### 4.1 The Shared Root

All media-specific materialization flows start from the same source: the DecisionFrame assembled by `cognition.FrameAssembler`. This frame contains the same IdentityCore, the same effective Voice, the same effective Aesthetic, and the same Mood regardless of which Adapter consumes it.

This architectural choice is the primary coherence mechanism. There is no per-media identity configuration. There is one identity, expressed through many adapters.

### 4.2 Identity Coherence Metrics

`evaluation.IdentityEvaluator` scores identity consistency for every Performance, regardless of media type. The scoring dimensions from Part 5 apply across all media:

| Dimension | Text Measurement | Image Measurement | Audio Measurement | Video Measurement |
|-----------|-----------------|-------------------|-------------------|-------------------|
| Value alignment | Semantic analysis of content vs. IdentityCore.values | Subject matter and framing vs. values | Content of speech vs. values | Combined text + visual analysis |
| Worldview consistency | Stance and argument alignment | Visual metaphor alignment | Tone and content alignment | All channels analyzed |
| Recognition markers | Linguistic signature match | Visual motif presence | Vocal signature match | Multi-channel signature |
| Core tension balance | Argument complexity reflecting tensions | Visual complexity reflecting tensions | Tonal nuance reflecting tensions | Combined assessment |

**Cross-media coherence score:** `evaluation.HealthAggregator` computes a rolling cross-media coherence score by comparing identity consistency scores across different Stage types for the same entity over a configurable window (default: 7 days). If the standard deviation of identity scores across media types exceeds 0.15, a coherence alert is raised.

### 4.3 Coherence Enforcement Mechanisms

1. **Single IdentityCore.** All adapters read from the same immutable IdentityCore. No adapter may maintain its own identity state.
2. **Centralized Voice and Aesthetic.** `identity.VoiceRegistry` and `identity.AestheticRegistry` are the single sources of truth. Adapters consume, never modify.
3. **Uniform Mood modulation.** `state.MoodController` applies the same Mood with the same intensity to all concurrent performances. If an entity is tweeting and generating an image at the same time, both see the same Mood.
4. **Cross-adapter evaluation.** After a Campaign produces outputs across multiple Stages, `orchestration.CampaignPlanner.EvaluateCoherenceRules` checks that all outputs are identity-consistent with each other, not just individually.
5. **Drift detection across media.** `evaluation.DriftMonitor` tracks whether identity expression is drifting differently in different media (e.g., becoming more casual on Twitter while staying formal on YouTube). Divergence beyond threshold triggers an alert.

### 4.4 The Squint Test (Formalized)

The informal "squint test" (could you tell it's the same entity without seeing the name?) is formalized as a cross-media recognition evaluation:

```
CrossMediaRecognitionTest {
  entity_id:     UUID
  samples:       List<{ stage_id: UUID, output: PerformanceOutput }>  // 2+ media types
  evaluator:     LLM-based or human panel

  Procedure:
  1. Collect recent outputs from 3+ different Stage types.
  2. Strip entity name, profile picture, and platform branding.
  3. Present to evaluator alongside outputs from 3 other entities (also stripped).
  4. Evaluator must correctly group outputs by entity.
  5. Score: accuracy of correct grouping.

  Pass threshold: 0.75 (evaluator correctly groups 75%+ of outputs)
}
```

This test is run periodically by `evaluation.HealthAggregator` (default: weekly for active entities) and the result is included in the HealthReport.

---

## 5. Materialization Pipeline Architecture

### 5.1 Full Pipeline Diagram

```
TRIGGER (user message / schedule tick / campaign event)
    |
    v
+------------------------------------------------------+
|  cognition.FrameAssembler                            |
|  Reads: IdentityCore, Traits, Voice, Aesthetic,      |
|         Mood, Memory, Directives, Guardrails,        |
|         Arc, Relationships, Stage                    |
|  Output: DecisionFrame (immutable)                   |
+------------------------------------------------------+
    |
    v
+------------------------------------------------------+
|  performance.Planner                                 |
|  Reads: DecisionFrame                                |
|  Output: PerformancePlan                             |
|    { intent, content_type, tone, key_points,         |
|      constraints }                                   |
+------------------------------------------------------+
    |
    v
+------------------------------------------------------+
|  performance.Generator                               |
|  Reads: DecisionFrame + PerformancePlan              |
|  Calls: LLM (text) or generation API (image/audio)  |
|  Output: PerformanceOutput (raw)                     |
+------------------------------------------------------+
    |
    v
+------------------------------------------------------+
|  performance.Evaluator                               |
|  Checks:                                             |
|    1. cognition.GuardrailEnforcer (Block/Warn/Flag)  |
|    2. evaluation.IdentityEvaluator (identity score)  |
|    3. evaluation.VoiceAnalyzer (voice score)         |
|  Decision: Publish / Regenerate / Block              |
+------------------------------------------------------+
    |                          |
    | (pass)                   | (fail, attempts < max)
    v                          v
+-------------------+    Loop back to Generator
|  Adapter.adapt()  |    with feedback
|  (via media.      |
|  AdapterRegistry) |
|                   |
|  Transform raw    |
|  output to stage  |
|  format           |
+-------------------+
    |
    v
+-------------------+
|  Adapter.publish() |
|  Deliver to        |
|  platform          |
+-------------------+
    |
    v
+------------------------------------------------------+
|  performance.SideEffectProcessor                     |
|  Updates: Memory (episodic), Mood, Relationships,    |
|           Trait nudges                               |
+------------------------------------------------------+
    |
    v
EVENT BUS: performance.published
```

### 5.2 Where Each Concern Is Handled

| Concern | Where in Pipeline | Module |
|---------|------------------|--------|
| Identity assembly | Step 1 | `cognition.FrameAssembler` |
| Content planning | Step 2 | `performance.Planner` |
| Content generation | Step 3 | `performance.Generator` |
| Guardrail enforcement | Step 4 | `cognition.GuardrailEnforcer` (via `performance.Evaluator`) |
| Identity quality check | Step 4 | `evaluation.IdentityEvaluator` (via `performance.Evaluator`) |
| Voice quality check | Step 4 | `evaluation.VoiceAnalyzer` (via `performance.Evaluator`) |
| Format transformation | Step 5 | Adapter (via `media.FormatTransformer`) |
| Platform delivery | Step 6 | Adapter (via `performance.Publisher`) |
| State updates | Step 7 | `performance.SideEffectProcessor` |

**Key ordering constraint:** Guardrail checking happens BEFORE format adaptation. The Adapter receives only content that has already passed all guardrails and quality thresholds. This prevents a situation where content passes guardrails in one format but violates them after adaptation (e.g., a truncation that removes a required disclaimer).

**Exception:** For format-dependent guardrails (e.g., "image must not contain text smaller than 12pt"), the Adapter runs a post-adaptation guardrail check via `cognition.GuardrailEnforcer.EvaluateOutput` with the adapted output. This is a second-pass check, not a replacement for the primary check.

### 5.3 Caching and Optimization

Repeated materialization patterns benefit from caching at multiple levels:

| Cache Layer | What Is Cached | TTL | Invalidation |
|------------|---------------|-----|-------------|
| Frame cache | IdentityCore, Voice, Aesthetic, Guardrails | Session duration | `identity.*` events on event bus |
| Trait cache | Effective trait values (post-mood modulation) | Until next Mood change | `state.mood.changed` event |
| Memory cache | Top-K relevant memories for current context | Per-interaction | Always refreshed |
| TTS cache | Audio clips for frequently repeated phrases | 24 hours | Voice or Mood change |
| Avatar cache | Rendered avatar frames for common expressions | 1 hour | Aesthetic or Mood change |
| Prompt template cache | Compiled prompt templates per Stage type | Until Voice change | `identity.voice.*` events |

Caches are entity-scoped. One entity's cache never serves another entity's requests.

---

## 6. Asset Management

### 6.1 Generated Assets as Reusable Artifacts

Every non-text output produced by the materialization pipeline is a generated asset: images, audio clips, video segments, avatar renders. These assets are stored, tagged, and available for reuse.

### 6.2 Asset Library Schema

```
Asset {
  id:           UUID
  entity_id:    UUID
  type:         "image" | "audio" | "video" | "avatar_frame" | "thumbnail"
  storage_url:  String              // Blob storage URL
  format:       String              // MIME type
  size_bytes:   Int
  created_at:   ISO8601
  created_by:   UUID                // Performance ID that produced this asset

  // Identity metadata
  epoch_id:     UUID                // Which Epoch this was generated during
  mood_state:   String | null       // Mood active at generation time
  mood_intensity: Float | null
  trait_snapshot: Map<String, Float> // Effective trait values at generation

  // Tagging
  tags:         List<String>        // Searchable tags (e.g., "portrait", "happy", "promotional")
  aesthetic_version: SemVer         // Which Aesthetic version was used

  // Quality
  identity_score:  Float[0, 1]     // From evaluation.IdentityEvaluator
  approved:        Boolean          // Creator-approved for reuse

  // Usage tracking
  usage_count:     Int
  last_used_at:    ISO8601 | null
}
```

### 6.3 Asset Library Operations

The asset library is managed through the Media Subsystem:

```
AssetLibrary API:

POST   /api/v1/entities/{id}/assets              Store new asset
GET    /api/v1/entities/{id}/assets               List assets (filterable)
GET    /api/v1/entities/{id}/assets/{asset_id}    Get asset metadata
GET    /api/v1/entities/{id}/assets/{asset_id}/download  Download asset file
DELETE /api/v1/entities/{id}/assets/{asset_id}    Soft-delete asset
POST   /api/v1/entities/{id}/assets/{asset_id}/approve   Creator approval

Query filters:
  ?type=image
  ?epoch_id={uuid}
  ?mood=joy
  ?tags=portrait,promotional
  ?min_identity_score=0.8
  ?approved=true
  ?created_after=2026-01-01
```

### 6.4 Asset Reuse Rules

Assets can be reused across performances under these conditions:

1. **Epoch match.** An asset from a previous Epoch may not be reused in the current Epoch unless the Aesthetic has not changed between epochs. The `aesthetic_version` field is checked against the current Aesthetic version.

2. **Mood compatibility.** Assets tagged with a specific mood can be reused when the entity is in the same or similar mood. Mood similarity is determined by a configurable mapping (e.g., "joy" and "excitement" are compatible; "joy" and "sadness" are not).

3. **Identity score threshold.** Only assets with `identity_score >= 0.7` are eligible for reuse. Assets below this threshold were identity-marginal at creation and should not propagate.

4. **Creator approval.** Assets marked `approved: true` can be reused automatically. Unapproved assets require creator review before reuse in new contexts.

5. **Freshness.** For avatar images and profile pictures, a freshness policy applies: assets older than the configurable `max_asset_age` (default: 90 days) are flagged for regeneration, even if still identity-consistent.

### 6.5 Asset Consistency Validation

Periodic validation ensures the asset library stays coherent with the entity's current identity:

```
AssetConsistencyCheck {
  trigger:     Scheduled (weekly) | EpochTransition | AestheticUpdate

  Procedure:
  1. Load current EffectiveAesthetic from identity.AestheticRegistry.
  2. For each approved image asset:
     a. Run ImageAdapter.validate_visual_identity(asset, current_aesthetic).
     b. If score < 0.5, mark asset as stale (remove from reuse pool).
     c. If score 0.5-0.7, flag for creator review.
  3. For each approved audio asset:
     a. Run AudioAdapter.validate_vocal_identity(asset, current_voice).
     b. Apply same thresholds.
  4. Generate AssetConsistencyReport.
  5. Emit evaluation.asset_consistency event.
}
```

When an Epoch transition or Aesthetic update occurs, this check runs immediately. Assets that no longer match the current identity are retired from active reuse but retained in storage for historical reference and potential rollback via `evolution.SnapshotService`.

### 6.6 Storage and Retention

Assets are stored in the same blob storage infrastructure used by the Snapshot Store (Part 5, Section 3). Retention policy:

| Asset Category | Retention |
|---------------|-----------|
| Creator-approved, identity_score >= 0.8 | Indefinite |
| Creator-approved, identity_score 0.7-0.8 | 1 year |
| Unapproved, identity_score >= 0.7 | 180 days |
| Unapproved, identity_score < 0.7 | 90 days |
| Stale (failed consistency check) | 90 days after marking |

Storage costs are reported via `Adapter.estimateCost` and surfaced in the `evaluation.HealthAggregator` HealthReport.

---

## Summary of Module References

All modules referenced in this part, with their canonical Part 5 names:

| Module | Role in Materialization |
|--------|------------------------|
| `cognition.FrameAssembler` | Assembles the DecisionFrame consumed by all adapters |
| `performance.Planner` | Creates the PerformancePlan that guides generation and adaptation |
| `performance.Generator` | Produces raw content (text, image prompts, scripts) |
| `performance.Evaluator` | Scores output quality and enforces thresholds |
| `performance.Publisher` | Routes approved output to the correct Adapter |
| `performance.SideEffectProcessor` | Updates entity state after publication |
| `media.AdapterRegistry` | Stores and retrieves Adapter instances by Stage |
| `media.StageManager` | Provides Stage configuration and format constraints |
| `media.FormatTransformer` | Handles markup and format conversion |
| `identity.VoiceRegistry` | Provides EffectiveVoice (Voice + Mood modulation) |
| `identity.AestheticRegistry` | Provides EffectiveAesthetic (Aesthetic + Mood modulation) |
| `identity.TraitEngine` | Provides effective trait values |
| `state.MoodController` | Provides current Mood and modulation values |
| `cognition.GuardrailEnforcer` | Validates output against Guardrails |
| `evaluation.IdentityEvaluator` | Scores identity consistency across media types |
| `evaluation.VoiceAnalyzer` | Scores voice consistency in text and audio |
| `evaluation.DriftMonitor` | Detects cross-media identity drift |
| `evaluation.HealthAggregator` | Aggregates cross-media coherence metrics |
| `orchestration.CampaignPlanner` | Enforces cross-stage coherence rules |

## Summary of Primitive References

All Part 3 primitives referenced in this part:

| Primitive | How Used in Materialization |
|-----------|---------------------------|
| Entity | Root container; owns all identity components |
| IdentityCore | Shared root that all adapters read for identity coherence |
| Trait | Modulated by Mood, read by adapters for behavioral calibration |
| Voice | Mapped to text prompts, TTS config, and video scripts |
| Aesthetic | Mapped to image prompts, avatar config, and video styling |
| Lore | Provides narrative context for content generation |
| Memory | Retrieved for contextual relevance in generation |
| Mood | Modulates Voice, Aesthetic, and Trait expression across all media |
| Directive | Shapes content intent via PerformancePlan |
| Guardrail | Enforced before and after adaptation |
| DecisionFrame | The assembled context consumed by the entire pipeline |
| Performance | The output event, one per materialization |
| Stage | The target media surface with format constraints |
| Adapter | The transformation layer between generation and platform |
| Epoch | Scopes asset validity and Aesthetic version |
| Campaign | Coordinates cross-stage coherence |

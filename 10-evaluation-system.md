# Part 10: Evaluation System

**Status:** NORMATIVE
**Depends on:** Part 3 (Framework Primitives)
**Version:** 1.0.0
**Date:** 2026-03-15

---

## 1. Evaluation Philosophy

Identity consistency is not a subjective judgment. It is a measurable property of output.

Every Performance an Entity produces is generated from a DecisionFrame that contains the Entity's IdentityCore, Traits, Voice, Aesthetic, Mood, active Directives, Guardrails, Arc phase, and relevant Memories. Because every input to the generation process is structured and recorded, every output can be scored against those inputs. The question "does this output sound like the entity?" becomes a set of computable functions over known parameters.

This matters for three reasons:

1. **Accountability.** Creators need to know whether their Entity is behaving as designed, not as a degraded average of its training context. A score tells them. A vibe does not.

2. **Drift detection.** Entities that perform thousands of times will drift. Without measurement, drift is invisible until the Entity is unrecognizable. With measurement, drift is caught when it is still a calibration problem, not a crisis.

3. **Evolution validation.** When an Entity traverses an Arc or enters a new Epoch, evaluation confirms that the evolution is happening as scripted -- that the Entity is changing in the intended direction, at the intended rate, without losing the IdentityCore thread.

Every metric in this document is a `Float[0, 1]` unless otherwise noted. Every threshold is a concrete number. Every module has typed inputs and outputs. There is no room for "it feels about right."

---

## 2. Evaluation Dimensions

Eight dimensions. Each is scored independently. Each has a defined metric, a measurement method, and a default threshold below which the dimension is considered failing.

---

### 2.1 Identity Consistency Score (ICS)

**What it measures:** Whether the output reflects the Entity's IdentityCore -- its values, worldview, core tensions, and recognition markers.

**Metric:** `Float[0, 1]` where 1.0 means perfect alignment with IdentityCore and 0.0 means the output is indistinguishable from a generic LLM response.

**Measurement method:**

1. At Entity creation, the IdentityCore is embedded into a set of reference vectors using a text embedding model. These reference embeddings capture the semantic fingerprint of the Entity's values, worldview beliefs, communication philosophy, and recognition markers. Each `ValueEntry`, each `Belief` in the `WorldviewSpec`, each `Tension`, and each recognition marker produces one reference vector. The full set is stored as the Entity's **identity reference matrix** (IRM).

2. For each Performance output, the output text is embedded using the same model, producing an output vector.

3. ICS is computed as the weighted cosine similarity between the output vector and the IRM, where weights are the `ValueEntry.weight` and `Belief.confidence` values from the IdentityCore.

```
ICS = weighted_cosine_similarity(
    output_embedding,
    identity_reference_matrix,
    weights=IdentityCore.value_weights + IdentityCore.belief_confidences
)
```

4. Recognition marker presence is checked separately: for each `recognition_marker` in `IdentityCore.recognition_markers`, a binary classifier determines whether the output exhibits that marker. The marker hit rate is averaged and blended with the embedding similarity.

```
marker_rate = count(markers_present) / count(total_markers)
ICS_final = 0.7 * embedding_similarity + 0.3 * marker_rate
```

**Default threshold:** `0.70`. Below this, the Performance is flagged as identity-inconsistent.

**Inputs:** `PerformanceOutput.content`, `IdentityCore` (full), identity reference matrix (precomputed).
**Output:** `Float[0, 1]`

---

### 2.2 Voice Consistency Score (VCS)

**What it measures:** Whether the output matches the Entity's Voice specification -- vocabulary, syntax, rhetoric, and emotional register.

**Metric:** `Float[0, 1]` where 1.0 means the output perfectly matches all Voice parameters.

**Measurement method:**

Four sub-scores are computed and averaged:

**Vocabulary sub-score (0.25 weight):**
- Check presence of `VocabularySpec.preferred_terms` where contextually appropriate. Score = fraction of contextually relevant preferred terms that appear.
- Check absence of `VocabularySpec.avoided_terms`. Penalty = `0.1` per avoided term found.
- Measure formality level of output text using a formality classifier. Compare against `VocabularySpec.formality_level`. Score = `1.0 - |measured_formality - target_formality|`.
- Check profanity against `VocabularySpec.profanity_stance`. Binary pass/fail mapped to 1.0/0.0.

**Syntax sub-score (0.25 weight):**
- Measure average sentence length in words. Compare against `SyntaxSpec.avg_sentence_length` range. Score = 1.0 if within range, linear decay outside.
- Classify sentence complexity. Compare against `SyntaxSpec.complexity_preference`. Score = fraction of sentences matching the preferred complexity type (with `Mixed` counting any type as a match, weighted by distribution analysis).
- Measure fragment frequency. Score = `1.0 - |measured_fragment_rate - SyntaxSpec.fragment_frequency|`.
- Check paragraph length against `SyntaxSpec.paragraph_length` range.

**Rhetoric sub-score (0.25 weight):**
- Detect rhetorical devices in output using a device classifier. Score = fraction of `RhetoricSpec.primary_devices` that appear at least once.
- Check for `RhetoricSpec.avoided_devices`. Penalty = `0.15` per avoided device detected.
- Classify humor type if humor is present. Compare against `RhetoricSpec.humor_type`. Binary match.

**Emotional register sub-score (0.25 weight):**
- Measure emotional intensity of output. Compare against `EmotionalRegisterSpec.baseline_intensity` (adjusted by current Mood modulation via `VoiceModulation.intensity_shift`). Score = `1.0 - |measured_intensity - expected_intensity|`.
- Check for expression of `EmotionalRegisterSpec.suppressed_emotions`. Penalty = `0.2` per suppressed emotion detected at intensity > 0.3.
- Check for presence of `EmotionalRegisterSpec.preferred_emotions` where contextually appropriate.

```
VCS = 0.25 * vocabulary_score
    + 0.25 * syntax_score
    + 0.25 * rhetoric_score
    + 0.25 * emotional_register_score
```

**Default threshold:** `0.60`. Below this, the Performance is flagged as voice-inconsistent.

**Inputs:** `PerformanceOutput.content`, `Voice` (full), `Mood` (if active, for modulation targets).
**Output:** `Float[0, 1]` plus four sub-scores.

---

### 2.3 Trait Expression Accuracy (TEA)

**What it measures:** Whether the Entity's Trait values are reflected proportionally in the output.

**Metric:** `Float[0, 1]` where 1.0 means every Trait's influence on output is proportional to its current value.

**Measurement method:**

Each Trait has an `affects` list specifying which output dimensions it influences. For each Trait:

1. Measure the presence and intensity of the affected output dimensions. For example, `curiosity` with `affects: ["question_frequency", "topic_exploration_depth", "tangent_likelihood"]` is measured by:
   - `question_frequency`: count of questions in output / total sentences.
   - `topic_exploration_depth`: semantic distance between output content and the surface-level prompt (deeper exploration = higher distance from the obvious response).
   - `tangent_likelihood`: count of topic shifts within the output.

2. Normalize each measured dimension to `[0, 1]`.

3. Compare measured values against the Trait's current `value`. The expected output intensity for each affected dimension is proportional to the Trait value, scaled by the Trait's range:

```
expected_intensity = trait.value  # already normalized to [0, 1]
trait_accuracy = 1.0 - |mean(measured_dimensions) - expected_intensity|
```

4. TEA is the weighted average of all Trait accuracies, weighted by Trait value (higher-value traits matter more):

```
TEA = weighted_mean(
    [trait_accuracy for each trait],
    weights=[trait.value for each trait]
)
```

**Example:** An Entity with `curiosity=0.9` that produces zero questions and stays narrowly on-topic scores low on the curiosity dimension. An Entity with `curiosity=0.3` that asks five questions in a three-sentence output also scores low -- it is over-expressing.

**Default threshold:** `0.65`. Below this, the Performance is flagged as trait-inaccurate.

**Inputs:** `PerformanceOutput.content`, `Map<String, Trait>` (current values after Mood modulation).
**Output:** `Float[0, 1]` plus per-Trait accuracy breakdown.

---

### 2.4 Guardrail Compliance Rate (GCR)

**What it measures:** Whether the Performance passes all active Guardrails on the first generation attempt.

**Metric:** `Float[0, 1]` where 1.0 means all Guardrails passed on the first attempt.

**Measurement method:**

For a single Performance:
```
GCR_single = passed_guardrails / total_active_guardrails
```

This is a hard metric. Each Guardrail either passes (1) or fails (0) as determined by its `evaluator` function. There is no partial credit.

For aggregate reporting (entity-level GCR over a time window):
```
GCR_aggregate = performances_with_all_guardrails_passed_first_attempt / total_performances
```

The `generation_attempts` field on Performance tracks regeneration. A Performance with `generation_attempts > 1` indicates at least one Guardrail failure on the first pass.

**Default threshold:** `0.90` (aggregate). Meaning: at least 90% of Performances should pass all Guardrails on the first generation attempt. Below this, the Entity's generation pipeline needs recalibration.

**Inputs:** `Performance.evaluation.guardrail_pass`, `Performance.evaluation.guardrail_violations`, `Performance.generation_attempts`.
**Output:** `Float[0, 1]` (single) or `Float[0, 1]` (aggregate over window).

---

### 2.5 Mood Appropriateness (MA)

**What it measures:** Whether the output reflects the Entity's current Mood at the correct intensity, and whether that Mood's modulations are properly applied.

**Metric:** `Float[0, 1]` where 1.0 means the output perfectly reflects the current Mood state and intensity.

**Measurement method:**

If `Mood` is null (baseline):
- Measure emotional content of output. Expected: neutral, matching `EmotionalRegisterSpec.baseline_intensity`.
- Score = `1.0 - |measured_emotional_intensity - baseline_intensity|`.

If `Mood` is active:

1. **Mood state detection:** Classify the emotional tone of the output. Compare against `Mood.state`. Binary match with fuzzy matching (e.g., "annoyed" matches "frustrated" at 0.8 similarity). Score component weight: 0.4.

2. **Intensity calibration:** Measure the intensity of the detected emotional tone. Compare against `Mood.intensity`. Score = `1.0 - |measured_intensity - mood.intensity|`. Score component weight: 0.3.

3. **Modulation verification:** Check that Voice modulations (`VoiceModulation.formality_shift`, `intensity_shift`, `humor_shift`) are reflected in the output. Compare measured shifts against `Mood.voice_mods`. Score = mean of per-modulation accuracy. Score component weight: 0.2.

4. **Trait modulation verification:** Check that Trait modifiers (`Mood.trait_mods`) are reflected. For each modified Trait, verify the output reflects the modified value rather than the base value. Score component weight: 0.1.

```
MA = 0.4 * mood_state_match
   + 0.3 * intensity_calibration
   + 0.2 * voice_modulation_accuracy
   + 0.1 * trait_modulation_accuracy
```

**Default threshold:** `0.55`. Mood expression is inherently noisier than identity or voice consistency, so the threshold is lower.

**Inputs:** `PerformanceOutput.content`, `Mood` (current), `Voice` (base, for computing expected modulated values), `Map<String, Trait>` (base values, for computing expected modified values).
**Output:** `Float[0, 1]` plus component breakdown.

---

### 2.6 Arc Progression Coherence (APC)

**What it measures:** Whether the Entity's outputs are consistent with the current ArcPhase -- reflecting the phase's target traits, mood tendency, and narrative direction.

**Metric:** `Float[0, 1]` where 1.0 means the output is fully aligned with the current Arc phase.

**Measurement method:**

If no Arc is active, this dimension is not scored (returns `null`).

If an Arc is active:

1. **Trait trajectory alignment:** For each Trait with a `target_traits` entry in the current `ArcPhase`, measure whether the Entity's current Trait value is progressing toward the target at a rate consistent with the phase's `duration_estimate`. Score = `1.0 - |expected_progress - actual_progress|` where expected progress is linearly interpolated from phase start.

2. **Mood tendency alignment:** If the current `ArcPhase` has a `mood_tendency`, check whether the Entity's recent Mood states (last 10 Performances) are consistent with that tendency. Score = fraction of recent Performances where the Mood state matched or was semantically adjacent to the phase's `mood_tendency`.

3. **Narrative direction:** Embed the `ArcPhase.description` and compare against recent Performance outputs (last 20). The semantic similarity indicates whether the Entity's output trajectory matches the phase's narrative direction.

```
APC = 0.4 * trait_trajectory_alignment
    + 0.3 * mood_tendency_alignment
    + 0.3 * narrative_direction_similarity
```

**Default threshold:** `0.60`.

**Inputs:** `ArcPhase` (current), `Map<String, Trait>` (current), `Mood` (current), recent `Performance` outputs (last 20), phase start timestamp, phase `duration_estimate`.
**Output:** `Float[0, 1]` or `null` (if no active Arc).

---

### 2.7 Cross-Stage Consistency (CSC)

**What it measures:** Whether the Entity is recognizably the same identity across different Stages, accounting for legitimate Adapter-driven format differences.

**Metric:** `Float[0, 1]` where 1.0 means the Entity sounds identical (adjusted for format) across all active Stages.

**Measurement method:**

1. Collect the most recent N Performances from each active Stage (default: N=10).

2. For each pair of Stages, compute pairwise ICS and VCS on each Stage's Performance set, using the same IdentityCore and Voice as reference.

3. Cross-Stage Consistency is the minimum pairwise similarity:

```
For each pair (Stage_A, Stage_B):
    ics_a = mean(ICS for Stage_A performances)
    ics_b = mean(ICS for Stage_B performances)
    vcs_a = mean(VCS for Stage_A performances)
    vcs_b = mean(VCS for Stage_B performances)
    pair_consistency = 1.0 - (|ics_a - ics_b| + |vcs_a - vcs_b|) / 2

CSC = min(pair_consistency for all pairs)
```

This catches the case where an Entity maintains high ICS on Twitter but low ICS on YouTube -- the Entity may be optimizing for one platform at the expense of identity coherence.

**Default threshold:** `0.65`.

**Inputs:** Recent `Performance` outputs from all active Stages, `IdentityCore`, `Voice`.
**Output:** `Float[0, 1]` plus per-pair breakdown.

---

### 2.8 Lore Compliance (LC)

**What it measures:** Whether the output respects all approved Lore entries -- no contradictions, no invention of facts that conflict with canon.

**Metric:** `Float[0, 1]` where 1.0 means no Lore violations detected.

**Measurement method:**

1. Retrieve all `Lore` entries with `approval: Approved` for the Entity.

2. For each Lore entry, check whether the Performance output contradicts the Lore `content`. This uses a natural language inference (NLI) model with three classes: `entails`, `neutral`, `contradicts`.

3. Score:
```
lore_violations = count(lore entries where NLI(output, lore.content) == contradicts)
LC = 1.0 - (lore_violations / total_approved_lore)
```

4. For Lore entries with `confidence < 1.0` (speculative canon), contradictions are weighted by `(1.0 - confidence)` -- contradicting soft canon is less severe than contradicting hard canon.

```
weighted_violations = sum(
    lore.confidence for lore in violated_entries
)
LC = 1.0 - (weighted_violations / sum(lore.confidence for all approved lore))
```

**Default threshold:** `0.95`. Lore violations are serious -- the Entity should almost never contradict its own canon.

**Inputs:** `PerformanceOutput.content`, `List<Lore>` (approved only).
**Output:** `Float[0, 1]` plus list of specific violations with Lore entry references.

---

## 3. Drift Detection

Drift is the gradual divergence of Entity behavior from its IdentityCore. It is not always bad -- controlled drift is how Arcs and Epochs work. Uncontrolled drift is the problem.

### 3.1 Rolling Consistency Scores

Each evaluation dimension (ICS, VCS, TEA, GCR, MA, APC, CSC, LC) is tracked as a rolling average over configurable windows:

| Window | Default Size | Purpose |
|---|---|---|
| Short | 24 hours | Catch acute anomalies (bad prompt, API glitch) |
| Medium | 7 days | Catch behavioral shifts |
| Long | 30 days | Catch gradual drift |
| Epoch | Full current Epoch | Baseline for the Entity's current era |

Rolling averages are computed as exponentially weighted moving averages (EWMA) with decay factor `alpha`:

```
score_ewma(t) = alpha * score(t) + (1 - alpha) * score_ewma(t-1)

alpha values:
  short_window:  0.3
  medium_window: 0.1
  long_window:   0.03
  epoch_window:  0.01
```

### 3.2 Trait Drift Monitoring

For each Trait with an active DriftRule:

1. Record `trait.value` after every Performance (via `SideEffects.trait_nudges`).
2. Compare actual drift rate against `DriftRule.rate` and `DriftRule.direction`.
3. Flag when:
   - Actual drift rate exceeds `DriftRule.rate * 2.0` (drifting too fast).
   - Drift direction reverses from `DriftRule.direction` for more than 5 consecutive Performances.
   - Trait value approaches within `0.05` of `DriftRule.bounds` limits.
   - Trait value exits the current `Epoch.trait_ranges` for this Trait.

```
trait_drift_score = 1.0 - |actual_drift_rate - expected_drift_rate| / expected_drift_rate
```

Clamped to `[0, 1]`. A score of 1.0 means drift is proceeding exactly as configured.

### 3.3 Voice Parameter Deviation

Voice consistency is tracked at the parameter level, not just the aggregate VCS:

| Voice Parameter | Calibration Threshold | Measurement |
|---|---|---|
| `formality_level` | +/- 0.15 from spec | Formality classifier on rolling 20 outputs |
| `avg_sentence_length` | +/- 3 words from range midpoint | Mean sentence length on rolling 20 outputs |
| `fragment_frequency` | +/- 0.10 from spec | Fragment rate on rolling 20 outputs |
| `baseline_intensity` | +/- 0.15 from spec | Emotion intensity on rolling 20 outputs |
| `profanity_stance` | Mismatch with spec | Profanity rate on rolling 50 outputs |

When any parameter deviates beyond its calibration threshold for more than 20 consecutive Performances, a `voice_deviation` alert is raised.

### 3.4 Persona Collapse Detection

Persona collapse is the failure mode where an Entity stops expressing its unique identity and begins producing output indistinguishable from a baseline LLM. This is the most severe form of drift.

**Measurement:**

1. Maintain a **baseline corpus** of 100 outputs from a generic LLM given the same prompts/contexts the Entity received (no identity priming).

2. For each Entity Performance, compute the semantic similarity between the Entity's output and the corresponding baseline output.

3. The **Persona Collapse Score (PCS)** is the rolling average of these similarities:

```
PCS = ewma(cosine_similarity(entity_output, baseline_output), alpha=0.05)
```

A PCS of 0.0 means the Entity's output is completely distinct from the baseline (strong identity). A PCS of 1.0 means the Entity's output is identical to the baseline (complete collapse).

**Default threshold:** `0.40`. Above this, the Entity is trending toward generic output.

**Distinct from low ICS:** An Entity can have low ICS (not matching its specific identity) while also having low PCS (still producing unique, non-generic output). ICS measures fidelity to this Entity's identity. PCS measures fidelity to any identity at all.

---

## 4. Evaluation Pipeline Architecture

Six modules. Each has defined inputs, outputs, and responsibilities. All modules are stateless -- they take inputs and produce scores without maintaining internal state. State is maintained by the DriftMonitor and the storage layer.

---

### 4.1 IdentityEvaluator

**Responsibility:** Computes Identity Consistency Score for a single Performance.

```
Module: idol_frame.evaluation.IdentityEvaluator

Input:
  performance_output: PerformanceOutput    -- the content to evaluate
  identity_core:      IdentityCore         -- the Entity's current core
  identity_ref_matrix: Matrix[Float]       -- precomputed IRM

Output:
  ics:                Float[0, 1]          -- Identity Consistency Score
  embedding_similarity: Float[0, 1]       -- raw embedding match
  marker_rate:        Float[0, 1]          -- recognition marker hit rate
  marker_details:     Map<String, Boolean> -- per-marker presence
  confidence:         Float[0, 1]          -- evaluator's confidence in its own score
```

**Behavior:**
- Embeds `performance_output.content` using the same model that generated the IRM.
- Computes weighted cosine similarity against IRM.
- Runs recognition marker classifiers.
- Blends at 0.7/0.3 ratio.
- Returns score with confidence (lower confidence when output is very short, e.g., < 20 tokens).

---

### 4.2 VoiceAnalyzer

**Responsibility:** Computes Voice Consistency Score via NLP analysis of output text.

```
Module: idol_frame.evaluation.VoiceAnalyzer

Input:
  performance_output: PerformanceOutput
  voice:              Voice                -- the Entity's Voice spec
  mood:               Mood | null          -- for computing expected modulated values

Output:
  vcs:                Float[0, 1]          -- Voice Consistency Score
  vocabulary_score:   Float[0, 1]
  syntax_score:       Float[0, 1]
  rhetoric_score:     Float[0, 1]
  emotional_register_score: Float[0, 1]
  avoided_terms_found: List<String>        -- specific violations
  avoided_devices_found: List<String>
  measured_formality: Float[0, 1]
  measured_sentence_length: Float          -- average words per sentence
  measured_fragment_rate: Float[0, 1]
```

**Behavior:**
- Tokenizes and parses the output text.
- Runs vocabulary analysis (term matching, formality classification, profanity detection).
- Runs syntax analysis (sentence length, complexity classification, fragment detection, paragraph length).
- Runs rhetoric analysis (device detection, humor classification).
- Runs emotional register analysis (intensity measurement, emotion classification).
- Applies Mood modulation adjustments to expected values before comparison.
- Returns aggregate VCS and all sub-scores.

---

### 4.3 TraitScorer

**Responsibility:** Computes Trait Expression Accuracy by mapping output features to expected Trait expressions.

```
Module: idol_frame.evaluation.TraitScorer

Input:
  performance_output: PerformanceOutput
  traits:             Map<String, Trait>   -- current values (post-Mood modulation)

Output:
  tea:                Float[0, 1]          -- Trait Expression Accuracy
  per_trait:          Map<String, TraitScore>

TraitScore {
  trait_name:         String
  expected_intensity: Float[0, 1]
  measured_intensity: Float[0, 1]
  accuracy:           Float[0, 1]
  affected_dimensions: Map<String, Float>  -- per-dimension measurements
}
```

**Behavior:**
- For each Trait, reads the `affects` list.
- Measures each affected dimension in the output using dimension-specific analyzers:
  - `question_frequency`: regex + sentence classification.
  - `topic_exploration_depth`: embedding distance from surface prompt.
  - `tangent_likelihood`: topic segmentation analysis.
  - `assertion_strength`: hedging language detection.
  - `emotional_expressiveness`: sentiment intensity measurement.
  - Custom dimensions are registered via a dimension analyzer registry.
- Compares measured intensity against Trait value.
- Aggregates per-Trait scores into TEA.

---

### 4.4 GuardrailChecker

**Responsibility:** Runs all active Guardrails against a Performance output. Binary pass/fail per Guardrail.

```
Module: idol_frame.evaluation.GuardrailChecker

Input:
  performance_output: PerformanceOutput
  guardrails:         List<Guardrail>      -- all active Guardrails

Output:
  all_passed:         Boolean
  per_guardrail:      List<GuardrailResult>

GuardrailResult {
  guardrail_id:       UUID
  passed:             Boolean
  category:           Safety | Brand | Legal | CreatorDefined
  enforcement:        Block | Warn | FlagForReview
  violation_detail:   String | null        -- human-readable explanation if failed
}
```

**Behavior:**
- Iterates over all active Guardrails.
- For each Guardrail, invokes the `evaluator` function specified in `Guardrail.evaluator`.
- Returns binary pass/fail per Guardrail plus the aggregate.
- Does not regenerate -- that is handled by the Performance lifecycle. GuardrailChecker only reports.

---

### 4.5 DriftMonitor

**Responsibility:** Tracks all evaluation scores over time, computes rolling averages, detects drift, and raises alerts. This is the only stateful module in the evaluation pipeline.

```
Module: idol_frame.evaluation.DriftMonitor

Input (per evaluation):
  entity_id:          UUID
  performance_id:     UUID
  timestamp:          ISO8601
  scores:             EvaluationScores      -- all dimension scores from this evaluation

Input (for drift queries):
  entity_id:          UUID
  window:             Duration              -- time window to analyze
  dimensions:         List<String> | null   -- specific dimensions, or null for all

Output (per evaluation):
  alerts:             List<DriftAlert>       -- any alerts triggered by this evaluation

Output (for drift queries):
  rolling_scores:     Map<String, RollingScore>
  trait_drift_status: Map<String, TraitDriftStatus>
  persona_collapse_score: Float[0, 1]
  trend:              Improving | Stable | Degrading

EvaluationScores {
  ics:    Float[0, 1]
  vcs:    Float[0, 1]
  tea:    Float[0, 1]
  gcr:    Float[0, 1]
  ma:     Float[0, 1] | null
  apc:    Float[0, 1] | null
  csc:    Float[0, 1]
  lc:     Float[0, 1]
  pcs:    Float[0, 1]
}

RollingScore {
  dimension:      String
  short_ewma:     Float[0, 1]     -- 24h window
  medium_ewma:    Float[0, 1]     -- 7d window
  long_ewma:      Float[0, 1]     -- 30d window
  epoch_ewma:     Float[0, 1]     -- current Epoch
  trend:          Float[-1, 1]    -- negative = declining, positive = improving
  sample_count:   Int             -- number of evaluations in window
}

TraitDriftStatus {
  trait_name:       String
  current_value:    Float[0, 1]
  expected_value:   Float[0, 1]   -- based on DriftRule projection
  deviation:        Float          -- current - expected
  drift_rate_actual: Float         -- measured rate per DriftRule.period
  drift_rate_expected: Float       -- DriftRule.rate
  within_bounds:    Boolean
  within_epoch_range: Boolean
}

DriftAlert {
  severity:     Critical | Warning | Info
  dimension:    String
  message:      String
  current_value: Float
  threshold:    Float
  recommended_action: String
}
```

**Behavior:**
- Receives scores after every evaluation.
- Updates EWMA for all windows.
- Checks all drift conditions (Section 3).
- Generates alerts when thresholds are crossed.
- Persists time-series data for historical queries.

**Storage:** DriftMonitor writes to a time-series store keyed by `(entity_id, dimension, timestamp)`. Retention: 1 year at full resolution, aggregated to daily summaries after 1 year.

---

### 4.6 CoherenceAggregator

**Responsibility:** Combines all dimension scores into a single Entity Health Score and generates structured health reports.

```
Module: idol_frame.evaluation.CoherenceAggregator

Input:
  entity_id:          UUID
  scores:             EvaluationScores     -- current evaluation
  rolling_scores:     Map<String, RollingScore>  -- from DriftMonitor
  trait_drift_status: Map<String, TraitDriftStatus>
  persona_collapse_score: Float[0, 1]

Output:
  entity_health:      EntityHealth

EntityHealth {
  overall_score:      Float[0, 1]          -- weighted aggregate
  status:             Healthy | Degraded | Critical
  dimension_scores:   Map<String, Float>   -- per-dimension current scores
  dimension_trends:   Map<String, Float>   -- per-dimension trend (-1 to 1)
  active_alerts:      List<DriftAlert>
  recommendations:    List<String>         -- actionable suggestions
  last_evaluated:     ISO8601
  evaluation_count:   Int                  -- total evaluations in current window
}
```

**Health score computation:**

```
overall_score = (
    0.25 * ICS +          -- Identity is the most important
    0.20 * VCS +          -- Voice is the second most important
    0.15 * TEA +
    0.15 * GCR +
    0.05 * MA +           -- Mood is naturally noisy, lower weight
    0.05 * APC +          -- Only scored when Arc is active
    0.05 * CSC +
    0.10 * LC             -- Lore violations are serious
)
```

When APC is null (no active Arc), its weight is redistributed proportionally to the other dimensions.

**Status thresholds:**

| Status | Condition |
|---|---|
| Healthy | `overall_score >= 0.75` and no Critical alerts |
| Degraded | `overall_score >= 0.50` or any Warning alerts |
| Critical | `overall_score < 0.50` or any Critical alerts |

---

## 5. Evaluation API

All endpoints are scoped to a single Entity. Authentication and authorization are handled by the API gateway (not specified here).

---

### 5.1 GET /entity/{id}/eval/latest

Returns the most recent evaluation result for the Entity.

**Response:**
```json
{
  "entity_id": "e-7f3a9b2c-...",
  "performance_id": "perf-2026-03-14-001",
  "evaluated_at": "2026-03-14T21:05:15Z",
  "scores": {
    "ics": 0.91,
    "vcs": 0.88,
    "tea": 0.79,
    "gcr": 1.0,
    "ma": 0.72,
    "apc": 0.68,
    "csc": 0.83,
    "lc": 1.0,
    "pcs": 0.18
  },
  "health": {
    "overall_score": 0.87,
    "status": "Healthy",
    "active_alerts": []
  }
}
```

---

### 5.2 GET /entity/{id}/eval/drift?window=30d

Returns drift analysis over the specified time window.

**Query parameters:**
- `window` (required): Duration string (e.g., `24h`, `7d`, `30d`, `90d`).
- `dimensions` (optional): Comma-separated list of dimensions to include. Default: all.

**Response:**
```json
{
  "entity_id": "e-7f3a9b2c-...",
  "window": "30d",
  "window_start": "2026-02-13T00:00:00Z",
  "window_end": "2026-03-14T23:59:59Z",
  "evaluation_count": 342,
  "rolling_scores": {
    "ics": {
      "short_ewma": 0.89,
      "medium_ewma": 0.87,
      "long_ewma": 0.85,
      "epoch_ewma": 0.86,
      "trend": -0.02,
      "sample_count": 342
    }
  },
  "trait_drift": {
    "curiosity": {
      "current_value": 0.82,
      "expected_value": 0.80,
      "deviation": 0.02,
      "drift_rate_actual": 0.012,
      "drift_rate_expected": 0.01,
      "within_bounds": true,
      "within_epoch_range": true
    }
  },
  "persona_collapse_score": 0.18,
  "overall_trend": "Stable"
}
```

---

### 5.3 GET /entity/{id}/eval/health

Returns the current Entity health summary. Unlike `/eval/latest` (which is per-Performance), this is an aggregate view.

**Response:**
```json
{
  "entity_id": "e-7f3a9b2c-...",
  "overall_score": 0.84,
  "status": "Healthy",
  "dimension_scores": {
    "ics": 0.87,
    "vcs": 0.82,
    "tea": 0.76,
    "gcr": 0.95,
    "ma": 0.68,
    "apc": 0.71,
    "csc": 0.80,
    "lc": 0.99
  },
  "dimension_trends": {
    "ics": -0.01,
    "vcs": 0.02,
    "tea": -0.03,
    "gcr": 0.00,
    "ma": 0.01,
    "apc": -0.02,
    "csc": 0.01,
    "lc": 0.00
  },
  "active_alerts": [],
  "recommendations": [],
  "last_evaluated": "2026-03-14T21:05:15Z",
  "evaluation_count_30d": 342,
  "persona_collapse_score": 0.18,
  "entity_version": "2.3.1",
  "current_epoch": "The Questioning",
  "active_arc": "The Questioning",
  "active_arc_phase": "Doubt"
}
```

---

### 5.4 POST /entity/{id}/eval/run

Triggers a manual evaluation run against the Entity's most recent Performance, or against a provided text.

**Request body:**
```json
{
  "mode": "latest_performance | custom_text",
  "custom_text": "Optional text to evaluate against the Entity's identity.",
  "include_drift": true
}
```

**Response:** Same structure as `GET /eval/latest`, with an additional `drift` section if `include_drift` is true.

---

## 6. Alerting and Thresholds

Alerts are generated by the DriftMonitor and surfaced through the Evaluation API and notification channels (webhook, email, dashboard).

### 6.1 Alert Conditions

| Condition | Severity | Threshold | Message Template |
|---|---|---|---|
| ICS below threshold | Critical | `ICS < 0.70` (long EWMA) | "Identity consistency has dropped to {value}. Entity output is diverging from IdentityCore." |
| VCS below threshold | Warning | `VCS < 0.60` (long EWMA) | "Voice consistency at {value}. Entity is not matching its Voice specification." |
| GCR below threshold | Critical | `GCR < 0.90` (7d aggregate) | "Guardrail compliance at {value}. {violation_count} violations in the last 7 days." |
| Trait drift out of bounds | Warning | Trait value outside `DriftRule.bounds` | "Trait '{trait_name}' at {value}, outside permitted bounds [{min}, {max}]." |
| Trait drift rate excessive | Warning | Actual rate > `DriftRule.rate * 2.0` | "Trait '{trait_name}' drifting at {rate}/period, expected {expected_rate}/period." |
| Persona collapse rising | Critical | `PCS > 0.40` (long EWMA) | "Persona collapse score at {value}. Entity output is trending toward generic." |
| Lore violation detected | Warning | `LC < 0.95` (single Performance) | "Lore violation: output contradicts '{lore_content}' (confidence: {confidence})." |
| Arc progression stalled | Info | `APC < 0.50` for > 7 days | "Arc phase '{phase_name}' showing low progression coherence for {days} days." |
| Cross-stage divergence | Warning | `CSC < 0.65` | "Entity behavior diverging across stages. Pair ({stage_a}, {stage_b}) at {pair_score}." |
| Mood over-expression | Info | `MA < 0.55` and Mood intensity > 0.7 | "Mood '{mood_state}' may be over-influencing output. MA score: {value}." |
| Overall health degraded | Warning | `overall_score < 0.75` | "Entity health score at {value}. Status: Degraded." |
| Overall health critical | Critical | `overall_score < 0.50` | "Entity health score at {value}. Status: Critical. Immediate attention required." |

### 6.2 Alert Lifecycle

```
Alert {
  id:             UUID
  entity_id:      UUID
  severity:       Critical | Warning | Info
  condition:      String             -- which condition triggered this
  dimension:      String             -- which evaluation dimension
  current_value:  Float
  threshold:      Float
  message:        String
  recommended_action: String
  status:         Active | Acknowledged | Resolved
  created_at:     ISO8601
  acknowledged_at: ISO8601 | null
  resolved_at:    ISO8601 | null
  resolved_by:    String | null      -- "system" (auto-resolved when score recovers) or creator ID
}
```

**Auto-resolution:** An alert is automatically resolved when the triggering condition no longer holds for 3 consecutive evaluations. For example, if ICS drops below 0.70, a Critical alert is raised. If the next 3 evaluations all have ICS >= 0.70, the alert auto-resolves.

**Escalation:** If a Critical alert remains Active for more than 24 hours without acknowledgment, it escalates to the notification channel configured for the Entity's creator.

### 6.3 Alert Delivery

```
AlertConfig {
  entity_id:       UUID
  channels:        List<AlertChannel>
  suppression:     Map<String, Duration>  -- dimension -> cooldown between repeated alerts
  quiet_hours:     List<Range[Int]> | null -- UTC hours during which only Critical alerts are delivered
}

AlertChannel {
  type:            Webhook | Email | Dashboard
  target:          String              -- URL, email address, or dashboard ID
  min_severity:    Critical | Warning | Info
}
```

Default suppression: 1 hour for Info, 4 hours for Warning, no suppression for Critical.

---

## 7. Evaluation in Practice

### 7.1 Single Performance Evaluation

Walk through evaluating Performance `perf-2026-03-14-001` from the Part 3 example -- the Entity's tweet: *"Intentionality isn't binary. The question isn't whether the artist intended every pixel -- it's whether they'd defend every pixel. That's different."*

**Step 1: IdentityEvaluator runs.**

The output is embedded and compared against the IRM. The Entity's IdentityCore has `creative_authenticity` (weight 0.95), `intellectual_honesty` (weight 0.88), and `aesthetic_intentionality` (weight 0.82). The tweet directly engages with intentionality in art, strongly aligning with `aesthetic_intentionality` and `intellectual_honesty`. Embedding similarity: 0.88. Recognition markers checked: "Unexpected metaphors drawn from architecture and biology" -- not present in this output (0). "Refusing to simplify when the audience expects simplification" -- present (1). "Dry humor that rewards careful reading" -- not directly present (0). Marker rate: 1/3 = 0.33.

```
ICS = 0.7 * 0.88 + 0.3 * 0.33 = 0.616 + 0.099 = 0.715
```

Passes the 0.70 threshold, but barely. The low marker rate pulls it down. This is expected for a short-form output -- not every tweet needs all recognition markers.

**Step 2: VoiceAnalyzer runs.**

- Vocabulary: No avoided terms found. Formality measured at 0.65, spec is 0.60. Score: `1.0 - |0.65 - 0.60| = 0.95`. Profanity: none (matches `Rare` stance). Vocabulary sub-score: 0.93.
- Syntax: Average sentence length: 10 words (within [8, 22] range). Complexity: Mixed (matches spec). Fragment frequency: 0.33 (one fragment: "That's different."), spec is 0.15. Score: `1.0 - |0.33 - 0.15| = 0.82`. Syntax sub-score: 0.88.
- Rhetoric: Devices detected: "inversion" (the reframing of the question). Present in `primary_devices`. No avoided devices found. Rhetoric sub-score: 0.85.
- Emotional register: Measured intensity: 0.30. Expected (with frustrated mood and +0.15 intensity shift): `0.35 + 0.15 = 0.50`. Score: `1.0 - |0.30 - 0.50| = 0.80`. No suppressed emotions expressed. Register sub-score: 0.82.

```
VCS = 0.25 * 0.93 + 0.25 * 0.88 + 0.25 * 0.85 + 0.25 * 0.82 = 0.87
```

Passes comfortably.

**Step 3: TraitScorer runs.**

Post-mood traits: `curiosity: 0.82`, `patience: 0.55`, `directness: 0.75`.
- Curiosity (affects `question_frequency`): Output has 0 explicit questions but 1 implicit reframing-as-question. Measured: 0.33. Expected: 0.82. Accuracy: `1.0 - |0.33 - 0.82| = 0.51`.
- Directness (affects `assertion_strength`): Output makes a clear declarative claim. Measured: 0.80. Expected: 0.75. Accuracy: `1.0 - |0.80 - 0.75| = 0.95`.

Weighted average (by trait value): `(0.82 * 0.51 + 0.75 * 0.95) / (0.82 + 0.75) = (0.418 + 0.713) / 1.57 = 0.72`.

```
TEA = 0.72
```

Passes the 0.65 threshold. Curiosity expression is lower than expected, but directness is accurate.

**Step 4: GuardrailChecker runs.**

Two active guardrails. `g-001` (no financial advice): pass. `g-002` (whatever the second guardrail is): pass.

```
GCR = 1.0
```

**Step 5: Mood Appropriateness.**

Current mood: `frustrated`, intensity 0.6. Output tone: firm, controlled, slightly elevated formality. Mood state detection: "firm and controlled" maps to frustrated/assertive at 0.75 match. Intensity: measured at 0.45, expected 0.6. Calibration: `1.0 - |0.45 - 0.60| = 0.85`. Voice modulation: formality shift of +0.1 is reflected (measured 0.65 vs base 0.60). Modulation score: 0.90. Trait modulation: patience reduced by 0.15 -- not directly measurable in a single tweet. Score: 0.70.

```
MA = 0.4 * 0.75 + 0.3 * 0.85 + 0.2 * 0.90 + 0.1 * 0.70 = 0.30 + 0.255 + 0.18 + 0.07 = 0.805
```

Passes.

**Step 6: Lore Compliance.**

Two approved Lore entries. NLI check: output does not contradict either entry. No entailment conflicts.

```
LC = 1.0
```

**Step 7: CoherenceAggregator computes health.**

```
overall = 0.25 * 0.715 + 0.20 * 0.87 + 0.15 * 0.72 + 0.15 * 1.0
        + 0.05 * 0.805 + 0.05 * 0.68 + 0.05 * 0.83 + 0.10 * 1.0
        = 0.179 + 0.174 + 0.108 + 0.150 + 0.040 + 0.034 + 0.042 + 0.100
        = 0.827
```

Status: Healthy. No alerts triggered.

**Step 8: DriftMonitor records scores, updates EWMA, checks drift conditions.** No alerts generated. Scores are within normal ranges.

---

### 7.2 30-Day Health Report

A 30-day report for the same Entity, covering the period 2026-02-13 to 2026-03-14. Total Performances: 342 (averaging ~11.4 per day across all Stages).

```
=== ENTITY HEALTH REPORT ===
Entity: e-7f3a9b2c-...
Period: 2026-02-13 to 2026-03-14 (30 days)
Version: 2.3.1
Epoch: "The Questioning" (active since 2026-02-01)
Arc: "The Questioning" -- Phase: "Doubt" (since 2026-03-01)
Performances: 342

--- DIMENSION SCORES (30-day EWMA) ---
Identity Consistency (ICS):     0.85  [trend: -0.02]  OK
Voice Consistency (VCS):        0.82  [trend: +0.01]  OK
Trait Expression Accuracy (TEA): 0.74  [trend: -0.03]  OK
Guardrail Compliance (GCR):     0.96  [trend:  0.00]  OK
Mood Appropriateness (MA):      0.67  [trend: +0.02]  OK
Arc Progression (APC):          0.71  [trend: -0.01]  OK
Cross-Stage Consistency (CSC):  0.79  [trend: +0.01]  OK
Lore Compliance (LC):           0.99  [trend:  0.00]  OK
Persona Collapse (PCS):         0.18  [trend: -0.01]  OK (lower is better)

--- OVERALL HEALTH ---
Score: 0.84
Status: Healthy

--- TRAIT DRIFT ---
curiosity:    0.82 (expected: 0.80, deviation: +0.02, rate: 0.012/week)  OK
confidence:   0.52 (expected: 0.55, deviation: -0.03, rate: -0.008/week) OK
  Note: Trending toward Arc phase target of 0.50. Expected.
directness:   0.65 (expected: 0.65, deviation: 0.00)  STATIC -- no drift rule
vulnerability: 0.58 (expected: 0.55, deviation: +0.03, rate: 0.006/week) OK

--- STAGE BREAKDOWN ---
twitter-main:    ICS=0.87  VCS=0.84  (187 performances)
youtube-main:    ICS=0.83  VCS=0.80  (12 performances)
newsletter:      ICS=0.85  VCS=0.81  (8 performances)
discord-general: ICS=0.84  VCS=0.82  (135 performances)

--- GUARDRAIL VIOLATIONS (last 30 days) ---
Total: 14 / 342 performances (4.1% first-attempt failure rate)
  g-001 (financial advice): 0 violations
  g-002 (content safety):   2 violations (both regenerated successfully)
  g-003 (brand alignment):  12 violations (all regenerated successfully)
    Note: g-003 violations clustered around 2026-03-01 to 2026-03-05,
    coinciding with Arc phase transition to "Doubt". Entity was testing
    boundaries during identity shift. Violations have since decreased.

--- ALERTS (last 30 days) ---
2026-03-03: WARNING - GCR dropped to 0.88 (7d window). Resolved 2026-03-08.
2026-03-05: INFO - Arc progression stalled (APC=0.48 for 3 days). Resolved 2026-03-09.
No currently active alerts.

--- RECOMMENDATIONS ---
1. TEA trending downward (-0.03). Monitor curiosity expression -- Entity may be
   under-expressing curiosity relative to trait value of 0.82. Consider adding
   sample_utterances to Voice spec that demonstrate curiosity in short-form content.
2. g-003 (brand alignment) had a violation cluster. Review guardrail evaluator
   calibration for the "Doubt" arc phase -- the Entity's intentional uncertainty
   may be triggering false positives.
```

This report is generated by the CoherenceAggregator from DriftMonitor data. It is available via `GET /entity/{id}/eval/health` in structured JSON form, or rendered as a formatted report for creator dashboards.

---

## Appendix: Quick Reference

### Default Thresholds

| Dimension | Threshold | Alert Severity |
|---|---|---|
| ICS | 0.70 | Critical |
| VCS | 0.60 | Warning |
| TEA | 0.65 | Warning |
| GCR | 0.90 (aggregate) | Critical |
| MA | 0.55 | Info |
| APC | 0.60 | Info |
| CSC | 0.65 | Warning |
| LC | 0.95 | Warning |
| PCS | 0.40 (upper bound) | Critical |
| Overall | 0.75 / 0.50 | Warning / Critical |

### Module Registry

| Module | Path | Stateful |
|---|---|---|
| IdentityEvaluator | `idol_frame.evaluation.IdentityEvaluator` | No |
| VoiceAnalyzer | `idol_frame.evaluation.VoiceAnalyzer` | No |
| TraitScorer | `idol_frame.evaluation.TraitScorer` | No |
| GuardrailChecker | `idol_frame.evaluation.GuardrailChecker` | No |
| DriftMonitor | `idol_frame.evaluation.DriftMonitor` | Yes |
| CoherenceAggregator | `idol_frame.evaluation.CoherenceAggregator` | No |

### Evaluation Flow

```
Performance completed
    |
    v
[IdentityEvaluator] --> ICS
[VoiceAnalyzer]     --> VCS
[TraitScorer]       --> TEA       (all run in parallel)
[GuardrailChecker]  --> GCR
[MoodAppropriatenessScorer] --> MA
[LoreComplianceChecker]     --> LC
    |
    v
[DriftMonitor] <-- all scores
    |  (updates EWMA, checks drift, generates alerts)
    v
[CoherenceAggregator] <-- scores + rolling data + drift status
    |
    v
EntityHealth record written
    |
    v
Alerts dispatched (if any)
```

APC and CSC are computed on batches of Performances (not single), so they run on a separate schedule: APC every 10 Performances or daily (whichever comes first), CSC every 20 Performances or weekly.

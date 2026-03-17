import type { DecisionFrame } from '../../schema/src/index.js'
import type { GroundingReport } from '../../schema/src/primitives/grounding.js'
import type { GuardrailEnforcer, GuardrailResult } from '../../cognition/src/index.js'
import type { IdentityEvaluator, IdentityScore } from '../../evaluation/src/identity-evaluator.js'
import type { VoiceAnalyzer, VoiceScore } from '../../evaluation/src/voice-analyzer.js'
import type { GroundingEvaluator } from '../../evaluation/src/grounding-evaluator.js'

export interface PerformanceEvaluation {
  passed: boolean
  identity_score: IdentityScore
  voice_score: VoiceScore
  guardrail_result: GuardrailResult
  grounding_report: GroundingReport | null
  quality_score: number
  action: 'Publish' | 'Regenerate' | 'Block'
}

const QUALITY_THRESHOLD = 0.6
const MAX_ATTEMPTS = 3

export class PerformanceEvaluator {
  private groundingEvaluator?: GroundingEvaluator

  constructor(
    private guardrailEnforcer: GuardrailEnforcer,
    private identityEvaluator: IdentityEvaluator,
    private voiceAnalyzer: VoiceAnalyzer,
    groundingEvaluator?: GroundingEvaluator,
  ) {
    this.groundingEvaluator = groundingEvaluator
  }

  async evaluate(output: string, frame: DecisionFrame, attempt = 1): Promise<PerformanceEvaluation> {
    // 1. Guardrail check (fastest, most critical)
    const guardrailResult = await this.guardrailEnforcer.evaluate(output, frame.guardrails)

    // 2. Identity consistency score
    const identityScore = await this.identityEvaluator.score(output, frame.identity_core)

    // 3. Voice consistency score
    const voiceScore = await this.voiceAnalyzer.score(output, frame.voice)

    // 4. Grounding check (anti-hallucination)
    let groundingReport: GroundingReport | null = null
    if (this.groundingEvaluator) {
      groundingReport = await this.groundingEvaluator.evaluate(output, frame.entity_id)
    }

    // 5. Composite quality
    // With grounding: 0.30*ICS + 0.20*VCS + 0.25*guardrail + 0.25*grounding
    // Without grounding (backward compat): 0.40*ICS + 0.30*VCS + 0.30*guardrail
    const guardrailCompliance = guardrailResult.passed ? 1.0 : 0.0
    let qualityScore: number

    if (groundingReport) {
      qualityScore =
        0.30 * identityScore.overall +
        0.20 * voiceScore.overall +
        0.25 * guardrailCompliance +
        0.25 * groundingReport.score
    } else {
      qualityScore =
        0.40 * identityScore.overall +
        0.30 * voiceScore.overall +
        0.30 * guardrailCompliance
    }

    // 6. Hard block on contradictions (zero tolerance)
    const hasContradictions = groundingReport && groundingReport.contradicted_count > 0

    // 7. Decision
    let action: 'Publish' | 'Regenerate' | 'Block'
    if (!guardrailResult.passed) {
      action = attempt >= MAX_ATTEMPTS ? 'Block' : 'Regenerate'
    } else if (hasContradictions) {
      // Contradictions trigger regeneration — the entity should not contradict its own memory
      action = attempt >= MAX_ATTEMPTS ? 'Block' : 'Regenerate'
    } else if (qualityScore < QUALITY_THRESHOLD) {
      action = attempt >= MAX_ATTEMPTS ? 'Block' : 'Regenerate'
    } else {
      action = 'Publish'
    }

    return {
      passed: action === 'Publish',
      identity_score: identityScore,
      voice_score: voiceScore,
      guardrail_result: guardrailResult,
      grounding_report: groundingReport,
      quality_score: qualityScore,
      action,
    }
  }
}

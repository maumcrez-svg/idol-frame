import type { DecisionFrame } from '../../schema/src/index.js'
import type { GuardrailEnforcer, GuardrailResult } from '../../cognition/src/index.js'
import type { IdentityEvaluator, IdentityScore } from '../../evaluation/src/identity-evaluator.js'
import type { VoiceAnalyzer, VoiceScore } from '../../evaluation/src/voice-analyzer.js'

export interface PerformanceEvaluation {
  passed: boolean
  identity_score: IdentityScore
  voice_score: VoiceScore
  guardrail_result: GuardrailResult
  quality_score: number
  action: 'Publish' | 'Regenerate' | 'Block'
}

const QUALITY_THRESHOLD = 0.6
const MAX_ATTEMPTS = 3

export class PerformanceEvaluator {
  constructor(
    private guardrailEnforcer: GuardrailEnforcer,
    private identityEvaluator: IdentityEvaluator,
    private voiceAnalyzer: VoiceAnalyzer,
  ) {}

  async evaluate(output: string, frame: DecisionFrame, attempt = 1): Promise<PerformanceEvaluation> {
    // 1. Guardrail check (fastest, most critical)
    const guardrailResult = await this.guardrailEnforcer.evaluate(output, frame.guardrails)

    // 2. Identity consistency score
    const identityScore = await this.identityEvaluator.score(output, frame.identity_core)

    // 3. Voice consistency score
    const voiceScore = await this.voiceAnalyzer.score(output, frame.voice)

    // 4. Composite quality: 0.4*ICS + 0.3*VCS + 0.3*guardrail_compliance
    const guardrailCompliance = guardrailResult.passed ? 1.0 : 0.0
    const qualityScore = 0.4 * identityScore.overall + 0.3 * voiceScore.overall + 0.3 * guardrailCompliance

    // 5. Decision
    let action: 'Publish' | 'Regenerate' | 'Block'
    if (!guardrailResult.passed) {
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
      quality_score: qualityScore,
      action,
    }
  }
}

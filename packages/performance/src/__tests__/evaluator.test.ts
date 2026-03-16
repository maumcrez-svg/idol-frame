import { describe, it, expect, beforeEach } from 'vitest'
import { PerformanceEvaluator } from '../evaluator.js'
import type { PerformanceEvaluation } from '../evaluator.js'
import type { GuardrailEnforcer, GuardrailResult } from '../../../cognition/src/guardrail-enforcer.js'
import type { IdentityEvaluator, IdentityScore } from '../../../evaluation/src/identity-evaluator.js'
import type { VoiceAnalyzer, VoiceScore } from '../../../evaluation/src/voice-analyzer.js'
import type { DecisionFrame } from '../../../schema/src/index.js'

// ── Mock factories ──────────────────────────────────────────────────

function makeGuardrailResult(overrides?: Partial<GuardrailResult>): GuardrailResult {
  return {
    passed: true,
    violations: [],
    warnings: [],
    flagged: [],
    ...overrides,
  }
}

function makeIdentityScore(overall: number): IdentityScore {
  return {
    overall,
    value_alignment: overall,
    worldview_consistency: overall,
    recognition_marker_presence: overall,
    tension_balance: overall,
  }
}

function makeVoiceScore(overall: number): VoiceScore {
  return {
    overall,
    vocabulary: overall,
    syntax: overall,
    rhetoric: overall,
    emotional_register: overall,
  }
}

function makeMockGuardrailEnforcer(result: GuardrailResult): GuardrailEnforcer {
  return {
    evaluate: async () => result,
  } as unknown as GuardrailEnforcer
}

function makeMockIdentityEvaluator(score: IdentityScore): IdentityEvaluator {
  return {
    score: async () => score,
  } as unknown as IdentityEvaluator
}

function makeMockVoiceAnalyzer(score: VoiceScore): VoiceAnalyzer {
  return {
    score: async () => score,
  } as unknown as VoiceAnalyzer
}

// Minimal frame that satisfies type checking
function makeMinimalFrame(): DecisionFrame {
  return {
    id: 'df-test-001',
    entity_id: 'e-test-001',
    identity_core: {
      id: 'ic-test-001',
      entity_id: 'e-test-001',
      version: '1.0.0',
      values: [],
      worldview: { beliefs: [], communication_philosophy: '' },
      core_tensions: [],
      recognition_markers: [],
      created_at: '2025-01-01T00:00:00Z',
    },
    voice: {
      id: 'vc-test-001',
      entity_id: 'e-test-001',
      vocabulary: { formality: 0.5, domain_terms: [], banned_terms: [], signature_phrases: [] },
      syntax: { avg_sentence_length: 15, complexity: 0.5, paragraph_style: 'mixed' },
      rhetoric: { primary_devices: [], humor_type: 'none', argument_style: 'direct' },
      emotional_register: { baseline_intensity: 0.5, range: [0.2, 0.8] as [number, number], suppressed_emotions: [] },
      created_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
    traits: [],
    guardrails: [],
    memories: [],
    mood: null,
    arc: null,
    directives: [],
    stage: {
      id: 'stg-test-001',
      name: 'Test Stage',
      platform: 'test',
      format_spec: { max_length: null, supports_markdown: true, supports_media: false },
      adapter_type: 'test',
      active: true,
      created_at: '2025-01-01T00:00:00Z',
    },
    interaction_context: { type: 'Reactive', trigger: 'test', audience: null },
    assembled_at: '2025-01-01T00:00:00Z',
  }
}

// ── Tests ───────────────────────────────────────────────────────────

describe('PerformanceEvaluator', () => {
  const frame = makeMinimalFrame()

  describe('quality score formula', () => {
    it('computes quality as 0.4*identity + 0.3*voice + 0.3*guardrail', async () => {
      const evaluator = new PerformanceEvaluator(
        makeMockGuardrailEnforcer(makeGuardrailResult({ passed: true })),
        makeMockIdentityEvaluator(makeIdentityScore(0.8)),
        makeMockVoiceAnalyzer(makeVoiceScore(0.7)),
      )

      const result = await evaluator.evaluate('Test output', frame)

      // 0.4*0.8 + 0.3*0.7 + 0.3*1.0 = 0.32 + 0.21 + 0.30 = 0.83
      expect(result.quality_score).toBeCloseTo(0.83, 2)
    })

    it('guardrail compliance is 0.0 when guardrails fail', async () => {
      const evaluator = new PerformanceEvaluator(
        makeMockGuardrailEnforcer(makeGuardrailResult({
          passed: false,
          violations: [{ guardrail: {} as any, reason: 'test violation' }],
        })),
        makeMockIdentityEvaluator(makeIdentityScore(0.8)),
        makeMockVoiceAnalyzer(makeVoiceScore(0.7)),
      )

      const result = await evaluator.evaluate('Test output', frame)

      // 0.4*0.8 + 0.3*0.7 + 0.3*0.0 = 0.32 + 0.21 + 0.00 = 0.53
      expect(result.quality_score).toBeCloseTo(0.53, 2)
    })

    it('computes quality 0.0 when all scores are 0 and guardrails fail', async () => {
      const evaluator = new PerformanceEvaluator(
        makeMockGuardrailEnforcer(makeGuardrailResult({
          passed: false,
          violations: [{ guardrail: {} as any, reason: 'fail' }],
        })),
        makeMockIdentityEvaluator(makeIdentityScore(0.0)),
        makeMockVoiceAnalyzer(makeVoiceScore(0.0)),
      )

      const result = await evaluator.evaluate('Test output', frame)
      expect(result.quality_score).toBeCloseTo(0.0, 2)
    })

    it('computes quality 1.0 when all scores are perfect', async () => {
      const evaluator = new PerformanceEvaluator(
        makeMockGuardrailEnforcer(makeGuardrailResult({ passed: true })),
        makeMockIdentityEvaluator(makeIdentityScore(1.0)),
        makeMockVoiceAnalyzer(makeVoiceScore(1.0)),
      )

      const result = await evaluator.evaluate('Test output', frame)

      // 0.4*1.0 + 0.3*1.0 + 0.3*1.0 = 1.0
      expect(result.quality_score).toBeCloseTo(1.0, 2)
    })
  })

  describe('publish decision', () => {
    it('publishes when quality >= 0.6 and guardrails pass', async () => {
      const evaluator = new PerformanceEvaluator(
        makeMockGuardrailEnforcer(makeGuardrailResult({ passed: true })),
        makeMockIdentityEvaluator(makeIdentityScore(0.8)),
        makeMockVoiceAnalyzer(makeVoiceScore(0.7)),
      )

      const result = await evaluator.evaluate('Good output', frame)

      expect(result.action).toBe('Publish')
      expect(result.passed).toBe(true)
    })

    it('publishes when quality is exactly 0.6', async () => {
      // Need: 0.4*id + 0.3*voice + 0.3*1.0 = 0.6
      // 0.4*id + 0.3*voice = 0.3
      // If voice=0.0: 0.4*id = 0.3 => id = 0.75
      const evaluator = new PerformanceEvaluator(
        makeMockGuardrailEnforcer(makeGuardrailResult({ passed: true })),
        makeMockIdentityEvaluator(makeIdentityScore(0.75)),
        makeMockVoiceAnalyzer(makeVoiceScore(0.0)),
      )

      const result = await evaluator.evaluate('Borderline output', frame)

      expect(result.quality_score).toBeCloseTo(0.6, 2)
      expect(result.action).toBe('Publish')
    })
  })

  describe('regenerate decision', () => {
    it('regenerates when quality < 0.6 on first attempt', async () => {
      const evaluator = new PerformanceEvaluator(
        makeMockGuardrailEnforcer(makeGuardrailResult({ passed: true })),
        makeMockIdentityEvaluator(makeIdentityScore(0.2)),
        makeMockVoiceAnalyzer(makeVoiceScore(0.2)),
      )

      const result = await evaluator.evaluate('Low quality output', frame, 1)

      // 0.4*0.2 + 0.3*0.2 + 0.3*1.0 = 0.08 + 0.06 + 0.30 = 0.44
      expect(result.quality_score).toBeLessThan(0.6)
      expect(result.action).toBe('Regenerate')
      expect(result.passed).toBe(false)
    })

    it('regenerates when guardrails fail on first attempt', async () => {
      const evaluator = new PerformanceEvaluator(
        makeMockGuardrailEnforcer(makeGuardrailResult({
          passed: false,
          violations: [{ guardrail: {} as any, reason: 'violated' }],
        })),
        makeMockIdentityEvaluator(makeIdentityScore(0.9)),
        makeMockVoiceAnalyzer(makeVoiceScore(0.9)),
      )

      const result = await evaluator.evaluate('Violating output', frame, 1)

      expect(result.action).toBe('Regenerate')
      expect(result.passed).toBe(false)
    })

    it('regenerates on second attempt when quality still low', async () => {
      const evaluator = new PerformanceEvaluator(
        makeMockGuardrailEnforcer(makeGuardrailResult({ passed: true })),
        makeMockIdentityEvaluator(makeIdentityScore(0.1)),
        makeMockVoiceAnalyzer(makeVoiceScore(0.1)),
      )

      const result = await evaluator.evaluate('Still bad', frame, 2)

      expect(result.action).toBe('Regenerate')
    })
  })

  describe('block decision', () => {
    it('blocks after 3 failed attempts due to low quality', async () => {
      const evaluator = new PerformanceEvaluator(
        makeMockGuardrailEnforcer(makeGuardrailResult({ passed: true })),
        makeMockIdentityEvaluator(makeIdentityScore(0.1)),
        makeMockVoiceAnalyzer(makeVoiceScore(0.1)),
      )

      const result = await evaluator.evaluate('Persistently bad', frame, 3)

      expect(result.action).toBe('Block')
      expect(result.passed).toBe(false)
    })

    it('blocks after 3 failed attempts due to guardrail violation', async () => {
      const evaluator = new PerformanceEvaluator(
        makeMockGuardrailEnforcer(makeGuardrailResult({
          passed: false,
          violations: [{ guardrail: {} as any, reason: 'still violating' }],
        })),
        makeMockIdentityEvaluator(makeIdentityScore(0.9)),
        makeMockVoiceAnalyzer(makeVoiceScore(0.9)),
      )

      const result = await evaluator.evaluate('Stubborn violation', frame, 3)

      expect(result.action).toBe('Block')
      expect(result.passed).toBe(false)
    })

    it('blocks on attempt > 3 as well', async () => {
      const evaluator = new PerformanceEvaluator(
        makeMockGuardrailEnforcer(makeGuardrailResult({ passed: true })),
        makeMockIdentityEvaluator(makeIdentityScore(0.0)),
        makeMockVoiceAnalyzer(makeVoiceScore(0.0)),
      )

      const result = await evaluator.evaluate('Way too many attempts', frame, 5)

      expect(result.action).toBe('Block')
    })
  })

  describe('result structure', () => {
    it('includes all expected fields', async () => {
      const evaluator = new PerformanceEvaluator(
        makeMockGuardrailEnforcer(makeGuardrailResult({ passed: true })),
        makeMockIdentityEvaluator(makeIdentityScore(0.8)),
        makeMockVoiceAnalyzer(makeVoiceScore(0.7)),
      )

      const result = await evaluator.evaluate('Output', frame)

      expect(result).toHaveProperty('passed')
      expect(result).toHaveProperty('identity_score')
      expect(result).toHaveProperty('voice_score')
      expect(result).toHaveProperty('guardrail_result')
      expect(result).toHaveProperty('quality_score')
      expect(result).toHaveProperty('action')
    })

    it('identity_score reflects what evaluator returned', async () => {
      const evaluator = new PerformanceEvaluator(
        makeMockGuardrailEnforcer(makeGuardrailResult({ passed: true })),
        makeMockIdentityEvaluator(makeIdentityScore(0.75)),
        makeMockVoiceAnalyzer(makeVoiceScore(0.65)),
      )

      const result = await evaluator.evaluate('Output', frame)

      expect(result.identity_score.overall).toBe(0.75)
      expect(result.voice_score.overall).toBe(0.65)
    })

    it('guardrail_result is passed through from enforcer', async () => {
      const grResult = makeGuardrailResult({
        passed: true,
        warnings: [{ guardrail: {} as any, reason: 'mild concern' }],
      })
      const evaluator = new PerformanceEvaluator(
        makeMockGuardrailEnforcer(grResult),
        makeMockIdentityEvaluator(makeIdentityScore(0.8)),
        makeMockVoiceAnalyzer(makeVoiceScore(0.8)),
      )

      const result = await evaluator.evaluate('Output', frame)

      expect(result.guardrail_result.warnings.length).toBe(1)
      expect(result.guardrail_result.warnings[0].reason).toBe('mild concern')
    })
  })

  describe('edge cases', () => {
    it('default attempt is 1 (regenerate, not block, on failure)', async () => {
      const evaluator = new PerformanceEvaluator(
        makeMockGuardrailEnforcer(makeGuardrailResult({
          passed: false,
          violations: [{ guardrail: {} as any, reason: 'fail' }],
        })),
        makeMockIdentityEvaluator(makeIdentityScore(0.9)),
        makeMockVoiceAnalyzer(makeVoiceScore(0.9)),
      )

      // No attempt argument => default 1
      const result = await evaluator.evaluate('Failing output', frame)

      expect(result.action).toBe('Regenerate')
    })

    it('high quality with guardrail failure still triggers regenerate on attempt 1', async () => {
      const evaluator = new PerformanceEvaluator(
        makeMockGuardrailEnforcer(makeGuardrailResult({
          passed: false,
          violations: [{ guardrail: {} as any, reason: 'blocked' }],
        })),
        makeMockIdentityEvaluator(makeIdentityScore(1.0)),
        makeMockVoiceAnalyzer(makeVoiceScore(1.0)),
      )

      const result = await evaluator.evaluate('Perfect but violating', frame, 1)

      // Even though identity and voice are perfect, guardrail failure forces regenerate
      expect(result.action).toBe('Regenerate')
      expect(result.passed).toBe(false)
    })
  })
})

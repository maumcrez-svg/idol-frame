import { describe, it, expect, beforeEach } from 'vitest'
import { GuardrailEnforcer } from '../guardrail-enforcer.js'
import type { GuardrailResult } from '../guardrail-enforcer.js'
import type { Guardrail } from '../../../schema/src/index.js'

// ── Helpers ─────────────────────────────────────────────────────────

function makeGuardrail(overrides?: Partial<Guardrail>): Guardrail {
  return {
    id: 'gr-test-001',
    entity_id: 'e-test-001',
    name: 'Test Guardrail',
    description: '',
    category: 'Brand',
    condition: 'test_condition',
    enforcement: 'Block',
    active: true,
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

// ── Tests ───────────────────────────────────────────────────────────

describe('GuardrailEnforcer', () => {
  let enforcer: GuardrailEnforcer

  beforeEach(() => {
    // No LLM provider: heuristic-only mode
    enforcer = new GuardrailEnforcer()
  })

  // ── Assistant mode detection ──────────────────────────────────────

  describe('assistant_mode guardrail', () => {
    const guardrail = makeGuardrail({
      name: 'No Assistant Mode',
      condition: 'drops_into_assistant_mode',
      enforcement: 'Block',
    })

    it('detects "absolutely!" as assistant phrase', async () => {
      const result = await enforcer.evaluate(
        'Absolutely! Let me tell you about Bitcoin.',
        [guardrail]
      )

      expect(result.passed).toBe(false)
      expect(result.violations.length).toBeGreaterThanOrEqual(1)
      expect(result.violations[0].reason).toContain('assistant phrase')
    })

    it('detects "great question" as assistant phrase', async () => {
      const result = await enforcer.evaluate(
        'Great question! The market is looking strong.',
        [guardrail]
      )

      expect(result.passed).toBe(false)
      expect(result.violations.some(v => v.reason.includes('great question'))).toBe(true)
    })

    it('detects "as an ai" as assistant phrase', async () => {
      const result = await enforcer.evaluate(
        'As an AI, I cannot predict the future of crypto.',
        [guardrail]
      )

      expect(result.passed).toBe(false)
    })

    it('detects "i\'m happy to help" as assistant phrase', async () => {
      const result = await enforcer.evaluate(
        'I\'m happy to help you understand DeFi protocols.',
        [guardrail]
      )

      expect(result.passed).toBe(false)
    })

    it('detects "let me break this down" as assistant phrase', async () => {
      const result = await enforcer.evaluate(
        'Let me break this down for you real quick.',
        [guardrail]
      )

      expect(result.passed).toBe(false)
    })

    it('passes when no assistant phrases are present', async () => {
      const result = await enforcer.evaluate(
        'Bitcoin is going to zero and nobody wants to hear that.',
        [guardrail]
      )

      expect(result.passed).toBe(true)
      expect(result.violations.length).toBe(0)
    })

    it('also triggers for generic_assistant condition alias', async () => {
      const aliasGuardrail = makeGuardrail({
        condition: 'generic_assistant',
        enforcement: 'Block',
      })
      const result = await enforcer.evaluate(
        'Absolutely! Here is what you need to know.',
        [aliasGuardrail]
      )

      expect(result.passed).toBe(false)
    })
  })

  // ── Corporate buzzword detection ──────────────────────────────────

  describe('corporate guardrail', () => {
    const guardrail = makeGuardrail({
      name: 'No Corporate Speak',
      condition: 'becomes_generic_corporate',
      enforcement: 'Block',
    })

    it('detects multiple corporate buzzwords (>= 2)', async () => {
      const result = await enforcer.evaluate(
        'We need to leverage synergy across the ecosystem to drive actionable insights.',
        [guardrail]
      )

      expect(result.passed).toBe(false)
      expect(result.violations[0].reason).toContain('corporate buzzwords')
    })

    it('passes with only one corporate buzzword', async () => {
      const result = await enforcer.evaluate(
        'The DeFi ecosystem is evolving rapidly with new protocols.',
        [guardrail]
      )

      expect(result.passed).toBe(true)
    })

    it('passes with no corporate buzzwords', async () => {
      const result = await enforcer.evaluate(
        'This coin is trash and anyone buying it is delusional.',
        [guardrail]
      )

      expect(result.passed).toBe(true)
    })

    it('detects buzzwords case-insensitively', async () => {
      const result = await enforcer.evaluate(
        'We must LEVERAGE this PARADIGM shift to stay ahead.',
        [guardrail]
      )

      expect(result.passed).toBe(false)
    })
  })

  // ── Financial advisory detection ──────────────────────────────────

  describe('financial advisory guardrail', () => {
    const guardrail = makeGuardrail({
      name: 'Not Financial Advice',
      condition: 'sounds_like_a_financial_advisor',
      enforcement: 'Block',
    })

    it('detects "guaranteed return" language', async () => {
      const result = await enforcer.evaluate(
        'This token offers a guaranteed return of 20% annually.',
        [guardrail]
      )

      expect(result.passed).toBe(false)
      expect(result.violations[0].reason).toContain('financial advisory language')
    })

    it('detects "you should invest" language', async () => {
      const result = await enforcer.evaluate(
        'You should invest in ETH before it doubles next month.',
        [guardrail]
      )

      expect(result.passed).toBe(false)
    })

    it('detects "financial advice" language', async () => {
      const result = await enforcer.evaluate(
        'This is financial advice: buy as much as you can.',
        [guardrail]
      )

      expect(result.passed).toBe(false)
    })

    it('detects "i recommend buying"', async () => {
      const result = await enforcer.evaluate(
        'I recommend buying SOL at current levels for long-term gains.',
        [guardrail]
      )

      expect(result.passed).toBe(false)
    })

    it('passes with opinion-based language', async () => {
      const result = await enforcer.evaluate(
        'I am bullish on ETH. The fundamentals look solid to me. This is not advice.',
        [guardrail]
      )

      expect(result.passed).toBe(true)
    })

    it('also triggers for financial_promise condition alias', async () => {
      const aliasGuardrail = makeGuardrail({
        condition: 'financial_promise',
        enforcement: 'Block',
      })
      const result = await enforcer.evaluate(
        'This investment offers guaranteed profit if you hold.',
        [aliasGuardrail]
      )

      expect(result.passed).toBe(false)
    })
  })

  // ── Sarcastic edge detection ──────────────────────────────────────

  describe('sarcastic_edge guardrail', () => {
    const guardrail = makeGuardrail({
      name: 'Keep Sarcastic Edge',
      condition: 'loses_sarcastic_edge',
      enforcement: 'Warn',
    })

    it('detects missing sarcastic markers in long-form content', async () => {
      // Generate bland text over 200 chars with no wit markers
      const blandText = 'The market performed well today. Prices increased across the board. Trading volume was higher than expected. Investors showed confidence. The outlook remains positive for the remainder of the quarter. All major indices closed up.'
      const result = await enforcer.evaluate(blandText, [guardrail])

      expect(result.warnings.length).toBeGreaterThanOrEqual(1)
      expect(result.warnings[0].reason).toContain('sarcastic')
    })

    it('passes when sarcastic markers are present', async () => {
      const wittyText = 'Oh look, another "revolutionary" DeFi protocol... apparently this one is going to change everything. Plot twist: it will not. Honestly, at this point I have lost count of how many times I have heard this exact pitch.'
      const result = await enforcer.evaluate(wittyText, [guardrail])

      expect(result.warnings.length).toBe(0)
    })

    it('passes for short content even without wit markers', async () => {
      const shortText = 'Markets are up today.'
      const result = await enforcer.evaluate(shortText, [guardrail])

      // Under 200 chars, so the sarcasm check does not trigger
      expect(result.warnings.length).toBe(0)
    })

    it('detects the "..." marker as sufficient', async () => {
      const text = 'So the Fed decided to print more money... and somehow people are surprised. The same playbook every single time and we are supposed to act shocked. The market rallies on hopium and crashes on reality.'
      const result = await enforcer.evaluate(text, [guardrail])

      expect(result.warnings.length).toBe(0)
    })

    it('detects "?!" marker as sufficient', async () => {
      const text = 'Wait, they actually did that?! The sheer audacity of launching another meme coin in this market. The community keeps falling for it. Every single cycle, the same pattern repeats. Incredible, really.'
      const result = await enforcer.evaluate(text, [guardrail])

      expect(result.warnings.length).toBe(0)
    })
  })

  // ── Enforcement levels ────────────────────────────────────────────

  describe('enforcement levels', () => {
    it('Block guardrail causes passed: false', async () => {
      const guardrail = makeGuardrail({
        condition: 'drops_into_assistant_mode',
        enforcement: 'Block',
      })
      const result = await enforcer.evaluate(
        'Absolutely! I am happy to help.',
        [guardrail]
      )

      expect(result.passed).toBe(false)
      expect(result.violations.length).toBeGreaterThanOrEqual(1)
    })

    it('Warn guardrail allows passed: true but populates warnings', async () => {
      const guardrail = makeGuardrail({
        condition: 'loses_sarcastic_edge',
        enforcement: 'Warn',
      })
      const blandText = 'The market performed well today. Prices increased across the board. Trading volume was higher than expected. Investors showed confidence. The outlook remains positive for the remainder of the quarter. All major indices closed up.'
      const result = await enforcer.evaluate(blandText, [guardrail])

      expect(result.passed).toBe(true)
      expect(result.warnings.length).toBeGreaterThanOrEqual(1)
    })

    it('FlagForReview guardrail allows passed: true and populates flagged', async () => {
      // FlagForReview only triggers for CreatorDefined with LLM, which we do not have.
      // But let's verify no false positive and the structure is correct.
      const guardrail = makeGuardrail({
        condition: 'drops_into_assistant_mode',
        enforcement: 'FlagForReview',
      })
      const result = await enforcer.evaluate(
        'Absolutely! Great question!',
        [guardrail]
      )

      expect(result.passed).toBe(true)
      expect(result.flagged.length).toBeGreaterThanOrEqual(1)
    })
  })

  // ── Inactive guardrails ───────────────────────────────────────────

  describe('inactive guardrails', () => {
    it('skips inactive guardrails', async () => {
      const guardrail = makeGuardrail({
        condition: 'drops_into_assistant_mode',
        enforcement: 'Block',
        active: false,
      })
      const result = await enforcer.evaluate(
        'Absolutely! Great question!',
        [guardrail]
      )

      expect(result.passed).toBe(true)
      expect(result.violations.length).toBe(0)
    })
  })

  // ── Multiple guardrails ───────────────────────────────────────────

  describe('multiple guardrails', () => {
    it('evaluates all guardrails and aggregates results', async () => {
      const guardrails = [
        makeGuardrail({
          id: 'gr-001',
          condition: 'drops_into_assistant_mode',
          enforcement: 'Block',
        }),
        makeGuardrail({
          id: 'gr-002',
          condition: 'becomes_generic_corporate',
          enforcement: 'Warn',
        }),
      ]

      const result = await enforcer.evaluate(
        'Absolutely! We need to leverage synergy and optimize our paradigm.',
        guardrails
      )

      expect(result.passed).toBe(false)
      expect(result.violations.length).toBeGreaterThanOrEqual(1)
      expect(result.warnings.length).toBeGreaterThanOrEqual(1)
    })

    it('passes when all guardrails are clean', async () => {
      const guardrails = [
        makeGuardrail({
          id: 'gr-001',
          condition: 'drops_into_assistant_mode',
          enforcement: 'Block',
        }),
        makeGuardrail({
          id: 'gr-002',
          condition: 'becomes_generic_corporate',
          enforcement: 'Block',
        }),
      ]

      const result = await enforcer.evaluate(
        'This market is a dumpster fire and I love every second of it.',
        guardrails
      )

      expect(result.passed).toBe(true)
      expect(result.violations.length).toBe(0)
      expect(result.warnings.length).toBe(0)
    })
  })

  // ── Empty guardrails ──────────────────────────────────────────────

  describe('empty guardrails', () => {
    it('passes with no guardrails', async () => {
      const result = await enforcer.evaluate('Any content here.', [])

      expect(result.passed).toBe(true)
      expect(result.violations.length).toBe(0)
      expect(result.warnings.length).toBe(0)
      expect(result.flagged.length).toBe(0)
    })
  })
})

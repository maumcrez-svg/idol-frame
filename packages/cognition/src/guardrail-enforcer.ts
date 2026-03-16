import type { Guardrail, GuardrailEnforcement } from '../../schema/src/index.js'
import type { LLMProvider } from '../../llm/src/index.js'

export interface GuardrailResult {
  passed: boolean
  violations: Array<{
    guardrail: Guardrail
    reason: string
  }>
  warnings: Array<{
    guardrail: Guardrail
    reason: string
  }>
  flagged: Array<{
    guardrail: Guardrail
    reason: string
  }>
}

// Heuristic patterns for fast guardrail checks
const ASSISTANT_PHRASES = [
  'absolutely!', 'great question', 'as an ai', 'i\'m an ai', 'i\'m happy to help',
  'let me break this down', 'here\'s the thing', 'that\'s a great point',
  'i don\'t have personal opinions', 'i\'m not able to', 'i\'d be happy to',
]

const CORPORATE_BUZZWORDS = [
  'synergy', 'leverage', 'optimize', 'streamline', 'paradigm', 'holistic',
  'ecosystem', 'value-add', 'thought leader', 'best-in-class', 'actionable insights',
]

export class GuardrailEnforcer {
  constructor(private llm?: LLMProvider) {}

  // Invariant 5: No output bypasses guardrail evaluation
  async evaluate(output: string, guardrails: Guardrail[]): Promise<GuardrailResult> {
    const result: GuardrailResult = {
      passed: true,
      violations: [],
      warnings: [],
      flagged: [],
    }

    const activeGuardrails = guardrails.filter(g => g.active)

    for (const guardrail of activeGuardrails) {
      const violated = await this.checkGuardrail(output, guardrail)
      if (violated) {
        const entry = { guardrail, reason: violated }
        switch (guardrail.enforcement) {
          case 'Block':
            result.violations.push(entry)
            result.passed = false
            break
          case 'Warn':
            result.warnings.push(entry)
            break
          case 'FlagForReview':
            result.flagged.push(entry)
            break
        }
      }
    }

    return result
  }

  private async checkGuardrail(output: string, guardrail: Guardrail): Promise<string | null> {
    const lower = output.toLowerCase()
    const condition = guardrail.condition.toLowerCase()

    // Fast heuristic checks for known patterns
    if (condition.includes('generic_assistant') || condition.includes('assistant_mode') || condition.includes('drops_into_assistant_mode')) {
      for (const phrase of ASSISTANT_PHRASES) {
        if (lower.includes(phrase)) return `Output contains assistant phrase: "${phrase}"`
      }
    }

    if (condition.includes('corporate') || condition.includes('becomes_generic_corporate')) {
      let count = 0
      for (const bw of CORPORATE_BUZZWORDS) {
        if (lower.includes(bw)) count++
      }
      if (count >= 2) return `Output contains ${count} corporate buzzwords`
    }

    if (condition.includes('financial_promise') || condition.includes('financial_advisor') || condition.includes('sounds_like_a_financial_advisor')) {
      const advisorPhrases = ['guaranteed return', 'you should invest', 'financial advice', 'i recommend buying', 'guaranteed profit']
      for (const phrase of advisorPhrases) {
        if (lower.includes(phrase)) return `Output contains financial advisory language: "${phrase}"`
      }
    }

    if (condition.includes('sarcastic_edge') || condition.includes('loses_sarcastic_edge')) {
      const witMarkers = ['...', '?!', 'honestly', 'look,', 'apparently', 'somehow', 'plot twist']
      const hasWit = witMarkers.some(m => lower.includes(m))
      if (!hasWit && output.length > 200) return 'Output lacks sarcastic/witty markers in long-form content'
    }

    // For CreatorDefined guardrails with complex conditions, use LLM
    if (guardrail.category === 'CreatorDefined' && this.llm) {
      return this.llmCheck(output, guardrail)
    }

    return null
  }

  private async llmCheck(output: string, guardrail: Guardrail): Promise<string | null> {
    if (!this.llm) return null

    try {
      const result = await this.llm.completeJSON<{ violated: boolean; reason: string }>([
        {
          role: 'system',
          content: 'You are a guardrail evaluator. Given an output and a guardrail condition, determine if the output violates the condition. Respond with JSON: { "violated": boolean, "reason": string }',
        },
        {
          role: 'user',
          content: `Guardrail: ${guardrail.name}\nCondition: ${guardrail.condition}\n\nOutput to evaluate:\n${output.substring(0, 2000)}`,
        },
      ], { temperature: 0 })

      return result.violated ? result.reason : null
    } catch {
      return null // Fail open on LLM errors for non-Safety guardrails
    }
  }
}

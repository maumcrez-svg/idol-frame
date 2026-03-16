import type { LLMProvider } from '../../llm/src/index.js'
import type { Voice } from '../../schema/src/index.js'

export interface VoiceScore {
  overall: number
  vocabulary: number
  syntax: number
  rhetoric: number
  emotional_register: number
}

export class VoiceAnalyzer {
  constructor(private llm: LLMProvider) {}

  async score(output: string, voice: Voice): Promise<VoiceScore> {
    // --- Programmatic sub-scores (fast, deterministic) ---
    const vocabulary = this.scoreVocabulary(output, voice)
    const syntax = this.scoreSyntax(output, voice)

    // --- LLM sub-scores (expensive, subjective) ---
    const llmScores = await this.scoreLLM(output, voice)

    const rhetoric = llmScores.rhetoric
    const emotional_register = llmScores.emotional_register

    // Weighted: vocab and syntax are reliable (0.25 each), LLM scores less (0.25 each)
    const overall = 0.25 * vocabulary + 0.25 * syntax + 0.25 * rhetoric + 0.25 * emotional_register

    return { overall, vocabulary, syntax, rhetoric, emotional_register }
  }

  private scoreVocabulary(output: string, voice: Voice): number {
    const words = output.toLowerCase().split(/\s+/)
    let score = 0.5 // baseline

    // Check banned terms
    const bannedHits = voice.vocabulary.banned_terms.filter(t => words.includes(t.toLowerCase()))
    score -= bannedHits.length * 0.15

    // Check signature phrases
    const lower = output.toLowerCase()
    const sigHits = voice.vocabulary.signature_phrases.filter(p => lower.includes(p.toLowerCase()))
    if (voice.vocabulary.signature_phrases.length > 0) {
      score += 0.3 * (sigHits.length / voice.vocabulary.signature_phrases.length)
    } else {
      score += 0.15 // no signatures defined, neutral
    }

    // Formality check (rough heuristic)
    const informalMarkers = ['gonna', 'wanna', 'gotta', 'ain\'t', 'kinda', 'sorta', 'lol', 'lmao', 'tbh', 'ngl']
    const informalCount = informalMarkers.filter(m => lower.includes(m)).length
    const informalRatio = informalCount / Math.max(1, words.length / 100)
    const expectedFormality = voice.vocabulary.formality

    // Low formality + informal markers = good. High formality + informal markers = bad.
    if (expectedFormality < 0.3) {
      score += informalRatio > 0 ? 0.1 : -0.05
    } else if (expectedFormality > 0.7) {
      score -= informalRatio * 0.2
    }

    return Math.max(0, Math.min(1, score))
  }

  private scoreSyntax(output: string, voice: Voice): number {
    const sentences = output.split(/[.!?]+/).filter(s => s.trim().length > 0)
    if (sentences.length === 0) return 0.5

    const avgLength = sentences.reduce((sum, s) => sum + s.trim().split(/\s+/).length, 0) / sentences.length
    const targetLength = voice.syntax.avg_sentence_length

    // Score based on how close actual avg is to target
    const lengthDiff = Math.abs(avgLength - targetLength)
    const lengthScore = Math.max(0, 1 - lengthDiff / targetLength)

    return Math.max(0, Math.min(1, lengthScore))
  }

  private async scoreLLM(output: string, voice: Voice): Promise<{ rhetoric: number; emotional_register: number }> {
    try {
      const result = await this.llm.completeJSON<{
        rhetoric: number
        emotional_register: number
      }>([
        {
          role: 'system',
          content: `You are a voice consistency analyzer. Score the output on two dimensions (0.0 to 1.0):

- rhetoric: Does the output use the expected rhetorical devices? Primary devices: ${voice.rhetoric.primary_devices.join(', ') || 'none specified'}. Humor type: ${voice.rhetoric.humor_type}. Argument style: ${voice.rhetoric.argument_style}.
  1.0 = perfectly matches expected rhetoric. 0.0 = completely different style.

- emotional_register: Does the output match the expected emotional baseline? Baseline intensity: ${voice.emotional_register.baseline_intensity}. Range: ${voice.emotional_register.range.join('-')}. Suppressed emotions: ${voice.emotional_register.suppressed_emotions.join(', ') || 'none'}.
  1.0 = perfect emotional match. 0.0 = completely wrong register.

Respond with JSON only: { "rhetoric": float, "emotional_register": float }`,
        },
        {
          role: 'user',
          content: `OUTPUT:\n${output.substring(0, 2000)}`,
        },
      ], { temperature: 0 })

      return {
        rhetoric: Math.max(0, Math.min(1, result.rhetoric)),
        emotional_register: Math.max(0, Math.min(1, result.emotional_register)),
      }
    } catch {
      return { rhetoric: 0.5, emotional_register: 0.5 } // Degrade gracefully
    }
  }
}

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GroundingEvaluator } from '../grounding-evaluator.js'
import { PerformanceEvaluator } from '../../../performance/src/evaluator.js'
import type { LLMProvider, ChatMessage, CompletionOptions, EmbeddingResult } from '../../../llm/src/types.js'
import type { MemoryRetriever, EnrichedMemoryResult } from '../../../cognition/src/memory-retriever.js'
import type { MemoryManager } from '../../../state/src/memory-manager.js'
import type { MemoryResult, EpisodicEntry } from '../../../schema/src/index.js'
import type { GroundingReport } from '../../../schema/src/primitives/grounding.js'
import type { GuardrailEnforcer, GuardrailResult } from '../../../cognition/src/guardrail-enforcer.js'
import type { IdentityEvaluator, IdentityScore } from '../identity-evaluator.js'
import type { VoiceAnalyzer, VoiceScore } from '../voice-analyzer.js'
import type { DecisionFrame } from '../../../schema/src/index.js'

// ── Helpers ──────────────────────────────────────────────────────────

function makeEntry(overrides?: Partial<EpisodicEntry>): EpisodicEntry {
  return {
    id: 'mem-001',
    entity_id: 'e-test-001',
    content: 'The project launched in March 2024.',
    context: '',
    importance: 0.7,
    timestamp: '2025-01-01T00:00:00Z',
    embedding: null,
    decay_rate: 0.01,
    consolidated: false,
    ...overrides,
  }
}

function makeMemoryResult(overrides?: Partial<EnrichedMemoryResult>): EnrichedMemoryResult {
  return {
    entry: makeEntry(),
    score: 0.85,
    source: 'vector',
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

function makeGuardrailResult(overrides?: Partial<GuardrailResult>): GuardrailResult {
  return {
    passed: true,
    violations: [],
    warnings: [],
    flagged: [],
    ...overrides,
  }
}

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

// ── Mock factories ───────────────────────────────────────────────────

function createMockLLM(): LLMProvider {
  return {
    complete: vi.fn(),
    completeJSON: vi.fn(),
    embed: vi.fn().mockResolvedValue({ embedding: [0.1, 0.2], token_count: 5 }),
    embedBatch: vi.fn(),
  }
}

function createMockRetriever(): MemoryRetriever {
  return {
    retrieve: vi.fn().mockResolvedValue([]),
    grep: vi.fn().mockReturnValue([]),
    expand: vi.fn().mockReturnValue([]),
    setConsolidator: vi.fn(),
  } as unknown as MemoryRetriever
}

function createMockMemoryManager(): MemoryManager {
  return {
    get: vi.fn().mockReturnValue(null),
    getByEntity: vi.fn().mockReturnValue([]),
    store: vi.fn(),
    markConsolidated: vi.fn(),
    getUnconsolidated: vi.fn().mockReturnValue([]),
  } as unknown as MemoryManager
}

// ── Tests ────────────────────────────────────────────────────────────

describe('GroundingEvaluator', () => {
  let llm: LLMProvider
  let retriever: MemoryRetriever
  let memoryManager: MemoryManager
  let evaluator: GroundingEvaluator

  beforeEach(() => {
    llm = createMockLLM()
    retriever = createMockRetriever()
    memoryManager = createMockMemoryManager()
    evaluator = new GroundingEvaluator(llm, retriever, memoryManager)
  })

  // ── 1. Empty output / no claims extracted ──────────────────────────

  describe('empty output / no claims extracted', () => {
    it('returns score 1.0 with empty arrays when LLM extracts no claims', async () => {
      vi.mocked(llm.completeJSON).mockResolvedValueOnce({ claims: [] })

      const report = await evaluator.evaluate('Hello world!', 'e-test-001')

      expect(report.score).toBe(1.0)
      expect(report.claims).toEqual([])
      expect(report.citations).toEqual([])
      expect(report.grounded_count).toBe(0)
      expect(report.novel_count).toBe(0)
      expect(report.ungrounded_count).toBe(0)
      expect(report.contradicted_count).toBe(0)
    })

    it('returns score 1.0 when LLM returns claims without text or type', async () => {
      vi.mocked(llm.completeJSON).mockResolvedValueOnce({
        claims: [{ text: '', type: '' }, { type: 'factual' }, { text: 'ok' }],
      })

      const report = await evaluator.evaluate('Vague stuff', 'e-test-001')

      expect(report.score).toBe(1.0)
      expect(report.claims).toEqual([])
    })

    it('returns score 1.0 when LLM returns null claims array', async () => {
      vi.mocked(llm.completeJSON).mockResolvedValueOnce({ claims: null })

      const report = await evaluator.evaluate('Nope', 'e-test-001')

      expect(report.score).toBe(1.0)
      expect(report.claims).toEqual([])
    })
  })

  // ── 2. All claims grounded ─────────────────────────────────────────

  describe('all claims grounded', () => {
    it('returns high score with grounded verdicts and citations', async () => {
      const mem1 = makeMemoryResult({
        entry: makeEntry({ id: 'mem-aaa', content: 'Project launched March 2024.' }),
        score: 0.9,
      })
      const mem2 = makeMemoryResult({
        entry: makeEntry({ id: 'mem-bbb', content: 'Revenue hit $10M in Q2.' }),
        score: 0.85,
      })

      // Extract claims
      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''

        if (systemContent.includes('claim extraction')) {
          return {
            claims: [
              { text: 'The project launched in March 2024.', type: 'factual' },
              { text: 'Revenue hit $10M in Q2.', type: 'factual' },
            ],
          }
        }

        // Verify against memories
        if (systemContent.includes('fact-checking')) {
          return {
            verdict: 'grounded',
            confidence: 0.95,
            supporting_indices: [1],
            contradiction: null,
          }
        }

        return {}
      })

      vi.mocked(retriever.retrieve).mockResolvedValue([mem1])
      vi.mocked(retriever.grep).mockReturnValue([mem2])

      const report = await evaluator.evaluate(
        'The project launched in March 2024 and revenue hit $10M in Q2.',
        'e-test-001',
      )

      expect(report.score).toBe(1.0)
      expect(report.grounded_count).toBe(2)
      expect(report.claims).toHaveLength(2)
      expect(report.claims.every(c => c.verdict === 'grounded')).toBe(true)
      expect(report.citations.length).toBeGreaterThan(0)
      expect(report.citations[0]).toHaveProperty('claim_text')
      expect(report.citations[0]).toHaveProperty('memory_id')
      expect(report.citations[0]).toHaveProperty('memory_content')
      expect(report.citations[0]).toHaveProperty('relevance')
    })
  })

  // ── 3. Novel opinions ──────────────────────────────────────────────

  describe('novel opinions', () => {
    it('returns score 0.8 per claim with verdict novel', async () => {
      // No memories found, so no contradiction path triggered
      vi.mocked(retriever.retrieve).mockResolvedValue([])
      vi.mocked(retriever.grep).mockReturnValue([])

      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction')) {
          return {
            claims: [
              { text: 'I think Bitcoin will surpass gold.', type: 'opinion' },
            ],
          }
        }
        return {}
      })

      const report = await evaluator.evaluate(
        'I think Bitcoin will surpass gold.',
        'e-test-001',
      )

      expect(report.score).toBeCloseTo(0.8, 2)
      expect(report.novel_count).toBe(1)
      expect(report.claims[0].verdict).toBe('novel')
      expect(report.claims[0].confidence).toBe(1.0)
      expect(report.claims[0].source_ids).toEqual([])
      expect(report.claims[0].contradiction).toBeNull()
    })

    it('predictions are also novel by default', async () => {
      vi.mocked(retriever.retrieve).mockResolvedValue([])
      vi.mocked(retriever.grep).mockReturnValue([])

      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction')) {
          return {
            claims: [
              { text: 'ETH will flip BTC by 2026.', type: 'prediction' },
            ],
          }
        }
        return {}
      })

      const report = await evaluator.evaluate(
        'ETH will flip BTC by 2026.',
        'e-test-001',
      )

      expect(report.score).toBeCloseTo(0.8, 2)
      expect(report.novel_count).toBe(1)
      expect(report.claims[0].verdict).toBe('novel')
    })
  })

  // ── 4. Ungrounded factual claim ────────────────────────────────────

  describe('ungrounded factual claim', () => {
    it('returns low score (0.3) with verdict ungrounded when no memories found', async () => {
      vi.mocked(retriever.retrieve).mockResolvedValue([])
      vi.mocked(retriever.grep).mockReturnValue([])

      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction')) {
          return {
            claims: [
              { text: 'We raised $50M in Series B.', type: 'factual' },
            ],
          }
        }
        return {}
      })

      const report = await evaluator.evaluate(
        'We raised $50M in Series B.',
        'e-test-001',
      )

      expect(report.score).toBeCloseTo(0.3, 2)
      expect(report.ungrounded_count).toBe(1)
      expect(report.claims[0].verdict).toBe('ungrounded')
      expect(report.claims[0].confidence).toBe(0)
      expect(report.claims[0].source_ids).toEqual([])
    })

    it('returns ungrounded when memories exist but LLM deems them irrelevant', async () => {
      const mem = makeMemoryResult({
        entry: makeEntry({ id: 'mem-weak', content: 'Discussed fundraising strategy.' }),
        score: 0.5,
      })

      vi.mocked(retriever.retrieve).mockResolvedValue([mem])
      vi.mocked(retriever.grep).mockReturnValue([])

      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction')) {
          return {
            claims: [
              { text: 'We raised $50M in Series B.', type: 'factual' },
            ],
          }
        }
        if (systemContent.includes('fact-checking')) {
          return {
            verdict: 'ungrounded',
            confidence: 0.8,
            supporting_indices: [],
            contradiction: null,
          }
        }
        return {}
      })

      const report = await evaluator.evaluate(
        'We raised $50M in Series B.',
        'e-test-001',
      )

      expect(report.score).toBeCloseTo(0.3, 2)
      expect(report.ungrounded_count).toBe(1)
    })
  })

  // ── 5. Contradicted claim ──────────────────────────────────────────

  describe('contradicted claim', () => {
    it('returns verdict contradicted with contradiction text and source_ids', async () => {
      const mem = makeMemoryResult({
        entry: makeEntry({
          id: 'mem-contra',
          content: 'The project launched in January 2024.',
        }),
        score: 0.9,
      })

      vi.mocked(retriever.retrieve).mockResolvedValue([mem])
      vi.mocked(retriever.grep).mockReturnValue([])

      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction')) {
          return {
            claims: [
              { text: 'The project launched in March 2024.', type: 'factual' },
            ],
          }
        }
        if (systemContent.includes('fact-checking')) {
          return {
            verdict: 'contradicted',
            confidence: 0.95,
            supporting_indices: [1],
            contradiction: 'Memory says January 2024, claim says March 2024.',
          }
        }
        return {}
      })

      const report = await evaluator.evaluate(
        'The project launched in March 2024.',
        'e-test-001',
      )

      expect(report.score).toBeCloseTo(0.0, 2)
      expect(report.contradicted_count).toBe(1)
      expect(report.claims[0].verdict).toBe('contradicted')
      expect(report.claims[0].contradiction).toBe('Memory says January 2024, claim says March 2024.')
      expect(report.claims[0].source_ids).toContain('mem-contra')
      expect(report.citations).toHaveLength(1)
      expect(report.citations[0].memory_id).toBe('mem-contra')
    })
  })

  // ── 6. Mixed claims ───────────────────────────────────────────────

  describe('mixed claims', () => {
    it('computes correct weighted score from mixed verdicts', async () => {
      const mem = makeMemoryResult({
        entry: makeEntry({ id: 'mem-fact', content: 'Revenue hit $10M.' }),
        score: 0.9,
      })

      // The output has 4 claims: 1 grounded factual, 1 novel opinion, 1 ungrounded factual, 1 contradicted factual
      let callCount = 0

      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''

        if (systemContent.includes('claim extraction')) {
          return {
            claims: [
              { text: 'Revenue hit $10M.', type: 'factual' },
              { text: 'I think the market is bullish.', type: 'opinion' },
              { text: 'We opened a Tokyo office.', type: 'factual' },
              { text: 'We launched in Q1 2023.', type: 'factual' },
            ],
          }
        }

        if (systemContent.includes('fact-checking')) {
          callCount++
          // First factual claim: grounded
          if (callCount === 1) {
            return {
              verdict: 'grounded',
              confidence: 0.95,
              supporting_indices: [1],
              contradiction: null,
            }
          }
          // Third claim (ungrounded factual): no memories found handled by findSupportingMemories
          // Fourth claim (contradicted)
          if (callCount === 2) {
            return {
              verdict: 'ungrounded',
              confidence: 0.6,
              supporting_indices: [],
              contradiction: null,
            }
          }
          if (callCount === 3) {
            return {
              verdict: 'contradicted',
              confidence: 0.9,
              supporting_indices: [1],
              contradiction: 'Actually launched in Q3 2023.',
            }
          }
        }

        return {}
      })

      // All factual claims find memories (to reach verifyAgainstMemories)
      vi.mocked(retriever.retrieve).mockResolvedValue([mem])
      vi.mocked(retriever.grep).mockReturnValue([])

      const report = await evaluator.evaluate(
        'Revenue hit $10M. I think the market is bullish. We opened a Tokyo office. We launched in Q1 2023.',
        'e-test-001',
      )

      // 4 claims: grounded(1.0) + novel(0.8) + ungrounded(0.3) + contradicted(0.0)
      // = 2.1 / 4 = 0.525
      expect(report.score).toBeCloseTo(0.525, 2)
      expect(report.grounded_count).toBe(1)
      expect(report.novel_count).toBe(1)
      expect(report.ungrounded_count).toBe(1)
      expect(report.contradicted_count).toBe(1)
      expect(report.claims).toHaveLength(4)
    })
  })

  // ── 7. LLM extraction failure ─────────────────────────────────────

  describe('LLM extraction failure', () => {
    it('returns score 1.0 on graceful degradation when extractClaims throws', async () => {
      vi.mocked(llm.completeJSON).mockRejectedValueOnce(new Error('LLM unavailable'))

      const report = await evaluator.evaluate(
        'Some text that would fail extraction.',
        'e-test-001',
      )

      expect(report.score).toBe(1.0)
      expect(report.claims).toEqual([])
      expect(report.citations).toEqual([])
    })
  })

  // ── 8. LLM verification failure ───────────────────────────────────

  describe('LLM verification failure', () => {
    it('falls back to ungrounded verdict when verifyAgainstMemories throws', async () => {
      const mem = makeMemoryResult({
        entry: makeEntry({ id: 'mem-verify-fail' }),
        score: 0.8,
      })

      let extractionDone = false
      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction') && !extractionDone) {
          extractionDone = true
          return {
            claims: [
              { text: 'The server has 99.9% uptime.', type: 'factual' },
            ],
          }
        }
        if (systemContent.includes('fact-checking')) {
          throw new Error('LLM verification failed')
        }
        return {}
      })

      vi.mocked(retriever.retrieve).mockResolvedValue([mem])
      vi.mocked(retriever.grep).mockReturnValue([])

      const report = await evaluator.evaluate(
        'The server has 99.9% uptime.',
        'e-test-001',
      )

      // Conservative fallback: ungrounded = 0.3
      expect(report.score).toBeCloseTo(0.3, 2)
      expect(report.claims[0].verdict).toBe('ungrounded')
      expect(report.claims[0].confidence).toBe(0.5)
    })
  })

  // ── 9. Contradiction detection for opinions ────────────────────────

  describe('contradiction detection', () => {
    it('flags silent contradiction when opinion conflicts with past opinion', async () => {
      const pastOpinion = makeMemoryResult({
        entry: makeEntry({
          id: 'mem-old-opinion',
          content: '[opinion] I think Bitcoin is bearish long-term.',
        }),
        score: 0.85,
      })

      vi.mocked(retriever.retrieve).mockResolvedValue([pastOpinion])
      vi.mocked(retriever.grep).mockReturnValue([])

      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''

        if (systemContent.includes('claim extraction')) {
          return {
            claims: [
              { text: 'I think Bitcoin is extremely bullish.', type: 'opinion' },
            ],
          }
        }

        if (systemContent.includes('contradiction detector')) {
          return {
            contradicts: true,
            memory_index: 1,
            explanation: 'Previously said Bitcoin is bearish, now says bullish.',
            confidence: 0.9,
          }
        }

        return {}
      })

      const report = await evaluator.evaluate(
        'I think Bitcoin is extremely bullish.',
        'e-test-001',
      )

      expect(report.contradicted_count).toBe(1)
      expect(report.claims[0].verdict).toBe('contradicted')
      expect(report.claims[0].contradiction).toBe(
        'Previously said Bitcoin is bearish, now says bullish.',
      )
      expect(report.claims[0].source_ids).toContain('mem-old-opinion')
      expect(report.citations).toHaveLength(1)
      expect(report.citations[0].memory_id).toBe('mem-old-opinion')
    })

    it('opinion remains novel when no contradiction detected', async () => {
      const pastOpinion = makeMemoryResult({
        entry: makeEntry({
          id: 'mem-old-opinion-2',
          content: '[opinion] I think AI will transform healthcare.',
        }),
        score: 0.7,
      })

      vi.mocked(retriever.retrieve).mockResolvedValue([pastOpinion])
      vi.mocked(retriever.grep).mockReturnValue([])

      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction')) {
          return {
            claims: [
              { text: 'I believe AI will also transform education.', type: 'opinion' },
            ],
          }
        }
        if (systemContent.includes('contradiction detector')) {
          return {
            contradicts: false,
            memory_index: 0,
            explanation: '',
            confidence: 0.1,
          }
        }
        return {}
      })

      const report = await evaluator.evaluate(
        'I believe AI will also transform education.',
        'e-test-001',
      )

      expect(report.novel_count).toBe(1)
      expect(report.contradicted_count).toBe(0)
      expect(report.claims[0].verdict).toBe('novel')
    })

    it('skips contradiction check when no opinion memories found', async () => {
      // Memories exist but none contain opinion markers
      const factMemory = makeMemoryResult({
        entry: makeEntry({
          id: 'mem-fact-only',
          content: 'Quarterly revenue report published.',
        }),
        score: 0.6,
      })

      vi.mocked(retriever.retrieve).mockResolvedValue([factMemory])
      vi.mocked(retriever.grep).mockReturnValue([])

      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction')) {
          return {
            claims: [
              { text: 'I think DeFi is the future.', type: 'opinion' },
            ],
          }
        }
        // Should NOT be called because no opinion memories exist
        if (systemContent.includes('contradiction detector')) {
          throw new Error('Should not reach contradiction detector')
        }
        return {}
      })

      const report = await evaluator.evaluate(
        'I think DeFi is the future.',
        'e-test-001',
      )

      expect(report.novel_count).toBe(1)
      expect(report.claims[0].verdict).toBe('novel')
    })
  })

  // ── 10. Score computation formula ──────────────────────────────────

  describe('score computation', () => {
    it('pure grounded claims => score 1.0', async () => {
      const mem = makeMemoryResult({ score: 0.9 })
      vi.mocked(retriever.retrieve).mockResolvedValue([mem])
      vi.mocked(retriever.grep).mockReturnValue([])

      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction')) {
          return { claims: [{ text: 'Fact A', type: 'factual' }] }
        }
        if (systemContent.includes('fact-checking')) {
          return { verdict: 'grounded', confidence: 0.95, supporting_indices: [1], contradiction: null }
        }
        return {}
      })

      const report = await evaluator.evaluate('Fact A', 'e-test-001')
      expect(report.score).toBeCloseTo(1.0, 2)
    })

    it('pure novel claims => score 0.8', async () => {
      vi.mocked(retriever.retrieve).mockResolvedValue([])
      vi.mocked(retriever.grep).mockReturnValue([])
      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction')) {
          return { claims: [{ text: 'I think X.', type: 'opinion' }] }
        }
        return {}
      })

      const report = await evaluator.evaluate('I think X.', 'e-test-001')
      expect(report.score).toBeCloseTo(0.8, 2)
    })

    it('pure ungrounded claims => score 0.3', async () => {
      vi.mocked(retriever.retrieve).mockResolvedValue([])
      vi.mocked(retriever.grep).mockReturnValue([])
      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction')) {
          return { claims: [{ text: 'We have 1M users.', type: 'factual' }] }
        }
        return {}
      })

      const report = await evaluator.evaluate('We have 1M users.', 'e-test-001')
      expect(report.score).toBeCloseTo(0.3, 2)
    })

    it('pure contradicted claims => score 0.0', async () => {
      const mem = makeMemoryResult({ score: 0.9 })
      vi.mocked(retriever.retrieve).mockResolvedValue([mem])
      vi.mocked(retriever.grep).mockReturnValue([])

      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction')) {
          return { claims: [{ text: 'We launched in 2020.', type: 'factual' }] }
        }
        if (systemContent.includes('fact-checking')) {
          return { verdict: 'contradicted', confidence: 0.9, supporting_indices: [1], contradiction: 'Launched in 2024.' }
        }
        return {}
      })

      const report = await evaluator.evaluate('We launched in 2020.', 'e-test-001')
      expect(report.score).toBeCloseTo(0.0, 2)
    })

    it('2 grounded + 1 novel = (2*1.0 + 1*0.8)/3 = 0.9333', async () => {
      const mem = makeMemoryResult({ score: 0.9 })
      vi.mocked(retriever.retrieve).mockResolvedValue([mem])
      vi.mocked(retriever.grep).mockReturnValue([])

      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction')) {
          return {
            claims: [
              { text: 'Fact A', type: 'factual' },
              { text: 'Fact B', type: 'factual' },
              { text: 'I think X', type: 'opinion' },
            ],
          }
        }
        if (systemContent.includes('fact-checking')) {
          return { verdict: 'grounded', confidence: 0.9, supporting_indices: [1], contradiction: null }
        }
        return {}
      })

      const report = await evaluator.evaluate('Fact A. Fact B. I think X.', 'e-test-001')
      expect(report.score).toBeCloseTo(2.8 / 3, 2)
    })
  })

  // ── 11. Citations structure ────────────────────────────────────────

  describe('citations', () => {
    it('has correct structure with claim_text, memory_id, memory_content, relevance', async () => {
      const mem = makeMemoryResult({
        entry: makeEntry({
          id: 'mem-cite-001',
          content: 'Team grew to 50 people in 2024.',
        }),
        score: 0.88,
      })

      vi.mocked(retriever.retrieve).mockResolvedValue([mem])
      vi.mocked(retriever.grep).mockReturnValue([])

      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction')) {
          return {
            claims: [
              { text: 'Our team grew to 50 people.', type: 'factual' },
            ],
          }
        }
        if (systemContent.includes('fact-checking')) {
          return {
            verdict: 'grounded',
            confidence: 0.92,
            supporting_indices: [1],
            contradiction: null,
          }
        }
        return {}
      })

      const report = await evaluator.evaluate('Our team grew to 50 people.', 'e-test-001')

      expect(report.citations).toHaveLength(1)

      const citation = report.citations[0]
      expect(citation.claim_text).toBe('Our team grew to 50 people.')
      expect(citation.memory_id).toBe('mem-cite-001')
      expect(citation.memory_content).toBe('Team grew to 50 people in 2024.')
      expect(citation.relevance).toBe(0.88)
    })

    it('empty citations for novel opinions without contradiction', async () => {
      vi.mocked(retriever.retrieve).mockResolvedValue([])
      vi.mocked(retriever.grep).mockReturnValue([])

      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction')) {
          return {
            claims: [{ text: 'I love decentralization.', type: 'opinion' }],
          }
        }
        return {}
      })

      const report = await evaluator.evaluate('I love decentralization.', 'e-test-001')
      expect(report.citations).toEqual([])
    })

    it('contradiction citation includes memory_content from contradicting memory', async () => {
      const pastOpinion = makeMemoryResult({
        entry: makeEntry({
          id: 'mem-contra-cite',
          content: '[opinion] I believe regulation is bad.',
        }),
        score: 0.8,
      })

      vi.mocked(retriever.retrieve).mockResolvedValue([pastOpinion])
      vi.mocked(retriever.grep).mockReturnValue([])

      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction')) {
          return {
            claims: [
              { text: 'I believe regulation is necessary.', type: 'opinion' },
            ],
          }
        }
        if (systemContent.includes('contradiction detector')) {
          return {
            contradicts: true,
            memory_index: 1,
            explanation: 'Previously said regulation is bad, now says necessary.',
            confidence: 0.85,
          }
        }
        return {}
      })

      const report = await evaluator.evaluate(
        'I believe regulation is necessary.',
        'e-test-001',
      )

      expect(report.citations).toHaveLength(1)
      expect(report.citations[0].memory_content).toBe('[opinion] I believe regulation is bad.')
      expect(report.citations[0].relevance).toBe(0.85)
    })
  })

  // ── 12. Keyword extraction ─────────────────────────────────────────

  describe('keyword extraction', () => {
    it('filters stopwords and short words', async () => {
      // Access private method via any cast for unit testing
      const keywords = (evaluator as any).extractKeywords(
        'The quick brown fox jumped over the lazy dog in a park',
      )

      expect(keywords).not.toContain('the')
      expect(keywords).not.toContain('a')
      expect(keywords).not.toContain('in')
      // "over" is not in the stopwords list and has 4 chars, so it passes through
      // "fox" and "dog" are length 3 so they pass the > 2 filter
      expect(keywords).toContain('quick')
      expect(keywords).toContain('brown')
      expect(keywords).toContain('fox')
      expect(keywords).toContain('jumped')
      expect(keywords).toContain('lazy')
      expect(keywords).toContain('dog')
      expect(keywords).toContain('park')
    })

    it('filters words with 2 or fewer characters', async () => {
      const keywords = (evaluator as any).extractKeywords('I am at an ok AI')

      // "am", "at", "an", "ok", "ai" are all <= 2 chars or stopwords
      expect(keywords).toEqual([])
    })

    it('removes punctuation before filtering', async () => {
      const keywords = (evaluator as any).extractKeywords(
        "Bitcoin's price is $50,000!",
      )

      expect(keywords).toContain('bitcoins')
      expect(keywords).toContain('price')
      expect(keywords).toContain('50000')
    })

    it('converts to lowercase', async () => {
      const keywords = (evaluator as any).extractKeywords('Bitcoin Ethereum Solana')
      expect(keywords).toEqual(['bitcoin', 'ethereum', 'solana'])
    })
  })

  // ── 13. Deduplication ──────────────────────────────────────────────

  describe('deduplication', () => {
    it('merges vector and grep results without duplicates', async () => {
      const sharedMem = makeMemoryResult({
        entry: makeEntry({ id: 'mem-shared' }),
        score: 0.9,
      })
      const vectorOnlyMem = makeMemoryResult({
        entry: makeEntry({ id: 'mem-vector-only', content: 'Vector only content.' }),
        score: 0.7,
      })
      const grepOnlyMem = makeMemoryResult({
        entry: makeEntry({ id: 'mem-grep-only', content: 'Grep only content.' }),
        score: 0.6,
      })

      // Both vector and grep return the shared memory
      vi.mocked(retriever.retrieve).mockResolvedValue([sharedMem, vectorOnlyMem])
      vi.mocked(retriever.grep).mockReturnValue([sharedMem, grepOnlyMem])

      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction')) {
          return {
            claims: [{ text: 'A factual claim.', type: 'factual' }],
          }
        }
        if (systemContent.includes('fact-checking')) {
          return {
            verdict: 'grounded',
            confidence: 0.9,
            supporting_indices: [1, 2, 3],
            contradiction: null,
          }
        }
        return {}
      })

      const report = await evaluator.evaluate('A factual claim.', 'e-test-001')

      // Should have citations from 3 unique memories, not 4
      // The exact count depends on findSupportingMemories dedup, but no duplicates
      const memoryIds = report.citations.map(c => c.memory_id)
      const uniqueIds = new Set(memoryIds)
      expect(memoryIds.length).toBe(uniqueIds.size)
    })
  })

  // ── 14. Integration with PerformanceEvaluator ──────────────────────

  describe('integration with PerformanceEvaluator', () => {
    it('uses 0.30/0.20/0.25/0.25 weights when grounding evaluator is present', async () => {
      // Set up a grounding evaluator that returns a known report
      vi.mocked(retriever.retrieve).mockResolvedValue([])
      vi.mocked(retriever.grep).mockReturnValue([])

      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction')) {
          return {
            claims: [{ text: 'An opinion.', type: 'opinion' }],
          }
        }
        return {}
      })

      const groundingEval = new GroundingEvaluator(llm, retriever, memoryManager)

      const perfEvaluator = new PerformanceEvaluator(
        { evaluate: async () => makeGuardrailResult({ passed: true }) } as unknown as GuardrailEnforcer,
        { score: async () => makeIdentityScore(0.8) } as unknown as IdentityEvaluator,
        { score: async () => makeVoiceScore(0.6) } as unknown as VoiceAnalyzer,
        groundingEval,
      )

      const frame = makeMinimalFrame()
      const result = await perfEvaluator.evaluate('An opinion.', frame)

      // grounding score = 0.8 (novel opinion)
      // quality = 0.30*0.8 + 0.20*0.6 + 0.25*1.0 + 0.25*0.8
      //         = 0.24 + 0.12 + 0.25 + 0.20 = 0.81
      expect(result.quality_score).toBeCloseTo(0.81, 2)
      expect(result.grounding_report).not.toBeNull()
      expect(result.grounding_report!.novel_count).toBe(1)
    })

    it('contradictions trigger Regenerate even when quality score is high enough', async () => {
      const mem = makeMemoryResult({
        entry: makeEntry({
          id: 'mem-past-opinion',
          content: '[opinion] I think ETH is overvalued.',
        }),
        score: 0.9,
      })

      vi.mocked(retriever.retrieve).mockResolvedValue([mem])
      vi.mocked(retriever.grep).mockReturnValue([])

      vi.mocked(llm.completeJSON).mockImplementation(async (messages: ChatMessage[]) => {
        const systemContent = messages[0]?.content ?? ''
        if (systemContent.includes('claim extraction')) {
          return {
            claims: [
              { text: 'I think ETH is undervalued.', type: 'opinion' },
            ],
          }
        }
        if (systemContent.includes('contradiction detector')) {
          return {
            contradicts: true,
            memory_index: 1,
            explanation: 'Previously said overvalued, now says undervalued.',
            confidence: 0.9,
          }
        }
        return {}
      })

      const groundingEval = new GroundingEvaluator(llm, retriever, memoryManager)

      const perfEvaluator = new PerformanceEvaluator(
        { evaluate: async () => makeGuardrailResult({ passed: true }) } as unknown as GuardrailEnforcer,
        { score: async () => makeIdentityScore(1.0) } as unknown as IdentityEvaluator,
        { score: async () => makeVoiceScore(1.0) } as unknown as VoiceAnalyzer,
        groundingEval,
      )

      const frame = makeMinimalFrame()
      const result = await perfEvaluator.evaluate('I think ETH is undervalued.', frame, 1)

      // Even though identity + voice are perfect, contradiction forces Regenerate
      expect(result.grounding_report!.contradicted_count).toBe(1)
      expect(result.action).toBe('Regenerate')
      expect(result.passed).toBe(false)
    })

    it('without grounding evaluator, report is null and weights are 0.4/0.3/0.3', async () => {
      const perfEvaluator = new PerformanceEvaluator(
        { evaluate: async () => makeGuardrailResult({ passed: true }) } as unknown as GuardrailEnforcer,
        { score: async () => makeIdentityScore(0.8) } as unknown as IdentityEvaluator,
        { score: async () => makeVoiceScore(0.7) } as unknown as VoiceAnalyzer,
        // No grounding evaluator
      )

      const frame = makeMinimalFrame()
      const result = await perfEvaluator.evaluate('Output', frame)

      // 0.4*0.8 + 0.3*0.7 + 0.3*1.0 = 0.32 + 0.21 + 0.30 = 0.83
      expect(result.quality_score).toBeCloseTo(0.83, 2)
      expect(result.grounding_report).toBeNull()
    })
  })
})

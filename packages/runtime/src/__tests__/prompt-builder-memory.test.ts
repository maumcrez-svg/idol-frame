import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../prompt-builder.js'
import type {
  Entity,
  DecisionFrame,
  IdentityCore,
  Voice,
  Trait,
  Guardrail,
  MemoryResult,
  Stage,
  InteractionContext,
  PerformanceMode,
} from '../../../schema/src/index.js'

// ── Fixtures ────────────────────────────────────────────────────────

function makeEntity(overrides?: Partial<Entity>): Entity {
  return {
    id: 'e-test-001',
    version: '1.0.0',
    name: 'Rex Viper',
    archetype: 'Provocateur',
    role: 'Market Commentator',
    domain: 'Crypto & DeFi',
    status: 'Active',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeIdentityCore(overrides?: Partial<IdentityCore>): IdentityCore {
  return {
    id: 'ic-test-001',
    entity_id: 'e-test-001',
    version: '1.0.0',
    values: [
      { name: 'Transparency', description: 'Always tell the truth', weight: 0.9 },
    ],
    worldview: {
      beliefs: [],
      communication_philosophy: 'Direct.',
    },
    core_tensions: [],
    recognition_markers: [],
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeVoice(overrides?: Partial<Voice>): Voice {
  return {
    id: 'vc-test-001',
    entity_id: 'e-test-001',
    vocabulary: {
      formality: 0.25,
      domain_terms: [],
      banned_terms: [],
      signature_phrases: [],
    },
    syntax: {
      avg_sentence_length: 10,
      complexity: 0.4,
      paragraph_style: 'punchy',
    },
    rhetoric: {
      primary_devices: [],
      humor_type: 'dry',
      argument_style: 'direct',
    },
    emotional_register: {
      baseline_intensity: 0.5,
      range: [0.2, 0.8] as [number, number],
      suppressed_emotions: [],
    },
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeTrait(): Trait {
  return {
    id: 'tr-test-001',
    entity_id: 'e-test-001',
    name: 'Wit',
    description: 'Quick thinking',
    value: 0.7,
    range: { min: 0, max: 1 },
    expression_rules: ['Be sharp'],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  }
}

function makeGuardrail(): Guardrail {
  return {
    id: 'gr-test-001',
    entity_id: 'e-test-001',
    name: 'No AI Voice',
    description: 'Stay in character',
    category: 'Brand',
    condition: 'drops_character',
    enforcement: 'Block',
    active: true,
    created_at: '2025-01-01T00:00:00Z',
  }
}

function makeStage(): Stage {
  return {
    id: 'stg-test-001',
    name: 'Main Show',
    platform: 'youtube',
    format_spec: { max_length: null, supports_markdown: true, supports_media: false },
    adapter_type: 'live_stream',
    active: true,
    created_at: '2025-01-01T00:00:00Z',
  }
}

function makeFrame(overrides?: Partial<DecisionFrame>): DecisionFrame {
  return {
    id: 'df-test-001',
    entity_id: 'e-test-001',
    identity_core: makeIdentityCore(),
    voice: makeVoice(),
    traits: [makeTrait()],
    guardrails: [makeGuardrail()],
    memories: [],
    mood: null,
    arc: null,
    directives: [],
    stage: makeStage(),
    interaction_context: { type: 'Reactive', trigger: 'test', audience: null },
    assembled_at: '2025-06-15T12:00:00Z',
    ...overrides,
  }
}

interface EnrichedMemoryResult extends MemoryResult {
  source?: 'fresh_tail' | 'vector' | 'fts' | 'consolidated'
}

function makeMemoryEntry(overrides?: Partial<MemoryResult['entry']>): MemoryResult['entry'] {
  return {
    id: 'mem-test-001',
    entity_id: 'e-test-001',
    content: 'Called SOL bullish at $180.',
    context: 'Live show episode 42',
    importance: 0.85,
    timestamp: '2025-06-01T00:00:00Z',
    embedding: null,
    decay_rate: 0.01,
    consolidated: false,
    ...overrides,
  }
}

// ── Tests ───────────────────────────────────────────────────────────

describe('buildSystemPrompt memory block behavior', () => {
  const entity = makeEntity()
  const mode: PerformanceMode = 'live_host'

  describe('enriched memories with source markers', () => {
    it('splits into RECENT MEMORY / CONSOLIDATED MEMORY / RELEVANT MEMORY sections', () => {
      const memories: EnrichedMemoryResult[] = [
        {
          entry: makeMemoryEntry({ id: 'mem-recent-001', content: 'Just talked about ETH merge.' }),
          score: 1.0,
          source: 'fresh_tail',
        },
        {
          entry: makeMemoryEntry({ id: 'mem-recent-002', content: 'Mentioned SOL ecosystem growth.' }),
          score: 1.0,
          source: 'fresh_tail',
        },
        {
          entry: makeMemoryEntry({
            id: 'mn-summary-001',
            content: 'Summary of early Bitcoin discussions and market calls.',
            importance: 0.7,
          }),
          score: 0.75,
          source: 'consolidated',
        },
        {
          entry: makeMemoryEntry({
            id: 'mem-vec-001',
            content: 'Predicted BTC would hit 100k by year end.',
            context: 'Episode 30 prediction segment',
          }),
          score: 0.65,
          source: 'vector',
        },
        {
          entry: makeMemoryEntry({
            id: 'mem-fts-001',
            content: 'DeFi summer was the turning point.',
            context: 'Analysis segment',
          }),
          score: 0.55,
          source: 'fts',
        },
      ]

      const frame = makeFrame({ memories: memories as MemoryResult[] })
      const prompt = buildSystemPrompt(entity, frame, mode)

      // Should have all three sections
      expect(prompt).toContain('RECENT MEMORY (verbatim')
      expect(prompt).toContain('CONSOLIDATED MEMORY (summaries')
      expect(prompt).toContain('RELEVANT MEMORY (retrieved by relevance)')

      // Recent memory should contain the fresh_tail entries
      expect(prompt).toContain('Just talked about ETH merge.')
      expect(prompt).toContain('Mentioned SOL ecosystem growth.')

      // Consolidated section should contain the summary
      expect(prompt).toContain('Summary of early Bitcoin discussions')

      // Relevant section should contain vector and fts entries
      expect(prompt).toContain('Predicted BTC would hit 100k')
      expect(prompt).toContain('DeFi summer was the turning point.')
    })

    it('shows context for recent entries when available', () => {
      const memories: EnrichedMemoryResult[] = [
        {
          entry: makeMemoryEntry({
            id: 'mem-001',
            content: 'Talked about regulation.',
            context: 'Policy discussion segment',
          }),
          score: 1.0,
          source: 'fresh_tail',
        },
      ]

      const frame = makeFrame({ memories: memories as MemoryResult[] })
      const prompt = buildSystemPrompt(entity, frame, mode)

      expect(prompt).toContain('Context: Policy discussion segment')
    })

    it('shows importance level for consolidated entries', () => {
      const memories: EnrichedMemoryResult[] = [
        {
          entry: makeMemoryEntry({
            id: 'mn-001',
            content: 'Critical summary.',
            importance: 0.85,
          }),
          score: 0.8,
          source: 'consolidated',
        },
      ]

      const frame = makeFrame({ memories: memories as MemoryResult[] })
      const prompt = buildSystemPrompt(entity, frame, mode)

      expect(prompt).toContain('[CRITICAL]')
      expect(prompt).toContain('Critical summary.')
    })

    it('shows importance level for relevant (vector/fts) entries', () => {
      const memories: EnrichedMemoryResult[] = [
        {
          entry: makeMemoryEntry({
            id: 'mem-001',
            content: 'Medium importance recall.',
            importance: 0.5,
          }),
          score: 0.6,
          source: 'vector',
        },
      ]

      const frame = makeFrame({ memories: memories as MemoryResult[] })
      const prompt = buildSystemPrompt(entity, frame, mode)

      expect(prompt).toContain('[MEDIUM]')
      expect(prompt).toContain('Medium importance recall.')
    })

    it('omits section headers for missing source types', () => {
      // Only fresh_tail, no consolidated or vector/fts
      const memories: EnrichedMemoryResult[] = [
        {
          entry: makeMemoryEntry({ id: 'mem-001', content: 'Only recent entry.' }),
          score: 1.0,
          source: 'fresh_tail',
        },
      ]

      const frame = makeFrame({ memories: memories as MemoryResult[] })
      const prompt = buildSystemPrompt(entity, frame, mode)

      expect(prompt).toContain('RECENT MEMORY')
      expect(prompt).not.toContain('CONSOLIDATED MEMORY')
      expect(prompt).not.toContain('RELEVANT MEMORY')
    })

    it('handles only consolidated memories (no fresh_tail)', () => {
      const memories: EnrichedMemoryResult[] = [
        {
          entry: makeMemoryEntry({
            id: 'mn-001',
            content: 'A consolidated summary.',
            importance: 0.6,
          }),
          score: 0.7,
          source: 'consolidated',
        },
      ]

      const frame = makeFrame({ memories: memories as MemoryResult[] })
      const prompt = buildSystemPrompt(entity, frame, mode)

      expect(prompt).not.toContain('RECENT MEMORY')
      expect(prompt).toContain('CONSOLIDATED MEMORY')
      expect(prompt).toContain('A consolidated summary.')
    })
  })

  describe('backward compat: no source markers falls back to CONTINUITY MEMORY', () => {
    it('renders flat CONTINUITY MEMORY list when memories lack source field', () => {
      const memories: MemoryResult[] = [
        {
          entry: makeMemoryEntry({
            id: 'mem-001',
            content: 'Old-style memory entry one.',
            importance: 0.8,
          }),
          score: 0.9,
        },
        {
          entry: makeMemoryEntry({
            id: 'mem-002',
            content: 'Old-style memory entry two.',
            importance: 0.4,
            context: 'Some old context',
          }),
          score: 0.5,
        },
      ]

      const frame = makeFrame({ memories })
      const prompt = buildSystemPrompt(entity, frame, mode)

      expect(prompt).toContain('CONTINUITY MEMORY')
      expect(prompt).not.toContain('RECENT MEMORY')
      expect(prompt).not.toContain('CONSOLIDATED MEMORY')
      expect(prompt).not.toContain('RELEVANT MEMORY')

      expect(prompt).toContain('Old-style memory entry one.')
      expect(prompt).toContain('Old-style memory entry two.')
    })

    it('sorts backward-compat memories by score descending', () => {
      const memories: MemoryResult[] = [
        {
          entry: makeMemoryEntry({ id: 'mem-low', content: 'Low score memory.' }),
          score: 0.3,
        },
        {
          entry: makeMemoryEntry({ id: 'mem-high', content: 'High score memory.' }),
          score: 0.95,
        },
      ]

      const frame = makeFrame({ memories })
      const prompt = buildSystemPrompt(entity, frame, mode)

      const highIdx = prompt.indexOf('High score memory.')
      const lowIdx = prompt.indexOf('Low score memory.')
      expect(highIdx).toBeLessThan(lowIdx)
    })

    it('shows importance level and context in backward-compat mode', () => {
      const memories: MemoryResult[] = [
        {
          entry: makeMemoryEntry({
            id: 'mem-001',
            content: 'Important old memory.',
            importance: 0.65,
            context: 'Episode 10',
          }),
          score: 0.8,
        },
      ]

      const frame = makeFrame({ memories })
      const prompt = buildSystemPrompt(entity, frame, mode)

      expect(prompt).toContain('[HIGH]')
      expect(prompt).toContain('Context: Episode 10')
    })
  })

  describe('empty memories', () => {
    it('shows "No prior memory" message when memories array is empty', () => {
      const frame = makeFrame({ memories: [] })
      const prompt = buildSystemPrompt(entity, frame, mode)

      expect(prompt).toContain('No prior memory')
      expect(prompt).toContain('fresh start')
    })

    it('shows "No prior memory" even when enriched sources are all empty arrays', () => {
      // All source-typed memories but empty
      const frame = makeFrame({ memories: [] })
      const prompt = buildSystemPrompt(entity, frame, mode)

      expect(prompt).toContain('No prior memory')
    })
  })

  describe('importance level mapping', () => {
    it('maps importance >= 0.8 to CRITICAL', () => {
      const memories: EnrichedMemoryResult[] = [
        {
          entry: makeMemoryEntry({ id: 'mem-001', content: 'Critical.', importance: 0.85 }),
          score: 0.9,
          source: 'vector',
        },
      ]
      const frame = makeFrame({ memories: memories as MemoryResult[] })
      const prompt = buildSystemPrompt(entity, frame, mode)
      expect(prompt).toContain('[CRITICAL]')
    })

    it('maps importance >= 0.6 to HIGH', () => {
      const memories: EnrichedMemoryResult[] = [
        {
          entry: makeMemoryEntry({ id: 'mem-001', content: 'High.', importance: 0.65 }),
          score: 0.7,
          source: 'vector',
        },
      ]
      const frame = makeFrame({ memories: memories as MemoryResult[] })
      const prompt = buildSystemPrompt(entity, frame, mode)
      expect(prompt).toContain('[HIGH]')
    })

    it('maps importance >= 0.4 to MEDIUM', () => {
      const memories: EnrichedMemoryResult[] = [
        {
          entry: makeMemoryEntry({ id: 'mem-001', content: 'Med.', importance: 0.45 }),
          score: 0.5,
          source: 'vector',
        },
      ]
      const frame = makeFrame({ memories: memories as MemoryResult[] })
      const prompt = buildSystemPrompt(entity, frame, mode)
      expect(prompt).toContain('[MEDIUM]')
    })

    it('maps importance < 0.4 to LOW', () => {
      const memories: EnrichedMemoryResult[] = [
        {
          entry: makeMemoryEntry({ id: 'mem-001', content: 'Low.', importance: 0.2 }),
          score: 0.3,
          source: 'vector',
        },
      ]
      const frame = makeFrame({ memories: memories as MemoryResult[] })
      const prompt = buildSystemPrompt(entity, frame, mode)
      expect(prompt).toContain('[LOW]')
    })
  })
})

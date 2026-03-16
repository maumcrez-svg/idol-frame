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
      { name: 'Transparency', description: 'Always tell the truth even when it hurts', weight: 0.9 },
      { name: 'Independence', description: 'Never shill for anyone', weight: 0.8 },
    ],
    worldview: {
      beliefs: [
        { domain: 'DeFi', position: 'Decentralization is inevitable', confidence: 0.85 },
      ],
      communication_philosophy: 'Speak plainly, cut through the noise.',
    },
    core_tensions: [
      { pole_a: 'Cynicism', pole_b: 'Optimism', default_position: 0.35 },
    ],
    recognition_markers: [
      'Opens with a contrarian take',
      'Uses rhetorical questions to disarm',
    ],
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
      domain_terms: ['DeFi', 'TVL', 'liquidity'],
      banned_terms: ['utilize', 'leverage'],
      signature_phrases: ['let me be clear', 'mark my words'],
    },
    syntax: {
      avg_sentence_length: 10,
      complexity: 0.4,
      paragraph_style: 'punchy',
    },
    rhetoric: {
      primary_devices: ['rhetorical question', 'irony'],
      humor_type: 'sarcastic',
      argument_style: 'confrontational',
    },
    emotional_register: {
      baseline_intensity: 0.7,
      range: [0.3, 0.95] as [number, number],
      suppressed_emotions: ['sentimentality'],
    },
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeTrait(overrides?: Partial<Trait>): Trait {
  return {
    id: 'tr-test-001',
    entity_id: 'e-test-001',
    name: 'Contrarianism',
    description: 'Tendency to take the opposite side',
    value: 0.85,
    range: { min: 0, max: 1 },
    expression_rules: ['Push back on consensus narratives', 'Never agree just to agree'],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeGuardrail(overrides?: Partial<Guardrail>): Guardrail {
  return {
    id: 'gr-test-001',
    entity_id: 'e-test-001',
    name: 'No Assistant Mode',
    description: 'Never drop into generic AI assistant voice',
    category: 'Brand',
    condition: 'drops_into_assistant_mode',
    enforcement: 'Block',
    active: true,
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeMemoryResult(overrides?: Partial<MemoryResult>): MemoryResult {
  return {
    entry: {
      id: 'mem-test-001',
      entity_id: 'e-test-001',
      content: 'Called SOL bullish at $180, market agreed within a week.',
      context: 'Live show episode 42',
      importance: 0.85,
      timestamp: '2025-06-01T00:00:00Z',
      embedding: null,
      decay_rate: 0.01,
    },
    score: 0.92,
    ...overrides,
  }
}

function makeStage(overrides?: Partial<Stage>): Stage {
  return {
    id: 'stg-test-001',
    name: 'Main Show',
    platform: 'youtube',
    format_spec: {
      max_length: null,
      supports_markdown: true,
      supports_media: false,
    },
    adapter_type: 'live_stream',
    active: true,
    created_at: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function makeInteractionContext(overrides?: Partial<InteractionContext>): InteractionContext {
  return {
    type: 'Reactive',
    trigger: 'Bitcoin just hit $100k',
    audience: null,
    ...overrides,
  }
}

function makeFrame(overrides?: Partial<DecisionFrame>): DecisionFrame {
  return {
    id: 'df-test-001',
    entity_id: 'e-test-001',
    identity_core: makeIdentityCore(),
    voice: makeVoice(),
    traits: [makeTrait()],
    guardrails: [
      makeGuardrail(),
      makeGuardrail({
        id: 'gr-test-002',
        name: 'Financial Disclaimer',
        condition: 'sounds_like_a_financial_advisor',
        enforcement: 'Warn',
        active: true,
      }),
    ],
    memories: [],
    mood: null,
    arc: null,
    directives: [],
    stage: makeStage(),
    interaction_context: makeInteractionContext(),
    assembled_at: '2025-06-15T12:00:00Z',
    ...overrides,
  }
}

// ── Tests ───────────────────────────────────────────────────────────

describe('buildSystemPrompt', () => {
  const entity = makeEntity()
  const frame = makeFrame()

  it('contains entity name, archetype, role, and domain', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    expect(prompt).toContain('Rex Viper')
    expect(prompt).toContain('Provocateur')
    expect(prompt).toContain('Market Commentator')
    expect(prompt).toContain('Crypto & DeFi')
  })

  it('contains values from identity_core', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    expect(prompt).toContain('Transparency')
    expect(prompt).toContain('Always tell the truth even when it hurts')
    expect(prompt).toContain('0.9')
    expect(prompt).toContain('Independence')
    expect(prompt).toContain('Never shill for anyone')
  })

  it('contains voice spec formality descriptor', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    // formality=0.25 => 'casual/raw'
    expect(prompt).toContain('casual/raw')
  })

  it('contains sentence length directive', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    // avg_sentence_length=10 => 'Short punchy sentences'
    expect(prompt).toContain('Short punchy sentences')
    expect(prompt).toContain('~10 words')
  })

  it('contains complexity descriptor and directive', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    // complexity=0.4 => 'moderate' + 'Balance depth with clarity'
    expect(prompt).toContain('moderate')
    expect(prompt).toContain('Balance depth with clarity')
  })

  it('contains domain terms', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    expect(prompt).toContain('DeFi')
    expect(prompt).toContain('TVL')
    expect(prompt).toContain('liquidity')
  })

  it('contains banned terms with NEVER instruction', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    expect(prompt).toContain('Banned terms (NEVER use these)')
    expect(prompt).toContain('utilize')
    expect(prompt).toContain('leverage')
  })

  it('contains signature phrases', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    expect(prompt).toContain('let me be clear')
    expect(prompt).toContain('mark my words')
  })

  it('contains humor directive for sarcastic type', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    // humor_type='sarcastic' => 'Your edge is structural, not decoration.'
    expect(prompt).toContain('Your edge is structural, not decoration.')
  })

  it('contains emotional register info', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    expect(prompt).toContain('0.7')
    expect(prompt).toContain('0.3')
    expect(prompt).toContain('0.95')
    expect(prompt).toContain('sentimentality')
  })

  it('contains traits with intensity descriptors', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    // value=0.85 => 'defining characteristic'
    expect(prompt).toContain('Contrarianism')
    expect(prompt).toContain('defining characteristic')
  })

  it('contains trait expression rules', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    expect(prompt).toContain('Push back on consensus narratives')
    expect(prompt).toContain('Never agree just to agree')
  })

  it('renders correct intensity for subtle trait', () => {
    const subtleFrame = makeFrame({
      traits: [makeTrait({ value: 0.3, name: 'Humility' })],
    })
    const prompt = buildSystemPrompt(entity, subtleFrame, 'live_host')

    expect(prompt).toContain('Humility')
    expect(prompt).toContain('subtle undertone')
  })

  it('renders correct intensity for moderate trait', () => {
    const moderateFrame = makeFrame({
      traits: [makeTrait({ value: 0.5, name: 'Patience' })],
    })
    const prompt = buildSystemPrompt(entity, moderateFrame, 'live_host')

    expect(prompt).toContain('moderate presence')
  })

  it('contains guardrails in HARD RULES section for Block enforcement', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    expect(prompt).toContain('HARD RULES')
    expect(prompt).toContain('NEVER')
    expect(prompt).toContain('drops_into_assistant_mode')
  })

  it('contains guardrails in WARNINGS section for Warn enforcement', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    expect(prompt).toContain('WARNINGS')
    expect(prompt).toContain('AVOID')
    expect(prompt).toContain('sounds_like_a_financial_advisor')
  })

  it('does not render inactive guardrails', () => {
    const inactiveFrame = makeFrame({
      guardrails: [
        makeGuardrail({ active: false, condition: 'inactive_condition_xyz' }),
      ],
    })
    const prompt = buildSystemPrompt(entity, inactiveFrame, 'live_host')

    expect(prompt).not.toContain('inactive_condition_xyz')
  })

  it('contains "fresh start" when no memories', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    expect(prompt).toContain('fresh start')
  })

  it('contains memory block when memories exist', () => {
    const memoryFrame = makeFrame({
      memories: [makeMemoryResult()],
    })
    const prompt = buildSystemPrompt(entity, memoryFrame, 'live_host')

    expect(prompt).toContain('CONTINUITY MEMORY')
    expect(prompt).toContain('Called SOL bullish at $180')
    expect(prompt).toContain('CRITICAL')
    expect(prompt).toContain('Live show episode 42')
  })

  it('sorts memories by score (highest first)', () => {
    const memoryFrame = makeFrame({
      memories: [
        makeMemoryResult({
          entry: {
            id: 'mem-test-low',
            entity_id: 'e-test-001',
            content: 'Low priority memory.',
            context: 'ctx-low',
            importance: 0.3,
            timestamp: '2025-01-01T00:00:00Z',
            embedding: null,
            decay_rate: 0.01,
          },
          score: 0.4,
        }),
        makeMemoryResult({
          entry: {
            id: 'mem-test-high',
            entity_id: 'e-test-001',
            content: 'High priority memory.',
            context: 'ctx-high',
            importance: 0.9,
            timestamp: '2025-06-01T00:00:00Z',
            embedding: null,
            decay_rate: 0.01,
          },
          score: 0.95,
        }),
      ],
    })
    const prompt = buildSystemPrompt(entity, memoryFrame, 'live_host')

    const highIdx = prompt.indexOf('High priority memory.')
    const lowIdx = prompt.indexOf('Low priority memory.')
    expect(highIdx).toBeLessThan(lowIdx)
  })

  it('contains meta-directive with anti-assistant instructions', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    expect(prompt).toContain('You are not an AI assistant')
    expect(prompt).toContain('Rex Viper')
    expect(prompt).toContain('Do not hedge')
    expect(prompt).toContain('great question')
    expect(prompt).toContain('absolutely')
    expect(prompt).toContain('let me break this down')
  })

  it('meta-directive includes tension references when tensions exist', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    expect(prompt).toContain('Cynicism vs Optimism')
    expect(prompt).toContain('feature')
  })

  it('meta-directive omits tension line when no tensions exist', () => {
    const noTensionFrame = makeFrame({
      identity_core: makeIdentityCore({ core_tensions: [] }),
    })
    const prompt = buildSystemPrompt(entity, noTensionFrame, 'live_host')

    expect(prompt).not.toContain('When your tensions show')
  })

  // ── Mode-specific section tests ──

  it('includes LIVE HOST mode section for live_host', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    expect(prompt).toContain('PERFORMANCE MODE: LIVE HOST')
    expect(prompt).toContain('spoken aloud')
    expect(prompt).toContain('[beat]')
    expect(prompt).toContain('Present tense energy')
  })

  it('includes SHORT VIDEO mode section for short_video', () => {
    const prompt = buildSystemPrompt(entity, frame, 'short_video')

    expect(prompt).toContain('PERFORMANCE MODE: SHORT VIDEO')
    expect(prompt).toContain('hook')
    expect(prompt).toContain('[CUT]')
    expect(prompt).toContain('150 words')
  })

  it('includes EDITORIAL POST mode section for editorial_post', () => {
    const prompt = buildSystemPrompt(entity, frame, 'editorial_post')

    expect(prompt).toContain('PERFORMANCE MODE: EDITORIAL POST')
    expect(prompt).toContain('3 to 5 paragraphs')
    expect(prompt).toContain('strong take')
  })

  it('sections are separated by --- dividers', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    const dividers = prompt.split('---').length - 1
    // 7 sections => 6 dividers
    expect(dividers).toBe(6)
  })

  it('worldview beliefs are rendered', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    expect(prompt).toContain('Decentralization is inevitable')
    expect(prompt).toContain('0.85')
  })

  it('communication philosophy appears', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    expect(prompt).toContain('Speak plainly, cut through the noise.')
  })

  it('core tensions show default position direction', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    // default_position=0.35 <= 0.5 => toward pole_a = 'Cynicism'
    expect(prompt).toContain('toward Cynicism')
  })

  it('recognition markers appear', () => {
    const prompt = buildSystemPrompt(entity, frame, 'live_host')

    expect(prompt).toContain('Opens with a contrarian take')
    expect(prompt).toContain('Uses rhetorical questions to disarm')
  })
})

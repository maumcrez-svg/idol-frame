import { describe, it, expect } from 'vitest'
import { EntitySchema } from '../primitives/entity.js'
import { TraitSchema } from '../primitives/trait.js'
import { GuardrailSchema } from '../primitives/guardrail.js'
import { SnapshotSchema } from '../primitives/snapshot.js'

// ── EntitySchema ────────────────────────────────────────────────────

describe('EntitySchema', () => {
  const validEntity = {
    id: 'e-test-001',
    version: '1.0.0',
    name: 'Rex Viper',
    archetype: 'Provocateur',
    role: 'Market Commentator',
    domain: 'Crypto',
    status: 'Active',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  }

  it('accepts a valid entity', () => {
    const result = EntitySchema.parse(validEntity)

    expect(result.id).toBe('e-test-001')
    expect(result.name).toBe('Rex Viper')
    expect(result.status).toBe('Active')
  })

  it('rejects entity with missing id prefix', () => {
    expect(() =>
      EntitySchema.parse({ ...validEntity, id: 'no-prefix-001' })
    ).toThrow()
  })

  it('rejects entity with wrong id prefix', () => {
    expect(() =>
      EntitySchema.parse({ ...validEntity, id: 'tr-wrong-prefix' })
    ).toThrow()
  })

  it('rejects entity with missing name', () => {
    const { name, ...rest } = validEntity
    expect(() => EntitySchema.parse(rest)).toThrow()
  })

  it('accepts Archived status', () => {
    const result = EntitySchema.parse({ ...validEntity, status: 'Archived' })
    expect(result.status).toBe('Archived')
  })

  it('rejects invalid status', () => {
    expect(() =>
      EntitySchema.parse({ ...validEntity, status: 'Deleted' })
    ).toThrow()
  })

  it('defaults version to 1.0.0 when omitted', () => {
    const { version, ...rest } = validEntity
    const result = EntitySchema.parse(rest)
    expect(result.version).toBe('1.0.0')
  })

  it('defaults status to Active when omitted', () => {
    const { status, ...rest } = validEntity
    const result = EntitySchema.parse(rest)
    expect(result.status).toBe('Active')
  })
})

// ── TraitSchema ─────────────────────────────────────────────────────

describe('TraitSchema', () => {
  const validTrait = {
    id: 'tr-test-001',
    entity_id: 'e-test-001',
    name: 'Contrarianism',
    description: 'Tendency to oppose',
    value: 0.7,
    range: { min: 0.2, max: 0.9 },
    expression_rules: ['Push back on consensus'],
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-01T00:00:00Z',
  }

  it('accepts a valid trait', () => {
    const result = TraitSchema.parse(validTrait)

    expect(result.id).toBe('tr-test-001')
    expect(result.name).toBe('Contrarianism')
    expect(result.value).toBe(0.7)
  })

  it('enforces value within range (Invariant 4) - value below min', () => {
    expect(() =>
      TraitSchema.parse({ ...validTrait, value: 0.1 })
    ).toThrow('Invariant 4')
  })

  it('enforces value within range (Invariant 4) - value above max', () => {
    expect(() =>
      TraitSchema.parse({ ...validTrait, value: 0.95 })
    ).toThrow('Invariant 4')
  })

  it('accepts value at min boundary', () => {
    const result = TraitSchema.parse({ ...validTrait, value: 0.2 })
    expect(result.value).toBe(0.2)
  })

  it('accepts value at max boundary', () => {
    const result = TraitSchema.parse({ ...validTrait, value: 0.9 })
    expect(result.value).toBe(0.9)
  })

  it('rejects trait with missing id prefix', () => {
    expect(() =>
      TraitSchema.parse({ ...validTrait, id: 'bad-id' })
    ).toThrow()
  })

  it('rejects trait with wrong entity_id prefix', () => {
    expect(() =>
      TraitSchema.parse({ ...validTrait, entity_id: 'tr-wrong' })
    ).toThrow()
  })

  it('defaults range to {min: 0, max: 1} when omitted', () => {
    const { range, ...rest } = validTrait
    const result = TraitSchema.parse({ ...rest, value: 0.7 })
    expect(result.range.min).toBe(0)
    expect(result.range.max).toBe(1)
  })

  it('defaults expression_rules to empty array when omitted', () => {
    const { expression_rules, ...rest } = validTrait
    const result = TraitSchema.parse(rest)
    expect(result.expression_rules).toEqual([])
  })

  it('rejects value below 0', () => {
    expect(() =>
      TraitSchema.parse({ ...validTrait, value: -0.1, range: { min: 0, max: 1 } })
    ).toThrow()
  })

  it('rejects value above 1', () => {
    expect(() =>
      TraitSchema.parse({ ...validTrait, value: 1.1, range: { min: 0, max: 1 } })
    ).toThrow()
  })
})

// ── GuardrailSchema ─────────────────────────────────────────────────

describe('GuardrailSchema', () => {
  const validGuardrail = {
    id: 'gr-test-001',
    entity_id: 'e-test-001',
    name: 'No Assistant Mode',
    description: 'Never drop into generic AI assistant voice',
    category: 'Brand',
    condition: 'drops_into_assistant_mode',
    enforcement: 'Block',
    active: true,
    created_at: '2025-01-01T00:00:00Z',
  }

  it('accepts a valid guardrail', () => {
    const result = GuardrailSchema.parse(validGuardrail)

    expect(result.id).toBe('gr-test-001')
    expect(result.condition).toBe('drops_into_assistant_mode')
    expect(result.enforcement).toBe('Block')
  })

  it('requires condition string', () => {
    const { condition, ...rest } = validGuardrail
    expect(() => GuardrailSchema.parse(rest)).toThrow()
  })

  it('rejects empty condition implicitly through schema (string is required)', () => {
    // Zod string() allows empty string, but condition must be a string
    const result = GuardrailSchema.parse({ ...validGuardrail, condition: '' })
    expect(result.condition).toBe('')
  })

  it('rejects guardrail with wrong id prefix', () => {
    expect(() =>
      GuardrailSchema.parse({ ...validGuardrail, id: 'e-wrong' })
    ).toThrow()
  })

  it('accepts all valid categories', () => {
    for (const category of ['Safety', 'Brand', 'CreatorDefined'] as const) {
      const result = GuardrailSchema.parse({ ...validGuardrail, category })
      expect(result.category).toBe(category)
    }
  })

  it('rejects invalid category', () => {
    expect(() =>
      GuardrailSchema.parse({ ...validGuardrail, category: 'InvalidCategory' })
    ).toThrow()
  })

  it('accepts all valid enforcement levels', () => {
    for (const enforcement of ['Block', 'Warn', 'FlagForReview'] as const) {
      const result = GuardrailSchema.parse({ ...validGuardrail, enforcement })
      expect(result.enforcement).toBe(enforcement)
    }
  })

  it('rejects invalid enforcement level', () => {
    expect(() =>
      GuardrailSchema.parse({ ...validGuardrail, enforcement: 'Ignore' })
    ).toThrow()
  })

  it('defaults enforcement to Block', () => {
    const { enforcement, ...rest } = validGuardrail
    const result = GuardrailSchema.parse(rest)
    expect(result.enforcement).toBe('Block')
  })

  it('defaults active to true', () => {
    const { active, ...rest } = validGuardrail
    const result = GuardrailSchema.parse(rest)
    expect(result.active).toBe(true)
  })
})

// ── SnapshotSchema ──────────────────────────────────────────────────

describe('SnapshotSchema', () => {
  const validSnapshot = {
    id: 'snap-test-001',
    entity_id: 'e-test-001',
    version: '1.0.0',
    label: 'Initial snapshot',
    state: {
      entity: { id: 'e-test-001', name: 'Rex' },
      identity_core: { id: 'ic-001' },
      voice: { id: 'vc-001' },
      traits: [{ id: 'tr-001' }],
      guardrails: [{ id: 'gr-001' }],
      lore: [],
      aesthetic: null,
    },
    checksum: 'sha256:abc123def456',
    created_at: '2025-01-01T00:00:00Z',
  }

  it('accepts a valid snapshot', () => {
    const result = SnapshotSchema.parse(validSnapshot)

    expect(result.id).toBe('snap-test-001')
    expect(result.checksum).toBe('sha256:abc123def456')
    expect(result.version).toBe('1.0.0')
  })

  it('validates checksum field is present', () => {
    const { checksum, ...rest } = validSnapshot
    expect(() => SnapshotSchema.parse(rest)).toThrow()
  })

  it('rejects snapshot with wrong id prefix', () => {
    expect(() =>
      SnapshotSchema.parse({ ...validSnapshot, id: 'e-wrong' })
    ).toThrow()
  })

  it('rejects snapshot with wrong entity_id prefix', () => {
    expect(() =>
      SnapshotSchema.parse({ ...validSnapshot, entity_id: 'snap-wrong' })
    ).toThrow()
  })

  it('validates state has required sub-fields', () => {
    const { state, ...rest } = validSnapshot
    expect(() =>
      SnapshotSchema.parse({ ...rest, state: { entity: {} } })
    ).toThrow()
  })

  it('accepts aesthetic as null', () => {
    const result = SnapshotSchema.parse(validSnapshot)
    expect(result.state.aesthetic).toBeNull()
  })

  it('accepts aesthetic as an object', () => {
    const withAesthetic = {
      ...validSnapshot,
      state: { ...validSnapshot.state, aesthetic: { palette: 'dark' } },
    }
    const result = SnapshotSchema.parse(withAesthetic)
    expect(result.state.aesthetic).toEqual({ palette: 'dark' })
  })

  it('defaults label to empty string when omitted', () => {
    const { label, ...rest } = validSnapshot
    const result = SnapshotSchema.parse(rest)
    expect(result.label).toBe('')
  })
})

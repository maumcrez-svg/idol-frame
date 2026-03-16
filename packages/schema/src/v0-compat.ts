import { v4 as uuid } from 'uuid'
import type { Entity, IdentityCore, ValueEntry, Tension } from './primitives/entity.js'
import type { Voice } from './primitives/voice.js'
import type { Trait } from './primitives/trait.js'
import type { Guardrail } from './primitives/guardrail.js'
import type { Lore } from './primitives/lore.js'
import type { Aesthetic } from './primitives/aesthetic.js'
import type { Stage } from './primitives/stage.js'

// Legacy EntityManifest shape for YAML import compatibility
export interface V0EntityManifest {
  entity: {
    id: string
    name: string
    archetype: string
    role: string
    domain: string
  }
  identity_core: {
    voice: { tone: string; cadence: string; density: string; slang_level: string }
    humor: { style: string; aggression: string; absurdity: string }
    emotional_baseline: { anxiety: string; confidence: string; empathy: string }
    values: string[]
    flaws: string[]
    taboo_zones: string[]
  }
  continuity: {
    must_preserve: string[]
    mutable_zones: string[]
  }
  manifestations: Record<string, Record<string, string | number | boolean>>
  memory_policy: { store: string[]; ignore: string[] }
  validation: { reject_if: string[] }
}

export interface ImportedEntity {
  entity: Entity
  identityCore: IdentityCore
  voice: Voice
  traits: Trait[]
  guardrails: Guardrail[]
  lore: Lore[]
  aesthetic: Aesthetic
  stage: Stage
  v0Manifest: V0EntityManifest
}

const LEVEL_TO_FLOAT: Record<string, number> = {
  none: 0, low: 0.25, medium: 0.5, high: 0.75, very_high: 1.0,
}

function levelToFloat(level: string): number {
  return LEVEL_TO_FLOAT[level] ?? 0.5
}

export function importV0Entity(manifest: V0EntityManifest): ImportedEntity {
  const now = new Date().toISOString()
  const entityId = `e-${uuid()}`

  const entity: Entity = {
    id: entityId,
    version: '1.0.0',
    name: manifest.entity.name,
    archetype: manifest.entity.archetype,
    role: manifest.entity.role,
    domain: manifest.entity.domain,
    status: 'Active',
    created_at: now,
    updated_at: now,
  }

  const values: ValueEntry[] = manifest.identity_core.values.map(v => ({
    name: v,
    description: v.replace(/_/g, ' '),
    weight: 0.7,
  }))

  const tensions: Tension[] = manifest.identity_core.flaws.map(flaw => ({
    pole_a: flaw,
    pole_b: `absence of ${flaw.replace(/_/g, ' ')}`,
    default_position: 0.7,
  }))

  const identityCore: IdentityCore = {
    id: `ic-${uuid()}`,
    entity_id: entityId,
    version: '1.0.0',
    values,
    worldview: {
      beliefs: [],
      communication_philosophy: `${manifest.identity_core.voice.tone} voice with ${manifest.identity_core.humor.style} humor`,
    },
    core_tensions: tensions,
    recognition_markers: [
      `tone:${manifest.identity_core.voice.tone}`,
      `humor:${manifest.identity_core.humor.style}`,
      `cadence:${manifest.identity_core.voice.cadence}`,
    ],
    created_at: now,
  }

  const voice: Voice = {
    id: `vc-${uuid()}`,
    entity_id: entityId,
    vocabulary: {
      formality: 1 - levelToFloat(manifest.identity_core.voice.slang_level),
      domain_terms: [],
      banned_terms: [],
      signature_phrases: [],
    },
    syntax: {
      avg_sentence_length: manifest.identity_core.voice.cadence === 'fast' ? 10 : manifest.identity_core.voice.cadence === 'slow' ? 25 : 15,
      complexity: levelToFloat(manifest.identity_core.voice.density),
      paragraph_style: 'mixed',
    },
    rhetoric: {
      primary_devices: [],
      humor_type: manifest.identity_core.humor.style,
      argument_style: 'direct',
    },
    emotional_register: {
      baseline_intensity: levelToFloat(manifest.identity_core.emotional_baseline.confidence),
      range: [0.2, 0.8],
      suppressed_emotions: [],
    },
    created_at: now,
    updated_at: now,
  }

  const traits: Trait[] = [
    { id: `tr-${uuid()}`, entity_id: entityId, name: 'anxiety', description: '', value: levelToFloat(manifest.identity_core.emotional_baseline.anxiety), range: { min: 0, max: 1 }, expression_rules: [], created_at: now, updated_at: now },
    { id: `tr-${uuid()}`, entity_id: entityId, name: 'confidence', description: '', value: levelToFloat(manifest.identity_core.emotional_baseline.confidence), range: { min: 0, max: 1 }, expression_rules: [], created_at: now, updated_at: now },
    { id: `tr-${uuid()}`, entity_id: entityId, name: 'empathy', description: '', value: levelToFloat(manifest.identity_core.emotional_baseline.empathy), range: { min: 0, max: 1 }, expression_rules: [], created_at: now, updated_at: now },
    { id: `tr-${uuid()}`, entity_id: entityId, name: 'humor_aggression', description: '', value: levelToFloat(manifest.identity_core.humor.aggression), range: { min: 0, max: 1 }, expression_rules: [], created_at: now, updated_at: now },
    { id: `tr-${uuid()}`, entity_id: entityId, name: 'absurdity', description: '', value: levelToFloat(manifest.identity_core.humor.absurdity), range: { min: 0, max: 1 }, expression_rules: [], created_at: now, updated_at: now },
  ]

  const guardrails: Guardrail[] = [
    ...manifest.identity_core.taboo_zones.map(zone => ({
      id: `gr-${uuid()}`,
      entity_id: entityId,
      name: `taboo:${zone}`,
      description: `Taboo zone: ${zone}`,
      category: 'Safety' as const,
      condition: zone,
      enforcement: 'Block' as const,
      active: true,
      created_at: now,
    })),
    ...manifest.validation.reject_if.map(rule => ({
      id: `gr-${uuid()}`,
      entity_id: entityId,
      name: `reject:${rule}`,
      description: `Rejection rule: ${rule}`,
      category: 'Brand' as const,
      condition: rule,
      enforcement: 'Block' as const,
      active: true,
      created_at: now,
    })),
  ]

  const lore: Lore[] = manifest.continuity.must_preserve.map(item => ({
    id: `lr-${uuid()}`,
    entity_id: entityId,
    category: 'Biographical' as const,
    content: `Must preserve: ${item}`,
    source: 'CreatorDefined' as const,
    approved: true,
    supersedes: null,
    created_at: now,
  }))

  const aesthetic: Aesthetic = {
    id: `ae-${uuid()}`,
    entity_id: entityId,
    color_palette: [],
    visual_motifs: [],
    typography_style: null,
    created_at: now,
  }

  const stage: Stage = {
    id: `stg-${uuid()}`,
    name: 'default',
    platform: 'text',
    format_spec: { max_length: null, supports_markdown: true, supports_media: false },
    adapter_type: 'text',
    active: true,
    created_at: now,
  }

  return { entity, identityCore, voice, traits, guardrails, lore, aesthetic, stage, v0Manifest: manifest }
}

import { v4 as uuid } from 'uuid'
import type { IDocumentStore } from '../../storage/src/index.js'
import type { Voice, VoiceModulation } from '../../schema/src/index.js'
import { VoiceSchema } from '../../schema/src/index.js'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

const COLLECTION = 'voices'

export class VoiceRegistry {
  constructor(private docs: IDocumentStore) {}

  create(input: { entity_id: string } & Partial<Omit<Voice, 'id' | 'entity_id' | 'created_at' | 'updated_at'>>): Voice {
    const now = new Date().toISOString()
    const voice: Voice = VoiceSchema.parse({
      id: `vc-${uuid()}`,
      ...input,
      created_at: now,
      updated_at: now,
    })
    this.docs.put(COLLECTION, voice.id, voice)
    return voice
  }

  getByEntity(entityId: string): Voice | null {
    const all = this.docs.list(COLLECTION, { entity_id: entityId })
    return all.length > 0 ? VoiceSchema.parse(all[0]) : null
  }

  getByEntityOrFail(entityId: string): Voice {
    const voice = this.getByEntity(entityId)
    if (!voice) throw new Error(`Voice not found for entity: ${entityId}`)
    return voice
  }

  getEffectiveVoice(entityId: string, voiceMods?: VoiceModulation): Voice {
    const base = this.getByEntityOrFail(entityId)
    if (!voiceMods) return base

    // Apply modulations to a copy of the voice
    return VoiceSchema.parse({
      ...base,
      vocabulary: {
        ...base.vocabulary,
        formality: clamp(base.vocabulary.formality + voiceMods.formality_shift, 0, 1),
      },
      emotional_register: {
        ...base.emotional_register,
        baseline_intensity: clamp(
          base.emotional_register.baseline_intensity + voiceMods.intensity_shift,
          base.emotional_register.range[0],
          base.emotional_register.range[1],
        ),
      },
    })
  }

  update(entityId: string, partial: Partial<Omit<Voice, 'id' | 'entity_id' | 'created_at'>>): Voice {
    const existing = this.getByEntityOrFail(entityId)
    const updated: Voice = VoiceSchema.parse({
      ...existing,
      ...partial,
      updated_at: new Date().toISOString(),
    })
    this.docs.put(COLLECTION, updated.id, updated)
    return updated
  }
}

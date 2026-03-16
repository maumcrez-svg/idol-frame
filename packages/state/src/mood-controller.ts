import { v4 as uuid } from 'uuid'
import type { IDocumentStore } from '../../storage/src/index.js'
import type { Mood, MoodTrigger, VoiceModulation } from '../../schema/src/index.js'
import { MoodSchema } from '../../schema/src/index.js'

const COLLECTION = 'moods'

export class MoodController {
  constructor(private docs: IDocumentStore) {}

  setMood(input: {
    entity_id: string
    state: string
    intensity: number
    decay_rate: number
    trigger: MoodTrigger
    trait_mods?: Record<string, number>
    voice_mods?: Partial<VoiceModulation>
    expires_at?: string | null
  }): Mood {
    // Remove any existing mood for this entity
    const existing = this.docs.list(COLLECTION, { entity_id: input.entity_id })
    for (const doc of existing) {
      this.docs.delete(COLLECTION, (doc as { id: string }).id)
    }

    const now = new Date().toISOString()

    const mood: Mood = MoodSchema.parse({
      id: `mood-${uuid()}`,
      entity_id: input.entity_id,
      state: input.state,
      intensity: input.intensity,
      decay_rate: input.decay_rate,
      trigger: input.trigger,
      trait_mods: input.trait_mods ?? {},
      voice_mods: input.voice_mods ?? {},
      started_at: now,
      expires_at: input.expires_at ?? null,
    })

    this.docs.put(COLLECTION, mood.id, mood)
    return mood
  }

  getCurrentMood(entityId: string): Mood | null {
    const docs = this.docs.list(COLLECTION, { entity_id: entityId })
    if (docs.length === 0) return null

    const mood: Mood = MoodSchema.parse(docs[0])
    const now = new Date()

    // Check expiration
    if (mood.expires_at !== null) {
      const expiresAt = new Date(mood.expires_at)
      if (now >= expiresAt) {
        this.docs.delete(COLLECTION, mood.id)
        return null
      }
    }

    // Calculate decayed intensity
    const startedAt = new Date(mood.started_at)
    const hoursSinceStart = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60)
    const currentIntensity = mood.intensity - (mood.decay_rate * hoursSinceStart)

    if (currentIntensity <= 0) {
      this.docs.delete(COLLECTION, mood.id)
      return null
    }

    return mood
  }

  computeTraitModulations(entityId: string): Record<string, number> {
    const mood = this.getCurrentMood(entityId)
    if (!mood) return {}

    const currentIntensity = this.computeCurrentIntensity(mood)
    if (currentIntensity <= 0) return {}

    const traitMods = mood.trait_mods ?? {}
    const result: Record<string, number> = {}
    for (const [traitName, modifier] of Object.entries(traitMods)) {
      result[traitName] = (modifier ?? 0) * currentIntensity
    }
    return result
  }

  computeVoiceModulations(entityId: string): VoiceModulation {
    const mood = this.getCurrentMood(entityId)
    if (!mood) {
      return { formality_shift: 0, intensity_shift: 0, humor_shift: 0 }
    }

    const currentIntensity = this.computeCurrentIntensity(mood)
    if (currentIntensity <= 0) {
      return { formality_shift: 0, intensity_shift: 0, humor_shift: 0 }
    }

    const voiceMods = mood.voice_mods ?? { formality_shift: 0, intensity_shift: 0, humor_shift: 0 }
    return {
      formality_shift: (voiceMods.formality_shift ?? 0) * currentIntensity,
      intensity_shift: (voiceMods.intensity_shift ?? 0) * currentIntensity,
      humor_shift: (voiceMods.humor_shift ?? 0) * currentIntensity,
    }
  }

  clearMood(entityId: string): void {
    const docs = this.docs.list(COLLECTION, { entity_id: entityId })
    for (const doc of docs) {
      this.docs.delete(COLLECTION, (doc as { id: string }).id)
    }
  }

  private computeCurrentIntensity(mood: Mood): number {
    const now = new Date()
    const startedAt = new Date(mood.started_at)
    const hoursSinceStart = (now.getTime() - startedAt.getTime()) / (1000 * 60 * 60)
    const currentIntensity = mood.intensity - (mood.decay_rate * hoursSinceStart)
    return Math.max(0, currentIntensity)
  }
}

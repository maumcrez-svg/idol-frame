import { describe, it, expect, beforeEach, vi } from 'vitest'
import { MoodController } from '../mood-controller.js'
import { MockDocumentStore } from '../../../__test-utils__/mock-store.js'
import { MoodSchema } from '../../../schema/src/index.js'

describe('MoodController', () => {
  let store: MockDocumentStore
  let controller: MoodController

  const baseMoodInput = {
    entity_id: 'e-test',
    state: 'melancholic',
    intensity: 0.8,
    decay_rate: 0.1,
    trigger: { type: 'Event' as const, source: 'test-event', context: 'testing' },
  }

  beforeEach(() => {
    store = new MockDocumentStore()
    controller = new MoodController(store)
    vi.useRealTimers()
  })

  describe('setMood()', () => {
    it('creates and stores a mood', () => {
      const mood = controller.setMood(baseMoodInput)

      expect(mood.id).toMatch(/^mood-/)
      expect(mood.entity_id).toBe('e-test')
      expect(mood.state).toBe('melancholic')
      expect(mood.intensity).toBe(0.8)
      expect(mood.decay_rate).toBe(0.1)
      expect(mood.trigger.type).toBe('Event')
      expect(mood.started_at).toBeDefined()
      expect(mood.expires_at).toBeNull()
    })

    it('replaces existing mood (only one per entity)', () => {
      const first = controller.setMood(baseMoodInput)
      const second = controller.setMood({
        ...baseMoodInput,
        state: 'euphoric',
        intensity: 0.6,
      })

      expect(second.state).toBe('euphoric')
      expect(second.id).not.toBe(first.id)

      // Only the second mood should exist
      const current = controller.getCurrentMood('e-test')
      expect(current).not.toBeNull()
      expect(current!.state).toBe('euphoric')
    })
  })

  describe('getCurrentMood()', () => {
    it('returns null when no mood set', () => {
      const result = controller.getCurrentMood('e-test')
      expect(result).toBeNull()
    })

    it('returns mood when set', () => {
      controller.setMood(baseMoodInput)
      const result = controller.getCurrentMood('e-test')

      expect(result).not.toBeNull()
      expect(result!.entity_id).toBe('e-test')
      expect(result!.state).toBe('melancholic')
    })

    it('returns null when mood has decayed to 0', () => {
      // Set mood with started_at far in the past via direct store manipulation
      const mood = controller.setMood({
        ...baseMoodInput,
        intensity: 0.5,
        decay_rate: 0.1, // 0.1 per hour; after 10 hours intensity = 0.5 - 1.0 = -0.5 → gone
      })

      // Backdate started_at by 10 hours
      const pastDate = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString()
      store.put('moods', mood.id, { ...mood, started_at: pastDate })

      const result = controller.getCurrentMood('e-test')
      expect(result).toBeNull()
    })

    it('returns null when expires_at is past', () => {
      const pastDate = new Date(Date.now() - 60 * 1000).toISOString() // 1 minute ago
      const mood = controller.setMood({
        ...baseMoodInput,
        decay_rate: 0.01,
        expires_at: pastDate,
      })

      // Overwrite so expires_at is in the past
      store.put('moods', mood.id, { ...mood, expires_at: pastDate })

      const result = controller.getCurrentMood('e-test')
      expect(result).toBeNull()
    })
  })

  describe('computeTraitModulations()', () => {
    it('scales mods by current intensity', () => {
      controller.setMood({
        ...baseMoodInput,
        intensity: 0.6,
        decay_rate: 0.01, // negligible decay for test
        trait_mods: { patience: -0.15, curiosity: 0.2 },
      })

      const mods = controller.computeTraitModulations('e-test')

      // intensity ~0.6, patience mod = -0.15 * ~0.6 = ~-0.09
      expect(mods.patience).toBeCloseTo(-0.09, 1)
      expect(mods.curiosity).toBeCloseTo(0.12, 1)
    })

    it('returns empty object when no mood', () => {
      const mods = controller.computeTraitModulations('e-test')
      expect(mods).toEqual({})
    })
  })

  describe('computeVoiceModulations()', () => {
    it('scales voice mods by intensity', () => {
      controller.setMood({
        ...baseMoodInput,
        intensity: 0.5,
        decay_rate: 0.01,
        voice_mods: {
          formality_shift: 0.2,
          intensity_shift: -0.1,
          humor_shift: 0.15,
        },
      })

      const voiceMods = controller.computeVoiceModulations('e-test')

      expect(voiceMods.formality_shift).toBeCloseTo(0.1, 1)
      expect(voiceMods.intensity_shift).toBeCloseTo(-0.05, 1)
      expect(voiceMods.humor_shift).toBeCloseTo(0.075, 1)
    })

    it('returns zero shifts when no mood', () => {
      const voiceMods = controller.computeVoiceModulations('e-test')
      expect(voiceMods.formality_shift).toBe(0)
      expect(voiceMods.intensity_shift).toBe(0)
      expect(voiceMods.humor_shift).toBe(0)
    })
  })

  describe('clearMood()', () => {
    it('removes the mood', () => {
      controller.setMood(baseMoodInput)
      expect(controller.getCurrentMood('e-test')).not.toBeNull()

      controller.clearMood('e-test')
      expect(controller.getCurrentMood('e-test')).toBeNull()
    })
  })

  describe('Invariant 11', () => {
    it('MoodSchema rejects mood with decay_rate=0 AND expires_at=null', () => {
      expect(() => {
        controller.setMood({
          ...baseMoodInput,
          decay_rate: 0,
          expires_at: null,
        })
      }).toThrow()
    })
  })
})

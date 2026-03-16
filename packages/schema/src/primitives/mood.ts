import { z } from 'zod'

export const MoodTriggerTypeSchema = z.enum(['Event', 'Directive', 'ArcTransition', 'Interaction'])

export const MoodTriggerSchema = z.object({
  type: MoodTriggerTypeSchema,
  source: z.string(),
  context: z.string().default(''),
})

export const VoiceModulationSchema = z.object({
  formality_shift: z.number().min(-0.3).max(0.3).default(0),
  intensity_shift: z.number().min(-0.3).max(0.3).default(0),
  humor_shift: z.number().min(-0.3).max(0.3).default(0),
})

export const MoodSchema = z.object({
  id: z.string().startsWith('mood-'),
  entity_id: z.string().startsWith('e-'),
  state: z.string(),
  intensity: z.number().min(0).max(1),
  decay_rate: z.number().min(0).max(1),
  trigger: MoodTriggerSchema,
  trait_mods: z.record(z.string(), z.number()).default({}),
  voice_mods: VoiceModulationSchema.default({}),
  started_at: z.string(),
  expires_at: z.string().nullable().default(null),
}).refine(
  data => data.decay_rate > 0 || data.expires_at !== null,
  { message: 'Invariant 11: Mood must have nonzero decay_rate or non-null expires_at' },
)

export type MoodTriggerType = z.infer<typeof MoodTriggerTypeSchema>
export type MoodTrigger = z.infer<typeof MoodTriggerSchema>
export type VoiceModulation = z.infer<typeof VoiceModulationSchema>
export type Mood = z.infer<typeof MoodSchema>

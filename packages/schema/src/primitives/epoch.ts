import { z } from 'zod'

export const EpochStatusSchema = z.enum(['Planned', 'Active', 'Completed'])

export const EpochSchema = z.object({
  id: z.string().startsWith('epoch-'),
  entity_id: z.string().startsWith('e-'),
  name: z.string(),
  ordinal: z.number().int().min(0),
  status: EpochStatusSchema.default('Planned'),
  identity_core_version: z.string().default('1.0.0'),
  trait_ranges: z.record(z.string(), z.object({
    min: z.number().min(0).max(1),
    max: z.number().min(0).max(1),
  })).default({}),
  characteristic_mood: z.string().nullable().default(null),
  start_condition: z.string().default(''),
  end_condition: z.string().default(''),
  started_at: z.string().nullable().default(null),
  ended_at: z.string().nullable().default(null),
  arcs_completed: z.array(z.string()).default([]),
  created_at: z.string(),
})

export type EpochStatus = z.infer<typeof EpochStatusSchema>
export type Epoch = z.infer<typeof EpochSchema>

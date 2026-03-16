import { z } from 'zod'

export const ValueEntrySchema = z.object({
  name: z.string(),
  description: z.string(),
  weight: z.number().min(0).max(1).default(0.5),
})

export const BeliefSchema = z.object({
  domain: z.string(),
  position: z.string(),
  confidence: z.number().min(0).max(1).default(0.7),
})

export const WorldviewSpecSchema = z.object({
  beliefs: z.array(BeliefSchema).default([]),
  communication_philosophy: z.string().default(''),
})

export const TensionSchema = z.object({
  pole_a: z.string(),
  pole_b: z.string(),
  default_position: z.number().min(0).max(1).default(0.5),
})

export const IdentityCoreSchema = z.object({
  id: z.string().startsWith('ic-'),
  entity_id: z.string().startsWith('e-'),
  version: z.string().default('1.0.0'),
  values: z.array(ValueEntrySchema),
  worldview: WorldviewSpecSchema.default({ beliefs: [], communication_philosophy: '' }),
  core_tensions: z.array(TensionSchema).default([]),
  recognition_markers: z.array(z.string()).default([]),
  created_at: z.string(),
})

export const EntityStatusSchema = z.enum(['Active', 'Archived'])

export const EntitySchema = z.object({
  id: z.string().startsWith('e-'),
  version: z.string().default('1.0.0'),
  name: z.string(),
  archetype: z.string(),
  role: z.string(),
  domain: z.string(),
  status: EntityStatusSchema.default('Active'),
  created_at: z.string(),
  updated_at: z.string(),
})

export type ValueEntry = z.infer<typeof ValueEntrySchema>
export type Belief = z.infer<typeof BeliefSchema>
export type WorldviewSpec = z.infer<typeof WorldviewSpecSchema>
export type Tension = z.infer<typeof TensionSchema>
export type IdentityCore = z.infer<typeof IdentityCoreSchema>
export type EntityStatus = z.infer<typeof EntityStatusSchema>
export type Entity = z.infer<typeof EntitySchema>

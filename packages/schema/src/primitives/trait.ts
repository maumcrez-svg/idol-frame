import { z } from 'zod'

export const TraitRangeSchema = z.object({
  min: z.number().min(0).max(1).default(0),
  max: z.number().min(0).max(1).default(1),
})

export const TraitSchema = z.object({
  id: z.string().startsWith('tr-'),
  entity_id: z.string().startsWith('e-'),
  name: z.string(),
  description: z.string().default(''),
  value: z.number().min(0).max(1),
  range: TraitRangeSchema.default({ min: 0, max: 1 }),
  expression_rules: z.array(z.string()).default([]),
  created_at: z.string(),
  updated_at: z.string(),
}).refine(
  data => data.value >= data.range.min && data.value <= data.range.max,
  { message: 'Invariant 4: trait value must be within [range.min, range.max]' },
)

export type TraitRange = z.infer<typeof TraitRangeSchema>
export type Trait = z.infer<typeof TraitSchema>

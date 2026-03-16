import { z } from 'zod'

export const LoreCategorySchema = z.enum(['Biographical', 'Relational', 'WorldKnowledge', 'Preference'])
export const LoreSourceSchema = z.enum(['CreatorDefined', 'EntityGenerated', 'AudienceDerived'])

export const LoreSchema = z.object({
  id: z.string().startsWith('lr-'),
  entity_id: z.string().startsWith('e-'),
  category: LoreCategorySchema,
  content: z.string(),
  source: LoreSourceSchema.default('CreatorDefined'),
  approved: z.boolean().default(true),
  supersedes: z.string().nullable().default(null),
  created_at: z.string(),
})

export type LoreCategory = z.infer<typeof LoreCategorySchema>
export type LoreSource = z.infer<typeof LoreSourceSchema>
export type Lore = z.infer<typeof LoreSchema>

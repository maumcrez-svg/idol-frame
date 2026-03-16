import { z } from 'zod'

export const GuardrailCategorySchema = z.enum(['Safety', 'Brand', 'CreatorDefined'])
export const GuardrailEnforcementSchema = z.enum(['Block', 'Warn', 'FlagForReview'])

export const GuardrailSchema = z.object({
  id: z.string().startsWith('gr-'),
  entity_id: z.string().startsWith('e-'),
  name: z.string(),
  description: z.string().default(''),
  category: GuardrailCategorySchema,
  condition: z.string(),
  enforcement: GuardrailEnforcementSchema.default('Block'),
  active: z.boolean().default(true),
  created_at: z.string(),
})

export type GuardrailCategory = z.infer<typeof GuardrailCategorySchema>
export type GuardrailEnforcement = z.infer<typeof GuardrailEnforcementSchema>
export type Guardrail = z.infer<typeof GuardrailSchema>

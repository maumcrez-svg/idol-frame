import { z } from 'zod'

export const DirectiveScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Global') }),
  z.object({ type: z.literal('Context'), stage_id: z.string().startsWith('stg-') }),
  z.object({ type: z.literal('Session'), session_id: z.string() }),
])

export const DirectiveExpirationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('Permanent') }),
  z.object({ type: z.literal('ExpiresAt'), date: z.string() }),
  z.object({ type: z.literal('SingleUse') }),
])

export const DirectiveStatusSchema = z.enum(['Active', 'Expired', 'Revoked'])

export const DirectiveSchema = z.object({
  id: z.string().startsWith('dir-'),
  entity_id: z.string().startsWith('e-'),
  priority: z.number().int().min(0).max(1000).default(100),
  scope: DirectiveScopeSchema,
  instruction: z.string(),
  rationale: z.string().nullable().default(null),
  expiration: DirectiveExpirationSchema,
  status: DirectiveStatusSchema.default('Active'),
  created_at: z.string(),
  created_by: z.string().default('creator'),
  conflicts_with: z.array(z.string()).default([]),
})

export type DirectiveScope = z.infer<typeof DirectiveScopeSchema>
export type DirectiveExpiration = z.infer<typeof DirectiveExpirationSchema>
export type DirectiveStatus = z.infer<typeof DirectiveStatusSchema>
export type Directive = z.infer<typeof DirectiveSchema>

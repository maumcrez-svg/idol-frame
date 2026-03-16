import { z } from 'zod'
import { IdentityCoreSchema } from './entity.js'
import { VoiceSchema } from './voice.js'
import { TraitSchema } from './trait.js'
import { GuardrailSchema } from './guardrail.js'
import { MemoryResultSchema } from './memory.js'
import { StageSchema } from './stage.js'
import { MoodSchema } from './mood.js'
import { DirectiveSchema } from './directive.js'
import { ArcSchema } from './arc.js'

export const InteractionTypeSchema = z.enum(['Proactive', 'Reactive', 'Scheduled'])

export const AudienceSpecSchema = z.object({
  size_estimate: z.number().nullable().default(null),
  sentiment: z.string().nullable().default(null),
})

export const InteractionContextSchema = z.object({
  type: InteractionTypeSchema,
  trigger: z.string(),
  audience: AudienceSpecSchema.nullable().default(null),
})

export const DecisionFrameSchema = z.object({
  id: z.string().startsWith('df-'),
  entity_id: z.string().startsWith('e-'),
  identity_core: IdentityCoreSchema,
  voice: VoiceSchema,
  traits: z.array(TraitSchema),
  guardrails: z.array(GuardrailSchema),
  memories: z.array(MemoryResultSchema).default([]),
  mood: MoodSchema.nullable().default(null),
  arc: ArcSchema.nullable().default(null),
  directives: z.array(DirectiveSchema).default([]),
  stage: StageSchema,
  interaction_context: InteractionContextSchema,
  assembled_at: z.string(),
})

export type InteractionType = z.infer<typeof InteractionTypeSchema>
export type AudienceSpec = z.infer<typeof AudienceSpecSchema>
export type InteractionContext = z.infer<typeof InteractionContextSchema>
export type DecisionFrame = z.infer<typeof DecisionFrameSchema>

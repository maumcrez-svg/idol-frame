import { z } from 'zod'

export const EpisodicEntrySchema = z.object({
  id: z.string().startsWith('mem-'),
  entity_id: z.string().startsWith('e-'),
  content: z.string(),
  context: z.string().default(''),
  importance: z.number().min(0).max(1).default(0.5),
  timestamp: z.string(),
  embedding: z.array(z.number()).nullable().default(null),
  decay_rate: z.number().min(0).max(1).default(0.01),
  consolidated: z.boolean().default(false),
})

export const MemoryQuerySchema = z.object({
  query: z.string(),
  top_k: z.number().int().default(5),
  min_importance: z.number().min(0).max(1).default(0),
  recency_bias: z.number().min(0).max(1).default(0.2),
})

export const MemoryResultSchema = z.object({
  entry: EpisodicEntrySchema,
  score: z.number().min(0).max(1),
})

export type EpisodicEntry = z.infer<typeof EpisodicEntrySchema>
export type MemoryQuery = z.infer<typeof MemoryQuerySchema>
export type MemoryResult = z.infer<typeof MemoryResultSchema>

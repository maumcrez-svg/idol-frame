import { z } from 'zod'

export const MemoryNodeSchema = z.object({
  id: z.string().startsWith('mn-'),
  entity_id: z.string().startsWith('e-'),
  type: z.enum(['episodic', 'leaf_summary', 'condensed']),
  content: z.string(),
  source_ids: z.array(z.string()), // mem-* or mn-* IDs (DAG edges)
  level: z.number().int().min(0), // 0 = episodic, 1 = leaf_summary, 2+ = condensed
  token_count: z.number().int().min(0),
  importance: z.number().min(0).max(1), // max of sources
  time_range: z.object({
    start: z.string(),
    end: z.string(),
  }),
  note_types: z.array(z.string()).default([]), // preserved typed prefixes
  embedding: z.array(z.number()).nullable().default(null),
  consolidated: z.boolean().default(false),
  created_at: z.string(),
})

export type MemoryNode = z.infer<typeof MemoryNodeSchema>

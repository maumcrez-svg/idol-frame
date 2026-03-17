import { z } from 'zod'

export const DriftEventSchema = z.object({
  id: z.string().startsWith('de-'),
  entity_id: z.string().startsWith('e-'),
  trait_name: z.string(),
  old_value: z.number(),
  new_value: z.number(),
  delta: z.number(),
  rule_id: z.string().startsWith('drift-'),
  epoch_id: z.string().nullable().default(null),
  timestamp: z.string(),
})

export type DriftEvent = z.infer<typeof DriftEventSchema>

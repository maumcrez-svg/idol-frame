import { z } from 'zod'

export const AestheticSchema = z.object({
  id: z.string().startsWith('ae-'),
  entity_id: z.string().startsWith('e-'),
  color_palette: z.array(z.string()).default([]),
  visual_motifs: z.array(z.string()).default([]),
  typography_style: z.string().nullable().default(null),
  created_at: z.string(),
})

export type Aesthetic = z.infer<typeof AestheticSchema>

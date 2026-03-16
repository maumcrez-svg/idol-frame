import { z } from 'zod'

export const FormatSpecSchema = z.object({
  max_length: z.number().nullable().default(null),
  supports_markdown: z.boolean().default(true),
  supports_media: z.boolean().default(false),
})

export const StageSchema = z.object({
  id: z.string().startsWith('stg-'),
  name: z.string(),
  platform: z.string(),
  format_spec: FormatSpecSchema.default({}),
  adapter_type: z.string(),
  active: z.boolean().default(true),
  created_at: z.string(),
})

export type FormatSpec = z.infer<typeof FormatSpecSchema>
export type Stage = z.infer<typeof StageSchema>

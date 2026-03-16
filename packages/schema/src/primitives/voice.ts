import { z } from 'zod'

export const VocabularySpecSchema = z.object({
  formality: z.number().min(0).max(1).default(0.5),
  domain_terms: z.array(z.string()).default([]),
  banned_terms: z.array(z.string()).default([]),
  signature_phrases: z.array(z.string()).default([]),
})

export const SyntaxSpecSchema = z.object({
  avg_sentence_length: z.number().default(15),
  complexity: z.number().min(0).max(1).default(0.5),
  paragraph_style: z.string().default('mixed'),
})

export const RhetoricSpecSchema = z.object({
  primary_devices: z.array(z.string()).default([]),
  humor_type: z.string().default('none'),
  argument_style: z.string().default('direct'),
})

export const EmotionalRegisterSpecSchema = z.object({
  baseline_intensity: z.number().min(0).max(1).default(0.5),
  range: z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)]).default([0.2, 0.8]),
  suppressed_emotions: z.array(z.string()).default([]),
})

export const VoiceSchema = z.object({
  id: z.string().startsWith('vc-'),
  entity_id: z.string().startsWith('e-'),
  vocabulary: VocabularySpecSchema.default({}),
  syntax: SyntaxSpecSchema.default({}),
  rhetoric: RhetoricSpecSchema.default({}),
  emotional_register: EmotionalRegisterSpecSchema.default({}),
  created_at: z.string(),
  updated_at: z.string(),
})

export type VocabularySpec = z.infer<typeof VocabularySpecSchema>
export type SyntaxSpec = z.infer<typeof SyntaxSpecSchema>
export type RhetoricSpec = z.infer<typeof RhetoricSpecSchema>
export type EmotionalRegisterSpec = z.infer<typeof EmotionalRegisterSpecSchema>
export type Voice = z.infer<typeof VoiceSchema>

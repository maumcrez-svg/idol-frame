import { z } from 'zod'

export const ClaimVerdict = z.enum([
  'grounded',      // Claim supported by existing memory
  'novel',         // New opinion/take — acceptable, no memory needed
  'ungrounded',    // Factual claim with no supporting memory
  'contradicted',  // Conflicts with existing memory
])

export const ClaimSchema = z.object({
  text: z.string(),
  type: z.enum(['factual', 'opinion', 'reference', 'prediction']),
  verdict: ClaimVerdict,
  confidence: z.number().min(0).max(1),
  source_ids: z.array(z.string()).default([]),   // mem-* or mn-* IDs that support/contradict
  contradiction: z.string().nullable().default(null), // what it contradicts, if any
})

export const GroundingReportSchema = z.object({
  score: z.number().min(0).max(1),
  claims: z.array(ClaimSchema),
  grounded_count: z.number().int().min(0),
  novel_count: z.number().int().min(0),
  ungrounded_count: z.number().int().min(0),
  contradicted_count: z.number().int().min(0),
  citations: z.array(z.object({
    claim_text: z.string(),
    memory_id: z.string(),
    memory_content: z.string(),
    relevance: z.number().min(0).max(1),
  })).default([]),
})

export type ClaimVerdictType = z.infer<typeof ClaimVerdict>
export type Claim = z.infer<typeof ClaimSchema>
export type GroundingReport = z.infer<typeof GroundingReportSchema>

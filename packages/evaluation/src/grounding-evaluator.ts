import type { LLMProvider } from '../../llm/src/index.js'
import type { MemoryRetriever } from '../../cognition/src/memory-retriever.js'
import type { MemoryManager } from '../../state/src/memory-manager.js'
import type { MemoryResult } from '../../schema/src/index.js'
import type { Claim, GroundingReport, ClaimVerdictType } from '../../schema/src/primitives/grounding.js'

interface ExtractedClaim {
  text: string
  type: 'factual' | 'opinion' | 'reference' | 'prediction'
}

export class GroundingEvaluator {
  constructor(
    private llm: LLMProvider,
    private memoryRetriever: MemoryRetriever,
    private memoryManager: MemoryManager,
  ) {}

  async evaluate(
    output: string,
    entityId: string,
  ): Promise<GroundingReport> {
    // 1. Extract claims from output
    const claims = await this.extractClaims(output)
    if (claims.length === 0) {
      return {
        score: 1.0,
        claims: [],
        grounded_count: 0,
        novel_count: 0,
        ungrounded_count: 0,
        contradicted_count: 0,
        citations: [],
      }
    }

    // 2. Verify each claim against memory
    const verifiedClaims: Claim[] = []
    const citations: GroundingReport['citations'] = []

    for (const claim of claims) {
      const result = await this.verifyClaim(claim, entityId)
      verifiedClaims.push(result.claim)
      citations.push(...result.citations)
    }

    // 3. Compute grounding score
    const counts = {
      grounded: verifiedClaims.filter(c => c.verdict === 'grounded').length,
      novel: verifiedClaims.filter(c => c.verdict === 'novel').length,
      ungrounded: verifiedClaims.filter(c => c.verdict === 'ungrounded').length,
      contradicted: verifiedClaims.filter(c => c.verdict === 'contradicted').length,
    }

    const score = this.computeScore(counts, verifiedClaims.length)

    return {
      score,
      claims: verifiedClaims,
      grounded_count: counts.grounded,
      novel_count: counts.novel,
      ungrounded_count: counts.ungrounded,
      contradicted_count: counts.contradicted,
      citations,
    }
  }

  private async extractClaims(output: string): Promise<ExtractedClaim[]> {
    try {
      const result = await this.llm.completeJSON<{ claims: ExtractedClaim[] }>([
        {
          role: 'system',
          content: `You are a claim extraction engine. Given an entity's output, extract all verifiable claims.

For each claim, classify its type:
- "factual": A statement about something that happened or a concrete fact (names, dates, numbers, events)
- "reference": A reference to something the entity said or did before ("I said...", "last time...", "remember when...")
- "opinion": A subjective take, belief, or position ("I think...", "X is overrated...")
- "prediction": A forecast or expectation about the future

Rules:
- Extract the exact claim text, not a summary
- Only extract claims that could be verified against memory or facts
- Ignore generic statements, rhetorical questions, and performative language
- Keep each claim to 1-2 sentences max
- Return an empty array if the output contains no verifiable claims

Return JSON: { "claims": [{ "text": "...", "type": "factual|opinion|reference|prediction" }] }`,
        },
        { role: 'user', content: output },
      ], { temperature: 0, max_tokens: 2000 })

      if (!result.claims || !Array.isArray(result.claims)) return []
      return result.claims.filter(c => c.text && c.type)
    } catch {
      return []
    }
  }

  private async verifyClaim(
    claim: ExtractedClaim,
    entityId: string,
  ): Promise<{ claim: Claim; citations: GroundingReport['citations'] }> {
    const citations: GroundingReport['citations'] = []

    // Opinions and predictions are novel by default — don't need memory grounding
    if (claim.type === 'opinion' || claim.type === 'prediction') {
      // But check for contradictions with past opinions
      const contradiction = await this.checkContradiction(claim, entityId)
      if (contradiction) {
        return {
          claim: {
            text: claim.text,
            type: claim.type,
            verdict: 'contradicted',
            confidence: contradiction.confidence,
            source_ids: [contradiction.memory_id],
            contradiction: contradiction.contradiction_text,
          },
          citations: [{
            claim_text: claim.text,
            memory_id: contradiction.memory_id,
            memory_content: contradiction.memory_content,
            relevance: contradiction.confidence,
          }],
        }
      }

      return {
        claim: {
          text: claim.text,
          type: claim.type,
          verdict: 'novel',
          confidence: 1.0,
          source_ids: [],
          contradiction: null,
        },
        citations: [],
      }
    }

    // Factual claims and references need memory support
    const memories = await this.findSupportingMemories(claim.text, entityId)

    if (memories.length === 0) {
      return {
        claim: {
          text: claim.text,
          type: claim.type,
          verdict: 'ungrounded',
          confidence: 0,
          source_ids: [],
          contradiction: null,
        },
        citations: [],
      }
    }

    // Check if memories support or contradict the claim
    const verification = await this.verifyAgainstMemories(claim, memories)

    for (const mem of verification.supporting) {
      citations.push({
        claim_text: claim.text,
        memory_id: mem.entry.id,
        memory_content: mem.entry.content,
        relevance: mem.score,
      })
    }

    return {
      claim: {
        text: claim.text,
        type: claim.type,
        verdict: verification.verdict,
        confidence: verification.confidence,
        source_ids: verification.supporting.map(m => m.entry.id),
        contradiction: verification.contradiction,
      },
      citations,
    }
  }

  private async findSupportingMemories(
    claimText: string,
    entityId: string,
  ): Promise<MemoryResult[]> {
    // Search via vector similarity
    const vectorResults = await this.memoryRetriever.retrieve(entityId, claimText, 5)

    // Also search via keyword grep
    const keywords = this.extractKeywords(claimText)
    const grepResults: MemoryResult[] = []
    for (const keyword of keywords.slice(0, 3)) {
      const results = this.memoryRetriever.grep(entityId, keyword, 3)
      grepResults.push(...results)
    }

    // Deduplicate by ID
    const seen = new Set<string>()
    const merged: MemoryResult[] = []
    for (const r of [...vectorResults, ...grepResults]) {
      if (!seen.has(r.entry.id)) {
        seen.add(r.entry.id)
        merged.push(r)
      }
    }

    // Filter to only reasonably relevant results (score > 0.3)
    return merged.filter(m => m.score > 0.3).slice(0, 8)
  }

  private extractKeywords(text: string): string[] {
    const stopwords = new Set([
      'the', 'a', 'an', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
      'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
      'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
      'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
      'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below',
      'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
      'neither', 'each', 'every', 'all', 'any', 'few', 'more', 'most',
      'other', 'some', 'such', 'no', 'only', 'own', 'same', 'than',
      'too', 'very', 'just', 'because', 'it', 'its', 'this', 'that',
      'these', 'those', 'i', 'me', 'my', 'we', 'our', 'you', 'your',
      'he', 'him', 'his', 'she', 'her', 'they', 'them', 'their', 'what',
      'which', 'who', 'whom', 'when', 'where', 'why', 'how', 'about',
    ])

    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !stopwords.has(w))
  }

  private async verifyAgainstMemories(
    claim: ExtractedClaim,
    memories: MemoryResult[],
  ): Promise<{
    verdict: ClaimVerdictType
    confidence: number
    supporting: MemoryResult[]
    contradiction: string | null
  }> {
    const memoryContext = memories
      .map((m, i) => `[${i + 1}] (id: ${m.entry.id}) ${m.entry.content}`)
      .join('\n')

    try {
      const result = await this.llm.completeJSON<{
        verdict: string
        confidence: number
        supporting_indices: number[]
        contradiction: string | null
      }>([
        {
          role: 'system',
          content: `You are a fact-checking engine. Given a claim and a set of memory entries, determine if the claim is supported, contradicted, or ungrounded.

Return JSON:
{
  "verdict": "grounded" | "ungrounded" | "contradicted",
  "confidence": 0.0-1.0,
  "supporting_indices": [1, 3],
  "contradiction": "string explaining what contradicts, or null"
}

Rules:
- "grounded": The claim is directly supported by one or more memories
- "contradicted": A memory directly contradicts the claim (the entity said/did the opposite)
- "ungrounded": The memories found are not relevant enough to support or contradict
- confidence: How certain you are about the verdict (1.0 = very certain)
- supporting_indices: Which memory entries (1-indexed) support or contradict the claim
- Be strict: vague similarity is not grounding. The memory must substantively support the specific claim.`,
        },
        {
          role: 'user',
          content: `CLAIM: ${claim.text}\n\nMEMORIES:\n${memoryContext}`,
        },
      ], { temperature: 0, max_tokens: 500 })

      const validVerdicts: ClaimVerdictType[] = ['grounded', 'ungrounded', 'contradicted']
      const verdict: ClaimVerdictType = validVerdicts.includes(result.verdict as ClaimVerdictType)
        ? result.verdict as ClaimVerdictType
        : 'ungrounded'

      const supporting = (result.supporting_indices ?? [])
        .filter((i: number) => i >= 1 && i <= memories.length)
        .map((i: number) => memories[i - 1])

      return {
        verdict,
        confidence: Math.min(1, Math.max(0, result.confidence ?? 0.5)),
        supporting,
        contradiction: result.contradiction ?? null,
      }
    } catch {
      // On LLM error, assume ungrounded (conservative)
      return {
        verdict: 'ungrounded',
        confidence: 0.5,
        supporting: [],
        contradiction: null,
      }
    }
  }

  private async checkContradiction(
    claim: ExtractedClaim,
    entityId: string,
  ): Promise<{
    memory_id: string
    memory_content: string
    contradiction_text: string
    confidence: number
  } | null> {
    // Search for memories about the same topic
    const memories = await this.findSupportingMemories(claim.text, entityId)
    if (memories.length === 0) return null

    // Only check opinions against past opinions
    const opinionMemories = memories.filter(m =>
      m.entry.content.toLowerCase().includes('[opinion]') ||
      m.entry.content.toLowerCase().includes('think') ||
      m.entry.content.toLowerCase().includes('believe') ||
      m.entry.content.toLowerCase().includes('bullish') ||
      m.entry.content.toLowerCase().includes('bearish'),
    )

    if (opinionMemories.length === 0) return null

    const memoryContext = opinionMemories
      .slice(0, 5)
      .map((m, i) => `[${i + 1}] (id: ${m.entry.id}) ${m.entry.content}`)
      .join('\n')

    try {
      const result = await this.llm.completeJSON<{
        contradicts: boolean
        memory_index: number
        explanation: string
        confidence: number
      }>([
        {
          role: 'system',
          content: `You are a contradiction detector. Given a new opinion/prediction and past opinions from the same entity, determine if the new claim contradicts a previous position.

Return JSON:
{
  "contradicts": true/false,
  "memory_index": 1,
  "explanation": "Previously said X, now says Y",
  "confidence": 0.0-1.0
}

Rules:
- Only flag genuine contradictions, not evolution of opinion
- Changing one's mind is fine IF acknowledged. Contradicting silently is the problem.
- If no contradiction, set contradicts: false and memory_index: 0
- Be strict: different nuance on the same topic is NOT a contradiction`,
        },
        {
          role: 'user',
          content: `NEW CLAIM: ${claim.text}\n\nPAST OPINIONS:\n${memoryContext}`,
        },
      ], { temperature: 0, max_tokens: 400 })

      if (!result.contradicts) return null

      const idx = (result.memory_index ?? 1) - 1
      const mem = opinionMemories[Math.min(idx, opinionMemories.length - 1)]

      return {
        memory_id: mem.entry.id,
        memory_content: mem.entry.content,
        contradiction_text: result.explanation ?? 'Contradicts previous position',
        confidence: Math.min(1, Math.max(0, result.confidence ?? 0.7)),
      }
    } catch {
      return null
    }
  }

  private computeScore(
    counts: { grounded: number; novel: number; ungrounded: number; contradicted: number },
    total: number,
  ): number {
    if (total === 0) return 1.0

    // Scoring:
    // - grounded: +1.0 (fully supported)
    // - novel: +0.8 (acceptable — new opinions are fine)
    // - ungrounded: +0.3 (factual claim without support — risky)
    // - contradicted: +0.0 (directly conflicts with memory — hallucination)
    const weighted =
      counts.grounded * 1.0 +
      counts.novel * 0.8 +
      counts.ungrounded * 0.3 +
      counts.contradicted * 0.0

    return Math.min(1, Math.max(0, weighted / total))
  }
}

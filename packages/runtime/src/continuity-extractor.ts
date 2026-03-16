// ── Types ────────────────────────────────────────────────────────────

export interface ContinuityNote {
  type: 'opinion' | 'event' | 'bit' | 'callback' | 'thread' | 'call'
  content: string
  importance: number
}

// ── Patterns ─────────────────────────────────────────────────────────

interface ExtractionRule {
  type: ContinuityNote['type']
  pattern: RegExp
  importance: number
}

const EXTRACTION_RULES: ExtractionRule[] = [
  // Strong opinions
  { type: 'opinion', pattern: /\bis absolutely\b/i, importance: 0.8 },
  { type: 'opinion', pattern: /\bis completely\b/i, importance: 0.8 },
  { type: 'opinion', pattern: /\bis clearly\b/i, importance: 0.8 },
  { type: 'opinion', pattern: /\bwill never\b/i, importance: 0.8 },
  { type: 'opinion', pattern: /\bwill always\b/i, importance: 0.8 },
  { type: 'opinion', pattern: /\bthis is insane\b/i, importance: 0.8 },
  { type: 'opinion', pattern: /\bthis is genius\b/i, importance: 0.8 },
  { type: 'opinion', pattern: /\bthis is terrible\b/i, importance: 0.8 },
  { type: 'opinion', pattern: /\bdon'?t buy\b/i, importance: 0.8 },
  { type: 'opinion', pattern: /\bdon'?t trust\b/i, importance: 0.8 },
  { type: 'opinion', pattern: /\bmark my words\b/i, importance: 0.8 },

  // Market calls
  { type: 'call', pattern: /\bgoing to \$\d/i, importance: 0.9 },
  { type: 'call', pattern: /\bheaded to \$\d/i, importance: 0.9 },
  { type: 'call', pattern: /\bbullish\b/i, importance: 0.9 },
  { type: 'call', pattern: /\bbearish\b/i, importance: 0.9 },
  { type: 'call', pattern: /\bcalling it\b/i, importance: 0.9 },
  { type: 'call', pattern: /\bprediction\b/i, importance: 0.9 },

  // Unresolved threads
  { type: 'thread', pattern: /\bwe'?ll see\b/i, importance: 0.7 },
  { type: 'thread', pattern: /\bwe'?ll come back\b/i, importance: 0.7 },
  { type: 'thread', pattern: /\bwe'?ll revisit\b/i, importance: 0.7 },
  { type: 'thread', pattern: /\bstay tuned\b/i, importance: 0.7 },
  { type: 'thread', pattern: /\bkeep an eye on\b/i, importance: 0.7 },
  { type: 'thread', pattern: /\bthis isn'?t over\b/i, importance: 0.7 },

  // Recurring bits
  { type: 'bit', pattern: /\bas I always say\b/i, importance: 0.6 },
  { type: 'bit', pattern: /\bour old friend\b/i, importance: 0.6 },
  { type: 'bit', pattern: /\brevery single time\b/i, importance: 0.6 },
  { type: 'bit', pattern: /\bhere we go again\b/i, importance: 0.6 },

  // Callbacks
  { type: 'callback', pattern: /\byou all remember\b/i, importance: 0.6 },
  { type: 'callback', pattern: /\blast time\b/i, importance: 0.6 },
  { type: 'callback', pattern: /\blast week\b/i, importance: 0.6 },
  { type: 'callback', pattern: /\blast episode\b/i, importance: 0.6 },
  { type: 'callback', pattern: /\bremember when\b/i, importance: 0.6 },
  { type: 'callback', pattern: /\bremember what\b/i, importance: 0.6 },
]

const FILLER_WORDS = /\b(um|uh|like|basically|you know|i mean|sort of|kind of)\b/gi

// ── Helpers ──────────────────────────────────────────────────────────

function extractSentence(text: string, matchIndex: number): string {
  // Walk backward to sentence start
  let start = matchIndex
  while (start > 0 && !/[.!?\n]/.test(text[start - 1])) {
    start--
  }

  // Walk forward to sentence end
  let end = matchIndex
  while (end < text.length && !/[.!?\n]/.test(text[end])) {
    end++
  }
  // Include the punctuation
  if (end < text.length && /[.!?]/.test(text[end])) {
    end++
  }

  return text.slice(start, end).trim()
}

function hasExcessiveFiller(text: string): boolean {
  const words = text.split(/\s+/).length
  const fillerMatches = text.match(FILLER_WORDS)
  const fillerCount = fillerMatches ? fillerMatches.length : 0
  // If more than 20% filler, it is noise
  return words > 0 && fillerCount / words > 0.2
}

// ── Main Export ──────────────────────────────────────────────────────

export function extractContinuityNotes(
  output: string,
  contextSummary: string,
  timestamp: string,
): ContinuityNote[] {
  const notes: ContinuityNote[] = []
  const seen = new Set<string>()

  // Run each extraction rule against the output
  for (const rule of EXTRACTION_RULES) {
    const regex = new RegExp(rule.pattern.source, rule.pattern.flags + (rule.pattern.flags.includes('g') ? '' : 'g'))
    let match: RegExpExecArray | null

    while ((match = regex.exec(output)) !== null) {
      const sentence = extractSentence(output, match.index)

      // Dedup: skip if we already captured this sentence for any type
      if (seen.has(sentence)) continue
      seen.add(sentence)

      // Filter: too short
      if (sentence.length < 15) continue

      // Filter: too much filler
      if (hasExcessiveFiller(sentence)) continue

      notes.push({
        type: rule.type,
        content: sentence,
        importance: rule.importance,
      })
    }
  }

  // Always record an event note for the context
  if (contextSummary.length >= 15 && !hasExcessiveFiller(contextSummary)) {
    notes.push({
      type: 'event',
      content: contextSummary,
      importance: 0.5,
    })
  }

  return notes
}

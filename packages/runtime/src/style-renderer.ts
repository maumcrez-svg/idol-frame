import type { PerformanceMode } from '../../schema/src/index.js'

// ── Helpers ──────────────────────────────────────────────────────────

const STAGE_DIRECTION_PATTERN = /(?<!\[)\b(pauses?|beats?|laughs?|sighs?|leans (?:in|back|forward)|looks (?:at|around|up|down)|shakes head|nods|points|gestures|takes a breath|deep breath|clears throat|silence|smiles|grins|chuckles|snaps fingers|slams (?:table|desk)|stands up|sits down|walks (?:away|over)|turns (?:around|to)|exhales|inhales)\b(?!\])/gi

function wrapBareStageDirections(text: string): string {
  return text.replace(STAGE_DIRECTION_PATTERN, '[$1]')
}

function ensureBeatMarkers(text: string): string {
  if (text.includes('[beat]') || text.includes('[pause]')) {
    return text
  }

  const paragraphs = text.split(/\n{2,}/)
  if (paragraphs.length <= 1) {
    return text
  }

  return paragraphs.join('\n\n[beat]\n\n')
}

function trimExcessWhitespace(text: string): string {
  return text
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(w => w.length > 0).length
}

function ensureHookLine(text: string): string {
  const lines = text.split('\n')
  if (lines.length === 0) return text

  const firstLine = lines[0].trim()
  const words = firstLine.split(/\s+/)

  if (words.length <= 25) {
    return text
  }

  // Split at a natural break under 25 words
  let splitIndex = 0
  let wordCount = 0
  for (let i = 0; i < firstLine.length; i++) {
    if (firstLine[i] === ' ') {
      wordCount++
      if (wordCount >= 20) {
        // Find next sentence boundary or comma
        const remaining = firstLine.slice(i)
        const breakMatch = remaining.match(/^[^.!?,]*[.!?,]/)
        if (breakMatch) {
          splitIndex = i + breakMatch[0].length
          break
        }
        // No natural break found, just split at 25 words
        splitIndex = i
        break
      }
    }
  }

  if (splitIndex > 0 && splitIndex < firstLine.length) {
    const hookPart = firstLine.slice(0, splitIndex).trim()
    const rest = firstLine.slice(splitIndex).trim()
    lines[0] = hookPart
    lines.splice(1, 0, rest)
    return lines.join('\n')
  }

  return text
}

function capWordCount(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(w => w.length > 0)
  if (words.length <= maxWords) return text

  // Truncate at last sentence boundary within limit
  let charCount = 0
  let lastSentenceEnd = 0

  for (let i = 0; i < words.length && i < maxWords; i++) {
    charCount += words[i].length + (i > 0 ? 1 : 0)
    const endChar = words[i].slice(-1)
    if (endChar === '.' || endChar === '!' || endChar === '?') {
      lastSentenceEnd = charCount
    }
  }

  if (lastSentenceEnd > 0) {
    const truncated = words.join(' ').slice(0, lastSentenceEnd)
    return truncated
  }

  // No sentence boundary found — hard cut at word limit
  return words.slice(0, maxWords).join(' ')
}

function ensureCutMarkers(text: string): string {
  if (text.includes('[CUT]')) {
    return text
  }

  const paragraphs = text.split(/\n{2,}/)
  if (paragraphs.length <= 1) {
    return text
  }

  return paragraphs.join('\n\n[CUT]\n\n')
}

function ensureParagraphStructure(text: string): string {
  const paragraphs = text.split(/\n{2,}/).filter(p => p.trim().length > 0)

  if (paragraphs.length >= 3 && paragraphs.length <= 5) {
    return paragraphs.join('\n\n')
  }

  if (paragraphs.length < 3) {
    // Split long paragraphs at sentence boundaries
    const expanded: string[] = []
    for (const p of paragraphs) {
      const sentences = p.match(/[^.!?]+[.!?]+/g)
      if (sentences && sentences.length >= 4 && expanded.length + 2 <= 5) {
        const mid = Math.ceil(sentences.length / 2)
        expanded.push(sentences.slice(0, mid).join('').trim())
        expanded.push(sentences.slice(mid).join('').trim())
      } else {
        expanded.push(p.trim())
      }
    }
    // If still under 3, accept what we have
    return expanded.join('\n\n')
  }

  if (paragraphs.length > 5) {
    // Merge smallest adjacent paragraphs until we have 5
    const merged = [...paragraphs]
    while (merged.length > 5) {
      // Find the shortest paragraph and merge with its shorter neighbor
      let minLen = Infinity
      let minIdx = 1
      for (let i = 1; i < merged.length; i++) {
        if (merged[i].length < minLen) {
          minLen = merged[i].length
          minIdx = i
        }
      }
      // Merge with previous paragraph
      const prevIdx = minIdx - 1
      merged[prevIdx] = merged[prevIdx] + ' ' + merged[minIdx]
      merged.splice(minIdx, 1)
    }
    return merged.join('\n\n')
  }

  return paragraphs.join('\n\n')
}

function cleanPunctuation(text: string): string {
  // Ensure text ends with proper punctuation
  const trimmed = text.trimEnd()
  if (trimmed.length === 0) return text
  const lastChar = trimmed[trimmed.length - 1]
  if (/[.!?"\u2019\u201D]/.test(lastChar)) {
    return trimmed
  }
  return trimmed + '.'
}

function removeStageDirections(text: string): string {
  return text
    .replace(/\[(?:beat|pause|CUT|EMPHASIS)\]\s*/gi, '')
    .replace(/\[(?:leans?|looks?|points?|gestures?|walks?|turns?|stands?|sits?|slams?|snaps?|shakes?|nods?|smiles?|grins?|chuckles?|sighs?|laughs?|exhales?|inhales?|clears?)[^\]]*\]\s*/gi, '')
    .replace(/\n{3,}/g, '\n\n')
}

// ── Main Export ──────────────────────────────────────────────────────

export function renderForMode(raw: string, mode: PerformanceMode): string {
  switch (mode) {
    case 'live_host': {
      let result = wrapBareStageDirections(raw)
      result = ensureBeatMarkers(result)
      result = trimExcessWhitespace(result)
      return result
    }

    case 'short_video': {
      let result = ensureHookLine(raw)
      result = capWordCount(result, 150)
      result = ensureCutMarkers(result)
      result = trimExcessWhitespace(result)
      return result
    }

    case 'editorial_post': {
      let result = ensureParagraphStructure(raw)
      result = cleanPunctuation(result)
      result = removeStageDirections(result)
      result = trimExcessWhitespace(result)
      return result
    }
  }
}

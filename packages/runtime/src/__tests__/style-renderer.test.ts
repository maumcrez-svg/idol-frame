import { describe, it, expect } from 'vitest'
import { renderForMode } from '../style-renderer.js'

// ── live_host ───────────────────────────────────────────────────────

describe('renderForMode - live_host', () => {
  it('wraps bare stage directions in brackets', () => {
    const raw = 'So here is the thing. pauses. Bitcoin is dead again.'
    const result = renderForMode(raw, 'live_host')

    expect(result).toContain('[pauses]')
    expect(result).not.toMatch(/(?<!\[)pauses(?!\])/)
  })

  it('wraps multiple bare stage directions', () => {
    const raw = 'leans in and look, this is the play. laughs. I told you.'
    const result = renderForMode(raw, 'live_host')

    expect(result).toContain('[leans in]')
    expect(result).toContain('[laughs]')
  })

  it('does not double-wrap already bracketed directions', () => {
    const raw = 'So [pause] let me tell you something.'
    const result = renderForMode(raw, 'live_host')

    expect(result).toContain('[pause]')
    expect(result).not.toContain('[[pause]]')
  })

  it('adds beat markers between paragraphs when none exist', () => {
    const raw = 'First paragraph about crypto.\n\nSecond paragraph about markets.'
    const result = renderForMode(raw, 'live_host')

    expect(result).toContain('[beat]')
  })

  it('does not add beat markers if already present', () => {
    const raw = 'First paragraph. [beat] Second paragraph.'
    const result = renderForMode(raw, 'live_host')

    // Should not add additional beat markers
    const beatCount = (result.match(/\[beat\]/g) || []).length
    expect(beatCount).toBe(1)
  })

  it('does not add beat markers if [pause] already present', () => {
    const raw = 'First paragraph. [pause] Second paragraph.'
    const result = renderForMode(raw, 'live_host')

    expect(result).not.toMatch(/\[beat\]/)
  })

  it('trims trailing whitespace from lines', () => {
    const raw = 'Line with trailing spaces   \nAnother line   '
    const result = renderForMode(raw, 'live_host')

    const lines = result.split('\n')
    for (const line of lines) {
      expect(line).toBe(line.trimEnd())
    }
  })

  it('collapses excessive blank lines', () => {
    const raw = 'Paragraph one.\n\n\n\n\nParagraph two.'
    const result = renderForMode(raw, 'live_host')

    expect(result).not.toContain('\n\n\n')
  })

  it('trims leading and trailing whitespace from full output', () => {
    const raw = '  \n  Some content here  \n  '
    const result = renderForMode(raw, 'live_host')

    expect(result).toBe(result.trim())
  })

  it('handles single-paragraph input without adding beat markers', () => {
    const raw = 'Just one paragraph with no breaks at all.'
    const result = renderForMode(raw, 'live_host')

    expect(result).not.toContain('[beat]')
  })
})

// ── short_video ─────────────────────────────────────────────────────

describe('renderForMode - short_video', () => {
  it('caps output at 150 words', () => {
    const words = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ')
    const result = renderForMode(words, 'short_video')

    const wordCount = result.split(/\s+/).filter(w => w.length > 0).length
    expect(wordCount).toBeLessThanOrEqual(150)
  })

  it('adds CUT markers between paragraphs when none exist', () => {
    const raw = 'Hook line here.\n\nSecond beat.\n\nThird beat.'
    const result = renderForMode(raw, 'short_video')

    expect(result).toContain('[CUT]')
  })

  it('does not add CUT markers if already present', () => {
    const raw = 'Hook line here.\n\n[CUT]\n\nSecond beat.'
    const result = renderForMode(raw, 'short_video')

    const cutCount = (result.match(/\[CUT\]/g) || []).length
    expect(cutCount).toBe(1)
  })

  it('preserves hook line when it is short enough', () => {
    const raw = 'This is the hook.\n\nRest of the script here.'
    const result = renderForMode(raw, 'short_video')

    expect(result.split('\n')[0].trim()).toBe('This is the hook.')
  })

  it('does not exceed 150 words even with long input and preserves sentence boundaries', () => {
    const sentences = Array.from({ length: 30 }, (_, i) => `This is sentence number ${i}.`).join(' ')
    const result = renderForMode(sentences, 'short_video')

    const wordCount = result.split(/\s+/).filter(w => w.length > 0).length
    expect(wordCount).toBeLessThanOrEqual(150)
  })

  it('short input under 150 words is preserved fully', () => {
    const raw = 'Short hook. This is it.'
    const result = renderForMode(raw, 'short_video')

    expect(result).toContain('Short hook')
    expect(result).toContain('This is it')
  })

  it('trims whitespace', () => {
    const raw = '  Hook line.  \n\n  Second beat.  '
    const result = renderForMode(raw, 'short_video')

    expect(result).toBe(result.trim())
  })
})

// ── editorial_post ──────────────────────────────────────────────────

describe('renderForMode - editorial_post', () => {
  it('ensures 3-5 paragraphs by splitting long paragraphs', () => {
    // Two paragraphs with enough sentences to split
    const raw =
      'First sentence. Second sentence. Third sentence. Fourth sentence.\n\n' +
      'Fifth sentence. Sixth sentence. Seventh sentence. Eighth sentence.'
    const result = renderForMode(raw, 'editorial_post')

    const paragraphs = result.split(/\n{2,}/).filter(p => p.trim().length > 0)
    expect(paragraphs.length).toBeGreaterThanOrEqual(3)
    expect(paragraphs.length).toBeLessThanOrEqual(5)
  })

  it('merges paragraphs when there are more than 5', () => {
    const raw = Array.from({ length: 8 }, (_, i) => `Paragraph ${i} content here.`).join('\n\n')
    const result = renderForMode(raw, 'editorial_post')

    const paragraphs = result.split(/\n{2,}/).filter(p => p.trim().length > 0)
    expect(paragraphs.length).toBeLessThanOrEqual(5)
  })

  it('preserves 3-5 paragraphs without modification', () => {
    const raw = 'Para one.\n\nPara two.\n\nPara three.\n\nPara four.'
    const result = renderForMode(raw, 'editorial_post')

    const paragraphs = result.split(/\n{2,}/).filter(p => p.trim().length > 0)
    expect(paragraphs.length).toBe(4)
  })

  it('removes stage directions like [beat] and [pause]', () => {
    const raw = 'Opening take.\n\n[beat]\n\nMiddle argument.\n\n[pause]\n\nClosing line.'
    const result = renderForMode(raw, 'editorial_post')

    expect(result).not.toContain('[beat]')
    expect(result).not.toContain('[pause]')
  })

  it('removes [CUT] markers', () => {
    const raw = 'Paragraph one.\n\n[CUT]\n\nParagraph two.\n\nParagraph three.'
    const result = renderForMode(raw, 'editorial_post')

    expect(result).not.toContain('[CUT]')
  })

  it('removes physical action stage directions', () => {
    const raw = 'Opening take. [leans in] This is what matters.\n\nSecond point here.\n\nClosing thought.'
    const result = renderForMode(raw, 'editorial_post')

    expect(result).not.toContain('[leans in]')
  })

  it('ensures output ends with proper punctuation', () => {
    const raw = 'First paragraph.\n\nSecond paragraph.\n\nFinal thought without punctuation'
    const result = renderForMode(raw, 'editorial_post')

    const lastChar = result.trimEnd().slice(-1)
    expect(['.', '!', '?', '"', '\u2019', '\u201D']).toContain(lastChar)
  })

  it('does not double-punctuate already punctuated text', () => {
    const raw = 'First paragraph.\n\nSecond paragraph.\n\nEnds properly!'
    const result = renderForMode(raw, 'editorial_post')

    expect(result).not.toMatch(/!\.$/)
  })

  it('collapses excess blank lines', () => {
    const raw = 'One.\n\n\n\n\nTwo.\n\n\n\nThree.'
    const result = renderForMode(raw, 'editorial_post')

    expect(result).not.toContain('\n\n\n')
  })
})

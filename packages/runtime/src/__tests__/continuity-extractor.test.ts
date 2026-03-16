import { describe, it, expect } from 'vitest'
import { extractContinuityNotes } from '../continuity-extractor.js'
import type { ContinuityNote } from '../continuity-extractor.js'

describe('extractContinuityNotes', () => {
  const timestamp = '2025-06-15T12:00:00Z'

  // ── Opinion extraction ────────────────────────────────────────────

  it('extracts opinion notes when "is absolutely" is present', () => {
    const output = 'This project is absolutely the worst thing to happen to DeFi this year.'
    const notes = extractContinuityNotes(output, 'DeFi commentary session', timestamp)

    const opinions = notes.filter(n => n.type === 'opinion')
    expect(opinions.length).toBeGreaterThanOrEqual(1)
    expect(opinions[0].content).toContain('is absolutely')
    expect(opinions[0].importance).toBe(0.8)
  })

  it('extracts opinion notes for "mark my words"', () => {
    const output = 'Mark my words, this token is going to zero within six months.'
    const notes = extractContinuityNotes(output, 'Market prediction', timestamp)

    const opinions = notes.filter(n => n.type === 'opinion')
    expect(opinions.length).toBeGreaterThanOrEqual(1)
    expect(opinions.some(o => o.content.includes('mark my words') || o.content.includes('Mark my words'))).toBe(true)
  })

  it('extracts opinion notes for "is clearly"', () => {
    const output = 'The regulation is clearly designed to protect incumbents, not consumers.'
    const notes = extractContinuityNotes(output, 'Regulation discussion', timestamp)

    const opinions = notes.filter(n => n.type === 'opinion')
    expect(opinions.length).toBeGreaterThanOrEqual(1)
  })

  it('extracts opinion notes for "will never"', () => {
    const output = 'Traditional banks will never adapt fast enough to compete with DeFi.'
    const notes = extractContinuityNotes(output, 'Banking discussion', timestamp)

    const opinions = notes.filter(n => n.type === 'opinion')
    expect(opinions.length).toBeGreaterThanOrEqual(1)
  })

  // ── Market call extraction ────────────────────────────────────────

  it('extracts market call notes for "bullish"', () => {
    const output = 'I am extremely bullish on ETH for the next quarter. The fundamentals are strong.'
    const notes = extractContinuityNotes(output, 'ETH analysis', timestamp)

    const calls = notes.filter(n => n.type === 'call')
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[0].importance).toBe(0.9)
  })

  it('extracts market call notes for "bearish"', () => {
    const output = 'Sentiment remains bearish across the board. Nobody is buying.'
    const notes = extractContinuityNotes(output, 'Market overview', timestamp)

    const calls = notes.filter(n => n.type === 'call')
    expect(calls.length).toBeGreaterThanOrEqual(1)
  })

  it('extracts market call notes for price targets', () => {
    const output = 'Bitcoin is going to $200k by end of year. The halving cycle confirms it.'
    const notes = extractContinuityNotes(output, 'BTC prediction', timestamp)

    const calls = notes.filter(n => n.type === 'call')
    expect(calls.length).toBeGreaterThanOrEqual(1)
  })

  it('extracts market call notes for "calling it"', () => {
    const output = 'I am calling it now: the bottom is in. This is where you accumulate.'
    const notes = extractContinuityNotes(output, 'Market bottom call', timestamp)

    const calls = notes.filter(n => n.type === 'call')
    expect(calls.length).toBeGreaterThanOrEqual(1)
  })

  // ── Thread extraction ─────────────────────────────────────────────

  it('extracts thread notes for "stay tuned"', () => {
    const output = 'We have more to unpack on this story. Stay tuned for the follow-up.'
    const notes = extractContinuityNotes(output, 'Developing story', timestamp)

    const threads = notes.filter(n => n.type === 'thread')
    expect(threads.length).toBeGreaterThanOrEqual(1)
    expect(threads[0].importance).toBe(0.7)
  })

  it('extracts thread notes for "we\'ll see"', () => {
    const output = 'The SEC might reverse course. We\'ll see what happens next month.'
    const notes = extractContinuityNotes(output, 'SEC regulatory', timestamp)

    const threads = notes.filter(n => n.type === 'thread')
    expect(threads.length).toBeGreaterThanOrEqual(1)
  })

  it('extracts thread notes for "keep an eye on"', () => {
    const output = 'Keep an eye on the Solana ecosystem. Something is brewing there.'
    const notes = extractContinuityNotes(output, 'Solana watch', timestamp)

    const threads = notes.filter(n => n.type === 'thread')
    expect(threads.length).toBeGreaterThanOrEqual(1)
  })

  it('extracts thread notes for "this isn\'t over"', () => {
    const output = 'The FTX fallout? This isn\'t over. More shoes are going to drop.'
    const notes = extractContinuityNotes(output, 'FTX aftermath', timestamp)

    const threads = notes.filter(n => n.type === 'thread')
    expect(threads.length).toBeGreaterThanOrEqual(1)
  })

  // ── Event notes ───────────────────────────────────────────────────

  it('always includes event note for context summary', () => {
    const output = 'Just a normal paragraph with nothing special.'
    const context = 'Live stream episode 45 recap'
    const notes = extractContinuityNotes(output, context, timestamp)

    const events = notes.filter(n => n.type === 'event')
    expect(events.length).toBe(1)
    expect(events[0].content).toBe(context)
    expect(events[0].importance).toBe(0.5)
  })

  it('does not include event note when context is too short', () => {
    const output = 'Regular content here.'
    const notes = extractContinuityNotes(output, 'short', timestamp)

    const events = notes.filter(n => n.type === 'event')
    expect(events.length).toBe(0)
  })

  // ── Filtering ─────────────────────────────────────────────────────

  it('filters out notes under 15 characters', () => {
    // Construct input where the matched sentence is very short
    const output = 'is absolutely.\nThis is a longer sentence that should survive the filter.'
    const notes = extractContinuityNotes(output, 'Test context for filtering', timestamp)

    for (const note of notes) {
      if (note.type !== 'event') {
        expect(note.content.length).toBeGreaterThanOrEqual(15)
      }
    }
  })

  // ── Deduplication ─────────────────────────────────────────────────

  it('deduplicates captured sentences', () => {
    // A sentence that matches multiple rules should only appear once
    const output = 'Mark my words, the market is absolutely going to crash. This is clearly a bubble.'
    const notes = extractContinuityNotes(output, 'Market crash prediction', timestamp)

    const contents = notes.filter(n => n.type !== 'event').map(n => n.content)
    const uniqueContents = new Set(contents)
    expect(contents.length).toBe(uniqueContents.size)
  })

  // ── Multiple types in one output ──────────────────────────────────

  it('extracts multiple note types from a single output', () => {
    const output =
      'This project is absolutely revolutionary. I am bullish on the long term. ' +
      'Stay tuned because we are going to revisit this next week.'
    const notes = extractContinuityNotes(output, 'Multi-signal commentary', timestamp)

    const types = new Set(notes.map(n => n.type))
    expect(types.has('opinion')).toBe(true)
    expect(types.has('call')).toBe(true)
    expect(types.has('thread')).toBe(true)
    expect(types.has('event')).toBe(true)
  })

  // ── Empty / no-match input ────────────────────────────────────────

  it('returns only event note when no patterns match', () => {
    const output = 'The weather is nice today. Nothing interesting happening in the markets.'
    const notes = extractContinuityNotes(output, 'Quiet day commentary', timestamp)

    const nonEvents = notes.filter(n => n.type !== 'event')
    expect(nonEvents.length).toBe(0)
    expect(notes.filter(n => n.type === 'event').length).toBe(1)
  })
})

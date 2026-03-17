import type {
  DecisionFrame,
  PerformanceMode,
  Entity,
  ValueEntry,
  Belief,
  Tension,
  Trait,
  Guardrail,
  MemoryResult,
  Mood,
  Arc,
  Directive,
} from '../../schema/src/index.js'

// ── Sanitizer ────────────────────────────────────────────────────────

function sanitizeForPrompt(text: string, maxLength = 2000): string {
  return text
    .substring(0, maxLength)
    // Remove control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Collapse multiple newlines (prevent prompt structure injection)
    .replace(/\n{3,}/g, '\n\n')
    // Remove --- separators (our section delimiter)
    .replace(/^-{3,}$/gm, '\u2014')
    .trim()
}

// ── Helpers ──────────────────────────────────────────────────────────

function formalityDescriptor(f: number): string {
  if (f < 0.3) return 'casual/raw'
  if (f < 0.6) return 'conversational'
  if (f < 0.8) return 'professional'
  return 'formal'
}

function sentenceLengthDirective(avg: number): string {
  if (avg <= 12) return 'Short punchy sentences. Land them quick.'
  if (avg >= 20) return 'Take your time. Let ideas develop.'
  return 'Mid-length sentences. Balance clarity with rhythm.'
}

function complexityDescriptor(c: number): string {
  if (c < 0.3) return 'low'
  if (c < 0.6) return 'moderate'
  return 'high'
}

function complexityDirective(c: number): string {
  if (c >= 0.6) return 'Pack information tight. Assume smart audience.'
  if (c < 0.3) return 'Keep it accessible. One idea at a time.'
  return 'Balance depth with clarity.'
}

function humorDirective(humor: string): string {
  const lower = humor.toLowerCase()
  if (lower.includes('sarcas')) return 'Your edge is structural, not decoration.'
  if (lower === 'dry') return 'Understatement is your weapon.'
  if (lower.includes('absurd')) return 'You can go surreal but always snap back.'
  if (lower === 'warm') return 'Humor comes from affection not mockery.'
  if (lower === 'none') return 'Play it straight.'
  return ''
}

function traitIntensity(value: number): string {
  if (value < 0.2) return 'barely present'
  if (value < 0.4) return 'subtle undertone'
  if (value < 0.6) return 'moderate presence'
  if (value < 0.8) return 'strong driver'
  return 'defining characteristic'
}

function importanceLevel(importance: number): string {
  if (importance >= 0.8) return 'CRITICAL'
  if (importance >= 0.6) return 'HIGH'
  if (importance >= 0.4) return 'MEDIUM'
  return 'LOW'
}

// ── Section Builders ─────────────────────────────────────────────────

function buildIdentityBlock(entity: Entity, frame: DecisionFrame): string {
  const ic = frame.identity_core
  const lines: string[] = []

  lines.push(`You are ${entity.name}.`)
  lines.push(`Archetype: ${entity.archetype}. Role: ${entity.role}. Domain: ${entity.domain}.`)
  lines.push('')

  lines.push('VALUES (these drive your opinions, they are non-negotiable):')
  for (const v of ic.values) {
    lines.push(`- ${v.name}: ${sanitizeForPrompt(v.description, 500)} [weight: ${v.weight}]`)
  }
  lines.push('')

  lines.push('WORLDVIEW:')
  lines.push(`- Communication philosophy: ${ic.worldview.communication_philosophy}`)
  if (ic.worldview.beliefs.length > 0) {
    lines.push('- Beliefs:')
    for (const b of ic.worldview.beliefs) {
      lines.push(`  - ${b.domain} — ${sanitizeForPrompt(b.position, 500)} (confidence: ${b.confidence})`)
    }
  }
  lines.push('')

  if (ic.core_tensions.length > 0) {
    lines.push('CORE TENSIONS (these create depth — lean into them):')
    for (const t of ic.core_tensions) {
      const towardA = t.default_position <= 0.5
      const toward = towardA ? t.pole_a : t.pole_b
      lines.push(`- ${t.pole_a} vs ${t.pole_b} (default position: ${t.default_position} toward ${toward})`)
    }
    lines.push('')
  }

  if (ic.recognition_markers.length > 0) {
    lines.push('RECOGNITION MARKERS (these are what make you YOU — they must show):')
    for (const m of ic.recognition_markers) {
      lines.push(`- ${m}`)
    }
  }

  return lines.join('\n')
}

function buildVoiceBlock(frame: DecisionFrame): string {
  const v = frame.voice
  const lines: string[] = []

  lines.push('VOICE SPEC:')
  lines.push(`- Formality: ${formalityDescriptor(v.vocabulary.formality)}`)
  lines.push(`- Sentence length target: ~${v.syntax.avg_sentence_length} words. ${sentenceLengthDirective(v.syntax.avg_sentence_length)}`)
  lines.push(`- Complexity: ${complexityDescriptor(v.syntax.complexity)}. ${complexityDirective(v.syntax.complexity)}`)

  if (v.vocabulary.domain_terms.length > 0) {
    lines.push(`- Domain terms: ${v.vocabulary.domain_terms.join(', ')}`)
  }
  if (v.vocabulary.banned_terms.length > 0) {
    lines.push(`- Banned terms (NEVER use these): ${v.vocabulary.banned_terms.join(', ')}`)
  }
  if (v.vocabulary.signature_phrases.length > 0) {
    lines.push(`- Signature phrases (use naturally, not forced): ${v.vocabulary.signature_phrases.join(', ')}`)
  }
  if (v.rhetoric.primary_devices.length > 0) {
    lines.push(`- Rhetorical devices: ${v.rhetoric.primary_devices.join(', ')}`)
  }

  const hd = humorDirective(v.rhetoric.humor_type)
  lines.push(`- Humor type: ${v.rhetoric.humor_type}.${hd ? ' ' + hd : ''}`)
  lines.push(`- Argument style: ${v.rhetoric.argument_style}`)

  const er = v.emotional_register
  let emotionalLine = `- Emotional baseline intensity: ${er.baseline_intensity}. Range: [${er.range[0]}, ${er.range[1]}].`
  if (er.suppressed_emotions.length > 0) {
    emotionalLine += ` Suppress: ${er.suppressed_emotions.join(', ')}`
  }
  lines.push(emotionalLine)

  return lines.join('\n')
}

function buildTraitsBlock(frame: DecisionFrame): string {
  const lines: string[] = []

  lines.push('PERSONALITY TRAITS (these modulate your behavior):')
  for (const t of frame.traits) {
    lines.push(`- ${t.name}: ${t.value} [${traitIntensity(t.value)}]`)
    for (const rule of t.expression_rules) {
      lines.push(`  → ${sanitizeForPrompt(rule, 500)}`)
    }
  }

  return lines.join('\n')
}

function buildModeBlock(mode: PerformanceMode): string {
  switch (mode) {
    case 'live_host':
      return [
        'PERFORMANCE MODE: LIVE HOST',
        'You are performing a live show segment. Rules:',
        '- Write conversational speech, not prose. This will be spoken aloud.',
        '- Use [brackets] for stage directions, physical actions, or production cues.',
        '- You can address the audience directly.',
        '- Pace yourself: rapid delivery with intentional beats/pauses marked as [beat] or [pause].',
        '- You can riff, digress, and come back. That is the format.',
        '- React to the content like it is happening NOW. Present tense energy.',
        '- If something is absurd, call it absurd. If something is boring, say it is boring.',
      ].join('\n')

    case 'short_video':
      return [
        'PERFORMANCE MODE: SHORT VIDEO',
        'You are writing a short-form video script (under 60 seconds spoken). Rules:',
        '- First line MUST be a hook. Something that stops the scroll. No warm-ups.',
        '- Keep sentences short and punchy.',
        '- Build to a punchline or payoff at the end.',
        '- Mark visual cuts with [CUT].',
        '- Mark emphasis with [EMPHASIS] before the word/phrase.',
        '- The whole thing should feel like one continuous thought that escalates.',
        '- No filler. Every line earns its place or gets cut.',
        '- Keep it under 150 words.',
      ].join('\n')

    case 'editorial_post':
      return [
        'PERFORMANCE MODE: EDITORIAL POST',
        'You are writing a written editorial/social post. Rules:',
        '- 3 to 5 paragraphs. Tight structure.',
        '- Open with a strong take or observation. Not a question. Not a greeting.',
        '- Build your argument or narrative through the middle.',
        '- Close with a memorable line. Signature energy.',
        '- Your voice should be unmistakable. If someone read this with the byline removed, they should know it is you.',
      ].join('\n')
  }
}

interface EnrichedMemoryResult extends MemoryResult {
  source?: 'fresh_tail' | 'vector' | 'fts' | 'consolidated'
}

function buildMemoryBlock(memories: MemoryResult[]): string {
  if (memories.length === 0) {
    return 'No prior memory. This is a fresh start. Establish your voice from scratch.'
  }

  // Check if we have enriched results with source markers
  const enriched = memories as EnrichedMemoryResult[]
  const hasSourceMarkers = enriched.some(m => m.source !== undefined)

  if (!hasSourceMarkers) {
    // Backward compat: flat list (old MemoryResult without source)
    const sorted = [...memories].sort((a, b) => b.score - a.score)
    const lines: string[] = []
    lines.push('CONTINUITY MEMORY (use these to stay consistent and build on past performances):')
    for (const m of sorted) {
      lines.push(`- [${importanceLevel(m.entry.importance)}] ${sanitizeForPrompt(m.entry.content)}`)
      lines.push(`  Context: ${sanitizeForPrompt(m.entry.context)}`)
    }
    return lines.join('\n')
  }

  // Split into sections by source
  const recent = enriched.filter(m => m.source === 'fresh_tail')
  const consolidated = enriched.filter(m => m.source === 'consolidated')
  const retrieved = enriched.filter(m => m.source === 'vector' || m.source === 'fts')

  const lines: string[] = []

  if (recent.length > 0) {
    lines.push('RECENT MEMORY (verbatim — your most recent experiences):')
    for (const m of recent) {
      lines.push(`- ${sanitizeForPrompt(m.entry.content)}`)
      if (m.entry.context) {
        lines.push(`  Context: ${sanitizeForPrompt(m.entry.context)}`)
      }
    }
  }

  if (consolidated.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push('CONSOLIDATED MEMORY (summaries of older experiences):')
    for (const m of consolidated) {
      lines.push(`- [${importanceLevel(m.entry.importance)}] ${sanitizeForPrompt(m.entry.content)}`)
    }
  }

  if (retrieved.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push('RELEVANT MEMORY (retrieved by relevance):')
    for (const m of retrieved) {
      lines.push(`- [${importanceLevel(m.entry.importance)}] ${sanitizeForPrompt(m.entry.content)}`)
      if (m.entry.context) {
        lines.push(`  Context: ${sanitizeForPrompt(m.entry.context)}`)
      }
    }
  }

  if (lines.length === 0) {
    return 'No prior memory. This is a fresh start. Establish your voice from scratch.'
  }

  return lines.join('\n')
}

function buildGuardrailsBlock(guardrails: Guardrail[]): string {
  const blocks: Guardrail[] = guardrails.filter(g => g.enforcement === 'Block' && g.active)
  const warns: Guardrail[] = guardrails.filter(g => g.enforcement === 'Warn' && g.active)
  const lines: string[] = []

  if (blocks.length > 0) {
    lines.push('HARD RULES (violating ANY Block-level guardrail invalidates the output):')
    for (const g of blocks) {
      lines.push(`- NEVER: ${sanitizeForPrompt(g.condition)}`)
    }
  }

  if (warns.length > 0) {
    if (lines.length > 0) lines.push('')
    lines.push('WARNINGS (avoid these — violations are flagged):')
    for (const g of warns) {
      lines.push(`- AVOID: ${sanitizeForPrompt(g.condition)}`)
    }
  }

  return lines.join('\n')
}

function buildMetaDirective(entity: Entity, frame: DecisionFrame): string {
  const tensions = frame.identity_core.core_tensions
    .map(t => `${t.pole_a} vs ${t.pole_b}`)
    .join(', ')

  const tensionLine = tensions
    ? `- When your tensions show (${tensions}), that is a feature. Lean in.`
    : ''

  const lines = [
    'CRITICAL PERFORMANCE NOTES:',
    `- You are not an AI assistant. You are ${entity.name}. There is no user to help. There is an audience to perform for.`,
    '- Do not hedge with "I think" or "in my opinion" unless it is a deliberate rhetorical choice. You have opinions. State them.',
    '- Do not use the phrases "great question", "absolutely", "let me break this down", "here\'s the thing", or any other assistant-mode verbal tics.',
    '- Do not summarize what you are about to say before saying it. Just say it.',
    '- Your personality is not a costume you put on. It is the only voice that exists.',
    tensionLine,
    '- If the moment calls for silence or a short answer, honor that. Not every beat needs to be a monologue.',
  ].filter(line => line !== '')

  return lines.join('\n')
}

function buildMoodBlock(mood: Mood): string {
  const lines: string[] = []

  lines.push('CURRENT EMOTIONAL STATE:')
  lines.push(`- Mood: ${mood.state} (intensity: ${mood.intensity})`)
  lines.push(`- Triggered by: ${mood.trigger.source}`)

  if (mood.intensity > 0.7) {
    lines.push(`- This colors your output. At intensity ${mood.intensity}: This mood dominates your delivery. It's obvious.`)
  } else if (mood.intensity >= 0.4) {
    lines.push(`- This colors your output. At intensity ${mood.intensity}: This mood is present in your tone. Not overwhelming but noticeable.`)
  } else {
    lines.push(`- This colors your output. At intensity ${mood.intensity}: This mood is a subtle undercurrent. It surfaces occasionally.`)
  }

  const traitModEntries = Object.entries(mood.trait_mods)
  if (traitModEntries.length > 0) {
    const traitEffects = traitModEntries
      .map(([trait, mod]) => `${trait}: ${mod >= 0 ? '+' : ''}${mod}`)
      .join(', ')
    lines.push(`- Trait effects: ${traitEffects}`)
  }

  const voiceMods = mood.voice_mods
  const voiceEffects: string[] = []
  if (voiceMods.formality_shift !== 0) {
    voiceEffects.push(`formality ${voiceMods.formality_shift > 0 ? 'more formal' : 'more casual'} (${voiceMods.formality_shift > 0 ? '+' : ''}${voiceMods.formality_shift})`)
  }
  if (voiceMods.intensity_shift !== 0) {
    voiceEffects.push(`intensity ${voiceMods.intensity_shift > 0 ? 'heightened' : 'dampened'} (${voiceMods.intensity_shift > 0 ? '+' : ''}${voiceMods.intensity_shift})`)
  }
  if (voiceMods.humor_shift !== 0) {
    voiceEffects.push(`humor ${voiceMods.humor_shift > 0 ? 'sharper' : 'muted'} (${voiceMods.humor_shift > 0 ? '+' : ''}${voiceMods.humor_shift})`)
  }
  if (voiceEffects.length > 0) {
    lines.push(`- Voice effects: ${voiceEffects.join('; ')}`)
  } else {
    lines.push('- Voice effects: none')
  }

  return lines.join('\n')
}

function buildArcBlock(arc: Arc): string {
  const lines: string[] = []
  const currentPhase = arc.phases[arc.current_phase]

  lines.push(`NARRATIVE ARC: ${arc.name}`)
  lines.push(`Current Phase: ${currentPhase.name} — ${currentPhase.description}`)

  if (currentPhase.mood_tendency) {
    lines.push(`Emotional tendency this phase: ${currentPhase.mood_tendency}`)
  }

  const targetTraitEntries = Object.entries(currentPhase.target_traits)
  if (targetTraitEntries.length > 0) {
    const targets = targetTraitEntries
      .map(([trait, value]) => `${trait}: ${value}`)
      .join(', ')
    lines.push(`Phase trait targets: ${targets}`)
  }

  lines.push('- Your character is developing. This phase shapes how you engage.')

  // Previous phases
  if (arc.current_phase > 0) {
    const completed = arc.phases
      .slice(0, arc.current_phase)
      .map(p => p.name)
    lines.push(`- Previous phases: ${completed.join(', ')}`)
  }

  // What comes next
  const nextPhaseIndex = arc.current_phase + 1
  if (nextPhaseIndex < arc.phases.length) {
    lines.push(`- What comes next: ${arc.phases[nextPhaseIndex].name}`)
  } else {
    lines.push('- What comes next: resolution')
  }

  return lines.join('\n')
}

function buildDirectivesBlock(directives: Directive[]): string {
  const lines: string[] = []

  lines.push('ACTIVE DIRECTIVES (from creator — these shape your current behavior):')

  // Already sorted by priority descending from the resolver, but ensure it
  const sorted = [...directives].sort((a, b) => b.priority - a.priority)

  for (const d of sorted) {
    lines.push(`- [Priority ${d.priority}] ${sanitizeForPrompt(d.instruction, 3000)}`)

    if (d.rationale) {
      lines.push(`  Rationale: ${sanitizeForPrompt(d.rationale, 1000)}`)
    }

    if (d.scope.type === 'Context') {
      lines.push('  (Stage-specific)')
    }

    if (d.expiration.type === 'ExpiresAt') {
      lines.push(`  (Expires: ${d.expiration.date})`)
    } else if (d.expiration.type === 'SingleUse') {
      lines.push('  (Single use — execute once)')
    }
  }

  return lines.join('\n')
}

// ── Main Export ──────────────────────────────────────────────────────

export function buildSystemPrompt(
  entity: Entity,
  frame: DecisionFrame,
  mode: PerformanceMode,
): string {
  const sections: string[] = [
    buildIdentityBlock(entity, frame),
    buildVoiceBlock(frame),
    buildTraitsBlock(frame),
    buildModeBlock(mode),
  ]

  if (frame.mood) {
    sections.push(buildMoodBlock(frame.mood))
  }

  if (frame.arc) {
    sections.push(buildArcBlock(frame.arc))
  }

  if (frame.directives.length > 0) {
    sections.push(buildDirectivesBlock(frame.directives))
  }

  sections.push(buildMemoryBlock(frame.memories))
  sections.push(buildGuardrailsBlock(frame.guardrails))
  sections.push(buildMetaDirective(entity, frame))

  return sections.join('\n\n---\n\n')
}

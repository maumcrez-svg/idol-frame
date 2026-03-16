import type { MemoryManager } from '../../state/src/memory-manager.js'
import type { MoodController } from '../../state/src/mood-controller.js'
import type { DecisionFrame, PerformanceMode } from '../../schema/src/index.js'
import { extractContinuityNotes } from '../../runtime/src/index.js'

interface EmotionalMarker {
  mood: string
  intensity: number
  patterns: RegExp[]
}

const EMOTIONAL_MARKERS: EmotionalMarker[] = [
  {
    mood: 'frustrated',
    intensity: 0.5,
    patterns: [/\bridiculous\b/i, /\binsane\b/i, /\bunbelievable\b/i, /\babsurd\b/i, /\boutrageous\b/i],
  },
  {
    mood: 'excited',
    intensity: 0.6,
    patterns: [/\bincredible\b/i, /\bmassive\b/i, /\bbreakthrough\b/i, /\bamazing\b/i, /\bgame.?changer\b/i],
  },
  {
    mood: 'skeptical',
    intensity: 0.4,
    patterns: [/\bsuspicious\b/i, /\bdon't buy\b/i, /\bnot buying\b/i, /\bdoubtful\b/i, /\bskeptical\b/i],
  },
]

export class SideEffectProcessor {
  constructor(
    private memoryManager: MemoryManager,
    private moodController?: MoodController,
  ) {}

  async process(input: {
    entity_id: string
    output: string
    frame: DecisionFrame
    mode: PerformanceMode
    context: string
  }): Promise<string[]> {
    // Extract continuity notes from output
    const notes = extractContinuityNotes(
      input.output,
      input.context.substring(0, 200),
      new Date().toISOString(),
    )

    // Collect all output labels (continuity notes + phase 2 side effects)
    const output: string[] = []

    // Store each note as an episodic memory
    for (const note of notes) {
      await this.memoryManager.store({
        entity_id: input.entity_id,
        content: `[${note.type}] ${note.content}`,
        context: input.context.substring(0, 200),
        importance: note.importance,
      })
      output.push(`[${note.type}] ${note.content}`)
    }

    // If an arc is active and the current phase has target_traits, log a note about the arc phase
    if (input.frame.arc && input.frame.arc.status === 'Active') {
      const arc = input.frame.arc
      const currentPhase = arc.phases[arc.current_phase]
      if (currentPhase) {
        const targetTraitEntries = Object.entries(currentPhase.target_traits)
        if (targetTraitEntries.length > 0) {
          const targets = targetTraitEntries
            .map(([trait, value]) => `${trait} -> ${value}`)
            .join(', ')

          const arcContent = `Performance during arc "${arc.name}", phase "${currentPhase.name}". Trait targets: ${targets}`

          await this.memoryManager.store({
            entity_id: input.entity_id,
            content: `[arc_phase] ${arcContent}`,
            context: input.context.substring(0, 200),
            importance: 0.6,
          })

          output.push(`[arc_phase] Arc "${arc.name}" phase "${currentPhase.name}" active during performance`)
        }
      }
    }

    // Detect emotional markers in output and set mood if none currently exists
    if (this.moodController) {
      const existingMood = this.moodController.getCurrentMood(input.entity_id)
      if (!existingMood) {
        const detectedMood = this.detectEmotionalMarkers(input.output)
        if (detectedMood) {
          this.moodController.setMood({
            entity_id: input.entity_id,
            state: detectedMood.mood,
            intensity: detectedMood.intensity,
            decay_rate: 0.1,
            trigger: {
              type: 'Interaction',
              source: 'auto-detected from performance output',
              context: input.context.substring(0, 200),
            },
          })

          output.push(`[mood_auto] Auto-detected mood: ${detectedMood.mood} (intensity: ${detectedMood.intensity})`)
        }
      }
    }

    return output
  }

  private detectEmotionalMarkers(output: string): { mood: string; intensity: number } | null {
    for (const marker of EMOTIONAL_MARKERS) {
      const matchCount = marker.patterns.filter(p => p.test(output)).length
      if (matchCount >= 1) {
        return { mood: marker.mood, intensity: marker.intensity }
      }
    }
    return null
  }
}

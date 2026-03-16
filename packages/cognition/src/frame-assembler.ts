import { v4 as uuid } from 'uuid'
import type { DecisionFrame, InteractionContext, VoiceModulation } from '../../schema/src/index.js'
import type { EntityStore, IdentityCoreManager, VoiceRegistry, TraitEngine } from '../../identity/src/index.js'
import { AestheticRegistry } from '../../identity/src/index.js'
import type { MemoryRetriever } from './memory-retriever.js'
import type { DirectiveResolver } from './directive-resolver.js'
import type { IDocumentStore } from '../../storage/src/index.js'
import { GuardrailSchema } from '../../schema/src/index.js'
import type { Guardrail, Stage } from '../../schema/src/index.js'
import type { MoodController } from '../../state/src/mood-controller.js'
import type { ArcDirector } from '../../state/src/arc-director.js'

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

export class FrameAssembler {
  constructor(
    private entityStore: EntityStore,
    private identityCoreManager: IdentityCoreManager,
    private voiceRegistry: VoiceRegistry,
    private traitEngine: TraitEngine,
    private memoryRetriever: MemoryRetriever,
    private docs: IDocumentStore,
    private moodController: MoodController,
    private directiveResolver: DirectiveResolver,
    private arcDirector: ArcDirector,
  ) {}

  // Invariant 8: DecisionFrame assembly fails if IdentityCore, Guardrails, or Stage missing
  async assemble(input: {
    entity_id: string
    stage: Stage
    interaction_context: InteractionContext
    query?: string
  }): Promise<DecisionFrame> {
    const entity = this.entityStore.getOrFail(input.entity_id)
    const identityCore = this.identityCoreManager.getByEntityOrFail(input.entity_id)

    // Load guardrails (parse + filter active only)
    const rawGuardrails = this.docs.list('guardrails', { entity_id: input.entity_id })
    const guardrails: Guardrail[] = rawGuardrails.map(d => GuardrailSchema.parse(d)).filter(g => g.active)
    if (guardrails.length === 0) {
      throw new Error(`Invariant 8: No guardrails found for entity ${input.entity_id}. At least one Safety guardrail is required.`)
    }

    // Get current mood (can be null)
    const currentMood = this.moodController.getCurrentMood(input.entity_id)

    // Get voice with mood modulations applied
    let voice
    if (currentMood) {
      const voiceMods: VoiceModulation = {
        formality_shift: clamp(currentMood.voice_mods.formality_shift * currentMood.intensity, -0.3, 0.3),
        intensity_shift: clamp(currentMood.voice_mods.intensity_shift * currentMood.intensity, -0.3, 0.3),
        humor_shift: clamp(currentMood.voice_mods.humor_shift * currentMood.intensity, -0.3, 0.3),
      }
      voice = this.voiceRegistry.getEffectiveVoice(input.entity_id, voiceMods)
    } else {
      voice = this.voiceRegistry.getEffectiveVoice(input.entity_id)
    }

    // Get traits with mood modulations applied
    let traits
    if (currentMood && Object.keys(currentMood.trait_mods).length > 0) {
      // Scale trait mods by mood intensity
      const scaledMods: Record<string, number> = {}
      for (const [traitName, mod] of Object.entries(currentMood.trait_mods)) {
        scaledMods[traitName] = mod * currentMood.intensity
      }
      traits = this.traitEngine.listByEntityWithMoodMods(input.entity_id, scaledMods)
    } else {
      traits = this.traitEngine.listByEntity(input.entity_id)
    }

    // Resolve directives for this context
    const resolvedDirectives = this.directiveResolver.resolve({
      entity_id: input.entity_id,
      stage_id: input.stage.id,
    })

    // Get active arc (can be null)
    const activeArc = this.arcDirector.getActive(input.entity_id)

    // Retrieve relevant memories
    const memories = input.query
      ? await this.memoryRetriever.retrieve(input.entity_id, input.query, 5)
      : []

    const frame: DecisionFrame = {
      id: `df-${uuid()}`,
      entity_id: input.entity_id,
      identity_core: identityCore,
      voice,
      traits,
      guardrails,
      memories,
      mood: currentMood,
      arc: activeArc,
      directives: resolvedDirectives,
      stage: input.stage,
      interaction_context: input.interaction_context,
      assembled_at: new Date().toISOString(),
    }

    // Invariant 9: Log the frame for audit
    this.docs.put('decision_frames', frame.id, frame)

    return frame
  }
}

import type { MemoryManager } from '../../state/src/memory-manager.js'
import type { MoodController } from '../../state/src/mood-controller.js'
import type { WalletManager } from '../../state/src/wallet-manager.js'
import type { DecisionFrame, PerformanceMode, TransactionCategory, Guardrail } from '../../schema/src/index.js'
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
    private walletManager?: WalletManager,
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

    // Process wallet directives — execute payments for services used during performance
    if (this.walletManager && input.frame.wallet_context) {
      const walletEffects = await this.processWalletDirectives(input)
      output.push(...walletEffects)
    }

    return output
  }

  /**
   * Process wallet directives from the DecisionFrame.
   *
   * Scans directives for payment instructions (prefixed with "wallet_action:" or "payment:")
   * and executes them through the WalletManager. Also handles auto-funding when balance
   * drops below threshold.
   *
   * Directive format examples:
   *   "wallet_action: pay 0.05 USDC to 0xElevenLabs for tts"
   *   "payment: compute 0.003 for LLM inference"
   *   "auto-fund threshold: $10 from wal-master-xxx"
   */
  private async processWalletDirectives(input: {
    entity_id: string
    output: string
    frame: DecisionFrame
    mode: PerformanceMode
    context: string
  }): Promise<string[]> {
    if (!this.walletManager || !input.frame.wallet_context) return []

    const effects: string[] = []
    const wc = input.frame.wallet_context

    // --- Auto-fund check ---
    if (wc.auto_fund_enabled && wc.auto_fund_threshold !== null) {
      if (wc.balance < wc.auto_fund_threshold) {
        const autoFundResult = await this.executeAutoFund(input, wc)
        if (autoFundResult) effects.push(autoFundResult)
      }
    }

    // --- Process wallet directives ---
    for (const directive of input.frame.directives) {
      const instruction = directive.instruction.toLowerCase()

      // Match "wallet_action:" or "payment:" prefix
      if (!instruction.startsWith('wallet_action:') && !instruction.startsWith('payment:')) {
        continue
      }

      const parsed = this.parseWalletDirective(directive.instruction)
      if (!parsed) {
        effects.push(`[wallet_error] Failed to parse directive: ${directive.instruction}`)
        continue
      }

      try {
        const tx = await this.walletManager.transact({
          wallet_id: wc.wallet_id,
          category: parsed.category,
          description: parsed.description,
          amount: parsed.amount,
          recipient: parsed.recipient,
          guardrails: input.frame.guardrails as Guardrail[],
          metadata: {
            directive_id: directive.id,
            performance_mode: input.mode,
            triggered_by: 'side_effect_processor',
          },
        })

        if (tx.status === 'Completed') {
          effects.push(`[wallet_tx] ${tx.category}: $${tx.amount} ${tx.currency} to ${tx.recipient}`)

          // Store transaction as episodic memory
          await this.memoryManager.store({
            entity_id: input.entity_id,
            content: `[wallet_transaction] Spent $${tx.amount} ${tx.currency} on ${tx.category}: ${tx.description}`,
            context: `Performance ${input.mode}, directive ${directive.id}`,
            importance: tx.amount > 1 ? 0.7 : 0.3,
          })
        } else {
          effects.push(`[wallet_blocked] ${tx.category}: ${tx.error_message}`)

          if (tx.guardrail_blocked) {
            await this.memoryManager.store({
              entity_id: input.entity_id,
              content: `[wallet_blocked] Transaction blocked by guardrail: $${tx.amount} for ${tx.category}. Reason: ${tx.error_message}`,
              context: `Performance ${input.mode}`,
              importance: 0.6,
            })
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        effects.push(`[wallet_error] ${parsed.category}: ${msg}`)
      }
    }

    return effects
  }

  /**
   * Auto-fund a wallet when balance drops below threshold.
   * Looks for a "master" wallet directive that specifies the funding source.
   */
  private async executeAutoFund(
    input: { entity_id: string; frame: DecisionFrame },
    wc: { wallet_id: string; auto_fund_threshold: number | null; balance: number },
  ): Promise<string | null> {
    if (!this.walletManager || !wc.auto_fund_threshold) return null

    // Find the master wallet directive
    let masterWalletId: string | null = null
    let fundAmount = wc.auto_fund_threshold * 2 // Default: fund to 2x threshold

    for (const directive of input.frame.directives) {
      const instruction = directive.instruction.toLowerCase()
      if (instruction.includes('auto-fund') || instruction.includes('auto_fund')) {
        // Extract master wallet ID: "auto-fund from wal-xxx"
        const walletMatch = directive.instruction.match(/from\s+(wal-[a-zA-Z0-9-]+)/i)
        if (walletMatch) masterWalletId = walletMatch[1]

        // Extract amount: "auto-fund amount: $50"
        const amountMatch = instruction.match(/amount[:\s]*\$?(\d+(?:\.\d+)?)/i)
        if (amountMatch) fundAmount = parseFloat(amountMatch[1])
      }
    }

    if (!masterWalletId) {
      return `[wallet_autofund_skip] Balance $${wc.balance} below threshold $${wc.auto_fund_threshold}, but no master wallet configured`
    }

    try {
      // Resolve recipient address from wallet (not wallet ID)
      const targetWallet = this.walletManager!.get(wc.wallet_id)
      const recipientAddress = targetWallet?.address ?? wc.wallet_id

      const tx = await this.walletManager!.transact({
        wallet_id: masterWalletId,
        category: 'transfer',
        description: `Auto-fund entity wallet ${wc.wallet_id}`,
        amount: fundAmount,
        recipient: recipientAddress,
      })

      if (tx.status === 'Completed') {
        await this.memoryManager.store({
          entity_id: input.entity_id,
          content: `[wallet_autofund] Auto-funded $${fundAmount} from master wallet. Balance was $${wc.balance}, threshold $${wc.auto_fund_threshold}.`,
          context: 'auto-fund trigger',
          importance: 0.5,
        })
        return `[wallet_autofund] Funded $${fundAmount} from ${masterWalletId}`
      } else {
        return `[wallet_autofund_failed] ${tx.error_message}`
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return `[wallet_autofund_error] ${msg}`
    }
  }

  /**
   * Parse a wallet directive instruction into structured transaction params.
   *
   * Supported formats:
   *   "wallet_action: pay 0.05 USDC to 0xAddr for tts"
   *   "payment: compute 0.003 for LLM inference"
   *   "wallet_action: image_gen 0.15 to https://fal.ai/endpoint"
   */
  private parseWalletDirective(instruction: string): {
    category: TransactionCategory
    amount: number
    recipient: string
    description: string
  } | null {
    // Strip prefix
    const body = instruction.replace(/^(wallet_action|payment)\s*:\s*/i, '').trim()

    // Try format: "pay <amount> [currency] to <recipient> for <category>"
    const payMatch = body.match(
      /^pay\s+(\d+(?:\.\d+)?)\s*(?:\w+)?\s+to\s+(\S+)\s+for\s+(\w+)(?:\s+(.*))?$/i,
    )
    if (payMatch) {
      return {
        amount: parseFloat(payMatch[1]),
        recipient: payMatch[2],
        category: this.resolveCategory(payMatch[3]),
        description: payMatch[4] ?? payMatch[3],
      }
    }

    // Try format: "<category> <amount> [to <recipient>] [for <description>]"
    const catMatch = body.match(
      /^(\w+)\s+(\d+(?:\.\d+)?)\s*(?:to\s+(\S+))?\s*(?:for\s+(.*))?$/i,
    )
    if (catMatch) {
      return {
        category: this.resolveCategory(catMatch[1]),
        amount: parseFloat(catMatch[2]),
        recipient: catMatch[3] ?? 'auto',
        description: catMatch[4] ?? catMatch[1],
      }
    }

    return null
  }

  private resolveCategory(raw: string): TransactionCategory {
    const map: Record<string, TransactionCategory> = {
      compute: 'compute',
      llm: 'compute',
      inference: 'compute',
      tts: 'tts',
      voice: 'tts',
      image: 'image_gen',
      image_gen: 'image_gen',
      img: 'image_gen',
      video: 'video_gen',
      video_gen: 'video_gen',
      audio: 'audio_gen',
      audio_gen: 'audio_gen',
      music: 'audio_gen',
      api: 'api_service',
      service: 'api_service',
      agent: 'agent_payment',
      transfer: 'transfer',
      swap: 'swap',
      media: 'media_asset',
      asset: 'media_asset',
    }
    return map[raw.toLowerCase()] ?? 'other'
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

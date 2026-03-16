import type { DecisionFrame, PerformanceMode, Entity } from '../../schema/src/index.js'
import type { LLMProvider } from '../../llm/src/index.js'
import { toLLMCallFn } from '../../llm/src/index.js'
import { buildSystemPrompt } from '../../runtime/src/index.js'
import { renderForMode } from '../../runtime/src/index.js'

export interface GenerationResult {
  content: string
  raw_llm_output: string
}

export class Generator {
  constructor(private llm: LLMProvider) {}

  async generate(
    entity: Entity,
    frame: DecisionFrame,
    mode: PerformanceMode,
    context: string,
  ): Promise<GenerationResult> {
    // 1. Build system prompt directly from phase1 primitives
    const systemPrompt = buildSystemPrompt(entity, frame, mode)

    // 2. Call LLM
    const llmCallFn = toLLMCallFn(this.llm)
    const rawOutput = await llmCallFn(systemPrompt, context)

    // 3. Post-process with style renderer
    const content = renderForMode(rawOutput, mode)

    return { content, raw_llm_output: rawOutput }
  }
}

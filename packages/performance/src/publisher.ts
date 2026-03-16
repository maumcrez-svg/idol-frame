import { v4 as uuid } from 'uuid'
import type { Performance, PerformanceMode, DecisionFrame, EvaluationResult } from '../../schema/src/index.js'
import type { IPerformanceLog, PerformanceLogEntry } from '../../storage/src/index.js'

export class Publisher {
  constructor(private performanceLog: IPerformanceLog) {}

  publish(input: {
    entity_id: string
    frame: DecisionFrame
    mode: PerformanceMode
    content: string
    raw_llm_output: string
    evaluation: EvaluationResult
    continuity_notes: string[]
  }): Performance {
    const now = new Date().toISOString()

    const performance: Performance = {
      id: `perf-${uuid()}`,
      entity_id: input.entity_id,
      decision_frame_id: input.frame.id,
      stage_id: input.frame.stage.id,
      mode: input.mode,
      content: input.content,
      raw_llm_output: input.raw_llm_output,
      evaluation: input.evaluation,
      continuity_notes: input.continuity_notes,
      published: true,
      timestamp: now,
    }

    // Invariant 9: Log for audit
    const logEntry: PerformanceLogEntry = {
      performance_id: performance.id,
      entity_id: input.entity_id,
      decision_frame_id: input.frame.id,
      mode: input.mode,
      content: input.content,
      raw_llm_output: input.raw_llm_output,
      identity_score: input.evaluation.identity_score,
      voice_score: input.evaluation.voice_score,
      quality_score: input.evaluation.quality_score,
      guardrail_passed: input.evaluation.guardrail_passed,
      published: true,
      timestamp: now,
    }
    this.performanceLog.append(logEntry)

    return performance
  }
}

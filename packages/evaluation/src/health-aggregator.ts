import type { IPerformanceLog } from '../../storage/src/index.js'

export interface HealthSummary {
  entity_id: string
  total_performances: number
  avg_identity_score: number | null
  avg_voice_score: number | null
  avg_quality_score: number | null
  guardrail_violation_rate: number
  last_performance_at: string | null
}

export class HealthAggregator {
  constructor(private performanceLog: IPerformanceLog) {}

  summarize(entityId: string, limit = 100): HealthSummary {
    const entries = this.performanceLog.getByEntity(entityId, limit)

    if (entries.length === 0) {
      return {
        entity_id: entityId,
        total_performances: 0,
        avg_identity_score: null,
        avg_voice_score: null,
        avg_quality_score: null,
        guardrail_violation_rate: 0,
        last_performance_at: null,
      }
    }

    const withIdentity = entries.filter(e => e.identity_score != null)
    const withVoice = entries.filter(e => e.voice_score != null)
    const withQuality = entries.filter(e => e.quality_score != null)
    const violations = entries.filter(e => !e.guardrail_passed)

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : null

    return {
      entity_id: entityId,
      total_performances: entries.length,
      avg_identity_score: avg(withIdentity.map(e => e.identity_score!)),
      avg_voice_score: avg(withVoice.map(e => e.voice_score!)),
      avg_quality_score: avg(withQuality.map(e => e.quality_score!)),
      guardrail_violation_rate: violations.length / entries.length,
      last_performance_at: entries[0]?.timestamp ?? null,
    }
  }
}

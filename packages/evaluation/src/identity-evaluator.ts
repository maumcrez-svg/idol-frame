import type { LLMProvider } from '../../llm/src/index.js'
import type { IdentityCore } from '../../schema/src/index.js'

export interface IdentityScore {
  overall: number
  value_alignment: number
  worldview_consistency: number
  recognition_marker_presence: number
  tension_balance: number
  degraded?: boolean
}

export class IdentityEvaluator {
  constructor(private llm: LLMProvider) {}

  async score(output: string, identityCore: IdentityCore): Promise<IdentityScore> {
    try {
    const valuesDesc = identityCore.values
      .map(v => `${v.name} (weight: ${v.weight}): ${v.description}`)
      .join('\n')

    const worldviewDesc = identityCore.worldview.beliefs
      .map(b => `${b.domain}: ${b.position} (confidence: ${b.confidence})`)
      .join('\n')

    const tensionsDesc = identityCore.core_tensions
      .map(t => `${t.pole_a} vs ${t.pole_b} (default position: ${t.default_position})`)
      .join('\n')

    const markersDesc = identityCore.recognition_markers.join(', ')

    const result = await this.llm.completeJSON<{
      value_alignment: number
      worldview_consistency: number
      recognition_marker_presence: number
      tension_balance: number
    }>([
      {
        role: 'system',
        content: `You are an identity consistency evaluator for a creative entity framework. Score the following output against the entity's identity core on four dimensions, each from 0.0 to 1.0.

Scoring rubric:
- value_alignment: Does the output reflect the entity's declared values? 1.0 = every value is clearly expressed. 0.0 = output contradicts values.
- worldview_consistency: Does the output align with the entity's worldview and beliefs? 1.0 = fully consistent. 0.0 = contradicts worldview.
- recognition_marker_presence: Are the entity's distinctive markers (tone, style, quirks) present? 1.0 = unmistakably this entity. 0.0 = generic/unrecognizable.
- tension_balance: Does the output navigate the entity's core tensions appropriately? 1.0 = balanced. 0.0 = collapses to one pole.

Respond with JSON only: { "value_alignment": float, "worldview_consistency": float, "recognition_marker_presence": float, "tension_balance": float }`,
      },
      {
        role: 'user',
        content: `ENTITY IDENTITY CORE:

VALUES:
${valuesDesc || 'None defined'}

WORLDVIEW:
${worldviewDesc || 'None defined'}
Communication philosophy: ${identityCore.worldview.communication_philosophy || 'None'}

CORE TENSIONS:
${tensionsDesc || 'None defined'}

RECOGNITION MARKERS:
${markersDesc || 'None defined'}

---

OUTPUT TO EVALUATE:
${output.substring(0, 3000)}`,
      },
    ], { temperature: 0 })

    const clamp = (n: number) => Math.max(0, Math.min(1, n))

    const va = clamp(result.value_alignment)
    const wc = clamp(result.worldview_consistency)
    const rmp = clamp(result.recognition_marker_presence)
    const tb = clamp(result.tension_balance)

    // Weighted average: recognition markers and values matter most
    const overall = 0.35 * va + 0.2 * wc + 0.3 * rmp + 0.15 * tb

    return {
      overall,
      value_alignment: va,
      worldview_consistency: wc,
      recognition_marker_presence: rmp,
      tension_balance: tb,
    }
    } catch (err) {
      // Graceful degradation: return conservative middle scores
      return {
        overall: 0.65,
        value_alignment: 0.65,
        worldview_consistency: 0.65,
        recognition_marker_presence: 0.65,
        tension_balance: 0.65,
        degraded: true,
      }
    }
  }
}

import { v4 as uuid } from 'uuid'
import type { IDocumentStore } from '../../storage/src/index.js'
import type { DriftEvent } from '../../schema/src/index.js'
import { DriftEventSchema } from '../../schema/src/index.js'

const COLLECTION = 'drift_events'

export class DriftTracker {
  constructor(private docs: IDocumentStore) {}

  record(input: Omit<DriftEvent, 'id' | 'timestamp'>): DriftEvent {
    const event: DriftEvent = DriftEventSchema.parse({
      id: `de-${uuid()}`,
      ...input,
      timestamp: new Date().toISOString(),
    })

    this.docs.put(COLLECTION, event.id, event)
    return event
  }

  getHistory(
    entityId: string,
    traitName: string,
    opts?: { after?: string; before?: string; limit?: number },
  ): DriftEvent[] {
    let events = this.docs
      .list(COLLECTION, { entity_id: entityId, trait_name: traitName })
      .map(d => DriftEventSchema.parse(d))

    if (opts?.after) {
      events = events.filter(e => e.timestamp > opts.after!)
    }
    if (opts?.before) {
      events = events.filter(e => e.timestamp < opts.before!)
    }

    // Sort descending by timestamp
    events.sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    const limit = opts?.limit ?? 50
    return events.slice(0, limit)
  }

  getValueAt(entityId: string, traitName: string, timestamp: string): number | null {
    const events = this.docs
      .list(COLLECTION, { entity_id: entityId, trait_name: traitName })
      .map(d => DriftEventSchema.parse(d))
      .filter(e => e.timestamp <= timestamp)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))

    if (events.length === 0) return null
    return events[0].new_value
  }

  getVelocity(
    entityId: string,
    traitName: string,
    windowHours: number = 168,
  ): { velocity: number; direction: 'rising' | 'falling' | 'stable'; samples: number } {
    const now = new Date()
    const windowStart = new Date(now.getTime() - windowHours * 3600 * 1000).toISOString()

    const events = this.docs
      .list(COLLECTION, { entity_id: entityId, trait_name: traitName })
      .map(d => DriftEventSchema.parse(d))
      .filter(e => e.timestamp >= windowStart)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    if (events.length === 0) {
      return { velocity: 0, direction: 'stable', samples: 0 }
    }

    const totalDelta = events.reduce((sum, e) => sum + e.delta, 0)
    const firstTime = new Date(events[0].timestamp).getTime()
    const lastTime = new Date(events[events.length - 1].timestamp).getTime()
    const spanHours = (lastTime - firstTime) / (3600 * 1000)

    const velocity = spanHours > 0 ? totalDelta / spanHours : totalDelta
    const direction: 'rising' | 'falling' | 'stable' =
      Math.abs(velocity) < 0.001 ? 'stable' : velocity > 0 ? 'rising' : 'falling'

    return { velocity, direction, samples: events.length }
  }

  getTrajectory(
    entityId: string,
    traitName: string,
    points: number = 20,
  ): Array<{ timestamp: string; value: number }> {
    const events = this.docs
      .list(COLLECTION, { entity_id: entityId, trait_name: traitName })
      .map(d => DriftEventSchema.parse(d))
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp))

    if (events.length === 0) return []
    if (events.length <= points) {
      return events.map(e => ({ timestamp: e.timestamp, value: e.new_value }))
    }

    // Evenly sample `points` entries from the events array
    const result: Array<{ timestamp: string; value: number }> = []
    const step = (events.length - 1) / (points - 1)

    for (let i = 0; i < points; i++) {
      const idx = Math.round(i * step)
      const e = events[idx]
      result.push({ timestamp: e.timestamp, value: e.new_value })
    }

    return result
  }
}

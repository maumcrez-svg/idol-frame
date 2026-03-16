import Database from 'better-sqlite3'
import type { IPerformanceLog, PerformanceLogEntry } from './index.js'

export class SQLitePerformanceLog implements IPerformanceLog {
  private db: Database.Database
  private initialized = false

  constructor(db: Database.Database) {
    this.db = db
  }

  private ensureTable(): void {
    if (this.initialized) return
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS performance_log (
        performance_id TEXT PRIMARY KEY,
        entity_id TEXT NOT NULL,
        decision_frame_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        content TEXT NOT NULL,
        raw_llm_output TEXT NOT NULL,
        identity_score REAL,
        voice_score REAL,
        quality_score REAL,
        guardrail_passed INTEGER NOT NULL DEFAULT 1,
        published INTEGER NOT NULL DEFAULT 0,
        timestamp TEXT NOT NULL
      )
    `)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_perf_entity ON performance_log(entity_id)`)
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_perf_ts ON performance_log(timestamp)`)
    this.initialized = true
  }

  append(entry: PerformanceLogEntry): void {
    this.ensureTable()
    this.db.prepare(`
      INSERT INTO performance_log
        (performance_id, entity_id, decision_frame_id, mode, content, raw_llm_output,
         identity_score, voice_score, quality_score, guardrail_passed, published, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      entry.performance_id,
      entry.entity_id,
      entry.decision_frame_id,
      entry.mode,
      entry.content,
      entry.raw_llm_output,
      entry.identity_score,
      entry.voice_score,
      entry.quality_score,
      entry.guardrail_passed ? 1 : 0,
      entry.published ? 1 : 0,
      entry.timestamp,
    )
  }

  getByEntity(entityId: string, limit = 50): PerformanceLogEntry[] {
    this.ensureTable()
    const rows = this.db.prepare(
      `SELECT * FROM performance_log WHERE entity_id = ? ORDER BY timestamp DESC LIMIT ?`,
    ).all(entityId, limit) as any[]
    return rows.map(this.rowToEntry)
  }

  getById(performanceId: string): PerformanceLogEntry | null {
    this.ensureTable()
    const row = this.db.prepare(
      `SELECT * FROM performance_log WHERE performance_id = ?`,
    ).get(performanceId) as any | undefined
    return row ? this.rowToEntry(row) : null
  }

  query(filter: { entityId?: string; after?: string; before?: string; minScore?: number }): PerformanceLogEntry[] {
    this.ensureTable()
    const conditions: string[] = []
    const params: any[] = []

    if (filter.entityId) {
      conditions.push('entity_id = ?')
      params.push(filter.entityId)
    }
    if (filter.after) {
      conditions.push('timestamp > ?')
      params.push(filter.after)
    }
    if (filter.before) {
      conditions.push('timestamp < ?')
      params.push(filter.before)
    }
    if (filter.minScore != null) {
      conditions.push('quality_score >= ?')
      params.push(filter.minScore)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = this.db.prepare(
      `SELECT * FROM performance_log ${where} ORDER BY timestamp DESC`,
    ).all(...params) as any[]
    return rows.map(this.rowToEntry)
  }

  private rowToEntry(row: any): PerformanceLogEntry {
    return {
      performance_id: row.performance_id,
      entity_id: row.entity_id,
      decision_frame_id: row.decision_frame_id,
      mode: row.mode,
      content: row.content,
      raw_llm_output: row.raw_llm_output,
      identity_score: row.identity_score,
      voice_score: row.voice_score,
      quality_score: row.quality_score,
      guardrail_passed: row.guardrail_passed === 1,
      published: row.published === 1,
      timestamp: row.timestamp,
    }
  }
}

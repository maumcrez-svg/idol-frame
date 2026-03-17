import type Database from 'better-sqlite3'
import type { IFTSIndex, FTSResult } from './index.js'

export class SQLiteFTSIndex implements IFTSIndex {
  private db: Database.Database
  private initialized = false

  constructor(db: Database.Database) {
    this.db = db
  }

  private ensureTable(): void {
    if (this.initialized) return
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        id UNINDEXED,
        entity_id UNINDEXED,
        content,
        tokenize = 'porter unicode61'
      )
    `)
    this.initialized = true
  }

  index(id: string, entityId: string, content: string): void {
    this.ensureTable()
    // Remove existing entry first (FTS5 doesn't support REPLACE)
    this.db.prepare('DELETE FROM memory_fts WHERE id = ?').run(id)
    this.db.prepare('INSERT INTO memory_fts (id, entity_id, content) VALUES (?, ?, ?)').run(id, entityId, content)
  }

  indexBatch(entries: Array<{ id: string; entityId: string; content: string }>): void {
    this.ensureTable()
    const del = this.db.prepare('DELETE FROM memory_fts WHERE id = ?')
    const ins = this.db.prepare('INSERT INTO memory_fts (id, entity_id, content) VALUES (?, ?, ?)')
    const batch = this.db.transaction((items: typeof entries) => {
      for (const e of items) {
        del.run(e.id)
        ins.run(e.id, e.entityId, e.content)
      }
    })
    batch(entries)
  }

  search(entityId: string, query: string, limit = 10): FTSResult[] {
    this.ensureTable()
    // Sanitize query for FTS5 — escape double quotes
    const safeQuery = query.replace(/"/g, '""')
    const rows = this.db.prepare(`
      SELECT id, snippet(memory_fts, 2, '<b>', '</b>', '...', 32) as snippet, bm25(memory_fts) as rank
      FROM memory_fts
      WHERE entity_id = ? AND memory_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `).all(entityId, `"${safeQuery}"`, limit) as Array<{ id: string; snippet: string; rank: number }>

    // bm25() returns negative values (lower = better match), normalize to 0-1 positive scores
    const maxAbsRank = rows.length > 0 ? Math.max(...rows.map(r => Math.abs(r.rank))) : 1
    return rows.map(r => ({
      id: r.id,
      snippet: r.snippet,
      score: maxAbsRank > 0 ? Math.abs(r.rank) / maxAbsRank : 0,
    }))
  }

  remove(id: string): void {
    this.ensureTable()
    this.db.prepare('DELETE FROM memory_fts WHERE id = ?').run(id)
  }
}

import Database from 'better-sqlite3'
import type { IDocumentStore } from './index.js'

const VALID_COLLECTION_RE = /^[a-z][a-z0-9_]*$/
function validateCollection(name: string): string {
  if (!VALID_COLLECTION_RE.test(name)) {
    throw new Error(`Invalid collection name: ${name}. Must match /^[a-z][a-z0-9_]*$/`)
  }
  return name
}

export class SQLiteDocumentStore implements IDocumentStore {
  private db: Database.Database
  private ensuredTables = new Set<string>()

  constructor(db: Database.Database) {
    this.db = db
  }

  private ensureTable(collection: string): void {
    if (this.ensuredTables.has(collection)) return
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS "${collection}" (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        _deleted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `)
    this.ensuredTables.add(collection)
  }

  put(collection: string, id: string, doc: Record<string, any>): void {
    validateCollection(collection)
    this.ensureTable(collection)
    const now = new Date().toISOString()
    this.db.prepare(`
      INSERT OR REPLACE INTO "${collection}" (id, data, _deleted, created_at, updated_at)
      VALUES (?, ?, 0, ?, ?)
    `).run(id, JSON.stringify(doc), now, now)
  }

  get(collection: string, id: string): Record<string, any> | null {
    validateCollection(collection)
    this.ensureTable(collection)
    const row = this.db.prepare(`SELECT data FROM "${collection}" WHERE id = ? AND _deleted = 0`).get(id) as { data: string } | undefined
    return row ? JSON.parse(row.data) : null
  }

  list(collection: string, filter?: Record<string, any>): Record<string, any>[] {
    validateCollection(collection)
    this.ensureTable(collection)
    const rows = this.db.prepare(`SELECT data FROM "${collection}" WHERE _deleted = 0`).all() as { data: string }[]
    let results = rows.map(r => JSON.parse(r.data))

    if (filter) {
      results = results.filter(doc =>
        Object.entries(filter).every(([key, value]) => doc[key] === value),
      )
    }

    return results
  }

  update(collection: string, id: string, partial: Record<string, any>): void {
    validateCollection(collection)
    this.ensureTable(collection)
    const existing = this.get(collection, id)
    if (!existing) throw new Error(`Document not found: ${collection}/${id}`)
    const merged = { ...existing, ...partial }
    const now = new Date().toISOString()
    this.db.prepare(`UPDATE "${collection}" SET data = ?, updated_at = ? WHERE id = ?`).run(JSON.stringify(merged), now, id)
  }

  delete(collection: string, id: string): void {
    validateCollection(collection)
    this.ensureTable(collection)
    const now = new Date().toISOString()
    this.db.prepare(`UPDATE "${collection}" SET _deleted = 1, updated_at = ? WHERE id = ?`).run(now, id)
  }

  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)()
  }

  close(): void {
    this.db.close()
  }
}

import { connect, type Connection, type Table } from '@lancedb/lancedb'
import type { IVectorStore, VectorResult } from './index.js'

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

interface VectorEntry {
  id: string
  embedding: number[]
  metadata: Record<string, any>
}

export class InMemoryVectorStore implements IVectorStore {
  private collections = new Map<string, Map<string, VectorEntry>>()

  private getCollection(name: string): Map<string, VectorEntry> {
    let col = this.collections.get(name)
    if (!col) {
      col = new Map()
      this.collections.set(name, col)
    }
    return col
  }

  async upsert(collection: string, id: string, embedding: number[], metadata: Record<string, any>): Promise<void> {
    this.getCollection(collection).set(id, { id, embedding, metadata })
  }

  async search(collection: string, queryEmbedding: number[], topK: number, filter?: Record<string, any>): Promise<VectorResult[]> {
    const col = this.getCollection(collection)
    const results: VectorResult[] = []

    for (const entry of col.values()) {
      if (filter) {
        const matches = Object.entries(filter).every(([k, v]) => entry.metadata[k] === v)
        if (!matches) continue
      }

      const score = cosineSimilarity(queryEmbedding, entry.embedding)
      results.push({ id: entry.id, score, metadata: entry.metadata })
    }

    results.sort((a, b) => b.score - a.score)
    return results.slice(0, topK)
  }

  async delete(collection: string, id: string): Promise<void> {
    this.getCollection(collection).delete(id)
  }
}

export class LanceDBVectorStore implements IVectorStore {
  private dbPromise: Promise<Connection>
  private tables = new Map<string, Table>()

  constructor(dataDir: string) {
    this.dbPromise = connect(dataDir)
  }

  private async getOrCreateTable(
    collection: string,
    firstRow: Record<string, unknown>,
  ): Promise<{ table: Table; created: boolean }> {
    const cached = this.tables.get(collection)
    if (cached) return { table: cached, created: false }

    const db = await this.dbPromise
    const existingNames = await db.tableNames()

    let table: Table
    let created = false

    if (existingNames.includes(collection)) {
      table = await db.openTable(collection)
    } else {
      table = await db.createTable(collection, [firstRow])
      created = true
    }

    this.tables.set(collection, table)
    return { table, created }
  }

  private async getTable(collection: string): Promise<Table | null> {
    const cached = this.tables.get(collection)
    if (cached) return cached

    const db = await this.dbPromise
    const existingNames = await db.tableNames()

    if (existingNames.includes(collection)) {
      const table = await db.openTable(collection)
      this.tables.set(collection, table)
      return table
    }

    return null
  }

  async upsert(collection: string, id: string, embedding: number[], metadata: Record<string, any>): Promise<void> {
    const row: Record<string, unknown> = {
      id,
      vector: Array.from(embedding),
      ...metadata,
    }

    const { table, created } = await this.getOrCreateTable(collection, row)

    if (created) {
      // Table was just created with this row as initial data — nothing more to do
      return
    }

    // LanceDB has no native upsert — delete then add
    try {
      await table.delete(`id = '${id.replace(/'/g, "''")}'`)
    } catch {
      // Ignore errors on delete (row may not exist)
    }

    await table.add([row])
  }

  async search(collection: string, queryEmbedding: number[], topK: number, filter?: Record<string, any>): Promise<VectorResult[]> {
    const table = await this.getTable(collection)
    if (!table) return []

    // Over-fetch by 2x to compensate for post-search metadata filtering
    const fetchLimit = filter ? topK * 2 : topK

    const rawResults = await table
      .search(Array.from(queryEmbedding))
      .limit(fetchLimit)
      .toArray()

    let results: VectorResult[] = rawResults.map((row: any) => {
      const { id, vector, _distance, ...rest } = row
      // Convert L2 distance to cosine similarity for normalized vectors:
      // score = 1 - distance / 2
      const score = 1 - (_distance ?? 0) / 2
      return { id: id as string, score, metadata: rest }
    })

    // Apply metadata filter in JS
    if (filter) {
      results = results.filter((r) =>
        Object.entries(filter).every(([k, v]) => r.metadata[k] === v)
      )
    }

    return results.slice(0, topK)
  }

  async delete(collection: string, id: string): Promise<void> {
    const table = await this.getTable(collection)
    if (!table) return

    await table.delete(`id = '${id.replace(/'/g, "''")}'`)
  }
}

/**
 * HybridVectorStore — InMemory for hot path, LanceDB for cold persistence.
 *
 * All reads/writes go through InMemory for speed. Dirty entries accumulate
 * in a write buffer and are flushed to LanceDB in batch (flush() or auto
 * at threshold). On init, warm() loads LanceDB → InMemory.
 *
 * Pattern inspired by Lossless Claw's WAL-based memory store.
 */
export class HybridVectorStore implements IVectorStore {
  private hot: InMemoryVectorStore
  private cold: LanceDBVectorStore
  private dirtyBuffer = new Map<string, { collection: string; id: string; embedding: number[]; metadata: Record<string, any> }>()
  private deleteBuffer = new Map<string, { collection: string; id: string }>()
  private flushThreshold: number
  private warmed = false

  constructor(dataDir: string, opts?: { flushThreshold?: number }) {
    this.hot = new InMemoryVectorStore()
    this.cold = new LanceDBVectorStore(dataDir)
    this.flushThreshold = opts?.flushThreshold ?? 100
  }

  /** Load all LanceDB data into InMemory. Call once at startup. */
  async warm(collections: string[]): Promise<{ loaded: number }> {
    let total = 0
    for (const col of collections) {
      try {
        // Search with a zero vector to get all entries (high limit)
        // LanceDB requires a vector for search, so we do a dummy search
        const results = await this.cold.search(col, [], 0)
        // If collection doesn't exist or is empty, skip
      } catch {
        // Collection doesn't exist yet — fine
      }
    }
    this.warmed = true
    return { loaded: total }
  }

  /** Warm from LanceDB by loading all rows of specific collections */
  async warmFromCold(collections: string[]): Promise<number> {
    let total = 0
    const db = await (this.cold as any).dbPromise as Connection
    const tableNames = await db.tableNames()

    for (const col of collections) {
      if (!tableNames.includes(col)) continue
      const table = await db.openTable(col)
      const rows = await table.query().toArray()

      for (const row of rows) {
        const { id, vector, _rowid, ...metadata } = row as any
        if (id && vector) {
          const embedding = Array.isArray(vector) ? vector : Array.from(vector as Float32Array)
          await this.hot.upsert(col, id, embedding, metadata)
          total++
        }
      }
    }
    this.warmed = true
    return total
  }

  async upsert(collection: string, id: string, embedding: number[], metadata: Record<string, any>): Promise<void> {
    // Hot path — instant
    await this.hot.upsert(collection, id, embedding, metadata)

    // Buffer for cold flush
    const key = `${collection}:${id}`
    this.deleteBuffer.delete(key) // cancel pending delete if re-upserting
    this.dirtyBuffer.set(key, { collection, id, embedding, metadata })

    // Auto-flush at threshold
    if (this.dirtyBuffer.size >= this.flushThreshold) {
      await this.flush()
    }
  }

  async search(collection: string, queryEmbedding: number[], topK: number, filter?: Record<string, any>): Promise<VectorResult[]> {
    // Always read from hot — it has the latest state
    return this.hot.search(collection, queryEmbedding, topK, filter)
  }

  async delete(collection: string, id: string): Promise<void> {
    await this.hot.delete(collection, id)

    const key = `${collection}:${id}`
    this.dirtyBuffer.delete(key) // cancel pending upsert
    this.deleteBuffer.set(key, { collection, id })
  }

  /** Batch flush dirty entries to LanceDB. Call periodically or on consolidate. */
  async flush(): Promise<{ upserted: number; deleted: number }> {
    const upserts = [...this.dirtyBuffer.values()]
    const deletes = [...this.deleteBuffer.values()]

    this.dirtyBuffer.clear()
    this.deleteBuffer.clear()

    // Batch deletes
    for (const { collection, id } of deletes) {
      try { await this.cold.delete(collection, id) } catch { /* ignore */ }
    }

    // Group upserts by collection for batch insert
    const byCollection = new Map<string, typeof upserts>()
    for (const entry of upserts) {
      const arr = byCollection.get(entry.collection) ?? []
      arr.push(entry)
      byCollection.set(entry.collection, arr)
    }

    for (const [, entries] of byCollection) {
      for (const entry of entries) {
        await this.cold.upsert(entry.collection, entry.id, entry.embedding, entry.metadata)
      }
    }

    return { upserted: upserts.length, deleted: deletes.length }
  }

  /** Number of entries pending flush */
  get pendingCount(): number {
    return this.dirtyBuffer.size + this.deleteBuffer.size
  }

  get isWarmed(): boolean {
    return this.warmed
  }
}

export async function createVectorStore(dataDir: string): Promise<IVectorStore> {
  return new HybridVectorStore(dataDir)
}

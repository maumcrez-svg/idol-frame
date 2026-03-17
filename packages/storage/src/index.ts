import { mkdirSync } from 'fs'
import { join } from 'path'
import Database from 'better-sqlite3'
import { SQLiteDocumentStore } from './document-store.js'
import { createVectorStore } from './vector-store.js'
import { SQLitePerformanceLog } from './performance-log.js'
import { SQLiteFTSIndex } from './fts-index.js'

export interface IDocumentStore {
  put(collection: string, id: string, doc: Record<string, any>): void
  get(collection: string, id: string): Record<string, any> | null
  list(collection: string, filter?: Record<string, any>): Record<string, any>[]
  update(collection: string, id: string, partial: Record<string, any>): void
  delete(collection: string, id: string): void
  transaction<T>(fn: () => T): T
}

export interface VectorResult {
  id: string
  score: number
  metadata: Record<string, any>
}

export interface IVectorStore {
  upsert(collection: string, id: string, embedding: number[], metadata: Record<string, any>): Promise<void>
  search(collection: string, queryEmbedding: number[], topK: number, filter?: Record<string, any>): Promise<VectorResult[]>
  delete(collection: string, id: string): Promise<void>
}

export interface PerformanceLogEntry {
  performance_id: string
  entity_id: string
  decision_frame_id: string
  mode: string
  content: string
  raw_llm_output: string
  identity_score: number | null
  voice_score: number | null
  quality_score: number | null
  guardrail_passed: boolean
  published: boolean
  timestamp: string
}

export interface IPerformanceLog {
  append(entry: PerformanceLogEntry): void
  getByEntity(entityId: string, limit?: number): PerformanceLogEntry[]
  getById(performanceId: string): PerformanceLogEntry | null
  query(filter: { entityId?: string; after?: string; before?: string; minScore?: number }): PerformanceLogEntry[]
}

export interface FTSResult {
  id: string
  snippet: string
  score: number
}

export interface IFTSIndex {
  index(id: string, entityId: string, content: string): void
  indexBatch(entries: Array<{ id: string; entityId: string; content: string }>): void
  search(entityId: string, query: string, limit?: number): FTSResult[]
  remove(id: string): void
}

export interface Storage {
  documents: IDocumentStore
  vectors: IVectorStore
  performanceLog: IPerformanceLog
  fts: IFTSIndex
}

export async function createStorage(config?: { dataDir?: string }): Promise<Storage> {
  const dataDir = config?.dataDir ?? './data'
  mkdirSync(dataDir, { recursive: true })

  const dbPath = join(dataDir, 'idol-frame.db')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  const documents = new SQLiteDocumentStore(db)
  const vectors = await createVectorStore(join(dataDir, 'vectors'))
  const performanceLog = new SQLitePerformanceLog(db)
  const fts = new SQLiteFTSIndex(db)

  return { documents, vectors, performanceLog, fts }
}

export { SQLiteDocumentStore } from './document-store.js'
export { InMemoryVectorStore, LanceDBVectorStore, HybridVectorStore, createVectorStore } from './vector-store.js'
export { SQLitePerformanceLog } from './performance-log.js'
export { SQLiteFTSIndex } from './fts-index.js'

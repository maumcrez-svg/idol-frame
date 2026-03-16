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

export async function createVectorStore(_dataDir: string): Promise<IVectorStore> {
  // In-memory vector store — swappable for LanceDB/Chroma without interface changes
  return new InMemoryVectorStore()
}

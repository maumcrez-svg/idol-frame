import type { IDocumentStore } from '../storage/src/index.js'

export class MockDocumentStore implements IDocumentStore {
  private store = new Map<string, Map<string, Record<string, any>>>()

  put(collection: string, id: string, doc: Record<string, any>): void {
    if (!this.store.has(collection)) this.store.set(collection, new Map())
    this.store.get(collection)!.set(id, { ...doc })
  }

  get(collection: string, id: string): Record<string, any> | null {
    return this.store.get(collection)?.get(id) ?? null
  }

  list(collection: string, filter?: Record<string, any>): Record<string, any>[] {
    const col = this.store.get(collection)
    if (!col) return []
    let results = Array.from(col.values())
    if (filter) {
      results = results.filter(doc => {
        return Object.entries(filter).every(([key, value]) => doc[key] === value)
      })
    }
    return results
  }

  update(collection: string, id: string, partial: Record<string, any>): void {
    const existing = this.get(collection, id)
    if (existing) {
      this.put(collection, id, { ...existing, ...partial })
    }
  }

  delete(collection: string, id: string): void {
    this.store.get(collection)?.delete(id)
  }

  transaction<T>(fn: () => T): T {
    return fn()
  }

  clear(): void {
    this.store.clear()
  }
}

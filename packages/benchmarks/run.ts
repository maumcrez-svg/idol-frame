/**
 * Idol Frame Memory Benchmark
 *
 * Tests latency of retrieve/grep/consolidate at 100, 1k, 10k memories.
 * Run: npx tsx packages/benchmarks/run.ts
 * Output: table + JSON results to packages/benchmarks/results.json
 */

import Database from 'better-sqlite3'
import { v4 as uuid } from 'uuid'
import { writeFileSync, mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { SQLiteDocumentStore } from '../storage/src/document-store.js'
import { InMemoryVectorStore, HybridVectorStore } from '../storage/src/vector-store.js'
import { SQLiteFTSIndex } from '../storage/src/fts-index.js'
import { MemoryManager } from '../state/src/memory-manager.js'
import { MemoryConsolidator } from '../state/src/memory-consolidator.js'
import { MemoryRetriever } from '../cognition/src/memory-retriever.js'
import type { LLMProvider } from '../llm/src/types.js'
import type { IVectorStore } from '../storage/src/index.js'

// ── Helpers ──────────────────────────────────────────────────────────

const ENTITY_ID = 'e-bench-001'
const EMBED_DIM = 64

function randomEmbedding(): number[] {
  const v = Array.from({ length: EMBED_DIM }, () => Math.random() * 2 - 1)
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
  return v.map(x => x / norm)
}

const TOPICS = [
  'SOL price prediction bullish momentum',
  'ETH merge validator staking rewards',
  'Bitcoin halving cycle analysis',
  'DeFi yield farming strategy comparison',
  'NFT market crash recovery signals',
  'Layer 2 rollup scaling throughput',
  'Federal Reserve rate decision impact',
  'AI agent autonomous trading risks',
  'Stablecoin depeg contagion risk',
  'Gaming token economy sustainability',
]

const NOTE_TYPES = ['[opinion]', '[event]', '[call]', '[bit]', '[callback]', '[thread]']

function generateMemoryContent(index: number): string {
  const topic = TOPICS[index % TOPICS.length]
  const prefix = NOTE_TYPES[index % NOTE_TYPES.length]
  const detail = `Entry #${index}: ${topic}. Observation at data point ${Math.random().toFixed(4)} with confidence level ${(0.5 + Math.random() * 0.5).toFixed(2)}.`
  return `${prefix} ${detail}`
}

function createMockLLM(): LLMProvider {
  return {
    complete: async () => 'Consolidated summary of memory entries covering key events and opinions.',
    completeJSON: async () => ({}),
    embed: async () => ({ embedding: randomEmbedding(), token_count: 10 }),
    embedBatch: async (texts: string[]) => texts.map(() => ({ embedding: randomEmbedding(), token_count: 10 })),
  }
}

interface BenchResult {
  operation: string
  scale: number
  runs: number
  avg_ms: number
  min_ms: number
  max_ms: number
  p50_ms: number
  p95_ms: number
}

async function measure(label: string, fn: () => Promise<void> | void, runs = 10): Promise<number[]> {
  const times: number[] = []
  // warmup
  await fn()
  for (let i = 0; i < runs; i++) {
    const start = performance.now()
    await fn()
    times.push(performance.now() - start)
  }
  return times
}

function stats(times: number[]): { avg: number; min: number; max: number; p50: number; p95: number } {
  const sorted = [...times].sort((a, b) => a - b)
  return {
    avg: times.reduce((s, t) => s + t, 0) / times.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
  }
}

// ── Benchmark Runner ─────────────────────────────────────────────────

async function benchmarkAtScale(scale: number, vectorBackend: 'inmemory' | 'hybrid' = 'inmemory'): Promise<{ results: BenchResult[]; cleanup?: () => void }> {
  console.log(`\n${'='.repeat(60)}`)
  console.log(`  SCALE: ${scale.toLocaleString()} memories | backend: ${vectorBackend}`)
  console.log(`${'='.repeat(60)}`)

  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')

  const docs = new SQLiteDocumentStore(db)
  let vectors: IVectorStore
  let tmpDir: string | undefined

  if (vectorBackend === 'hybrid') {
    tmpDir = mkdtempSync(join(tmpdir(), 'idol-bench-'))
    vectors = new HybridVectorStore(join(tmpDir, 'vectors'), { flushThreshold: scale + 100 }) // don't auto-flush during seed
  } else {
    vectors = new InMemoryVectorStore()
  }

  const fts = new SQLiteFTSIndex(db)
  const llm = createMockLLM()

  const memoryManager = new MemoryManager(docs, vectors, llm, fts)
  const consolidator = new MemoryConsolidator(docs, vectors, llm, memoryManager, {
    fresh_tail_count: 20,
    leaf_chunk_size: 8,
    condensation_threshold: 5,
  })
  const retriever = new MemoryRetriever(vectors, memoryManager, llm, fts)
  retriever.setConsolidator(consolidator)

  // ── Seed memories ──
  console.log(`  Seeding ${scale} memories...`)
  const seedStart = performance.now()

  // Batch store to avoid measuring store() individually at large scale
  const baseTime = new Date('2025-01-01T00:00:00Z').getTime()
  for (let i = 0; i < scale; i++) {
    const content = generateMemoryContent(i)
    const importance = i % 10 === 0 ? 0.8 + Math.random() * 0.2 : 0.3 + Math.random() * 0.4
    await memoryManager.store({
      entity_id: ENTITY_ID,
      content,
      context: `batch-seed-${i}`,
      importance,
    })
  }

  const seedMs = performance.now() - seedStart
  console.log(`  Seeded in ${seedMs.toFixed(0)}ms (${(seedMs / scale).toFixed(2)}ms/entry)`)

  const results: BenchResult[] = []
  const RUNS = scale >= 10000 ? 5 : 10

  // ── Benchmark: retrieve (hybrid vector+FTS) ──
  console.log('  Benchmarking retrieve()...')
  const retrieveTimes = await measure('retrieve', async () => {
    await retriever.retrieve(ENTITY_ID, 'SOL bullish prediction price', 10)
  }, RUNS)
  const rStats = stats(retrieveTimes)
  results.push({
    operation: 'retrieve (hybrid)',
    scale,
    runs: RUNS,
    avg_ms: +rStats.avg.toFixed(2),
    min_ms: +rStats.min.toFixed(2),
    max_ms: +rStats.max.toFixed(2),
    p50_ms: +rStats.p50.toFixed(2),
    p95_ms: +rStats.p95.toFixed(2),
  })

  // ── Benchmark: retrieve without FTS (vector-only, backward compat) ──
  console.log('  Benchmarking retrieve (vector-only)...')
  const retrieverNoFts = new MemoryRetriever(vectors, memoryManager, llm)
  const retrieveNoFtsTimes = await measure('retrieve-no-fts', async () => {
    await retrieverNoFts.retrieve(ENTITY_ID, 'ETH staking rewards', 10)
  }, RUNS)
  const rnfStats = stats(retrieveNoFtsTimes)
  results.push({
    operation: 'retrieve (vector-only)',
    scale,
    runs: RUNS,
    avg_ms: +rnfStats.avg.toFixed(2),
    min_ms: +rnfStats.min.toFixed(2),
    max_ms: +rnfStats.max.toFixed(2),
    p50_ms: +rnfStats.p50.toFixed(2),
    p95_ms: +rnfStats.p95.toFixed(2),
  })

  // ── Benchmark: grep (FTS5 keyword search) ──
  console.log('  Benchmarking grep()...')
  const grepTimes = await measure('grep', () => {
    retriever.grep(ENTITY_ID, 'bullish momentum', 20)
  }, RUNS)
  const gStats = stats(grepTimes)
  results.push({
    operation: 'grep (FTS5)',
    scale,
    runs: RUNS,
    avg_ms: +gStats.avg.toFixed(2),
    min_ms: +gStats.min.toFixed(2),
    max_ms: +gStats.max.toFixed(2),
    p50_ms: +gStats.p50.toFixed(2),
    p95_ms: +gStats.p95.toFixed(2),
  })

  // ── Benchmark: consolidate ──
  console.log('  Benchmarking consolidate()...')
  const consolidateTimes = await measure('consolidate', async () => {
    // Reset consolidation state for each run by creating a fresh consolidator
    // that shares the same data but has fresh state
    await consolidator.consolidate(ENTITY_ID)
  }, Math.min(RUNS, 3)) // fewer runs — consolidate is heavier
  const cStats = stats(consolidateTimes)
  results.push({
    operation: 'consolidate',
    scale,
    runs: Math.min(RUNS, 3),
    avg_ms: +cStats.avg.toFixed(2),
    min_ms: +cStats.min.toFixed(2),
    max_ms: +cStats.max.toFixed(2),
    p50_ms: +cStats.p50.toFixed(2),
    p95_ms: +cStats.p95.toFixed(2),
  })

  // ── Benchmark: getNodes ──
  console.log('  Benchmarking getNodes()...')
  const nodesTimes = await measure('getNodes', () => {
    consolidator.getNodes(ENTITY_ID)
  }, RUNS)
  const nStats = stats(nodesTimes)
  results.push({
    operation: 'getNodes',
    scale,
    runs: RUNS,
    avg_ms: +nStats.avg.toFixed(2),
    min_ms: +nStats.min.toFixed(2),
    max_ms: +nStats.max.toFixed(2),
    p50_ms: +nStats.p50.toFixed(2),
    p95_ms: +nStats.p95.toFixed(2),
  })

  // ── Benchmark: expand (if nodes exist) ──
  const nodes = consolidator.getNodes(ENTITY_ID)
  if (nodes.length > 0) {
    console.log('  Benchmarking expand()...')
    const expandTimes = await measure('expand', () => {
      consolidator.expand(nodes[0].id)
    }, RUNS)
    const eStats = stats(expandTimes)
    results.push({
      operation: 'expand',
      scale,
      runs: RUNS,
      avg_ms: +eStats.avg.toFixed(2),
      min_ms: +eStats.min.toFixed(2),
      max_ms: +eStats.max.toFixed(2),
      p50_ms: +eStats.p50.toFixed(2),
      p95_ms: +eStats.p95.toFixed(2),
    })
  }

  // ── Benchmark: store (single entry) ──
  console.log('  Benchmarking store()...')
  let storeIdx = scale
  const storeTimes = await measure('store', async () => {
    await memoryManager.store({
      entity_id: ENTITY_ID,
      content: generateMemoryContent(storeIdx++),
      context: 'bench-store',
      importance: 0.5,
    })
  }, RUNS)
  const sStats = stats(storeTimes)
  results.push({
    operation: 'store (single)',
    scale,
    runs: RUNS,
    avg_ms: +sStats.avg.toFixed(2),
    min_ms: +sStats.min.toFixed(2),
    max_ms: +sStats.max.toFixed(2),
    p50_ms: +sStats.p50.toFixed(2),
    p95_ms: +sStats.p95.toFixed(2),
  })

  // ── Benchmark: fact recall ──
  console.log('  Benchmarking fact recall accuracy...')
  // Store a known fact, then try to retrieve it
  const knownFact = `[opinion] UNIQUE_MARKER_${uuid()}: The market will crash on exactly March 15th 2027 at 3:42 PM.`
  await memoryManager.store({
    entity_id: ENTITY_ID,
    content: knownFact,
    context: 'fact-recall-test',
    importance: 0.9,
  })

  const recallResults = await retriever.retrieve(ENTITY_ID, 'market crash March 2027', 20)
  const grepRecall = retriever.grep(ENTITY_ID, 'UNIQUE_MARKER', 10)

  const vectorRecalled = recallResults.some(r => r.entry.content.includes('UNIQUE_MARKER'))
  const ftsRecalled = grepRecall.some(r => r.entry.content.includes('UNIQUE_MARKER'))

  console.log(`  Fact recall — vector retrieve: ${vectorRecalled ? 'FOUND' : 'MISSED'}, grep: ${ftsRecalled ? 'FOUND' : 'MISSED'}`)

  // ── Benchmark: flush (hybrid only) ──
  const hybrid = vectors as any
  if (hybrid.flush && hybrid.pendingCount > 0) {
    console.log(`  Benchmarking flush() (${hybrid.pendingCount} pending)...`)
    const flushTimes = await measure('flush', async () => {
      // flush() clears the buffer, so only first run does real work
      await hybrid.flush()
    }, 1)
    const fStats = stats(flushTimes)
    results.push({
      operation: `flush (${scale + RUNS + 1} entries)`,
      scale,
      runs: 1,
      avg_ms: +fStats.avg.toFixed(2),
      min_ms: +fStats.min.toFixed(2),
      max_ms: +fStats.max.toFixed(2),
      p50_ms: +fStats.p50.toFixed(2),
      p95_ms: +fStats.p95.toFixed(2),
    })
  }

  db.close()

  const cleanup = tmpDir ? () => { try { rmSync(tmpDir!, { recursive: true, force: true }) } catch {} } : undefined

  // Print table
  console.log('')
  console.log(`  ${'Operation'.padEnd(25)} ${'Avg'.padStart(10)} ${'Min'.padStart(10)} ${'P50'.padStart(10)} ${'P95'.padStart(10)} ${'Max'.padStart(10)}`)
  console.log(`  ${'-'.repeat(75)}`)
  for (const r of results) {
    console.log(`  ${r.operation.padEnd(25)} ${(r.avg_ms + 'ms').padStart(10)} ${(r.min_ms + 'ms').padStart(10)} ${(r.p50_ms + 'ms').padStart(10)} ${(r.p95_ms + 'ms').padStart(10)} ${(r.max_ms + 'ms').padStart(10)}`)
  }

  return { results, cleanup }
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('Idol Frame Memory Benchmark')
  console.log(`Started: ${new Date().toISOString()}`)
  console.log(`Node: ${process.version}`)

  const SCALES = [100, 1_000, 10_000]
  const BACKENDS: Array<'inmemory' | 'hybrid'> = ['inmemory', 'hybrid']
  const allResults: (BenchResult & { backend: string })[] = []
  const cleanups: Array<() => void> = []

  for (const backend of BACKENDS) {
    for (const scale of SCALES) {
      const { results, cleanup } = await benchmarkAtScale(scale, backend)
      allResults.push(...results.map(r => ({ ...r, backend })))
      if (cleanup) cleanups.push(cleanup)
    }
  }

  // Summary: InMemory vs LanceDB side-by-side
  console.log(`\n${'='.repeat(90)}`)
  console.log('  INMEMORY vs HYBRID (InMemory + LanceDB cold) COMPARISON')
  console.log(`${'='.repeat(90)}`)

  const operations = [...new Set(allResults.map(r => r.operation))]
  for (const op of operations) {
    console.log(`\n  ${op}:`)
    console.log(`  ${'Scale'.padEnd(12)} ${'InMemory Avg'.padStart(14)} ${'Hybrid Avg'.padStart(14)} ${'Speedup'.padStart(10)}`)
    for (const scale of SCALES) {
      const im = allResults.find(x => x.operation === op && x.scale === scale && x.backend === 'inmemory')
      const lb = allResults.find(x => x.operation === op && x.scale === scale && x.backend === 'hybrid')
      if (im && lb) {
        const speedup = im.avg_ms / lb.avg_ms
        const label = speedup > 1 ? `${speedup.toFixed(1)}x faster` : `${(1/speedup).toFixed(1)}x slower`
        console.log(`  ${scale.toLocaleString().padEnd(12)} ${(im.avg_ms + 'ms').padStart(14)} ${(lb.avg_ms + 'ms').padStart(14)} ${label.padStart(10)}`)
      } else if (im) {
        console.log(`  ${scale.toLocaleString().padEnd(12)} ${(im.avg_ms + 'ms').padStart(14)} ${'N/A'.padStart(14)}`)
      }
    }
  }

  // Cleanup temp dirs
  for (const fn of cleanups) fn()

  // Write JSON results
  const outputPath = new URL('./results.json', import.meta.url).pathname
  const output = {
    timestamp: new Date().toISOString(),
    node_version: process.version,
    scales: SCALES,
    results: allResults,
  }
  writeFileSync(outputPath, JSON.stringify(output, null, 2))
  console.log(`\nResults saved to: ${outputPath}`)
  console.log(`Finished: ${new Date().toISOString()}`)
}

main().catch(err => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})

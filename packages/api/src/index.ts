import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { v4 as uuid } from 'uuid'

// Config
import { loadConfig } from './config.js'

// Middleware
import { authMiddleware } from './middleware/auth.js'
import { envelopeMiddleware } from './middleware/envelope.js'
import { createErrorHandler } from './middleware/error-handler.js'

// Storage
import { createStorage, type HybridVectorStore } from '../../storage/src/index.js'

// LLM
import { createProvider } from '../../llm/src/index.js'

// Identity
import { EntityStore } from '../../identity/src/entity-store.js'
import { IdentityCoreManager } from '../../identity/src/identity-core-manager.js'
import { VoiceRegistry } from '../../identity/src/voice-registry.js'
import { TraitEngine } from '../../identity/src/trait-engine.js'
import { AestheticRegistry } from '../../identity/src/aesthetic-registry.js'
import { LoreGraph } from '../../identity/src/lore-graph.js'
import { SnapshotManager } from '../../identity/src/snapshot-manager.js'

// State
import { MemoryManager } from '../../state/src/memory-manager.js'
import { MemoryConsolidator } from '../../state/src/memory-consolidator.js'
import { MoodController } from '../../state/src/mood-controller.js'
import { ArcDirector } from '../../state/src/arc-director.js'
import { DriftEngine } from '../../state/src/drift-engine.js'
import { DriftTracker } from '../../state/src/drift-tracker.js'
import { EpochManager } from '../../state/src/epoch-manager.js'
import { WalletManager } from '../../state/src/wallet-manager.js'
import { CoinbaseWalletProvider } from '../../state/src/coinbase-wallet-provider.js'
import { StripeWalletProvider } from '../../state/src/stripe-wallet-provider.js'

// Cognition
import { FrameAssembler } from '../../cognition/src/frame-assembler.js'
import { GuardrailEnforcer } from '../../cognition/src/guardrail-enforcer.js'
import { MemoryRetriever } from '../../cognition/src/memory-retriever.js'
import { DirectiveResolver } from '../../cognition/src/directive-resolver.js'

// Performance
import { Generator } from '../../performance/src/generator.js'
import { PerformanceEvaluator } from '../../performance/src/evaluator.js'
import { Publisher } from '../../performance/src/publisher.js'
import { SideEffectProcessor } from '../../performance/src/side-effect-processor.js'

// Evaluation
import { IdentityEvaluator } from '../../evaluation/src/identity-evaluator.js'
import { VoiceAnalyzer } from '../../evaluation/src/voice-analyzer.js'
import { HealthAggregator } from '../../evaluation/src/health-aggregator.js'
import { GroundingEvaluator } from '../../evaluation/src/grounding-evaluator.js'

// Routes
import { registerEntityRoutes } from './routes/entities.js'
import { registerPerformanceRoutes } from './routes/performances.js'
import { registerVoiceRoutes } from './routes/voice.js'
import { registerIdentityCoreRoutes } from './routes/identity-core.js'
import { registerGuardrailRoutes } from './routes/guardrails.js'
import { registerLoreRoutes } from './routes/lore.js'
import { registerSnapshotRoutes } from './routes/snapshots.js'
import { registerStageRoutes } from './routes/stages.js'
import { registerDirectiveRoutes } from './routes/directives.js'
import { registerArcRoutes } from './routes/arcs.js'
import { registerDriftRuleRoutes } from './routes/drift-rules.js'
import { registerEpochRoutes } from './routes/epochs.js'
import { registerMemoryRoutes } from './routes/memory.js'
import { registerDriftHistoryRoutes } from './routes/drift-history.js'
import { registerWalletRoutes } from './routes/wallets.js'

// Schema
import type { Stage } from '../../schema/src/index.js'

async function main() {
  const config = loadConfig()

  // --- Initialize storage ---
  const storage = await createStorage({ dataDir: config.dataDir })

  // --- Warm hybrid vector store from LanceDB persistence ---
  const hybridVectors = storage.vectors as HybridVectorStore
  if (hybridVectors.warmFromCold) {
    const loaded = await hybridVectors.warmFromCold(['memory_vectors'])
    console.log(`Warmed vector store: ${loaded} vectors loaded from LanceDB`)
  }

  // --- Initialize LLM ---
  const llm = createProvider()

  // --- Initialize identity subsystem ---
  const entityStore = new EntityStore(storage.documents)
  const identityCoreManager = new IdentityCoreManager(storage.documents)
  const voiceRegistry = new VoiceRegistry(storage.documents)
  const traitEngine = new TraitEngine(storage.documents)
  const aestheticRegistry = new AestheticRegistry(storage.documents)
  const loreGraph = new LoreGraph(storage.documents)
  const snapshotManager = new SnapshotManager(
    storage.documents, entityStore, identityCoreManager,
    voiceRegistry, traitEngine, loreGraph, aestheticRegistry,
  )

  // --- Initialize state subsystem ---
  const memoryManager = new MemoryManager(storage.documents, storage.vectors, llm, storage.fts)
  const moodController = new MoodController(storage.documents)
  const arcDirector = new ArcDirector(storage.documents, snapshotManager)
  const driftTracker = new DriftTracker(storage.documents)
  const epochManager = new EpochManager(storage.documents)
  const driftEngine = new DriftEngine(storage.documents, traitEngine, driftTracker, epochManager)

  // --- Initialize wallet subsystem ---
  const walletManager = new WalletManager(storage.documents)
  let stripeProviderRef: StripeWalletProvider | null = null

  // Register Coinbase provider if credentials available
  // Initialize is async — provider reports isReady()=false until complete
  if (process.env.CDP_API_KEY_ID) {
    const coinbaseProvider = new CoinbaseWalletProvider()
    await coinbaseProvider.initialize({
      cdp_api_key_id: process.env.CDP_API_KEY_ID,
      cdp_api_key_secret: process.env.CDP_API_KEY_SECRET,
      cdp_wallet_secret: process.env.CDP_WALLET_SECRET,
      network_id: process.env.COINBASE_NETWORK_ID,
      paymaster_url: process.env.COINBASE_PAYMASTER_URL,
    }).catch(err => console.warn('Coinbase provider init skipped:', err.message))
    walletManager.registerProvider('Coinbase', coinbaseProvider)
  }

  // Register Stripe provider if credentials available
  if (process.env.STRIPE_API_KEY) {
    const stripeProvider = new StripeWalletProvider()
    await stripeProvider.initialize({
      stripe_api_key: process.env.STRIPE_API_KEY,
    }).catch(err => console.warn('Stripe provider init skipped:', err.message))
    walletManager.registerProvider('Stripe', stripeProvider)
    stripeProviderRef = stripeProvider
  }

  // --- Initialize consolidation ---
  const memoryConsolidator = new MemoryConsolidator(storage.documents, storage.vectors, llm, memoryManager)

  // --- Initialize cognition subsystem ---
  const memoryRetriever = new MemoryRetriever(storage.vectors, memoryManager, llm, storage.fts)
  memoryRetriever.setConsolidator(memoryConsolidator)
  const guardrailEnforcer = new GuardrailEnforcer(llm)
  const directiveResolver = new DirectiveResolver(storage.documents)
  const frameAssembler = new FrameAssembler(
    entityStore, identityCoreManager, voiceRegistry, traitEngine, memoryRetriever, storage.documents,
    moodController, directiveResolver, arcDirector, walletManager,
  )

  // --- Initialize performance subsystem ---
  const generator = new Generator(llm)
  const identityEvaluator = new IdentityEvaluator(llm)
  const voiceAnalyzer = new VoiceAnalyzer(llm)
  const groundingEvaluator = new GroundingEvaluator(llm, memoryRetriever, memoryManager)
  const performanceEvaluator = new PerformanceEvaluator(guardrailEnforcer, identityEvaluator, voiceAnalyzer, groundingEvaluator)
  const publisher = new Publisher(storage.performanceLog)
  const sideEffectProcessor = new SideEffectProcessor(memoryManager, moodController, walletManager)
  const healthAggregator = new HealthAggregator(storage.performanceLog)

  // Default text stage (deterministic ID, persisted)
  const DEFAULT_STAGE_ID = 'stg-default-text'
  let defaultStage = storage.documents.get('stages', DEFAULT_STAGE_ID) as Stage | null
  if (!defaultStage) {
    defaultStage = {
      id: DEFAULT_STAGE_ID,
      name: 'default-text',
      platform: 'text',
      format_spec: { max_length: null, supports_markdown: true, supports_media: false },
      adapter_type: 'text',
      active: true,
      created_at: new Date().toISOString(),
    }
    storage.documents.put('stages', DEFAULT_STAGE_ID, defaultStage)
  }

  // --- Create Fastify app ---
  const app = Fastify({
    logger: {
      level: config.logLevel,
    },
    genReqId: () => `req-${uuid().substring(0, 8)}`,
  })

  // --- Register middleware ---
  await app.register(cors, {
    origin: config.corsOrigin === '*' ? true : config.corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  })

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  })

  await app.register(authMiddleware)
  await app.register(envelopeMiddleware)
  app.setErrorHandler(createErrorHandler(config.nodeEnv))

  // --- Register routes ---
  registerEntityRoutes(app, {
    entityStore, identityCoreManager, voiceRegistry, traitEngine, aestheticRegistry, loreGraph,
    docs: storage.documents,
  })

  registerPerformanceRoutes(app, {
    frameAssembler, generator, evaluator: performanceEvaluator, publisher,
    sideEffectProcessor, entityStore, performanceLog: storage.performanceLog,
    healthAggregator, docs: storage.documents, defaultStage,
  })

  registerVoiceRoutes(app, { voiceRegistry, entityStore })
  registerIdentityCoreRoutes(app, { identityCoreManager, entityStore })
  registerGuardrailRoutes(app, { docs: storage.documents, entityStore })
  registerLoreRoutes(app, { loreGraph, entityStore })
  registerSnapshotRoutes(app, { snapshotManager, entityStore })
  registerStageRoutes(app, { docs: storage.documents })
  registerDirectiveRoutes(app, { directiveResolver, entityStore, docs: storage.documents })
  registerArcRoutes(app, { arcDirector, entityStore })
  registerDriftRuleRoutes(app, { driftEngine, entityStore })
  registerEpochRoutes(app, { epochManager, entityStore })
  registerMemoryRoutes(app, { entityStore, memoryRetriever, memoryConsolidator, vectors: storage.vectors })
  registerDriftHistoryRoutes(app, { driftTracker, entityStore })
  registerWalletRoutes(app, { walletManager, entityStore, docs: storage.documents })

  // --- System routes ---
  app.get('/health', async () => {
    const checks: Record<string, string> = {}

    // Check SQLite
    try {
      storage.documents.get('_health_check', '_ping')
      checks.storage = 'ok'
    } catch {
      checks.storage = 'error'
    }

    // Check LLM reachability (lightweight — just verify client is configured)
    try {
      checks.llm = llm ? 'configured' : 'missing'
    } catch {
      checks.llm = 'error'
    }

    const allOk = Object.values(checks).every(v => v === 'ok' || v === 'configured')

    return {
      status: allOk ? 'ok' : 'degraded',
      version: '1.0.0',
      phase: 1,
      checks,
    }
  })

  app.get('/v1/routes', async () => ({
    data: app.printRoutes({ commonPrefix: false }),
    meta: { timestamp: new Date().toISOString(), version: 'v1' },
    errors: [],
  }))

  // --- Periodic flush: write dirty vectors to LanceDB every 60s ---
  const flushInterval = setInterval(async () => {
    if (hybridVectors.flush && hybridVectors.pendingCount > 0) {
      const { upserted, deleted } = await hybridVectors.flush()
      if (upserted > 0 || deleted > 0) {
        app.log.info(`Vector flush: ${upserted} upserted, ${deleted} deleted`)
      }
    }
  }, 60_000)

  // --- Graceful shutdown ---
  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, shutting down...`)
    clearInterval(flushInterval)
    // Final flush before exit
    if (hybridVectors.flush && hybridVectors.pendingCount > 0) {
      app.log.info('Final vector flush...')
      await hybridVectors.flush()
    }
    if (stripeProviderRef) {
      app.log.info('Closing Stripe MCP connection...')
      await stripeProviderRef.close()
    }
    await app.close()
    process.exit(0)
  }
  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  // --- Start ---
  await app.listen({ port: config.port, host: config.host })
  app.log.info(`Idol Frame API running on http://${config.host}:${config.port}`)
}

main().catch(err => {
  console.error('Failed to start:', err)
  process.exit(1)
})

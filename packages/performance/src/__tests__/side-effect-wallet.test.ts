import { describe, it, expect, beforeEach } from 'vitest'
import { SideEffectProcessor } from '../side-effect-processor.js'
import { WalletManager } from '../../../state/src/wallet-manager.js'
import { MemoryManager } from '../../../state/src/memory-manager.js'
import { MockDocumentStore } from '../../../__test-utils__/mock-store.js'
import type { IWalletProvider, ProviderTransactionResult, ProviderBalance, TransactionRequest } from '../../../state/src/wallet-provider.js'
import type { DecisionFrame } from '../../../schema/src/index.js'

// --- Mock Provider ---
class MockProvider implements IWalletProvider {
  readonly type = 'Coinbase' as const
  shouldFail = false
  lastRequest: TransactionRequest | null = null

  async initialize() {}
  async getBalance(): Promise<ProviderBalance> {
    return { balance: 100, currency: 'USDC', pending: 0 }
  }
  async execute(req: TransactionRequest): Promise<ProviderTransactionResult> {
    this.lastRequest = req
    if (this.shouldFail) return { success: false, provider_tx_id: null, error_message: 'fail', metadata: {} }
    return { success: true, provider_tx_id: 'tx-123', error_message: null, metadata: {} }
  }
  isReady() { return true }
  async provisionWallet(entityId: string) {
    return { address: '0xMock', metadata: { entity_id: entityId } }
  }
  getCapabilities() { return ['transfer', 'x402'] }
}

// --- Mock LLM (minimal) ---
const mockLlm = {
  generate: async () => ({ content: 'test', usage: { input_tokens: 0, output_tokens: 0 } }),
  embed: async () => ({ embedding: [0.1, 0.2, 0.3] }),
  provider: 'mock',
}

// --- Minimal DecisionFrame factory ---
function makeFrame(overrides: {
  directives?: any[]
  walletContext?: any
  guardrails?: any[]
}): DecisionFrame {
  return {
    id: 'df-test',
    entity_id: 'e-test',
    identity_core: {
      id: 'ic-test',
      entity_id: 'e-test',
      version: '1.0.0',
      values: [{ name: 'truth', description: 'truth', weight: 0.9 }],
      worldview: { beliefs: [], communication_philosophy: '' },
      core_tensions: [],
      recognition_markers: [],
      created_at: new Date().toISOString(),
    },
    voice: {
      id: 'vc-test',
      entity_id: 'e-test',
      vocabulary: { preferred_terms: [], avoided_terms: [], jargon_level: 0.5, profanity_level: 0 },
      syntax: { avg_sentence_length: 15, complexity: 0.5, fragment_frequency: 0.1 },
      rhetoric: { primary_devices: [], avoided_devices: [] },
      emotional_register: { baseline_intensity: 0.5, range: [0.2, 0.8], expression_style: 'direct' },
      sample_utterances: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    traits: [],
    guardrails: overrides.guardrails ?? [{
      id: 'gr-test',
      entity_id: 'e-test',
      name: 'Safety',
      description: '',
      category: 'Safety',
      condition: 'no harmful content',
      enforcement: 'Block',
      active: true,
      created_at: new Date().toISOString(),
    }],
    memories: [],
    mood: null,
    arc: null,
    directives: overrides.directives ?? [],
    wallet_context: overrides.walletContext ?? null,
    stage: {
      id: 'stg-test',
      name: 'test',
      platform: 'text',
      format_spec: { max_length: null, supports_markdown: true, supports_media: false },
      adapter_type: 'text',
      active: true,
      created_at: new Date().toISOString(),
    },
    interaction_context: {
      type: 'Reactive',
      trigger: 'test',
      audience: null,
    },
    assembled_at: new Date().toISOString(),
  }
}

describe('SideEffectProcessor — Wallet Integration', () => {
  let store: MockDocumentStore
  let memoryManager: MemoryManager
  let walletManager: WalletManager
  let mockProvider: MockProvider
  let processor: SideEffectProcessor

  const coinbaseConfig = {
    type: 'Coinbase' as const,
    coinbase: {
      wallet_type: 'smart' as const,
      network_id: 'base-mainnet' as const,
      smart_wallet_address: null,
      owner_address: null,
      paymaster_url: null,
      x402_enabled: true,
      x402_max_payment_usdc: 1.0,
    },
  }

  beforeEach(() => {
    store = new MockDocumentStore()
    memoryManager = new MemoryManager(store, { upsert: async () => {}, search: async () => [], delete: async () => {} } as any, mockLlm as any)
    mockProvider = new MockProvider()
    walletManager = new WalletManager(store)
    walletManager.registerProvider('Coinbase', mockProvider)
    processor = new SideEffectProcessor(memoryManager, undefined, walletManager)
  })

  it('processes wallet_action directive and executes transaction', async () => {
    const wallet = walletManager.create({ entity_id: 'e-test', provider: coinbaseConfig })

    const frame = makeFrame({
      directives: [{
        id: 'dir-pay',
        entity_id: 'e-test',
        priority: 100,
        scope: { type: 'Global' },
        instruction: 'wallet_action: pay 0.05 USDC to 0xElevenLabs for tts',
        rationale: null,
        expiration: { type: 'Permanent' },
        status: 'Active',
        created_at: new Date().toISOString(),
        created_by: 'creator',
        conflicts_with: [],
      }],
      walletContext: {
        wallet_id: wallet.id,
        provider_type: 'Coinbase',
        balance: 50,
        currency: 'USDC',
        capabilities: ['transfer', 'x402'],
        allowed_categories: [],
        per_transaction_limit: null,
        auto_fund_enabled: false,
        auto_fund_threshold: null,
      },
    })

    const effects = await processor.process({
      entity_id: 'e-test',
      output: 'Here is the content.',
      frame,
      mode: 'editorial_post',
      context: 'test context',
    })

    const walletEffects = effects.filter(e => e.startsWith('[wallet_tx]'))
    expect(walletEffects).toHaveLength(1)
    expect(walletEffects[0]).toContain('tts')
    expect(walletEffects[0]).toContain('0.05')

    // Transaction should be recorded
    const txs = walletManager.getTransactions(wallet.id)
    expect(txs).toHaveLength(1)
    expect(txs[0].status).toBe('Completed')
    expect(txs[0].category).toBe('tts')
  })

  it('processes payment: directive format', async () => {
    const wallet = walletManager.create({ entity_id: 'e-test', provider: coinbaseConfig })

    const frame = makeFrame({
      directives: [{
        id: 'dir-compute',
        entity_id: 'e-test',
        priority: 100,
        scope: { type: 'Global' },
        instruction: 'payment: compute 0.003 to 0xLLM for inference',
        rationale: null,
        expiration: { type: 'Permanent' },
        status: 'Active',
        created_at: new Date().toISOString(),
        created_by: 'creator',
        conflicts_with: [],
      }],
      walletContext: {
        wallet_id: wallet.id,
        provider_type: 'Coinbase',
        balance: 50,
        currency: 'USDC',
        capabilities: ['transfer'],
        allowed_categories: [],
        per_transaction_limit: null,
        auto_fund_enabled: false,
        auto_fund_threshold: null,
      },
    })

    const effects = await processor.process({
      entity_id: 'e-test',
      output: 'Generated content.',
      frame,
      mode: 'editorial_post',
      context: 'test',
    })

    const walletEffects = effects.filter(e => e.startsWith('[wallet_tx]'))
    expect(walletEffects).toHaveLength(1)
    expect(walletEffects[0]).toContain('compute')
  })

  it('blocks transaction via guardrail and records it', async () => {
    const wallet = walletManager.create({
      entity_id: 'e-test',
      provider: coinbaseConfig,
      spending_limits: { per_transaction: 0.01 },
    })

    const frame = makeFrame({
      directives: [{
        id: 'dir-big',
        entity_id: 'e-test',
        priority: 100,
        scope: { type: 'Global' },
        instruction: 'wallet_action: pay 5.00 USDC to 0xExpensive for video_gen',
        rationale: null,
        expiration: { type: 'Permanent' },
        status: 'Active',
        created_at: new Date().toISOString(),
        created_by: 'creator',
        conflicts_with: [],
      }],
      walletContext: {
        wallet_id: wallet.id,
        provider_type: 'Coinbase',
        balance: 50,
        currency: 'USDC',
        capabilities: ['transfer'],
        allowed_categories: [],
        per_transaction_limit: 0.01,
        auto_fund_enabled: false,
        auto_fund_threshold: null,
      },
    })

    const effects = await processor.process({
      entity_id: 'e-test',
      output: 'Content.',
      frame,
      mode: 'editorial_post',
      context: 'test',
    })

    const blocked = effects.filter(e => e.startsWith('[wallet_blocked]'))
    expect(blocked).toHaveLength(1)
    expect(blocked[0]).toContain('per-transaction limit')
  })

  it('triggers auto-fund when balance below threshold', async () => {
    // Create master wallet
    const masterWallet = walletManager.create({
      entity_id: 'e-test',
      name: 'master',
      provider: coinbaseConfig,
    })

    // Create entity wallet with low balance
    const entityWallet = walletManager.create({
      entity_id: 'e-test',
      name: 'agent-wallet',
      provider: coinbaseConfig,
    })

    const frame = makeFrame({
      directives: [{
        id: 'dir-autofund',
        entity_id: 'e-test',
        priority: 200,
        scope: { type: 'Global' },
        instruction: `auto-fund threshold: $10 amount: $20 from ${masterWallet.id}`,
        rationale: 'Keep agent wallet funded',
        expiration: { type: 'Permanent' },
        status: 'Active',
        created_at: new Date().toISOString(),
        created_by: 'creator',
        conflicts_with: [],
      }],
      walletContext: {
        wallet_id: entityWallet.id,
        provider_type: 'Coinbase',
        balance: 5, // Below threshold of 10
        currency: 'USDC',
        capabilities: ['transfer'],
        allowed_categories: [],
        per_transaction_limit: null,
        auto_fund_enabled: true,
        auto_fund_threshold: 10,
      },
    })

    const effects = await processor.process({
      entity_id: 'e-test',
      output: 'Some content.',
      frame,
      mode: 'editorial_post',
      context: 'test',
    })

    const autoFund = effects.filter(e => e.startsWith('[wallet_autofund]'))
    expect(autoFund).toHaveLength(1)
    expect(autoFund[0]).toContain('$20')
    expect(autoFund[0]).toContain(masterWallet.id)
  })

  it('skips auto-fund when no master wallet configured', async () => {
    const wallet = walletManager.create({ entity_id: 'e-test', provider: coinbaseConfig })

    const frame = makeFrame({
      directives: [],
      walletContext: {
        wallet_id: wallet.id,
        provider_type: 'Coinbase',
        balance: 1, // Low
        currency: 'USDC',
        capabilities: ['transfer'],
        allowed_categories: [],
        per_transaction_limit: null,
        auto_fund_enabled: true,
        auto_fund_threshold: 10,
      },
    })

    const effects = await processor.process({
      entity_id: 'e-test',
      output: 'Content.',
      frame,
      mode: 'editorial_post',
      context: 'test',
    })

    const skip = effects.filter(e => e.includes('autofund_skip'))
    expect(skip).toHaveLength(1)
  })

  it('does nothing when no wallet context in frame', async () => {
    const frame = makeFrame({ directives: [], walletContext: null })

    const effects = await processor.process({
      entity_id: 'e-test',
      output: 'Content.',
      frame,
      mode: 'editorial_post',
      context: 'test',
    })

    const walletEffects = effects.filter(e => e.includes('[wallet'))
    expect(walletEffects).toHaveLength(0)
  })

  it('stores transaction as episodic memory', async () => {
    const wallet = walletManager.create({ entity_id: 'e-test', provider: coinbaseConfig })

    const frame = makeFrame({
      directives: [{
        id: 'dir-mem',
        entity_id: 'e-test',
        priority: 100,
        scope: { type: 'Global' },
        instruction: 'wallet_action: pay 2.50 USDC to 0xFal for image_gen',
        rationale: null,
        expiration: { type: 'Permanent' },
        status: 'Active',
        created_at: new Date().toISOString(),
        created_by: 'creator',
        conflicts_with: [],
      }],
      walletContext: {
        wallet_id: wallet.id,
        provider_type: 'Coinbase',
        balance: 50,
        currency: 'USDC',
        capabilities: ['transfer'],
        allowed_categories: [],
        per_transaction_limit: null,
        auto_fund_enabled: false,
        auto_fund_threshold: null,
      },
    })

    await processor.process({
      entity_id: 'e-test',
      output: 'Content.',
      frame,
      mode: 'editorial_post',
      context: 'test',
    })

    // Check memory was stored (amount > 1 = importance 0.7)
    const memories = memoryManager.getByEntity('e-test')
    const walletMemory = memories.find(m => m.content.includes('wallet_transaction'))
    expect(walletMemory).toBeDefined()
    expect(walletMemory!.content).toContain('$2.5')
    expect(walletMemory!.content).toContain('image_gen')
    expect(walletMemory!.importance).toBe(0.7)
  })
})

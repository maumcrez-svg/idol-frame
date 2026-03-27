import { describe, it, expect, beforeEach } from 'vitest'
import { WalletManager } from '../wallet-manager.js'
import { MockDocumentStore } from '../../../__test-utils__/mock-store.js'
import { WalletSchema, WalletTransactionSchema } from '../../../schema/src/index.js'
import type { IWalletProvider, ProviderTransactionResult, ProviderBalance, TransactionRequest } from '../wallet-provider.js'

// --- Mock Provider ---

class MockCoinbaseProvider implements IWalletProvider {
  readonly type = 'Coinbase' as const
  private _ready = true
  lastRequest: TransactionRequest | null = null
  shouldFail = false

  async initialize(): Promise<void> {}

  async getBalance(): Promise<ProviderBalance> {
    return { balance: 100, currency: 'USDC', pending: 0 }
  }

  async execute(request: TransactionRequest): Promise<ProviderTransactionResult> {
    this.lastRequest = request
    if (this.shouldFail) {
      return { success: false, provider_tx_id: null, error_message: 'Mock failure', metadata: {} }
    }
    return { success: true, provider_tx_id: 'tx-mock-123', error_message: null, metadata: { mock: true } }
  }

  isReady(): boolean { return this._ready }
  setReady(ready: boolean) { this._ready = ready }

  async provisionWallet(entityId: string) {
    return { address: '0xMockAddress', metadata: { entity_id: entityId, network_id: 'base-mainnet' } }
  }

  getCapabilities() { return ['transfer', 'x402', 'swap'] }
}

describe('WalletManager', () => {
  let store: MockDocumentStore
  let manager: WalletManager
  let mockProvider: MockCoinbaseProvider

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
    mockProvider = new MockCoinbaseProvider()
    manager = new WalletManager(store)
    manager.registerProvider('Coinbase', mockProvider)
  })

  // --- Wallet CRUD ---

  describe('create()', () => {
    it('creates a wallet with valid schema', () => {
      const wallet = manager.create({
        entity_id: 'e-test',
        name: 'main-wallet',
        provider: coinbaseConfig,
        currency: 'USDC',
      })

      expect(wallet.id).toMatch(/^wal-/)
      expect(wallet.entity_id).toBe('e-test')
      expect(wallet.name).toBe('main-wallet')
      expect(wallet.provider.type).toBe('Coinbase')
      expect(wallet.currency).toBe('USDC')
      expect(wallet.balance).toBe(0)
      expect(wallet.total_spent).toBe(0)
      expect(wallet.total_transactions).toBe(0)
      expect(wallet.status).toBe('Active')
      expect(wallet.created_at).toBeDefined()

      // Validate against schema
      expect(() => WalletSchema.parse(wallet)).not.toThrow()
    })

    it('creates with spending limits', () => {
      const wallet = manager.create({
        entity_id: 'e-test',
        provider: coinbaseConfig,
        spending_limits: {
          per_transaction: 5,
          per_day: 50,
          per_month: 500,
          allowed_categories: ['compute', 'image_gen'],
        },
      })

      expect(wallet.spending_limits.per_transaction).toBe(5)
      expect(wallet.spending_limits.per_day).toBe(50)
      expect(wallet.spending_limits.per_month).toBe(500)
      expect(wallet.spending_limits.allowed_categories).toEqual(['compute', 'image_gen'])
    })
  })

  describe('get() / getByEntity()', () => {
    it('retrieves wallet by ID', () => {
      const created = manager.create({ entity_id: 'e-test', provider: coinbaseConfig })
      const retrieved = manager.get(created.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.id).toBe(created.id)
    })

    it('returns null for unknown ID', () => {
      expect(manager.get('wal-nonexistent')).toBeNull()
    })

    it('lists wallets by entity', () => {
      manager.create({ entity_id: 'e-test', name: 'wallet-1', provider: coinbaseConfig })
      manager.create({ entity_id: 'e-test', name: 'wallet-2', provider: coinbaseConfig })
      manager.create({ entity_id: 'e-other', name: 'wallet-3', provider: coinbaseConfig })

      const wallets = manager.getByEntity('e-test')
      expect(wallets).toHaveLength(2)
    })
  })

  describe('update()', () => {
    it('updates wallet name and limits', async () => {
      const wallet = manager.create({ entity_id: 'e-test', provider: coinbaseConfig })

      // Ensure timestamp difference
      await new Promise(r => setTimeout(r, 5))

      const updated = manager.update(wallet.id, {
        name: 'renamed',
        spending_limits: { per_transaction: 10 },
      })

      expect(updated.name).toBe('renamed')
      expect(updated.spending_limits.per_transaction).toBe(10)
      expect(updated.updated_at >= wallet.updated_at).toBe(true)
    })

    it('freezes a wallet', () => {
      const wallet = manager.create({ entity_id: 'e-test', provider: coinbaseConfig })
      const frozen = manager.update(wallet.id, { status: 'Frozen' })
      expect(frozen.status).toBe('Frozen')
    })

    it('throws for unknown wallet', () => {
      expect(() => manager.update('wal-nope', { name: 'x' })).toThrow('Wallet not found')
    })
  })

  // --- Transaction Execution ---

  describe('transact()', () => {
    it('executes a successful transaction', async () => {
      const wallet = manager.create({ entity_id: 'e-test', provider: coinbaseConfig })

      const tx = await manager.transact({
        wallet_id: wallet.id,
        category: 'compute',
        description: 'LLM inference call',
        amount: 0.05,
        recipient: '0xServiceAddress',
      })

      expect(tx.id).toMatch(/^wtx-/)
      expect(tx.status).toBe('Completed')
      expect(tx.amount).toBe(0.05)
      expect(tx.category).toBe('compute')
      expect(tx.provider_type).toBe('Coinbase')
      expect(tx.provider_tx_id).toBe('tx-mock-123')
      expect(tx.guardrail_blocked).toBe(false)

      expect(() => WalletTransactionSchema.parse(tx)).not.toThrow()

      // Wallet should be updated
      const updatedWallet = manager.get(wallet.id)!
      expect(updatedWallet.total_spent).toBe(0.05)
      expect(updatedWallet.total_transactions).toBe(1)
    })

    it('blocks transaction on frozen wallet', async () => {
      const wallet = manager.create({ entity_id: 'e-test', provider: coinbaseConfig })
      manager.update(wallet.id, { status: 'Frozen' })

      const tx = await manager.transact({
        wallet_id: wallet.id,
        category: 'compute',
        description: 'Should be blocked',
        amount: 1,
        recipient: '0x123',
      })

      expect(tx.status).toBe('Blocked')
      expect(tx.error_message).toContain('Frozen')
    })

    it('blocks transaction exceeding per-transaction limit', async () => {
      const wallet = manager.create({
        entity_id: 'e-test',
        provider: coinbaseConfig,
        spending_limits: { per_transaction: 1 },
      })

      const tx = await manager.transact({
        wallet_id: wallet.id,
        category: 'image_gen',
        description: 'Big image batch',
        amount: 5,
        recipient: '0xFal',
      })

      expect(tx.status).toBe('Blocked')
      expect(tx.guardrail_blocked).toBe(true)
      expect(tx.error_message).toContain('per-transaction limit')
    })

    it('blocks transaction for disallowed category', async () => {
      const wallet = manager.create({
        entity_id: 'e-test',
        provider: coinbaseConfig,
        spending_limits: { allowed_categories: ['compute', 'tts'] },
      })

      const tx = await manager.transact({
        wallet_id: wallet.id,
        category: 'swap',
        description: 'Token swap',
        amount: 0.5,
        recipient: '0xDex',
      })

      expect(tx.status).toBe('Blocked')
      expect(tx.guardrail_blocked).toBe(true)
      expect(tx.error_message).toContain('not in allowed categories')
    })

    it('blocks transaction exceeding approval threshold', async () => {
      const wallet = manager.create({
        entity_id: 'e-test',
        provider: coinbaseConfig,
        spending_limits: { requires_approval_above: 2 },
      })

      const tx = await manager.transact({
        wallet_id: wallet.id,
        category: 'video_gen',
        description: 'Expensive video',
        amount: 5,
        recipient: '0xRunway',
      })

      expect(tx.status).toBe('Blocked')
      expect(tx.error_message).toContain('approval threshold')
    })

    it('handles provider failure gracefully', async () => {
      const wallet = manager.create({ entity_id: 'e-test', provider: coinbaseConfig })
      mockProvider.shouldFail = true

      const tx = await manager.transact({
        wallet_id: wallet.id,
        category: 'compute',
        description: 'Will fail',
        amount: 0.1,
        recipient: '0x123',
      })

      expect(tx.status).toBe('Failed')
      expect(tx.error_message).toBe('Mock failure')

      // Balance should NOT be deducted
      const w = manager.get(wallet.id)!
      expect(w.total_spent).toBe(0)
    })

    it('fails when provider is unavailable', async () => {
      const wallet = manager.create({ entity_id: 'e-test', provider: coinbaseConfig })
      mockProvider.setReady(false)

      const tx = await manager.transact({
        wallet_id: wallet.id,
        category: 'compute',
        description: 'No provider',
        amount: 0.1,
        recipient: '0x123',
      })

      expect(tx.status).toBe('Failed')
      expect(tx.error_message).toContain('not available')
    })

    it('applies guardrail spending checks', async () => {
      const wallet = manager.create({ entity_id: 'e-test', provider: coinbaseConfig })

      const tx = await manager.transact({
        wallet_id: wallet.id,
        category: 'compute',
        description: 'Expensive call',
        amount: 10,
        recipient: '0x123',
        guardrails: [{
          id: 'gr-spend-limit',
          entity_id: 'e-test',
          name: 'Max spending per transaction',
          description: '',
          category: 'CreatorDefined',
          condition: 'max $5 per transaction',
          enforcement: 'Block',
          active: true,
          created_at: new Date().toISOString(),
        }],
      })

      expect(tx.status).toBe('Blocked')
      expect(tx.guardrail_blocked).toBe(true)
      expect(tx.error_message).toContain('Guardrail')
    })
  })

  // --- Transaction History ---

  describe('getTransactions()', () => {
    it('lists transactions by wallet', async () => {
      const wallet = manager.create({ entity_id: 'e-test', provider: coinbaseConfig })

      await manager.transact({ wallet_id: wallet.id, category: 'compute', description: 'tx1', amount: 0.01, recipient: '0x1' })
      await manager.transact({ wallet_id: wallet.id, category: 'tts', description: 'tx2', amount: 0.05, recipient: '0x2' })
      await manager.transact({ wallet_id: wallet.id, category: 'image_gen', description: 'tx3', amount: 0.10, recipient: '0x3' })

      const txs = manager.getTransactions(wallet.id)
      expect(txs).toHaveLength(3)
      // All three should be present
      const descriptions = txs.map(t => t.description).sort()
      expect(descriptions).toEqual(['tx1', 'tx2', 'tx3'])
    })

    it('filters by category', async () => {
      const wallet = manager.create({ entity_id: 'e-test', provider: coinbaseConfig })

      await manager.transact({ wallet_id: wallet.id, category: 'compute', description: 'a', amount: 0.01, recipient: '0x1' })
      await manager.transact({ wallet_id: wallet.id, category: 'tts', description: 'b', amount: 0.01, recipient: '0x1' })

      const txs = manager.getTransactions(wallet.id, { category: 'compute' })
      expect(txs).toHaveLength(1)
      expect(txs[0].category).toBe('compute')
    })

    it('respects limit', async () => {
      const wallet = manager.create({ entity_id: 'e-test', provider: coinbaseConfig })

      for (let i = 0; i < 5; i++) {
        await manager.transact({ wallet_id: wallet.id, category: 'compute', description: `tx${i}`, amount: 0.01, recipient: '0x1' })
      }

      const txs = manager.getTransactions(wallet.id, { limit: 2 })
      expect(txs).toHaveLength(2)
    })
  })

  describe('getTransactionsByEntity()', () => {
    it('lists all transactions across wallets', async () => {
      const w1 = manager.create({ entity_id: 'e-test', name: 'w1', provider: coinbaseConfig })
      const w2 = manager.create({ entity_id: 'e-test', name: 'w2', provider: coinbaseConfig })

      await manager.transact({ wallet_id: w1.id, category: 'compute', description: 'from w1', amount: 0.01, recipient: '0x1' })
      await manager.transact({ wallet_id: w2.id, category: 'tts', description: 'from w2', amount: 0.02, recipient: '0x2' })

      const txs = manager.getTransactionsByEntity('e-test')
      expect(txs).toHaveLength(2)
    })
  })

  // --- Spending Analytics ---

  describe('spending analytics', () => {
    it('calculates spent today', async () => {
      const wallet = manager.create({ entity_id: 'e-test', provider: coinbaseConfig })

      await manager.transact({ wallet_id: wallet.id, category: 'compute', description: 'a', amount: 1.5, recipient: '0x1' })
      await manager.transact({ wallet_id: wallet.id, category: 'compute', description: 'b', amount: 2.5, recipient: '0x1' })

      const spent = manager.getSpentToday(wallet.id)
      expect(spent).toBe(4.0)
    })

    it('calculates spent this month', async () => {
      const wallet = manager.create({ entity_id: 'e-test', provider: coinbaseConfig })

      await manager.transact({ wallet_id: wallet.id, category: 'compute', description: 'a', amount: 10, recipient: '0x1' })

      const spent = manager.getSpentThisMonth(wallet.id)
      expect(spent).toBe(10)
    })
  })

  // --- Provision ---

  describe('provision()', () => {
    it('provisions wallet through provider', async () => {
      const wallet = await manager.provision({
        entity_id: 'e-test',
        name: 'auto-provisioned',
        provider_type: 'Coinbase',
        spending_limits: { per_day: 100 },
      })

      expect(wallet.id).toMatch(/^wal-/)
      expect(wallet.name).toBe('auto-provisioned')
      expect(wallet.provider.type).toBe('Coinbase')
      expect(wallet.spending_limits.per_day).toBe(100)
    })

    it('throws for unknown provider', async () => {
      await expect(manager.provision({
        entity_id: 'e-test',
        provider_type: 'Unknown' as any,
      })).rejects.toThrow('not available')
    })
  })

  // --- Schema Validation ---

  describe('schema validation', () => {
    it('rejects wallet with invalid ID prefix', () => {
      expect(() => WalletSchema.parse({
        id: 'bad-id',
        entity_id: 'e-test',
        provider: coinbaseConfig,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })).toThrow()
    })

    it('rejects wallet with invalid entity_id prefix', () => {
      expect(() => WalletSchema.parse({
        id: 'wal-test',
        entity_id: 'bad-entity',
        provider: coinbaseConfig,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })).toThrow()
    })

    it('rejects negative balance', () => {
      expect(() => WalletSchema.parse({
        id: 'wal-test',
        entity_id: 'e-test',
        provider: coinbaseConfig,
        balance: -5,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })).toThrow()
    })

    it('rejects transaction with invalid ID prefix', () => {
      expect(() => WalletTransactionSchema.parse({
        id: 'bad-tx',
        wallet_id: 'wal-test',
        entity_id: 'e-test',
        category: 'compute',
        description: 'test',
        amount: 1,
        status: 'Completed',
        provider_type: 'Coinbase',
        timestamp: new Date().toISOString(),
      })).toThrow()
    })
  })
})

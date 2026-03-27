import { v4 as uuid } from 'uuid'
import type { IDocumentStore } from '../../storage/src/index.js'
import type {
  Wallet,
  WalletTransaction,
  WalletProviderConfig,
  TransactionCategory,
  SpendingLimits,
  Guardrail,
} from '../../schema/src/index.js'
import { WalletSchema, WalletTransactionSchema } from '../../schema/src/index.js'
import type { IWalletProvider, TransactionRequest } from './wallet-provider.js'

const WALLET_COLLECTION = 'wallets'
const TX_COLLECTION = 'wallet_transactions'

export interface WalletManagerConfig {
  providers?: Map<string, IWalletProvider>
}

export class WalletManager {
  private providers: Map<string, IWalletProvider>

  constructor(
    private docs: IDocumentStore,
    config?: WalletManagerConfig,
  ) {
    this.providers = config?.providers ?? new Map()
  }

  registerProvider(type: string, provider: IWalletProvider): void {
    this.providers.set(type, provider)
  }

  getProvider(type: string): IWalletProvider | undefined {
    return this.providers.get(type)
  }

  // --- Wallet CRUD ---

  create(input: {
    entity_id: string
    name?: string
    provider: WalletProviderConfig
    currency?: string
    spending_limits?: Partial<SpendingLimits>
  }): Wallet {
    const now = new Date().toISOString()

    const wallet: Wallet = WalletSchema.parse({
      id: `wal-${uuid()}`,
      entity_id: input.entity_id,
      name: input.name ?? 'default',
      provider: input.provider,
      currency: input.currency ?? 'USDC',
      spending_limits: input.spending_limits ?? {},
      created_at: now,
      updated_at: now,
    })

    this.docs.put(WALLET_COLLECTION, wallet.id, wallet)
    return wallet
  }

  get(id: string): Wallet | null {
    const doc = this.docs.get(WALLET_COLLECTION, id)
    return doc ? WalletSchema.parse(doc) : null
  }

  getByEntity(entityId: string): Wallet[] {
    return this.docs
      .list(WALLET_COLLECTION, { entity_id: entityId })
      .map(d => WalletSchema.parse(d))
  }

  getByEntityAndProvider(entityId: string, providerType: string): Wallet | null {
    const wallets = this.getByEntity(entityId)
    return wallets.find(w => w.provider.type === providerType) ?? null
  }

  update(id: string, partial: {
    name?: string
    spending_limits?: Partial<SpendingLimits>
    status?: 'Active' | 'Frozen' | 'Closed'
  }): Wallet {
    const existing = this.get(id)
    if (!existing) throw new Error(`Wallet not found: ${id}`)

    const updated: Wallet = WalletSchema.parse({
      ...existing,
      ...partial,
      spending_limits: partial.spending_limits
        ? { ...existing.spending_limits, ...partial.spending_limits }
        : existing.spending_limits,
      updated_at: new Date().toISOString(),
    })

    this.docs.put(WALLET_COLLECTION, id, updated)
    return updated
  }

  // --- Transaction Execution ---

  async transact(input: {
    wallet_id: string
    category: TransactionCategory
    description: string
    amount: number
    recipient: string
    metadata?: Record<string, unknown>
    guardrails?: Guardrail[]
  }): Promise<WalletTransaction> {
    const wallet = this.get(input.wallet_id)
    if (!wallet) throw new Error(`Wallet not found: ${input.wallet_id}`)

    if (wallet.status !== 'Active') {
      return this.recordTransaction({
        wallet,
        ...input,
        status: 'Blocked',
        error_message: `Wallet is ${wallet.status}`,
        guardrail_blocked: false,
      })
    }

    // --- Guardrail checks ---
    const guardrailBlock = this.checkGuardrails(wallet, input)
    if (guardrailBlock) {
      return this.recordTransaction({
        wallet,
        ...input,
        status: 'Blocked',
        error_message: guardrailBlock,
        guardrail_blocked: true,
      })
    }

    // --- Spending limit checks ---
    const limitBlock = this.checkSpendingLimits(wallet, input.amount, input.category)
    if (limitBlock) {
      return this.recordTransaction({
        wallet,
        ...input,
        status: 'Blocked',
        error_message: limitBlock,
        guardrail_blocked: true,
      })
    }

    // --- Execute via provider ---
    const provider = this.providers.get(wallet.provider.type)
    if (!provider || !provider.isReady()) {
      return this.recordTransaction({
        wallet,
        ...input,
        status: 'Failed',
        error_message: `Provider ${wallet.provider.type} is not available`,
        guardrail_blocked: false,
      })
    }

    const request: TransactionRequest = {
      amount: input.amount,
      currency: wallet.currency,
      recipient: input.recipient,
      category: input.category,
      description: input.description,
      metadata: input.metadata,
    }

    const result = await provider.execute(request)

    // --- Update wallet balance ---
    if (result.success) {
      const updated: Wallet = WalletSchema.parse({
        ...wallet,
        total_spent: wallet.total_spent + input.amount,
        total_transactions: wallet.total_transactions + 1,
        balance: Math.max(0, wallet.balance - input.amount),
        updated_at: new Date().toISOString(),
      })
      this.docs.put(WALLET_COLLECTION, wallet.id, updated)
    }

    return this.recordTransaction({
      wallet,
      ...input,
      status: result.success ? 'Completed' : 'Failed',
      error_message: result.error_message,
      provider_tx_id: result.provider_tx_id,
      guardrail_blocked: false,
      extra_metadata: result.metadata,
    })
  }

  // --- Transaction History ---

  getTransactions(walletId: string, opts?: {
    limit?: number
    after?: string
    before?: string
    category?: TransactionCategory
    status?: string
  }): WalletTransaction[] {
    let txs = this.docs
      .list(TX_COLLECTION, { wallet_id: walletId })
      .map(d => WalletTransactionSchema.parse(d))

    if (opts?.after) txs = txs.filter(t => t.timestamp > opts.after!)
    if (opts?.before) txs = txs.filter(t => t.timestamp < opts.before!)
    if (opts?.category) txs = txs.filter(t => t.category === opts.category)
    if (opts?.status) txs = txs.filter(t => t.status === opts.status)

    txs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    return txs.slice(0, opts?.limit ?? 50)
  }

  getTransactionsByEntity(entityId: string, limit = 50): WalletTransaction[] {
    return this.docs
      .list(TX_COLLECTION, { entity_id: entityId })
      .map(d => WalletTransactionSchema.parse(d))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit)
  }

  getTransaction(id: string): WalletTransaction | null {
    const doc = this.docs.get(TX_COLLECTION, id)
    return doc ? WalletTransactionSchema.parse(doc) : null
  }

  // --- Spending Analytics ---

  getSpentToday(walletId: string): number {
    const now = new Date()
    const todayStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}T00:00:00.000Z`

    return this.docs
      .list(TX_COLLECTION, { wallet_id: walletId })
      .map(d => WalletTransactionSchema.parse(d))
      .filter(t => t.timestamp >= todayStr && t.status === 'Completed')
      .reduce((sum, t) => sum + t.amount, 0)
  }

  getSpentThisMonth(walletId: string): number {
    const now = new Date()
    const monthStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01T00:00:00.000Z`

    return this.docs
      .list(TX_COLLECTION, { wallet_id: walletId })
      .map(d => WalletTransactionSchema.parse(d))
      .filter(t => t.timestamp >= monthStr && t.status === 'Completed')
      .reduce((sum, t) => sum + t.amount, 0)
  }

  // --- Sync balance from provider ---

  async syncBalance(walletId: string): Promise<Wallet> {
    const wallet = this.get(walletId)
    if (!wallet) throw new Error(`Wallet not found: ${walletId}`)

    const provider = this.providers.get(wallet.provider.type)
    if (!provider || !provider.isReady()) {
      throw new Error(`Provider ${wallet.provider.type} is not available`)
    }

    const providerBalance = await provider.getBalance(wallet.address ?? '')
    const updated: Wallet = WalletSchema.parse({
      ...wallet,
      balance: providerBalance.balance,
      updated_at: new Date().toISOString(),
    })

    this.docs.put(WALLET_COLLECTION, walletId, updated)
    return updated
  }

  // --- Provision wallet through provider ---

  async provision(input: {
    entity_id: string
    name?: string
    provider_type: string
    currency?: string
    spending_limits?: Partial<SpendingLimits>
  }): Promise<Wallet> {
    const provider = this.providers.get(input.provider_type)
    if (!provider || !provider.isReady()) {
      throw new Error(`Provider ${input.provider_type} is not available`)
    }

    const provisioned = await provider.provisionWallet(input.entity_id)

    let providerConfig: WalletProviderConfig
    if (input.provider_type === 'Coinbase') {
      const rawType = (provisioned.metadata.wallet_type as string) ?? ''
      const walletType = rawType.toLowerCase().includes('evm') ? 'mpc' as const : 'smart' as const

      providerConfig = {
        type: 'Coinbase',
        coinbase: {
          wallet_type: walletType,
          network_id: (provisioned.metadata.network_id as string) ?? 'base-mainnet',
          smart_wallet_address: walletType === 'smart' ? provisioned.address : null,
          owner_address: (provisioned.metadata.owner_address as string) ?? null,
          paymaster_url: null,
          x402_enabled: true,
          x402_max_payment_usdc: 1.0,
        },
      }
    } else {
      providerConfig = {
        type: 'Stripe',
        stripe: {
          customer_id: (provisioned.metadata.stripe_customer_id as string) ?? null,
          connected_account_id: null,
        },
      }
    }

    return this.create({
      entity_id: input.entity_id,
      name: input.name,
      provider: providerConfig,
      currency: input.currency,
      spending_limits: input.spending_limits,
    })
  }

  // --- Private helpers ---

  private checkGuardrails(
    wallet: Wallet,
    input: { category: TransactionCategory; amount: number; guardrails?: Guardrail[] },
  ): string | null {
    if (!input.guardrails) return null

    for (const guardrail of input.guardrails) {
      if (!guardrail.active) continue
      if (guardrail.enforcement === 'Warn') continue

      // Check if the guardrail condition mentions spending/wallet
      const condition = guardrail.condition.toLowerCase()
      if (
        condition.includes('spending') ||
        condition.includes('wallet') ||
        condition.includes('payment') ||
        condition.includes('transaction')
      ) {
        // Extract amount limits from condition (e.g., "max $5 per transaction")
        const amountMatch = condition.match(/max\s*\$?(\d+(?:\.\d+)?)/i)
        if (amountMatch) {
          const maxAmount = parseFloat(amountMatch[1])
          if (input.amount > maxAmount) {
            return `Guardrail "${guardrail.name}" blocks: amount $${input.amount} exceeds max $${maxAmount}`
          }
        }

        // Check category restrictions
        if (condition.includes('only') && !condition.includes(input.category)) {
          return `Guardrail "${guardrail.name}" blocks: category "${input.category}" not allowed`
        }
      }
    }

    return null
  }

  private checkSpendingLimits(
    wallet: Wallet,
    amount: number,
    category: TransactionCategory,
  ): string | null {
    const limits = wallet.spending_limits

    // Per-transaction limit
    if (limits.per_transaction !== null && amount > limits.per_transaction) {
      return `Exceeds per-transaction limit: $${amount} > $${limits.per_transaction}`
    }

    // Daily limit
    if (limits.per_day !== null) {
      const spentToday = this.getSpentToday(wallet.id)
      if (spentToday + amount > limits.per_day) {
        return `Exceeds daily limit: $${spentToday} + $${amount} > $${limits.per_day}`
      }
    }

    // Monthly limit
    if (limits.per_month !== null) {
      const spentMonth = this.getSpentThisMonth(wallet.id)
      if (spentMonth + amount > limits.per_month) {
        return `Exceeds monthly limit: $${spentMonth} + $${amount} > $${limits.per_month}`
      }
    }

    // Category restrictions
    if (limits.allowed_categories.length > 0 && !limits.allowed_categories.includes(category)) {
      return `Category "${category}" not in allowed categories: [${limits.allowed_categories.join(', ')}]`
    }

    // Approval threshold
    if (limits.requires_approval_above !== null && amount > limits.requires_approval_above) {
      return `Amount $${amount} exceeds approval threshold $${limits.requires_approval_above} — requires creator approval`
    }

    return null
  }

  private recordTransaction(input: {
    wallet: Wallet
    category: TransactionCategory
    description: string
    amount: number
    recipient: string
    status: 'Pending' | 'Completed' | 'Failed' | 'Blocked' | 'Reverted'
    error_message?: string | null
    provider_tx_id?: string | null
    guardrail_blocked: boolean
    metadata?: Record<string, unknown>
    extra_metadata?: Record<string, unknown>
  }): WalletTransaction {
    const tx: WalletTransaction = WalletTransactionSchema.parse({
      id: `wtx-${uuid()}`,
      wallet_id: input.wallet.id,
      entity_id: input.wallet.entity_id,
      category: input.category,
      description: input.description,
      amount: input.amount,
      currency: input.wallet.currency,
      recipient: input.recipient,
      status: input.status,
      provider_tx_id: input.provider_tx_id ?? null,
      provider_type: input.wallet.provider.type,
      error_message: input.error_message ?? null,
      guardrail_blocked: input.guardrail_blocked,
      metadata: { ...(input.metadata ?? {}), ...(input.extra_metadata ?? {}) },
      timestamp: new Date().toISOString(),
    })

    this.docs.put(TX_COLLECTION, tx.id, tx)
    return tx
  }
}

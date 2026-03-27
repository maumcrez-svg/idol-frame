import type { TransactionCategory, WalletProviderType } from '../../schema/src/index.js'

/**
 * Result of a provider-level transaction execution.
 */
export interface ProviderTransactionResult {
  success: boolean
  provider_tx_id: string | null
  error_message: string | null
  metadata: Record<string, unknown>
}

/**
 * Request to execute a transaction through a wallet provider.
 */
export interface TransactionRequest {
  amount: number
  currency: string
  recipient: string
  category: TransactionCategory
  description: string
  metadata?: Record<string, unknown>
}

/**
 * Provider balance info.
 */
export interface ProviderBalance {
  balance: number
  currency: string
  pending: number
}

/**
 * Abstract wallet provider contract.
 * Coinbase and Stripe implement this interface.
 */
export interface IWalletProvider {
  readonly type: WalletProviderType

  /**
   * Initialize the provider (create wallets, connect to APIs).
   * Called once during WalletManager setup.
   */
  initialize(config: Record<string, unknown>): Promise<void>

  /**
   * Get the current balance from the provider.
   */
  getBalance(walletAddress: string): Promise<ProviderBalance>

  /**
   * Execute a transaction (send payment, pay for API, etc.).
   */
  execute(request: TransactionRequest): Promise<ProviderTransactionResult>

  /**
   * Check if the provider is configured and ready.
   */
  isReady(): boolean

  /**
   * Get the wallet address for a newly provisioned wallet.
   */
  provisionWallet(entityId: string): Promise<{ address: string; metadata: Record<string, unknown> }>

  /**
   * Provider-specific capabilities beyond the common interface.
   */
  getCapabilities(): string[]
}

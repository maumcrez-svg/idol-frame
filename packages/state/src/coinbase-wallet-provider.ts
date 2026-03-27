import type {
  IWalletProvider,
  ProviderTransactionResult,
  ProviderBalance,
  TransactionRequest,
} from './wallet-provider.js'

/**
 * Coinbase AgentKit wallet provider.
 *
 * Uses @coinbase/agentkit for:
 * - Smart wallet (ERC-4337) or MPC wallet management
 * - USDC transfers on Base L2
 * - Token swaps via CDP
 * - x402 agent-to-agent payments
 * - Spend permissions enforcement
 *
 * Required env vars:
 *   CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET
 *
 * Optional:
 *   COINBASE_NETWORK_ID (default: base-mainnet)
 *   COINBASE_PAYMASTER_URL (for gasless smart wallet txs)
 */
export class CoinbaseWalletProvider implements IWalletProvider {
  readonly type = 'Coinbase' as const

  private agentKit: any = null
  private walletProvider: any = null
  private ready = false
  private networkId = 'base-mainnet'

  async initialize(config: Record<string, unknown>): Promise<void> {
    const apiKeyId = config.cdp_api_key_id as string ?? process.env.CDP_API_KEY_ID
    const apiKeySecret = config.cdp_api_key_secret as string ?? process.env.CDP_API_KEY_SECRET
    const walletSecret = config.cdp_wallet_secret as string ?? process.env.CDP_WALLET_SECRET

    if (!apiKeyId || !apiKeySecret || !walletSecret) {
      console.warn('CoinbaseWalletProvider: Missing CDP credentials, provider not ready')
      return
    }

    this.networkId = (config.network_id as string) ?? process.env.COINBASE_NETWORK_ID ?? 'base-mainnet'
    const walletType = (config.wallet_type as string) ?? 'smart'
    const paymasterUrl = (config.paymaster_url as string) ?? process.env.COINBASE_PAYMASTER_URL ?? null

    try {
      // Dynamic import to avoid hard dependency when not configured
      const { AgentKit, walletActionProvider, erc20ActionProvider, cdpApiActionProvider } =
        await import('@coinbase/agentkit')

      let wp: any

      if (walletType === 'smart') {
        const { CdpSmartWalletProvider } = await import('@coinbase/agentkit')
        const smartConfig: Record<string, unknown> = { networkId: this.networkId }

        // Restore existing wallet if addresses provided
        if (config.smart_wallet_address) {
          smartConfig.smartWalletAddress = config.smart_wallet_address
        }
        if (config.owner_address) {
          smartConfig.ownerAddress = config.owner_address
        }
        if (paymasterUrl) {
          smartConfig.paymasterUrl = paymasterUrl
        }

        wp = await CdpSmartWalletProvider.configureWithWallet(smartConfig)
      } else {
        const { CdpEvmWalletProvider } = await import('@coinbase/agentkit')
        wp = await CdpEvmWalletProvider.configureWithWallet({ networkId: this.networkId })
      }

      this.walletProvider = wp

      // Build action providers list
      const actionProviders: any[] = [
        walletActionProvider(),
        erc20ActionProvider(),
        cdpApiActionProvider(),
      ]

      // Add x402 if enabled
      if (config.x402_enabled !== false) {
        try {
          const { x402ActionProvider } = await import('@coinbase/agentkit')
          actionProviders.push(x402ActionProvider({
            maxPaymentUsdc: (config.x402_max_payment_usdc as number) ?? 1.0,
          }))
        } catch {
          console.warn('CoinbaseWalletProvider: x402 action provider not available')
        }
      }

      // Add swap capability for mainnet
      if (this.networkId === 'base-mainnet' || this.networkId === 'ethereum-mainnet') {
        try {
          const { cdpSmartWalletActionProvider } = await import('@coinbase/agentkit')
          actionProviders.push(cdpSmartWalletActionProvider())
        } catch {
          // swap not available on this network
        }
      }

      this.agentKit = await AgentKit.from({
        walletProvider: wp,
        actionProviders,
      })

      this.ready = true
      console.log(`CoinbaseWalletProvider initialized on ${this.networkId}`)
    } catch (err) {
      console.error('CoinbaseWalletProvider: Failed to initialize', err)
      this.ready = false
    }
  }

  async getBalance(walletAddress: string): Promise<ProviderBalance> {
    this.ensureReady()

    try {
      const actions = this.agentKit.getActions()
      const getErc20 = actions.find((a: any) => a.name === 'get_balance')

      let balance = 0

      if (getErc20) {
        const result = await getErc20.invoke(this.walletProvider, {
          token: 'USDC',
        })
        const parsed = typeof result === 'string' ? parseFloat(result) : 0
        balance = isNaN(parsed) ? 0 : parsed
      }

      return { balance, currency: 'USDC', pending: 0 }
    } catch (err) {
      console.error('CoinbaseWalletProvider: getBalance failed', err)
      return { balance: 0, currency: 'USDC', pending: 0 }
    }
  }

  async execute(request: TransactionRequest): Promise<ProviderTransactionResult> {
    this.ensureReady()

    try {
      // Route based on category
      if (request.category === 'agent_payment') {
        return await this.executeX402Payment(request)
      }
      if (request.category === 'swap') {
        return await this.executeSwap(request)
      }

      // Default: ERC20 transfer (USDC)
      return await this.executeTransfer(request)
    } catch (err) {
      return {
        success: false,
        provider_tx_id: null,
        error_message: err instanceof Error ? err.message : String(err),
        metadata: {},
      }
    }
  }

  isReady(): boolean {
    return this.ready
  }

  async provisionWallet(entityId: string): Promise<{ address: string; metadata: Record<string, unknown> }> {
    this.ensureReady()

    const address = await this.walletProvider.getAddress()

    return {
      address,
      metadata: {
        network_id: this.networkId,
        wallet_type: this.walletProvider.constructor.name,
        entity_id: entityId,
      },
    }
  }

  getCapabilities(): string[] {
    const caps = ['transfer', 'balance']

    if (this.networkId === 'base-mainnet' || this.networkId === 'ethereum-mainnet') {
      caps.push('swap')
    }
    caps.push('x402', 'spend_permissions', 'gasless')

    return caps
  }

  // --- Coinbase-specific methods ---

  /**
   * Execute an x402 payment to a service endpoint.
   */
  private async executeX402Payment(request: TransactionRequest): Promise<ProviderTransactionResult> {
    const actions = this.agentKit.getActions()
    const x402Action = actions.find((a: any) => a.name === 'direct_x402_request')

    if (!x402Action) {
      return {
        success: false,
        provider_tx_id: null,
        error_message: 'x402 action not available',
        metadata: {},
      }
    }

    const result = await x402Action.invoke(this.walletProvider, {
      url: request.recipient,
      method: 'POST',
      body: JSON.stringify(request.metadata ?? {}),
    })

    return {
      success: true,
      provider_tx_id: typeof result === 'string' ? result : null,
      error_message: null,
      metadata: { x402: true, url: request.recipient },
    }
  }

  /**
   * Execute a USDC transfer.
   */
  private async executeTransfer(request: TransactionRequest): Promise<ProviderTransactionResult> {
    const actions = this.agentKit.getActions()
    const transferAction = actions.find((a: any) => a.name === 'transfer')
      ?? actions.find((a: any) => a.name === 'native_transfer')

    if (!transferAction) {
      return {
        success: false,
        provider_tx_id: null,
        error_message: 'Transfer action not available',
        metadata: {},
      }
    }

    const result = await transferAction.invoke(this.walletProvider, {
      to: request.recipient,
      amount: String(request.amount),
      token: request.currency ?? 'USDC',
    })

    return {
      success: true,
      provider_tx_id: typeof result === 'string' ? result : null,
      error_message: null,
      metadata: { transfer: true },
    }
  }

  /**
   * Execute a token swap.
   */
  private async executeSwap(request: TransactionRequest): Promise<ProviderTransactionResult> {
    const actions = this.agentKit.getActions()
    const swapAction = actions.find((a: any) => a.name === 'swap')

    if (!swapAction) {
      return {
        success: false,
        provider_tx_id: null,
        error_message: 'Swap not available on this network',
        metadata: {},
      }
    }

    const [fromToken, toToken] = (request.description ?? 'USDC:ETH').split(':')

    const result = await swapAction.invoke(this.walletProvider, {
      fromToken: fromToken ?? 'USDC',
      toToken: toToken ?? 'ETH',
      amount: String(request.amount),
    })

    return {
      success: true,
      provider_tx_id: typeof result === 'string' ? result : null,
      error_message: null,
      metadata: { swap: true, from: fromToken, to: toToken },
    }
  }

  /**
   * Discover available x402 services.
   */
  async discoverX402Services(keyword?: string): Promise<unknown[]> {
    this.ensureReady()

    const actions = this.agentKit.getActions()
    const discoverAction = actions.find((a: any) => a.name === 'discover_x402_services')

    if (!discoverAction) return []

    const result = await discoverAction.invoke(this.walletProvider, {
      keyword: keyword ?? '',
    })

    return Array.isArray(result) ? result : []
  }

  /**
   * Get the raw AgentKit instance for advanced operations.
   */
  getAgentKit(): unknown {
    return this.agentKit
  }

  private ensureReady(): void {
    if (!this.ready) {
      throw new Error('CoinbaseWalletProvider is not initialized. Set CDP_API_KEY_ID, CDP_API_KEY_SECRET, CDP_WALLET_SECRET.')
    }
  }
}

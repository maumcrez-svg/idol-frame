import type {
  IWalletProvider,
  ProviderTransactionResult,
  ProviderBalance,
  TransactionRequest,
} from './wallet-provider.js'

/**
 * Stripe Agent Toolkit wallet provider.
 *
 * Uses @stripe/agent-toolkit for:
 * - Creating payment links for Web2 service purchases
 * - Managing invoices and customers
 * - Handling subscriptions for recurring services
 * - Searching Stripe resources
 *
 * Architecture: All tool calls proxy through Stripe's MCP server at mcp.stripe.com.
 * The toolkit does NOT support direct charge creation (safety by design) —
 * agents create payment links that are then executed.
 *
 * Required env vars:
 *   STRIPE_API_KEY (restricted key rk_* recommended)
 *
 * Optional:
 *   STRIPE_CUSTOMER_ID (scope operations to a specific customer)
 *   STRIPE_CONNECTED_ACCOUNT_ID (for connected account operations)
 */
export class StripeWalletProvider implements IWalletProvider {
  readonly type = 'Stripe' as const

  private toolkit: any = null
  private ready = false
  private tools: Map<string, any> = new Map()

  async initialize(config: Record<string, unknown>): Promise<void> {
    const apiKey = (config.stripe_api_key as string) ?? process.env.STRIPE_API_KEY

    if (!apiKey) {
      console.warn('StripeWalletProvider: Missing STRIPE_API_KEY, provider not ready')
      return
    }

    try {
      const { createStripeAgentToolkit } = await import('@stripe/agent-toolkit/modelcontextprotocol')

      const toolkitConfig: Record<string, unknown> = {
        secretKey: apiKey,
      }

      if (config.customer_id) {
        toolkitConfig.context = { customer: config.customer_id }
      }
      if (config.connected_account_id) {
        toolkitConfig.context = {
          ...(toolkitConfig.context as Record<string, unknown> ?? {}),
          account: config.connected_account_id,
        }
      }

      this.toolkit = await createStripeAgentToolkit(toolkitConfig)

      // Index available tools
      const availableTools = this.toolkit.getTools?.() ?? []
      for (const tool of availableTools) {
        if (tool.name) {
          this.tools.set(tool.name, tool)
        }
      }

      this.ready = true
      console.log(`StripeWalletProvider initialized with ${this.tools.size} tools available`)
    } catch (err) {
      console.error('StripeWalletProvider: Failed to initialize', err)
      this.ready = false
    }
  }

  async getBalance(_walletAddress: string): Promise<ProviderBalance> {
    this.ensureReady()

    try {
      const retrieveBalance = this.tools.get('retrieve_balance')
      if (!retrieveBalance) {
        return { balance: 0, currency: 'USD', pending: 0 }
      }

      const result = await this.callTool('retrieve_balance', {})
      const available = result?.available?.[0]?.amount ?? 0
      const pending = result?.pending?.[0]?.amount ?? 0

      return {
        balance: available / 100, // Stripe uses cents
        currency: 'USD',
        pending: pending / 100,
      }
    } catch (err) {
      console.error('StripeWalletProvider: getBalance failed', err)
      return { balance: 0, currency: 'USD', pending: 0 }
    }
  }

  async execute(request: TransactionRequest): Promise<ProviderTransactionResult> {
    this.ensureReady()

    try {
      // Stripe Agent Toolkit doesn't support direct charges.
      // Instead, we create payment links or invoices depending on the use case.
      if (request.category === 'api_service' || request.category === 'compute') {
        return await this.createPaymentLink(request)
      }

      // For recurring services, create an invoice
      return await this.createInvoice(request)
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

    // In Stripe, "provisioning a wallet" means creating a Customer
    const customer = await this.callTool('create_customer', {
      name: `Entity ${entityId}`,
      metadata: { entity_id: entityId, source: 'idol-frame' },
    })

    return {
      address: customer?.id ?? `cus_${entityId}`,
      metadata: {
        stripe_customer_id: customer?.id,
        entity_id: entityId,
      },
    }
  }

  getCapabilities(): string[] {
    const caps: string[] = []
    if (this.tools.has('create_payment_link')) caps.push('payment_link')
    if (this.tools.has('create_invoice')) caps.push('invoice')
    if (this.tools.has('create_customer')) caps.push('customer_management')
    if (this.tools.has('list_payment_intents')) caps.push('payment_intents')
    if (this.tools.has('create_product')) caps.push('products')
    if (this.tools.has('search_stripe_resources')) caps.push('search')
    return caps
  }

  // --- Stripe-specific methods ---

  /**
   * Create a payment link for a service purchase.
   */
  private async createPaymentLink(request: TransactionRequest): Promise<ProviderTransactionResult> {
    // First, ensure a product exists
    const product = await this.callTool('create_product', {
      name: request.description,
      metadata: { category: request.category },
    })

    if (!product?.id) {
      return {
        success: false,
        provider_tx_id: null,
        error_message: 'Failed to create product',
        metadata: {},
      }
    }

    // Create a price for the product
    const price = await this.callTool('create_price', {
      product: product.id,
      unit_amount: Math.round(request.amount * 100), // Stripe uses cents
      currency: (request.currency ?? 'usd').toLowerCase(),
    })

    if (!price?.id) {
      return {
        success: false,
        provider_tx_id: null,
        error_message: 'Failed to create price',
        metadata: {},
      }
    }

    // Create the payment link
    const link = await this.callTool('create_payment_link', {
      line_items: [{ price: price.id, quantity: 1 }],
    })

    return {
      success: true,
      provider_tx_id: link?.id ?? null,
      error_message: null,
      metadata: {
        payment_link_url: link?.url,
        product_id: product.id,
        price_id: price.id,
      },
    }
  }

  /**
   * Create an invoice for a service.
   */
  private async createInvoice(request: TransactionRequest): Promise<ProviderTransactionResult> {
    const invoice = await this.callTool('create_invoice', {
      description: request.description,
      metadata: { category: request.category },
    })

    if (!invoice?.id) {
      return {
        success: false,
        provider_tx_id: null,
        error_message: 'Failed to create invoice',
        metadata: {},
      }
    }

    // Add line item
    await this.callTool('create_invoice_item', {
      invoice: invoice.id,
      amount: Math.round(request.amount * 100),
      currency: (request.currency ?? 'usd').toLowerCase(),
      description: request.description,
    })

    // Finalize the invoice
    const finalized = await this.callTool('finalize_invoice', {
      invoice: invoice.id,
    })

    return {
      success: true,
      provider_tx_id: finalized?.id ?? invoice.id,
      error_message: null,
      metadata: {
        invoice_id: invoice.id,
        invoice_url: finalized?.hosted_invoice_url,
        status: finalized?.status,
        settlement: 'pending', // Invoice finalized but payment not yet collected
      },
    }
  }

  /**
   * Search Stripe resources (payments, customers, etc.).
   */
  async search(query: string): Promise<unknown> {
    this.ensureReady()
    return this.callTool('search_stripe_resources', { query })
  }

  /**
   * List recent payment intents.
   */
  async listPayments(limit = 10): Promise<unknown> {
    this.ensureReady()
    return this.callTool('list_payment_intents', { limit })
  }

  /**
   * Get the raw toolkit instance for advanced operations.
   */
  getToolkit(): unknown {
    return this.toolkit
  }

  private async callTool(name: string, args: Record<string, unknown>): Promise<any> {
    if (!this.toolkit) throw new Error('Toolkit not initialized')

    // Use MCP-based tool execution
    try {
      const result = await this.toolkit.callTool(name, args)
      return result
    } catch (err) {
      console.error(`StripeWalletProvider: Tool ${name} failed`, err)
      throw err
    }
  }

  private ensureReady(): void {
    if (!this.ready) {
      throw new Error('StripeWalletProvider is not initialized. Set STRIPE_API_KEY.')
    }
  }

  async close(): Promise<void> {
    if (this.toolkit?.close) {
      await this.toolkit.close()
    }
    this.ready = false
  }
}

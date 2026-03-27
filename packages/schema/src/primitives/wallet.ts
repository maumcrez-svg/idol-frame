import { z } from 'zod'

// --- Enums ---

export const WalletProviderTypeSchema = z.enum(['Coinbase', 'Stripe'])

export const WalletStatusSchema = z.enum(['Active', 'Frozen', 'Closed'])

export const WalletNetworkSchema = z.enum([
  'base-mainnet',
  'base-sepolia',
  'ethereum-mainnet',
  'ethereum-sepolia',
  'solana-mainnet',
  'solana-devnet',
])

export const TransactionStatusSchema = z.enum([
  'Pending',
  'Completed',
  'Failed',
  'Blocked',     // blocked by guardrail
  'Reverted',
])

export const TransactionCategorySchema = z.enum([
  'compute',         // paying for LLM inference, GPU, etc.
  'media_asset',     // buying images, audio, video assets
  'tts',             // text-to-speech services
  'image_gen',       // image generation services
  'video_gen',       // video generation services
  'audio_gen',       // audio/music generation
  'api_service',     // generic API calls
  'agent_payment',   // agent-to-agent payment (x402)
  'transfer',        // direct USDC/token transfer
  'swap',            // token swap
  'other',
])

// --- Sub-schemas ---

export const SpendingLimitsSchema = z.object({
  per_transaction: z.number().min(0).nullable().default(null),
  per_day: z.number().min(0).nullable().default(null),
  per_month: z.number().min(0).nullable().default(null),
  allowed_categories: z.array(TransactionCategorySchema).default([]),
  requires_approval_above: z.number().min(0).nullable().default(null),
})

export const CoinbaseConfigSchema = z.object({
  wallet_type: z.enum(['smart', 'mpc']).default('smart'),
  network_id: WalletNetworkSchema.default('base-mainnet'),
  smart_wallet_address: z.string().nullable().default(null),
  owner_address: z.string().nullable().default(null),
  paymaster_url: z.string().nullable().default(null),
  x402_enabled: z.boolean().default(true),
  x402_max_payment_usdc: z.number().min(0).default(1.0),
})

export const StripeConfigSchema = z.object({
  customer_id: z.string().nullable().default(null),
  connected_account_id: z.string().nullable().default(null),
})

export const WalletProviderConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('Coinbase'),
    coinbase: CoinbaseConfigSchema,
  }),
  z.object({
    type: z.literal('Stripe'),
    stripe: StripeConfigSchema,
  }),
])

// --- Main Wallet Schema ---

export const WalletSchema = z.object({
  id: z.string().startsWith('wal-'),
  entity_id: z.string().startsWith('e-'),
  name: z.string().default('default'),
  provider: WalletProviderConfigSchema,
  address: z.string().nullable().default(null),
  currency: z.string().default('USDC'),
  balance: z.number().min(0).default(0),
  spending_limits: SpendingLimitsSchema.default({}),
  total_spent: z.number().min(0).default(0),
  total_transactions: z.number().int().min(0).default(0),
  status: WalletStatusSchema.default('Active'),
  created_at: z.string(),
  updated_at: z.string(),
})

// --- Transaction Schema (append-only ledger) ---

export const WalletTransactionSchema = z.object({
  id: z.string().startsWith('wtx-'),
  wallet_id: z.string().startsWith('wal-'),
  entity_id: z.string().startsWith('e-'),
  category: TransactionCategorySchema,
  description: z.string(),
  amount: z.number().min(0),
  currency: z.string().default('USDC'),
  recipient: z.string().default(''),
  status: TransactionStatusSchema,
  provider_tx_id: z.string().nullable().default(null),
  provider_type: WalletProviderTypeSchema,
  error_message: z.string().nullable().default(null),
  guardrail_blocked: z.boolean().default(false),
  metadata: z.record(z.string(), z.unknown()).default({}),
  timestamp: z.string(),
})

// --- Type Exports ---

export type WalletProviderType = z.infer<typeof WalletProviderTypeSchema>
export type WalletStatus = z.infer<typeof WalletStatusSchema>
export type WalletNetwork = z.infer<typeof WalletNetworkSchema>
export type TransactionStatus = z.infer<typeof TransactionStatusSchema>
export type TransactionCategory = z.infer<typeof TransactionCategorySchema>
export type SpendingLimits = z.infer<typeof SpendingLimitsSchema>
export type CoinbaseConfig = z.infer<typeof CoinbaseConfigSchema>
export type StripeConfig = z.infer<typeof StripeConfigSchema>
export type WalletProviderConfig = z.infer<typeof WalletProviderConfigSchema>
export type Wallet = z.infer<typeof WalletSchema>
export type WalletTransaction = z.infer<typeof WalletTransactionSchema>

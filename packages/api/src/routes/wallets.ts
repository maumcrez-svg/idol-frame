import { z } from 'zod'
import type { FastifyInstance } from 'fastify'
import type { WalletManager } from '../../../state/src/wallet-manager.js'
import type { EntityStore } from '../../../identity/src/entity-store.js'
import type { IDocumentStore } from '../../../storage/src/index.js'
import {
  WalletProviderConfigSchema,
  SpendingLimitsSchema,
  WalletStatusSchema,
  TransactionCategorySchema,
} from '../../../schema/src/index.js'
import { validateBody, validateParams, validateQuery } from '../middleware/validate.js'

export interface WalletDeps {
  walletManager: WalletManager
  entityStore: EntityStore
  docs: IDocumentStore
}

// --- Param Schemas ---

const EntityIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
})

const WalletIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
  walletId: z.string().startsWith('wal-'),
})

const TxIdParamsSchema = z.object({
  id: z.string().startsWith('e-'),
  walletId: z.string().startsWith('wal-'),
  txId: z.string().startsWith('wtx-'),
})

// --- Body Schemas ---

const CreateWalletBodySchema = z.object({
  name: z.string().min(1).optional(),
  provider: WalletProviderConfigSchema,
  currency: z.string().optional(),
  spending_limits: SpendingLimitsSchema.partial().optional(),
})

const ProvisionWalletBodySchema = z.object({
  name: z.string().min(1).optional(),
  provider_type: z.enum(['Coinbase', 'Stripe']),
  currency: z.string().optional(),
  spending_limits: SpendingLimitsSchema.partial().optional(),
})

const UpdateWalletBodySchema = z.object({
  name: z.string().min(1).optional(),
  spending_limits: SpendingLimitsSchema.partial().optional(),
  status: WalletStatusSchema.optional(),
})

const TransactBodySchema = z.object({
  category: TransactionCategorySchema,
  description: z.string().min(1),
  amount: z.number().min(0.001),
  recipient: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

// --- Query Schemas ---

const TxQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  after: z.string().optional(),
  before: z.string().optional(),
  category: TransactionCategorySchema.optional(),
  status: z.string().optional(),
})

export function registerWalletRoutes(
  app: FastifyInstance,
  deps: WalletDeps,
): void {
  const { walletManager, entityStore, docs } = deps

  // --- List wallets for entity ---
  app.get('/v1/entities/:id/wallets', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)

    const entity = entityStore.get(id)
    if (!entity) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Entity not found: ${id}` }],
      }
    }

    const wallets = walletManager.getByEntity(id)

    return {
      data: wallets,
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [],
    }
  })

  // --- Create wallet (manual config) ---
  app.post('/v1/entities/:id/wallets', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const body = validateBody(req, CreateWalletBodySchema)

    const entity = entityStore.get(id)
    if (!entity) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Entity not found: ${id}` }],
      }
    }

    const wallet = walletManager.create({
      entity_id: id,
      name: body.name,
      provider: body.provider,
      currency: body.currency,
      spending_limits: body.spending_limits,
    })

    reply.code(201)
    return {
      data: wallet,
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [],
    }
  })

  // --- Provision wallet (auto-create via provider) ---
  app.post('/v1/entities/:id/wallets/provision', async (req, reply) => {
    const { id } = validateParams(req, EntityIdParamsSchema)
    const body = validateBody(req, ProvisionWalletBodySchema)

    const entity = entityStore.get(id)
    if (!entity) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Entity not found: ${id}` }],
      }
    }

    try {
      const wallet = await walletManager.provision({
        entity_id: id,
        name: body.name,
        provider_type: body.provider_type,
        currency: body.currency,
        spending_limits: body.spending_limits,
      })

      reply.code(201)
      return {
        data: wallet,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [],
      }
    } catch (err) {
      reply.code(422)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: err instanceof Error ? err.message : 'Provision failed' }],
      }
    }
  })

  // --- Get wallet ---
  app.get('/v1/entities/:id/wallets/:walletId', async (req, reply) => {
    const { id, walletId } = validateParams(req, WalletIdParamsSchema)

    const entity = entityStore.get(id)
    if (!entity) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Entity not found: ${id}` }],
      }
    }

    const wallet = walletManager.get(walletId)
    if (!wallet || wallet.entity_id !== id) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Wallet not found: ${walletId}` }],
      }
    }

    return {
      data: wallet,
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [],
    }
  })

  // --- Update wallet ---
  app.put('/v1/entities/:id/wallets/:walletId', async (req, reply) => {
    const { id, walletId } = validateParams(req, WalletIdParamsSchema)
    const body = validateBody(req, UpdateWalletBodySchema)

    const entity = entityStore.get(id)
    if (!entity) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Entity not found: ${id}` }],
      }
    }

    const wallet = walletManager.get(walletId)
    if (!wallet || wallet.entity_id !== id) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Wallet not found: ${walletId}` }],
      }
    }

    const updated = walletManager.update(walletId, body)

    return {
      data: updated,
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [],
    }
  })

  // --- Close (delete) wallet ---
  app.delete('/v1/entities/:id/wallets/:walletId', async (req, reply) => {
    const { id, walletId } = validateParams(req, WalletIdParamsSchema)

    const entity = entityStore.get(id)
    if (!entity) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Entity not found: ${id}` }],
      }
    }

    const wallet = walletManager.get(walletId)
    if (!wallet || wallet.entity_id !== id) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Wallet not found: ${walletId}` }],
      }
    }

    const closed = walletManager.update(walletId, { status: 'Closed' })

    return {
      data: closed,
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [],
    }
  })

  // --- Sync balance from provider ---
  app.post('/v1/entities/:id/wallets/:walletId/sync', async (req, reply) => {
    const { id, walletId } = validateParams(req, WalletIdParamsSchema)

    const entity = entityStore.get(id)
    if (!entity) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Entity not found: ${id}` }],
      }
    }

    const wallet = walletManager.get(walletId)
    if (!wallet || wallet.entity_id !== id) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Wallet not found: ${walletId}` }],
      }
    }

    try {
      const synced = await walletManager.syncBalance(walletId)
      return {
        data: synced,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [],
      }
    } catch (err) {
      reply.code(422)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: err instanceof Error ? err.message : 'Sync failed' }],
      }
    }
  })

  // --- Execute transaction ---
  app.post('/v1/entities/:id/wallets/:walletId/transact', async (req, reply) => {
    const { id, walletId } = validateParams(req, WalletIdParamsSchema)
    const body = validateBody(req, TransactBodySchema)

    const entity = entityStore.get(id)
    if (!entity) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Entity not found: ${id}` }],
      }
    }

    const wallet = walletManager.get(walletId)
    if (!wallet || wallet.entity_id !== id) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Wallet not found: ${walletId}` }],
      }
    }

    // Fetch entity guardrails for spending checks
    const guardrails = docs.list('guardrails', { entity_id: id })

    const tx = await walletManager.transact({
      wallet_id: walletId,
      category: body.category,
      description: body.description,
      amount: body.amount,
      recipient: body.recipient,
      metadata: body.metadata,
      guardrails: guardrails as any[],
    })

    const statusCode = tx.status === 'Blocked' ? 403 : tx.status === 'Failed' ? 422 : 201
    reply.code(statusCode)

    return {
      data: tx,
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: tx.error_message ? [{ message: tx.error_message }] : [],
    }
  })

  // --- List transactions ---
  app.get('/v1/entities/:id/wallets/:walletId/transactions', async (req, reply) => {
    const { id, walletId } = validateParams(req, WalletIdParamsSchema)
    const query = validateQuery(req, TxQuerySchema)

    const entity = entityStore.get(id)
    if (!entity) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Entity not found: ${id}` }],
      }
    }

    const wallet = walletManager.get(walletId)
    if (!wallet || wallet.entity_id !== id) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Wallet not found: ${walletId}` }],
      }
    }

    const txs = walletManager.getTransactions(walletId, query)

    return {
      data: txs,
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [],
    }
  })

  // --- Get transaction ---
  app.get('/v1/entities/:id/wallets/:walletId/transactions/:txId', async (req, reply) => {
    const { id, walletId, txId } = validateParams(req, TxIdParamsSchema)

    const entity = entityStore.get(id)
    if (!entity) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Entity not found: ${id}` }],
      }
    }

    const wallet = walletManager.get(walletId)
    if (!wallet || wallet.entity_id !== id) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Wallet not found: ${walletId}` }],
      }
    }

    const tx = walletManager.getTransaction(txId)
    if (!tx || tx.wallet_id !== walletId) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Transaction not found: ${txId}` }],
      }
    }

    return {
      data: tx,
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [],
    }
  })

  // --- Spending summary ---
  app.get('/v1/entities/:id/wallets/:walletId/spending', async (req, reply) => {
    const { id, walletId } = validateParams(req, WalletIdParamsSchema)

    const entity = entityStore.get(id)
    if (!entity) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Entity not found: ${id}` }],
      }
    }

    const wallet = walletManager.get(walletId)
    if (!wallet || wallet.entity_id !== id) {
      reply.code(404)
      return {
        data: null,
        meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
        errors: [{ message: `Wallet not found: ${walletId}` }],
      }
    }

    return {
      data: {
        wallet_id: walletId,
        balance: wallet.balance,
        total_spent: wallet.total_spent,
        total_transactions: wallet.total_transactions,
        spent_today: walletManager.getSpentToday(walletId),
        spent_this_month: walletManager.getSpentThisMonth(walletId),
        spending_limits: wallet.spending_limits,
      },
      meta: { request_id: req.id, timestamp: new Date().toISOString(), version: 'v1' },
      errors: [],
    }
  })
}

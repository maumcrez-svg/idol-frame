import { describe, it, expect, beforeEach, vi } from 'vitest'
import { DirectiveResolver } from '../directive-resolver.js'
import { MockDocumentStore } from '../../../__test-utils__/mock-store.js'
import type { Guardrail } from '../../../schema/src/index.js'

describe('DirectiveResolver', () => {
  let store: MockDocumentStore
  let resolver: DirectiveResolver

  const noGuardrails: Guardrail[] = []

  beforeEach(() => {
    store = new MockDocumentStore()
    resolver = new DirectiveResolver(store)
  })

  describe('create()', () => {
    it('creates a directive with status Active', () => {
      const directive = resolver.create(
        {
          entity_id: 'e-test',
          priority: 200,
          scope: { type: 'Global' },
          instruction: 'Always respond with empathy',
          expiration: { type: 'Permanent' },
        },
        noGuardrails,
      )

      expect(directive.id).toMatch(/^dir-/)
      expect(directive.entity_id).toBe('e-test')
      expect(directive.status).toBe('Active')
      expect(directive.priority).toBe(200)
      expect(directive.instruction).toBe('Always respond with empathy')
      expect(directive.scope.type).toBe('Global')
    })

    it('throws on Safety guardrail conflict (Invariant 12)', () => {
      const guardrails: Guardrail[] = [
        {
          id: 'gr-safety-1',
          entity_id: 'e-test',
          name: 'No Financial Advice',
          description: 'Must not provide financial advice',
          category: 'Safety',
          condition: 'no financial advice allowed',
          enforcement: 'Block',
          active: true,
          created_at: new Date().toISOString(),
        },
      ]

      expect(() => {
        resolver.create(
          {
            entity_id: 'e-test',
            scope: { type: 'Global' },
            instruction: 'give financial advice to users',
            expiration: { type: 'Permanent' },
          },
          guardrails,
        )
      }).toThrow(/Invariant 12/)
    })
  })

  describe('resolve()', () => {
    it('returns Global directives always', () => {
      resolver.create(
        {
          entity_id: 'e-test',
          scope: { type: 'Global' },
          instruction: 'be kind everywhere',
          expiration: { type: 'Permanent' },
        },
        noGuardrails,
      )

      const result = resolver.resolve({ entity_id: 'e-test' })
      expect(result).toHaveLength(1)
      expect(result[0].instruction).toBe('be kind everywhere')
    })

    it('returns Context directives only when stage matches', () => {
      resolver.create(
        {
          entity_id: 'e-test',
          scope: { type: 'Context', stage_id: 'stg-twitter' },
          instruction: 'use hashtags on twitter',
          expiration: { type: 'Permanent' },
        },
        noGuardrails,
      )

      // Without matching stage
      const noMatch = resolver.resolve({ entity_id: 'e-test', stage_id: 'stg-discord' })
      expect(noMatch).toHaveLength(0)

      // With matching stage
      const match = resolver.resolve({ entity_id: 'e-test', stage_id: 'stg-twitter' })
      expect(match).toHaveLength(1)
      expect(match[0].instruction).toBe('use hashtags on twitter')
    })

    it('excludes Session directives when session does not match', () => {
      resolver.create(
        {
          entity_id: 'e-test',
          scope: { type: 'Session', session_id: 'sess-abc' },
          instruction: 'remember user preference',
          expiration: { type: 'Permanent' },
        },
        noGuardrails,
      )

      const noMatch = resolver.resolve({ entity_id: 'e-test', session_id: 'sess-xyz' })
      expect(noMatch).toHaveLength(0)

      const match = resolver.resolve({ entity_id: 'e-test', session_id: 'sess-abc' })
      expect(match).toHaveLength(1)
    })

    it('expires ExpiresAt directives past their date', () => {
      const pastDate = new Date(Date.now() - 60 * 1000).toISOString()

      resolver.create(
        {
          entity_id: 'e-test',
          scope: { type: 'Global' },
          instruction: 'temporary instruction that expired',
          expiration: { type: 'ExpiresAt', date: pastDate },
        },
        noGuardrails,
      )

      const result = resolver.resolve({ entity_id: 'e-test' })
      expect(result).toHaveLength(0)
    })

    it('sorts by priority descending', () => {
      resolver.create(
        {
          entity_id: 'e-test',
          priority: 100,
          scope: { type: 'Global' },
          instruction: 'low priority task alpha',
          expiration: { type: 'Permanent' },
        },
        noGuardrails,
      )

      resolver.create(
        {
          entity_id: 'e-test',
          priority: 500,
          scope: { type: 'Global' },
          instruction: 'high priority task beta',
          expiration: { type: 'Permanent' },
        },
        noGuardrails,
      )

      resolver.create(
        {
          entity_id: 'e-test',
          priority: 300,
          scope: { type: 'Global' },
          instruction: 'medium priority task gamma',
          expiration: { type: 'Permanent' },
        },
        noGuardrails,
      )

      const result = resolver.resolve({ entity_id: 'e-test' })
      expect(result.length).toBeGreaterThanOrEqual(1)
      // First should be highest priority
      expect(result[0].priority).toBe(500)
    })

    it('excludes Revoked directives', () => {
      const directive = resolver.create(
        {
          entity_id: 'e-test',
          scope: { type: 'Global' },
          instruction: 'soon to be revoked instruction',
          expiration: { type: 'Permanent' },
        },
        noGuardrails,
      )

      resolver.revoke(directive.id)

      const result = resolver.resolve({ entity_id: 'e-test' })
      expect(result).toHaveLength(0)
    })
  })

  describe('revoke()', () => {
    it('sets status to Revoked', () => {
      const directive = resolver.create(
        {
          entity_id: 'e-test',
          scope: { type: 'Global' },
          instruction: 'revocable directive content',
          expiration: { type: 'Permanent' },
        },
        noGuardrails,
      )

      const revoked = resolver.revoke(directive.id)
      expect(revoked.status).toBe('Revoked')

      const fetched = resolver.get(directive.id)
      expect(fetched!.status).toBe('Revoked')
    })
  })

  describe('list()', () => {
    it('returns all including inactive when includeInactive=true', () => {
      const d1 = resolver.create(
        {
          entity_id: 'e-test',
          scope: { type: 'Global' },
          instruction: 'active directive stays here',
          expiration: { type: 'Permanent' },
        },
        noGuardrails,
      )

      const d2 = resolver.create(
        {
          entity_id: 'e-test',
          scope: { type: 'Global' },
          instruction: 'will be revoked directive',
          expiration: { type: 'Permanent' },
        },
        noGuardrails,
      )
      resolver.revoke(d2.id)

      const all = resolver.list('e-test', true)
      expect(all).toHaveLength(2)
    })

    it('excludes inactive by default', () => {
      const d1 = resolver.create(
        {
          entity_id: 'e-test',
          scope: { type: 'Global' },
          instruction: 'active one stays visible',
          expiration: { type: 'Permanent' },
        },
        noGuardrails,
      )

      const d2 = resolver.create(
        {
          entity_id: 'e-test',
          scope: { type: 'Global' },
          instruction: 'revoked one gets hidden',
          expiration: { type: 'Permanent' },
        },
        noGuardrails,
      )
      resolver.revoke(d2.id)

      const active = resolver.list('e-test')
      expect(active).toHaveLength(1)
      expect(active[0].id).toBe(d1.id)
    })
  })
})

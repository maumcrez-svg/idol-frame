import { z } from 'zod'

export const SnapshotStateSchema = z.object({
  entity: z.record(z.unknown()),
  identity_core: z.record(z.unknown()),
  voice: z.record(z.unknown()),
  traits: z.array(z.record(z.unknown())),
  guardrails: z.array(z.record(z.unknown())),
  lore: z.array(z.record(z.unknown())),
  aesthetic: z.record(z.unknown()).nullable(),
})

export const SnapshotSchema = z.object({
  id: z.string().startsWith('snap-'),
  entity_id: z.string().startsWith('e-'),
  version: z.string(),
  label: z.string().default(''),
  state: SnapshotStateSchema,
  checksum: z.string(),
  created_at: z.string(),
})

export type SnapshotState = z.infer<typeof SnapshotStateSchema>
export type Snapshot = z.infer<typeof SnapshotSchema>

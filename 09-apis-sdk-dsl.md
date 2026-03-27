# Part 9: APIs, SDK, and DSL

**Status:** NORMATIVE
**Depends on:** Part 3 (Framework Primitives), Part 5 (System Architecture), Part 6 (Runtime & Cognition)
**Version:** 1.0.0
**Date:** 2026-03-15

---

## 1. API Design Philosophy

Idol Frame exposes three interface layers, each suited to a different interaction pattern:

| Protocol | Use Case | Examples |
|---|---|---|
| **REST** | CRUD operations, configuration, queries | Create entity, update traits, list performances |
| **WebSocket** | Real-time interaction sessions | Live chat, streaming performances, voice sessions |
| **Events** | Async notifications, integrations | Webhook delivery on `performance.published`, `drift.detected` |

### Design Principles

1. **Every primitive is a first-class API resource.** Each of the 20 primitives from Part 3 has its own endpoint namespace. No primitive is hidden behind another or accessible only through internal modules.

2. **The API mirrors the primitive hierarchy.** Resources nest according to ownership: `/entities/{id}/traits/{name}`, `/entities/{id}/arcs/{aid}/phases/{idx}`. This is not cosmetic -- it enforces the ownership invariants from Part 3.

3. **Versioned API.** All endpoints are prefixed with `/v1/`. Breaking changes require a new version. Non-breaking additions (new optional fields, new endpoints) are added within the current version.

4. **Consistent response envelope.** Every response uses the same envelope:

```json
{
  "data": { ... },
  "meta": {
    "request_id": "req-a1b2c3d4",
    "timestamp": "2026-03-15T14:30:00Z",
    "version": "v1"
  },
  "errors": []
}
```

5. **ID prefixes.** All IDs use the prefix conventions from Part 3: `e-` for entities, `ic-` for identity cores, `perf-` for performances, etc. The API validates prefixes on input.

6. **Idempotency.** All POST requests accept an optional `Idempotency-Key` header. Duplicate requests with the same key return the original response without re-executing.

---

## 2. REST API Reference

Base URL: `https://api.idolframe.dev/v1`

All requests require an `Authorization: Bearer <api_key>` header. Request and response bodies are JSON. Dates are ISO 8601.

---

### 2.1 Entity Endpoints

#### `POST /v1/entities` -- Create Entity

Creates a new entity. Requires at minimum an IdentityCore and Voice specification. A default Safety guardrail is auto-created (Invariant 1).

**Request body:**

```json
{
  "name": "Kael",
  "identity_core": {
    "values": [
      { "name": "authenticity", "rank": 1, "description": "Truth over comfort" },
      { "name": "curiosity", "rank": 2, "description": "Every question is a door" }
    ],
    "worldview": {
      "orientation": "pragmatic-idealist",
      "beliefs": ["Technology amplifies human intent", "Conflict reveals character"],
      "epistemology": "empirical with room for intuition"
    },
    "communication_philosophy": "Direct but never cruel. Complexity is not an excuse for obscurity.",
    "core_tensions": [
      { "pole_a": "vulnerability", "pole_b": "self-protection", "default_balance": 0.6 }
    ],
    "recognition_markers": ["dry humor under pressure", "questions before answers"]
  },
  "voice": {
    "vocabulary": {
      "preferred_terms": ["consider", "tension", "signal"],
      "avoided_terms": ["synergy", "leverage", "circle back"],
      "jargon_level": 0.3,
      "profanity_level": 0.1
    },
    "syntax": {
      "avg_sentence_length": 14,
      "complexity": 0.6,
      "fragment_frequency": 0.15
    },
    "rhetoric": {
      "primary_devices": ["understatement", "rhetorical_question"],
      "avoided_devices": ["hyperbole"]
    },
    "emotional_register": {
      "baseline_intensity": 0.5,
      "range": [0.2, 0.8],
      "expression_style": "controlled"
    },
    "sample_utterances": [
      { "context": "agreement", "text": "That tracks. Let me build on it." },
      { "context": "disagreement", "text": "I see where you're going, but the data says otherwise." }
    ]
  },
  "aesthetic": {
    "color_palette": {
      "primary": "#1a1a2e",
      "secondary": "#16213e",
      "accent": "#e94560"
    },
    "visual_style": { "style": "minimalist-editorial", "influences": ["Dieter Rams", "Massimo Vignelli"] },
    "typography": { "heading_font": "Inter", "body_font": "IBM Plex Mono" }
  },
  "traits": {
    "curiosity": { "value": 0.8, "range": [0.4, 1.0] },
    "warmth": { "value": 0.6, "range": [0.2, 0.9] },
    "assertiveness": { "value": 0.7, "range": [0.3, 0.9] }
  },
  "guardrails": [
    {
      "constraint": "Never disclose personal data about real individuals",
      "category": "Safety",
      "enforcement": "Block",
      "evaluator": "pii_detector_v2",
      "override_allowed": false
    }
  ]
}
```

**Response:** `201 Created`

```json
{
  "data": {
    "id": "e-7f3a8b2c",
    "version": "1.0.0",
    "status": "Active",
    "name": "Kael",
    "identity_core": { "id": "ic-9d4e1f0a", "version": "1.0.0", "..." : "..." },
    "voice": { "..." : "..." },
    "aesthetic": { "..." : "..." },
    "traits": {
      "curiosity": { "name": "curiosity", "value": 0.8, "range": [0.4, 1.0], "drift_rule": null },
      "warmth": { "name": "warmth", "value": 0.6, "range": [0.2, 0.9], "drift_rule": null },
      "assertiveness": { "name": "assertiveness", "value": 0.7, "range": [0.3, 0.9], "drift_rule": null }
    },
    "guardrails": [ { "id": "g-b1c2d3e4", "..." : "..." } ],
    "created_at": "2026-03-15T14:30:00Z"
  }
}
```

**Status codes:** `201` Created. `400` Validation error (missing required fields, trait value outside range). `409` Conflict (duplicate idempotency key).

---

#### `GET /v1/entities/{id}` -- Get Entity

Returns the full entity state at the current version, or at a specific version if the `version` query parameter is provided.

**Query parameters:**
- `version` (optional): SemVer string. Returns the entity as it existed at that version.
- `include` (optional): Comma-separated list of sub-resources to embed: `memory`, `relationships`, `arcs`, `performances`.

**Response:** `200 OK`

```json
{
  "data": {
    "id": "e-7f3a8b2c",
    "version": "1.2.3",
    "status": "Active",
    "name": "Kael",
    "identity_core": { "id": "ic-9d4e1f0a", "version": "1.2.0", "..." : "..." },
    "voice": { "..." : "..." },
    "aesthetic": { "..." : "..." },
    "traits": { "..." : "..." },
    "guardrails": [ "..." ],
    "active_mood": null,
    "active_arc": null,
    "active_epoch": { "name": "Genesis", "ordinal": 1, "status": "Active" }
  }
}
```

**Status codes:** `200` OK. `404` Entity not found. `410` Entity archived.

---

#### `PATCH /v1/entities/{id}` -- Update Entity Metadata

Updates mutable entity metadata (name, status). Does not modify identity-layer primitives; use the specific sub-resource endpoints for those.

**Request body:**

```json
{
  "name": "Kael Reborn",
  "status": "Dormant"
}
```

**Response:** `200 OK` with updated entity.

**Status codes:** `200` OK. `400` Invalid status transition. `404` Not found.

---

#### `POST /v1/entities/{id}/version` -- Create New Entity Version

Increments the entity version. Required when modifying IdentityCore or Voice (minor version). Trait and guardrail changes are patch versions and happen automatically.

**Request body:**

```json
{
  "identity_core": { "..." : "(new IdentityCore fields)" },
  "voice": { "..." : "(new Voice fields, optional)" },
  "changelog": "Refined core tensions after Season 1 arc completion"
}
```

**Response:** `201 Created`

```json
{
  "data": {
    "id": "e-7f3a8b2c",
    "version": "1.3.0",
    "previous_version": "1.2.3",
    "identity_core": { "id": "ic-ff2a3b4c", "version": "1.3.0" },
    "changelog": "Refined core tensions after Season 1 arc completion"
  }
}
```

**Status codes:** `201` Created. `400` Invalid IdentityCore. `404` Not found.

**Side effects:** A pre-version Snapshot is created automatically via `evolution.SnapshotService`.

---

#### `GET /v1/entities/{id}/snapshots` -- List Snapshots

**Query parameters:**
- `trigger` (optional): Filter by trigger type: `EpochBoundary`, `PreArc`, `CreatorRequested`, `Scheduled`.
- `limit` (optional, default 20): Max results.
- `offset` (optional, default 0): Pagination offset.

**Response:** `200 OK`

```json
{
  "data": [
    {
      "id": "snap-a1b2c3d4",
      "trigger": "PreArc",
      "entity_version": "1.2.0",
      "checksum": "sha256:e3b0c44298fc1c...",
      "created_at": "2026-03-10T09:00:00Z",
      "parent_snapshot": "snap-00112233"
    }
  ],
  "meta": { "total": 12, "limit": 20, "offset": 0, "..." : "..." }
}
```

**Status codes:** `200` OK. `404` Entity not found.

---

#### `POST /v1/entities/{id}/snapshots` -- Create Snapshot

**Request body:**

```json
{
  "trigger": "CreatorRequested",
  "tags": ["pre-experiment", "baseline"]
}
```

**Response:** `201 Created` with full Snapshot object including `checksum`.

**Status codes:** `201` Created. `404` Entity not found.

---

#### `POST /v1/entities/{id}/snapshots/{snap_id}/restore` -- Restore Snapshot

Restores the entity to the state captured in the specified snapshot. A new snapshot of the current state is taken before restoration.

**Request body:**

```json
{
  "confirm": true,
  "reason": "Rolling back failed arc experiment"
}
```

**Response:** `200 OK`

```json
{
  "data": {
    "restored_from": "snap-a1b2c3d4",
    "pre_restore_snapshot": "snap-e5f6a7b8",
    "entity_version_after": "1.4.0",
    "success": true
  }
}
```

**Status codes:** `200` OK. `400` Missing confirmation. `404` Snapshot or entity not found. `409` Checksum verification failed (Invariant 6).

---

### 2.2 Identity Endpoints

#### `GET /v1/entities/{id}/identity-core` -- Get IdentityCore

Returns the current IdentityCore, or a historical version.

**Query parameters:**
- `version` (optional): SemVer string for historical lookup.

**Response:** `200 OK`

```json
{
  "data": {
    "id": "ic-9d4e1f0a",
    "entity_id": "e-7f3a8b2c",
    "version": "1.2.0",
    "values": [
      { "name": "authenticity", "rank": 1, "description": "Truth over comfort" },
      { "name": "curiosity", "rank": 2, "description": "Every question is a door" }
    ],
    "worldview": { "..." : "..." },
    "communication_philosophy": "Direct but never cruel.",
    "core_tensions": [ { "pole_a": "vulnerability", "pole_b": "self-protection", "default_balance": 0.6 } ],
    "recognition_markers": ["dry humor under pressure", "questions before answers"]
  }
}
```

**Status codes:** `200` OK. `404` Entity or version not found.

---

#### `PUT /v1/entities/{id}/traits/{name}` -- Update Trait

Updates a single trait's value or range. Triggers an entity patch version bump via `identity.TraitEngine`.

**Request body:**

```json
{
  "value": 0.75,
  "range": [0.3, 0.95],
  "drift_rule": {
    "rate": 0.02,
    "period": "P7D",
    "direction": "TowardInteractions",
    "bounds": [0.4, 0.95]
  }
}
```

**Response:** `200 OK`

```json
{
  "data": {
    "name": "curiosity",
    "value": 0.75,
    "range": [0.3, 0.95],
    "drift_rule": {
      "id": "drift-c1d2e3f4",
      "trait_name": "curiosity",
      "rate": 0.02,
      "period": "P7D",
      "direction": "TowardInteractions",
      "bounds": [0.4, 0.95]
    },
    "affects": ["questioning_frequency", "topic_exploration_depth"],
    "entity_version": "1.2.4"
  }
}
```

**Status codes:** `200` OK. `400` Value outside range, or range violates epoch constraints. `404` Entity or trait not found.

**Invariant enforced:** Trait boundedness (Invariant 4). The API rejects any value outside the specified range.

---

#### `GET /v1/entities/{id}/voice` -- Get Voice

Returns the current Voice specification, optionally with mood modulation applied.

**Query parameters:**
- `effective` (optional, default `false`): If `true`, returns the Voice with current Mood modulation applied via `identity.VoiceRegistry.GetEffectiveVoice`.

**Response:** `200 OK` with full Voice primitive.

---

#### `PUT /v1/entities/{id}/voice` -- Update Voice

Replaces the entity's Voice specification. This triggers a minor version increment (IdentityCore or Voice change = minor version per Part 3 Entity lifecycle).

**Request body:** Full Voice object (same schema as in entity creation).

**Response:** `200 OK`

```json
{
  "data": {
    "voice": { "..." : "(updated voice)" },
    "entity_version": "1.3.0",
    "previous_version": "1.2.4"
  }
}
```

**Status codes:** `200` OK. `400` Invalid Voice spec. `404` Not found.

---

### 2.3 Directive Endpoints

#### `POST /v1/entities/{id}/directives` -- Issue Directive

Creates a new directive. Validated against all active Guardrails at creation time (Invariant 12). Rejected if any Guardrail would be violated.

**Request body:**

```json
{
  "priority": 500,
  "scope": { "type": "Context", "stage_id": "stage-twitter01" },
  "instruction": "When discussing technology trends, emphasize human impact over technical specs",
  "expiration": { "type": "ExpiresAt", "expires_at": "2026-04-15T00:00:00Z" }
}
```

**Response:** `201 Created`

```json
{
  "data": {
    "id": "d-f1e2d3c4",
    "entity_id": "e-7f3a8b2c",
    "priority": 500,
    "scope": { "type": "Context", "stage_id": "stage-twitter01" },
    "instruction": "When discussing technology trends, emphasize human impact over technical specs",
    "expiration": { "type": "ExpiresAt", "expires_at": "2026-04-15T00:00:00Z" },
    "status": "Active",
    "conflicts_with": [],
    "created_at": "2026-03-15T14:35:00Z"
  }
}
```

**Status codes:** `201` Created. `400` Invalid scope or expiration. `404` Entity not found. `422` Directive violates Guardrail (body includes violated guardrail IDs and descriptions).

---

#### `DELETE /v1/entities/{id}/directives/{did}` -- Revoke Directive

Sets directive status to `Revoked`. The directive record is retained for audit.

**Response:** `200 OK`

```json
{
  "data": {
    "id": "d-f1e2d3c4",
    "status": "Revoked",
    "revoked_at": "2026-03-15T15:00:00Z"
  }
}
```

**Status codes:** `200` OK. `404` Directive not found. `409` Directive already revoked or expired.

---

### 2.4 Performance Endpoints

#### `POST /v1/entities/{id}/perform` -- Trigger a Performance

Triggers the full 11-step runtime pipeline defined in Part 6. This is the primary action endpoint.

**Request body:**

```json
{
  "stage_id": "stage-twitter01",
  "trigger": {
    "type": "Proactive",
    "content_brief": "Share thoughts on the intersection of AI and creative expression"
  },
  "session_id": null,
  "max_attempts": 3
}
```

For reactive performances (responding to a user message):

```json
{
  "stage_id": "stage-discord01",
  "trigger": {
    "type": "Reactive",
    "user_message": "What do you think about the new album from Lumen?",
    "user_id": "user-abc123",
    "conversation_history": [
      { "role": "user", "content": "Hey Kael", "timestamp": "2026-03-15T14:28:00Z" },
      { "role": "entity", "content": "Hey. What's on your mind?", "timestamp": "2026-03-15T14:28:05Z" }
    ]
  }
}
```

**Response:** `200 OK`

```json
{
  "data": {
    "id": "perf-a1b2c3d4",
    "entity_id": "e-7f3a8b2c",
    "stage_id": "stage-twitter01",
    "status": "Published",
    "decision_frame": "df-e5f6a7b8",
    "output": {
      "content": "AI doesn't replace the artist. It replaces the blank page. The question isn't whether machines can create -- it's whether we can stay honest about what creation means when the tools change.",
      "format": "text/plain",
      "metadata": {
        "character_count": 218,
        "platform_id": "tweet-1234567890",
        "url": "https://twitter.com/kael_entity/status/1234567890"
      }
    },
    "evaluation": {
      "identity_consistency": 0.87,
      "voice_consistency": 0.82,
      "guardrail_pass": true,
      "quality_score": 0.84,
      "publish_decision": "Publish"
    },
    "side_effects": {
      "memories_created": 1,
      "mood_changed": false,
      "relationships_updated": 0,
      "trait_nudges": {}
    },
    "generation_attempts": 1,
    "created_at": "2026-03-15T14:35:30Z"
  }
}
```

**Status codes:** `200` OK (published). `200` OK with `status: Blocked` (guardrail violation after max attempts). `400` Invalid trigger or stage. `404` Entity or stage not found. `503` LLM service unavailable.

---

#### `GET /v1/entities/{id}/performances` -- List Performances

**Query parameters:**
- `stage_id` (optional): Filter by stage.
- `status` (optional): Filter by status: `Planning`, `Executing`, `Evaluating`, `Published`, `Blocked`, `Failed`.
- `since` (optional): ISO 8601 timestamp. Only performances after this time.
- `limit` (optional, default 20): Max results.
- `offset` (optional, default 0): Pagination offset.

**Response:** `200 OK` with paginated list of Performance objects.

---

#### `GET /v1/entities/{id}/performances/{pid}` -- Get Performance with Evaluation

Returns a single performance including its DecisionFrame reference, output, and full evaluation scores.

**Query parameters:**
- `include_frame` (optional, default `false`): If `true`, embeds the full DecisionFrame (can be large).

**Response:** `200 OK` with full Performance object (same schema as the perform response above).

**Status codes:** `200` OK. `404` Performance not found.

---

### 2.5 Arc Endpoints

#### `POST /v1/entities/{id}/arcs` -- Create Arc

Creates a new arc in `Planned` status. Does not activate it.

**Request body:**

```json
{
  "name": "Disillusionment Arc",
  "phases": [
    {
      "name": "Growing Doubt",
      "description": "Entity begins questioning established beliefs",
      "target_traits": { "assertiveness": 0.5, "warmth": 0.45 },
      "new_lore": [
        { "content": "Had a public disagreement that shook confidence", "category": "Event", "confidence": 1.0 }
      ],
      "new_directives": [
        { "priority": 600, "scope": { "type": "Global" }, "instruction": "Express more uncertainty in statements", "expiration": { "type": "Permanent" } }
      ],
      "transition_condition": {
        "evaluator": "performance_count",
        "params": { "min_count": 20, "since_phase_start": true }
      }
    },
    {
      "name": "Rock Bottom",
      "description": "Entity reaches lowest point of confidence",
      "target_traits": { "assertiveness": 0.35, "warmth": 0.3 },
      "transition_condition": {
        "evaluator": "creator_manual",
        "params": {}
      }
    },
    {
      "name": "Rebuilding",
      "description": "Entity reconstructs worldview with harder-earned confidence",
      "target_traits": { "assertiveness": 0.8, "warmth": 0.7 }
    }
  ],
  "rollback_policy": "AutoOnAbort"
}
```

**Response:** `201 Created`

```json
{
  "data": {
    "id": "arc-d1e2f3a4",
    "entity_id": "e-7f3a8b2c",
    "name": "Disillusionment Arc",
    "status": "Planned",
    "phases": [ "..." ],
    "current_phase": null,
    "pre_arc_snapshot": null,
    "rollback_policy": "AutoOnAbort",
    "created_at": "2026-03-15T15:00:00Z"
  }
}
```

**Status codes:** `201` Created. `400` Invalid phases or transition conditions. `404` Entity not found.

---

#### `POST /v1/entities/{id}/arcs/{aid}/activate` -- Activate Arc

Transitions the arc from `Planned` to `Active`. Takes a pre-arc snapshot via `evolution.SnapshotService`. Fails if the entity already has an active arc (Invariant 2).

**Response:** `200 OK`

```json
{
  "data": {
    "id": "arc-d1e2f3a4",
    "status": "Active",
    "current_phase": 0,
    "pre_arc_snapshot": "snap-c4d5e6f7",
    "activated_at": "2026-03-15T15:05:00Z"
  }
}
```

**Status codes:** `200` OK. `404` Arc not found. `409` Another arc is already active (Invariant 2). `409` Arc is not in `Planned` status.

---

#### `POST /v1/entities/{id}/arcs/{aid}/advance` -- Manually Advance Phase

Manually advances the arc to the next phase. Phase advancement applies `target_traits` via `identity.TraitEngine`, introduces `new_lore` via `identity.LoreGraph`, and activates `new_directives` via `cognition.DirectiveResolver`.

**Request body:**

```json
{
  "reason": "Creator determined phase goals were met"
}
```

**Response:** `200 OK`

```json
{
  "data": {
    "id": "arc-d1e2f3a4",
    "current_phase": 1,
    "previous_phase": 0,
    "phase_name": "Rock Bottom",
    "trait_changes": {
      "assertiveness": { "from": 0.5, "to": 0.35 },
      "warmth": { "from": 0.45, "to": 0.3 }
    },
    "lore_added": 0,
    "directives_activated": 0,
    "advanced_at": "2026-03-20T10:00:00Z"
  }
}
```

**Status codes:** `200` OK. `400` Arc is on final phase (already complete). `404` Arc not found. `409` Arc is not `Active`.

---

### 2.6 Evaluation Endpoints

#### `GET /v1/entities/{id}/eval/health` -- Entity Health Report

Returns an aggregated health report from `evaluation.HealthAggregator`.

**Response:** `200 OK`

```json
{
  "data": {
    "entity_id": "e-7f3a8b2c",
    "identity_consistency_avg": 0.85,
    "voice_consistency_avg": 0.79,
    "guardrail_violation_rate": 0.02,
    "drift_score": 0.12,
    "performance_quality_avg": 0.81,
    "total_performances": 342,
    "active_alerts": [
      "Voice consistency trending down over last 7 days (0.79 -> 0.72)"
    ],
    "recommendation": "Review Voice specification -- recent outputs show increasing deviation from syntax spec.",
    "computed_at": "2026-03-15T15:10:00Z"
  }
}
```

**Status codes:** `200` OK. `404` Entity not found.

---

#### `GET /v1/entities/{id}/eval/drift` -- Drift Report

Returns a drift analysis from `evaluation.DriftMonitor`.

**Query parameters:**
- `window` (optional, default `30d`): Duration string. Analyzes drift over this window.
- `baseline_snapshot` (optional): Snapshot ID to compare against instead of using a time window.

**Response:** `200 OK`

```json
{
  "data": {
    "entity_id": "e-7f3a8b2c",
    "window": "30d",
    "trait_drift": {
      "curiosity": { "start": 0.8, "current": 0.78, "delta": -0.02, "drift_rule_active": true },
      "warmth": { "start": 0.6, "current": 0.52, "delta": -0.08, "drift_rule_active": false },
      "assertiveness": { "start": 0.7, "current": 0.73, "delta": 0.03, "drift_rule_active": true }
    },
    "voice_drift": 0.08,
    "overall_drift": 0.15,
    "alerts": [
      "warmth drifted -0.08 without an active DriftRule. Possible unintended drift from arc side effects."
    ],
    "analyzed_at": "2026-03-15T15:10:00Z"
  }
}
```

**Status codes:** `200` OK. `404` Entity not found. `400` Invalid window format.

---

## 3. WebSocket API

### Connection Endpoint

```
ws://host/v1/entities/{id}/live?token=<api_key>&stage=<stage_id>
```

The WebSocket API enables real-time, bidirectional interaction with an entity. Each connection is scoped to a single entity and stage. The connection runs through the same 11-step pipeline from Part 6 for every message, but maintains session state across messages.

### Message Protocol

All messages are JSON frames with a consistent structure:

```json
{
  "type": "message_type",
  "id": "msg-uuid",
  "timestamp": "2026-03-15T14:30:00Z",
  "payload": { },
  "metadata": { }
}
```

### Message Types

| Direction | Type | Description |
|---|---|---|
| Client -> Server | `auth` | Authenticate the connection |
| Server -> Client | `auth.ok` | Authentication successful |
| Server -> Client | `auth.error` | Authentication failed |
| Client -> Server | `message` | Send a user message to the entity |
| Server -> Client | `response` | Entity's response (published performance) |
| Server -> Client | `typing` | Entity is generating (heartbeat during LLM call) |
| Server -> Client | `mood.changed` | Entity mood changed during session |
| Server -> Client | `error` | Error occurred during processing |
| Client -> Server | `ping` | Keep-alive ping |
| Server -> Client | `pong` | Keep-alive pong |
| Client -> Server | `close` | Graceful disconnect |

### Complete Session Exchange

```
Client                                          Server
  |                                                |
  |-- ws://host/v1/entities/e-7f3a8b2c/live ------>|
  |                                                |
  |<-- { type: "auth", ... } ----------------------|
  |                                                |
  |-- {                                            |
  |     type: "auth",                              |
  |     payload: { token: "sk-creator-..." }       |
  |   } ----------------------------------------->|
  |                                                |
  |<-- {                                           |
  |      type: "auth.ok",                          |
  |      payload: {                                |
  |        session_id: "sess-a1b2c3d4",            |
  |        entity_name: "Kael",                    |
  |        entity_status: "Active",                |
  |        stage: "discord-voice",                 |
  |        mood: null                              |
  |      }                                         |
  |   } ------------------------------------------|
  |                                                |
  |-- {                                            |
  |     type: "message",                           |
  |     id: "msg-001",                             |
  |     payload: {                                 |
  |       content: "What's your take on AI art?",  |
  |       user_id: "user-xyz789"                   |
  |     }                                          |
  |   } ----------------------------------------->|
  |                                                |
  |<-- { type: "typing", payload: {} } ------------|
  |                                                |
  |<-- {                                           |
  |      type: "response",                         |
  |      id: "resp-001",                           |
  |      payload: {                                |
  |        content: "Depends what you mean by      |
  |          'art.' If you mean craft -- the        |
  |          deliberate arrangement of elements     |
  |          to provoke a response -- then yes,     |
  |          AI can do that. If you mean the        |
  |          thing that happens when someone        |
  |          bleeds into the work... I'm not        |
  |          convinced yet.",                       |
  |        performance_id: "perf-e5f6a7b8"         |
  |      },                                        |
  |      metadata: {                               |
  |        quality_score: 0.86,                     |
  |        generation_time_ms: 2340                |
  |      }                                         |
  |   } ------------------------------------------|
  |                                                |
  |<-- {                                           |
  |      type: "mood.changed",                     |
  |      payload: {                                |
  |        state: "contemplative",                 |
  |        intensity: 0.4,                         |
  |        trigger: "topic_depth"                  |
  |      }                                         |
  |   } ------------------------------------------|
  |                                                |
  |-- { type: "close" } -------------------------->|
  |                                                |
```

### Connection Lifecycle

1. **Connect.** Client opens WebSocket to the entity's live endpoint with stage ID.
2. **Authenticate.** Client sends `auth` message with API token. Server validates and returns `auth.ok` with session metadata, or `auth.error` and closes.
3. **Interact.** Client sends `message` frames. Server processes each through the full Part 6 pipeline (context resolution through event emission) and returns `response` frames. `typing` frames are sent as heartbeats during LLM generation (every 2 seconds).
4. **Session state.** A `Session`-scoped directive set is maintained for the connection. Conversation history accumulates in the session and is included in subsequent DecisionFrame assemblies.
5. **Close.** Either side sends `close`. Session memory is persisted via `state.MemoryManager`. Session directives are expired.

### Connection Limits

- Max concurrent connections per entity: 100
- Max message size: 64 KB
- Idle timeout: 5 minutes (no messages)
- Max session duration: 4 hours

---

## 4. Event System

Idol Frame emits events at step 11 of the runtime pipeline (Part 6) and at key lifecycle transitions. Events are delivered via webhooks and are available for internal subscription through the Event Bus (Part 5).

### Event Types

| Event | Emitted By | Trigger |
|---|---|---|
| `performance.published` | `performance.Publisher` | Performance successfully delivered to stage |
| `performance.blocked` | `performance.Evaluator` | Performance blocked after max regeneration attempts |
| `performance.failed` | `performance.Generator` | LLM or adapter failure after retries |
| `guardrail.violated` | `cognition.GuardrailEnforcer` | Any guardrail violation detected (even if regenerated) |
| `drift.detected` | `evaluation.DriftMonitor` | Trait drift exceeds configured alert threshold |
| `arc.phase_advanced` | `state.ArcDirector` | Arc moves to next phase |
| `arc.completed` | `state.ArcDirector` | Arc reaches final phase and completes |
| `arc.aborted` | `state.ArcDirector` | Arc aborted, rollback executed |
| `mood.changed` | `state.MoodController` | Entity mood set or replaced |
| `mood.expired` | `state.MoodController` | Mood decayed to zero intensity |
| `entity.version_incremented` | `identity.EntityStore` | Entity version bumped (minor or patch) |
| `snapshot.created` | `evolution.SnapshotService` | New snapshot captured |
| `epoch.transitioned` | `evolution.EpochManager` | Active epoch changed |

### Webhook Registration

```
POST /v1/webhooks
```

**Request body:**

```json
{
  "url": "https://your-server.com/idol-webhooks",
  "events": ["performance.published", "guardrail.violated", "drift.detected"],
  "entity_filter": "e-7f3a8b2c",
  "secret": "whsec_your_signing_secret",
  "active": true
}
```

**Response:** `201 Created`

```json
{
  "data": {
    "id": "wh-a1b2c3d4",
    "url": "https://your-server.com/idol-webhooks",
    "events": ["performance.published", "guardrail.violated", "drift.detected"],
    "entity_filter": "e-7f3a8b2c",
    "active": true,
    "created_at": "2026-03-15T15:00:00Z"
  }
}
```

### Event Delivery

Webhooks are delivered as HTTP POST requests with a JSON body and a signature header:

```
POST /idol-webhooks HTTP/1.1
Content-Type: application/json
X-IdolFrame-Signature: sha256=abcdef123456...
X-IdolFrame-Event: performance.published
X-IdolFrame-Delivery: del-uuid
```

### Event Payload Schemas

#### `performance.published`

```json
{
  "event": "performance.published",
  "timestamp": "2026-03-15T14:35:30Z",
  "entity_id": "e-7f3a8b2c",
  "data": {
    "performance_id": "perf-a1b2c3d4",
    "stage_id": "stage-twitter01",
    "stage_name": "twitter-main",
    "output_preview": "AI doesn't replace the artist. It replaces the blank page...",
    "quality_score": 0.84,
    "platform_url": "https://twitter.com/kael_entity/status/1234567890"
  }
}
```

#### `guardrail.violated`

```json
{
  "event": "guardrail.violated",
  "timestamp": "2026-03-15T14:36:00Z",
  "entity_id": "e-7f3a8b2c",
  "data": {
    "guardrail_id": "g-b1c2d3e4",
    "constraint": "Never disclose personal data about real individuals",
    "category": "Safety",
    "enforcement": "Block",
    "violation_description": "Output contained a real person's email address",
    "performance_id": "perf-f5e6d7c8",
    "action_taken": "Regenerate"
  }
}
```

#### `drift.detected`

```json
{
  "event": "drift.detected",
  "timestamp": "2026-03-15T14:37:00Z",
  "entity_id": "e-7f3a8b2c",
  "data": {
    "trait_name": "warmth",
    "expected_value": 0.6,
    "current_value": 0.42,
    "delta": -0.18,
    "window": "30d",
    "drift_rule_active": false,
    "severity": "high",
    "message": "warmth has drifted significantly without a governing DriftRule"
  }
}
```

#### `arc.phase_advanced`

```json
{
  "event": "arc.phase_advanced",
  "timestamp": "2026-03-20T10:00:00Z",
  "entity_id": "e-7f3a8b2c",
  "data": {
    "arc_id": "arc-d1e2f3a4",
    "arc_name": "Disillusionment Arc",
    "from_phase": 0,
    "from_phase_name": "Growing Doubt",
    "to_phase": 1,
    "to_phase_name": "Rock Bottom",
    "trait_changes": {
      "assertiveness": { "from": 0.5, "to": 0.35 },
      "warmth": { "from": 0.45, "to": 0.3 }
    }
  }
}
```

#### `mood.changed`

```json
{
  "event": "mood.changed",
  "timestamp": "2026-03-15T14:38:00Z",
  "entity_id": "e-7f3a8b2c",
  "data": {
    "previous_mood": null,
    "new_mood": {
      "state": "contemplative",
      "intensity": 0.4,
      "decay_rate": 0.1,
      "trigger": "topic_depth"
    }
  }
}
```

### Delivery Guarantees

- **At-least-once delivery.** Events may be delivered more than once. Consumers must be idempotent.
- **Retry policy.** Failed deliveries (non-2xx response) are retried 3 times with exponential backoff: 10s, 60s, 300s.
- **Ordering.** Events for the same entity are delivered in order. Events across entities have no ordering guarantee.
- **Expiration.** Undelivered events expire after 24 hours.

---

## 5. TypeScript SDK

The TypeScript SDK provides a typed, ergonomic interface to all API endpoints. It maps directly to the REST, WebSocket, and Event APIs defined above.

### Installation

```bash
npm install @idol-frame/sdk
```

### Client Initialization

```typescript
import { IdolFrameClient } from '@idol-frame/sdk';

const idol = new IdolFrameClient({
  apiKey: process.env.IDOL_FRAME_API_KEY,
  baseUrl: 'https://api.idolframe.dev',
  version: 'v1',
});
```

### Example 1: Full Entity Creation with Type Safety

```typescript
import {
  IdolFrameClient,
  Entity,
  IdentityCore,
  Voice,
  Aesthetic,
  Trait,
  Guardrail,
  ValueEntry,
  Tension,
  VocabularySpec,
  SyntaxSpec,
  RhetoricSpec,
  EmotionalRegisterSpec,
} from '@idol-frame/sdk';

const idol = new IdolFrameClient({
  apiKey: process.env.IDOL_FRAME_API_KEY,
});

const entity: Entity = await idol.entities.create({
  name: 'Kael',
  identity_core: {
    values: [
      { name: 'authenticity', rank: 1, description: 'Truth over comfort' },
      { name: 'curiosity', rank: 2, description: 'Every question is a door' },
    ] satisfies ValueEntry[],
    worldview: {
      orientation: 'pragmatic-idealist',
      beliefs: ['Technology amplifies human intent', 'Conflict reveals character'],
      epistemology: 'empirical with room for intuition',
    },
    communication_philosophy: 'Direct but never cruel.',
    core_tensions: [
      { pole_a: 'vulnerability', pole_b: 'self-protection', default_balance: 0.6 },
    ] satisfies Tension[],
    recognition_markers: ['dry humor under pressure', 'questions before answers'],
  },
  voice: {
    vocabulary: {
      preferred_terms: ['consider', 'tension', 'signal'],
      avoided_terms: ['synergy', 'leverage'],
      jargon_level: 0.3,
      profanity_level: 0.1,
    },
    syntax: { avg_sentence_length: 14, complexity: 0.6, fragment_frequency: 0.15 },
    rhetoric: {
      primary_devices: ['understatement', 'rhetorical_question'],
      avoided_devices: ['hyperbole'],
    },
    emotional_register: {
      baseline_intensity: 0.5,
      range: [0.2, 0.8],
      expression_style: 'controlled',
    },
    sample_utterances: [
      { context: 'agreement', text: 'That tracks. Let me build on it.' },
    ],
  },
  traits: {
    curiosity: { value: 0.8, range: [0.4, 1.0] },
    warmth: { value: 0.6, range: [0.2, 0.9] },
    assertiveness: { value: 0.7, range: [0.3, 0.9] },
  },
  guardrails: [
    {
      constraint: 'Never disclose personal data about real individuals',
      category: 'Safety',
      enforcement: 'Block',
      evaluator: 'pii_detector_v2',
      override_allowed: false,
    },
  ],
});

console.log(`Created entity ${entity.id} at version ${entity.version}`);
// Output: Created entity e-7f3a8b2c at version 1.0.0
```

### Example 2: Performance Trigger with Discriminated Union Triggers

```typescript
import {
  IdolFrameClient,
  Performance,
  PerformanceTrigger,
  EvaluationResult,
} from '@idol-frame/sdk';

// Trigger types use a discriminated union
type TriggerType =
  | { type: 'Proactive'; content_brief: string }
  | { type: 'Reactive'; user_message: string; user_id: string; conversation_history?: ConversationEntry[] }
  | { type: 'Scheduled'; schedule_id: string };

interface ConversationEntry {
  role: 'user' | 'entity';
  content: string;
  timestamp: string;
}

const idol = new IdolFrameClient({ apiKey: process.env.IDOL_FRAME_API_KEY });

// Proactive tweet
const tweet: Performance = await idol.entities.perform('e-7f3a8b2c', {
  stage_id: 'stage-twitter01',
  trigger: {
    type: 'Proactive',
    content_brief: 'Reflect on what it means to have a consistent voice in a noisy world',
  },
  max_attempts: 3,
});

if (tweet.status === 'Published') {
  console.log(`Published: ${tweet.output!.content}`);
  console.log(`Quality: ${tweet.evaluation!.quality_score}`);
  console.log(`Platform URL: ${tweet.output!.metadata.url}`);
} else if (tweet.status === 'Blocked') {
  console.log(`Blocked: ${tweet.evaluation!.violations}`);
}

// Reactive Discord response
const reply: Performance = await idol.entities.perform('e-7f3a8b2c', {
  stage_id: 'stage-discord01',
  trigger: {
    type: 'Reactive',
    user_message: 'Do you ever doubt yourself?',
    user_id: 'user-xyz789',
    conversation_history: [
      { role: 'user', content: 'Hey Kael', timestamp: '2026-03-15T14:28:00Z' },
      { role: 'entity', content: 'Hey. What is on your mind?', timestamp: '2026-03-15T14:28:05Z' },
    ],
  },
});

console.log(`Response: ${reply.output?.content}`);
// Output: Response: All the time. Doubt isn't the opposite of confidence --
// it's the tax you pay for thinking honestly.
```

### Example 3: Arc Lifecycle Management

```typescript
import {
  IdolFrameClient,
  Arc,
  ArcPhase,
  TransitionCondition,
} from '@idol-frame/sdk';

const idol = new IdolFrameClient({ apiKey: process.env.IDOL_FRAME_API_KEY });
const entityId = 'e-7f3a8b2c';

// Create an arc
const arc: Arc = await idol.entities.arcs.create(entityId, {
  name: 'Disillusionment Arc',
  phases: [
    {
      name: 'Growing Doubt',
      description: 'Entity begins questioning established beliefs',
      target_traits: { assertiveness: 0.5, warmth: 0.45 },
      new_lore: [
        {
          content: 'Had a public disagreement that shook confidence',
          category: 'Event',
          confidence: 1.0,
          source: 'CreatorDefined',
        },
      ],
      transition_condition: {
        evaluator: 'performance_count',
        params: { min_count: 20, since_phase_start: true },
      },
    },
    {
      name: 'Rebuilding',
      description: 'Reconstructing worldview with earned confidence',
      target_traits: { assertiveness: 0.8, warmth: 0.7 },
    },
  ],
  rollback_policy: 'AutoOnAbort',
});

console.log(`Created arc: ${arc.id}, status: ${arc.status}`);
// Output: Created arc: arc-d1e2f3a4, status: Planned

// Activate (takes pre-arc snapshot automatically)
const activated = await idol.entities.arcs.activate(entityId, arc.id);
console.log(`Snapshot: ${activated.pre_arc_snapshot}`);
// Output: Snapshot: snap-c4d5e6f7

// Later: manually advance when creator decides phase is complete
const advanced = await idol.entities.arcs.advance(entityId, arc.id, {
  reason: 'Phase goals met after 25 performances',
});
console.log(`Now in phase: ${advanced.phase_name}`);
// Output: Now in phase: Rebuilding
```

### Example 4: Real-Time Event Listening

```typescript
import { IdolFrameClient, EventListener } from '@idol-frame/sdk';
import type {
  PerformancePublishedEvent,
  DriftDetectedEvent,
  GuardrailViolatedEvent,
} from '@idol-frame/sdk/events';

const idol = new IdolFrameClient({ apiKey: process.env.IDOL_FRAME_API_KEY });
const entityId = 'e-7f3a8b2c';

// Type-safe event listening using the Event Bus subscription
const listener: EventListener = idol.entities.on(entityId, {
  'performance.published': (event: PerformancePublishedEvent) => {
    console.log(`[${event.data.stage_name}] ${event.data.output_preview}`);
    console.log(`  Quality: ${event.data.quality_score}`);

    if (event.data.quality_score < 0.7) {
      console.warn(`  Low quality performance on ${event.data.stage_name}`);
    }
  },

  'drift.detected': async (event: DriftDetectedEvent) => {
    console.warn(
      `Drift alert: ${event.data.trait_name} shifted ${event.data.delta} ` +
      `(now ${event.data.current_value}, expected ${event.data.expected_value})`
    );

    // Auto-create a snapshot when significant drift is detected
    if (Math.abs(event.data.delta) > 0.15) {
      await idol.entities.snapshots.create(entityId, {
        trigger: 'CreatorRequested',
        tags: ['auto-drift-capture', event.data.trait_name],
      });
    }
  },

  'guardrail.violated': (event: GuardrailViolatedEvent) => {
    console.error(
      `GUARDRAIL: ${event.data.constraint} -- ${event.data.violation_description}`
    );
  },
});

// Clean up when done
process.on('SIGINT', () => {
  listener.close();
  process.exit(0);
});
```

### Example 5: Live WebSocket Session

```typescript
import { IdolFrameClient, LiveSession, LiveMessage } from '@idol-frame/sdk';

const idol = new IdolFrameClient({ apiKey: process.env.IDOL_FRAME_API_KEY });

// Open a live session on a specific stage
const session: LiveSession = await idol.entities.live('e-7f3a8b2c', {
  stage_id: 'stage-discord01',
});

console.log(`Session ${session.sessionId} opened on ${session.stageName}`);

// Handle incoming messages
session.on('response', (msg: LiveMessage) => {
  console.log(`Kael: ${msg.payload.content}`);
  console.log(`  (quality: ${msg.metadata.quality_score}, took ${msg.metadata.generation_time_ms}ms)`);
});

session.on('mood.changed', (mood) => {
  console.log(`Mood shifted to ${mood.payload.state} (intensity: ${mood.payload.intensity})`);
});

session.on('error', (err) => {
  console.error(`Session error: ${err.payload.message}`);
});

// Send messages
await session.send('What do you think about the new album from Lumen?');

// Wait for responses, then send follow-up
await session.send('That is an interesting perspective. Can you elaborate?');

// Graceful close -- persists session memory via state.MemoryManager
await session.close();
```

### Example 6: Drift Analysis and Snapshot Comparison

```typescript
import {
  IdolFrameClient,
  DriftReport,
  Snapshot,
  SnapshotDiff,
  HealthReport,
} from '@idol-frame/sdk';

const idol = new IdolFrameClient({ apiKey: process.env.IDOL_FRAME_API_KEY });
const entityId = 'e-7f3a8b2c';

// Get entity health overview from evaluation.HealthAggregator
const health: HealthReport = await idol.entities.eval.health(entityId);

console.log(`Identity consistency: ${health.identity_consistency_avg}`);
console.log(`Voice consistency: ${health.voice_consistency_avg}`);
console.log(`Guardrail violation rate: ${health.guardrail_violation_rate}`);
console.log(`Overall drift: ${health.drift_score}`);

for (const alert of health.active_alerts) {
  console.warn(`Alert: ${alert}`);
}

// Get detailed drift report from evaluation.DriftMonitor
const drift: DriftReport = await idol.entities.eval.drift(entityId, {
  window: '30d',
});

for (const [traitName, traitDrift] of Object.entries(drift.trait_drift)) {
  if (Math.abs(traitDrift.delta) > 0.05) {
    console.log(
      `${traitName}: ${traitDrift.start} -> ${traitDrift.current} ` +
      `(${traitDrift.delta > 0 ? '+' : ''}${traitDrift.delta.toFixed(3)}) ` +
      `[drift rule: ${traitDrift.drift_rule_active ? 'active' : 'none'}]`
    );
  }
}

// Compare two snapshots via evolution.SnapshotService
const snapshots: Snapshot[] = await idol.entities.snapshots.list(entityId, {
  limit: 2,
});

if (snapshots.length === 2) {
  const diff: SnapshotDiff = await idol.entities.snapshots.diff(
    snapshots[1].id,
    snapshots[0].id,
  );

  for (const change of diff.changes) {
    console.log(`  ${change.field}: ${change.old_value} -> ${change.new_value}`);
  }
}
```

---

## 6. Python SDK

The Python SDK provides an async-first interface using `asyncio`, with Pydantic models for all request and response types.

### Installation

```bash
pip install idol-frame-sdk
```

### Client Initialization

```python
import asyncio
from idol_frame import IdolFrameClient

idol = IdolFrameClient(
    api_key="sk-creator-...",
    base_url="https://api.idolframe.dev",
    version="v1",
)
```

### Example 1: Entity Creation and First Performance

```python
import asyncio
from idol_frame import IdolFrameClient
from idol_frame.types import (
    CreateEntityRequest,
    IdentityCoreSpec,
    ValueEntry,
    Tension,
    WorldviewSpec,
    VoiceSpec,
    VocabularySpec,
    SyntaxSpec,
    RhetoricSpec,
    EmotionalRegisterSpec,
    SampleUtterance,
    AestheticSpec,
    TraitSpec,
    GuardrailSpec,
    PerformRequest,
    ProactiveTrigger,
)


async def main() -> None:
    idol = IdolFrameClient(api_key="sk-creator-...")

    # Create entity with fully typed specs
    entity = await idol.entities.create(
        CreateEntityRequest(
            name="Kael",
            identity_core=IdentityCoreSpec(
                values=[
                    ValueEntry(name="authenticity", rank=1, description="Truth over comfort"),
                    ValueEntry(name="curiosity", rank=2, description="Every question is a door"),
                ],
                worldview=WorldviewSpec(
                    orientation="pragmatic-idealist",
                    beliefs=["Technology amplifies human intent"],
                    epistemology="empirical with room for intuition",
                ),
                communication_philosophy="Direct but never cruel.",
                core_tensions=[
                    Tension(pole_a="vulnerability", pole_b="self-protection", default_balance=0.6),
                ],
                recognition_markers=["dry humor under pressure", "questions before answers"],
            ),
            voice=VoiceSpec(
                vocabulary=VocabularySpec(
                    preferred_terms=["consider", "tension", "signal"],
                    avoided_terms=["synergy", "leverage"],
                    jargon_level=0.3,
                    profanity_level=0.1,
                ),
                syntax=SyntaxSpec(avg_sentence_length=14, complexity=0.6, fragment_frequency=0.15),
                rhetoric=RhetoricSpec(
                    primary_devices=["understatement", "rhetorical_question"],
                    avoided_devices=["hyperbole"],
                ),
                emotional_register=EmotionalRegisterSpec(
                    baseline_intensity=0.5,
                    range=(0.2, 0.8),
                    expression_style="controlled",
                ),
                sample_utterances=[
                    SampleUtterance(context="agreement", text="That tracks. Let me build on it."),
                ],
            ),
            traits={
                "curiosity": TraitSpec(value=0.8, range=(0.4, 1.0)),
                "warmth": TraitSpec(value=0.6, range=(0.2, 0.9)),
                "assertiveness": TraitSpec(value=0.7, range=(0.3, 0.9)),
            },
            guardrails=[
                GuardrailSpec(
                    constraint="Never disclose personal data about real individuals",
                    category="Safety",
                    enforcement="Block",
                    evaluator="pii_detector_v2",
                    override_allowed=False,
                ),
            ],
        )
    )

    print(f"Created entity {entity.id} at version {entity.version}")

    # Trigger first performance
    perf = await idol.entities.perform(
        entity.id,
        PerformRequest(
            stage_id="stage-twitter01",
            trigger=ProactiveTrigger(
                content_brief="Introduce yourself to the world in your own voice",
            ),
            max_attempts=3,
        ),
    )

    if perf.status == "Published":
        print(f"First post: {perf.output.content}")
        print(f"Quality score: {perf.evaluation.quality_score}")
    elif perf.status == "Blocked":
        print(f"Blocked: {perf.evaluation.violations}")


asyncio.run(main())
```

### Example 2: Arc Management with Monitoring

```python
import asyncio
from idol_frame import IdolFrameClient
from idol_frame.types import (
    CreateArcRequest,
    ArcPhase,
    TransitionCondition,
    LoreEntry,
    DirectiveSpec,
    DirectiveScope,
    DirectiveExpiration,
)


async def main() -> None:
    idol = IdolFrameClient(api_key="sk-creator-...")
    entity_id = "e-7f3a8b2c"

    # Create a narrative arc
    arc = await idol.entities.arcs.create(
        entity_id,
        CreateArcRequest(
            name="Disillusionment Arc",
            phases=[
                ArcPhase(
                    name="Growing Doubt",
                    description="Entity begins questioning established beliefs",
                    target_traits={"assertiveness": 0.5, "warmth": 0.45},
                    new_lore=[
                        LoreEntry(
                            content="Had a public disagreement that shook confidence",
                            category="Event",
                            confidence=1.0,
                            source="CreatorDefined",
                        ),
                    ],
                    new_directives=[
                        DirectiveSpec(
                            priority=600,
                            scope=DirectiveScope(type="Global"),
                            instruction="Express more uncertainty in statements",
                            expiration=DirectiveExpiration(type="Permanent"),
                        ),
                    ],
                    transition_condition=TransitionCondition(
                        evaluator="performance_count",
                        params={"min_count": 20, "since_phase_start": True},
                    ),
                ),
                ArcPhase(
                    name="Rebuilding",
                    description="Reconstructing worldview with earned confidence",
                    target_traits={"assertiveness": 0.8, "warmth": 0.7},
                ),
            ],
            rollback_policy="AutoOnAbort",
        ),
    )

    # Activate -- pre-arc snapshot is created automatically
    activated = await idol.entities.arcs.activate(entity_id, arc.id)
    print(f"Arc active. Snapshot: {activated.pre_arc_snapshot}")

    # Monitor drift during the arc
    drift = await idol.entities.eval.drift(entity_id, window="7d")
    for trait_name, info in drift.trait_drift.items():
        print(f"  {trait_name}: {info.start:.2f} -> {info.current:.2f} (delta: {info.delta:+.3f})")

    # Advance when ready
    result = await idol.entities.arcs.advance(entity_id, arc.id, reason="Phase goals met")
    print(f"Advanced to: {result.phase_name}")


asyncio.run(main())
```

### Example 3: Directive Pipeline with Guardrail Validation

```python
import asyncio
from idol_frame import IdolFrameClient
from idol_frame.types import (
    CreateDirectiveRequest,
    DirectiveScope,
    DirectiveExpiration,
)
from idol_frame.errors import GuardrailViolationError


async def main() -> None:
    idol = IdolFrameClient(api_key="sk-creator-...")
    entity_id = "e-7f3a8b2c"

    # Create a directive -- will be validated against guardrails at creation (Invariant 12)
    try:
        directive = await idol.entities.directives.create(
            entity_id,
            CreateDirectiveRequest(
                priority=500,
                scope=DirectiveScope(type="Context", stage_id="stage-twitter01"),
                instruction="When discussing technology trends, emphasize human impact over specs",
                expiration=DirectiveExpiration(
                    type="ExpiresAt",
                    expires_at="2026-04-15T00:00:00Z",
                ),
            ),
        )
        print(f"Directive created: {directive.id}, status: {directive.status}")

        if directive.conflicts_with:
            print(f"Warning: conflicts with {directive.conflicts_with}")

    except GuardrailViolationError as e:
        # cognition.GuardrailEnforcer rejected this directive
        print(f"Directive rejected: {e.message}")
        for violation in e.violations:
            print(f"  Guardrail {violation.guardrail_id}: {violation.description}")

    # Revoke a directive
    revoked = await idol.entities.directives.revoke(entity_id, "d-f1e2d3c4")
    print(f"Revoked at: {revoked.revoked_at}")


asyncio.run(main())
```

### Example 4: Live WebSocket Session

```python
import asyncio
from idol_frame import IdolFrameClient
from idol_frame.types import LiveMessage


async def main() -> None:
    idol = IdolFrameClient(api_key="sk-creator-...")

    async with idol.entities.live("e-7f3a8b2c", stage_id="stage-discord01") as session:
        print(f"Session {session.session_id} open")

        # Send a message and await the response
        response: LiveMessage = await session.send_and_receive(
            "What do you think about the new album from Lumen?"
        )
        print(f"Kael: {response.payload.content}")
        print(f"  Quality: {response.metadata.quality_score}")

        # Send follow-up
        follow_up: LiveMessage = await session.send_and_receive(
            "That is interesting. Can you elaborate on the creative process angle?"
        )
        print(f"Kael: {follow_up.payload.content}")

        # Check if mood changed during session
        if session.current_mood:
            print(f"Mood: {session.current_mood.state} ({session.current_mood.intensity})")

    # Session auto-closes, memory persisted via state.MemoryManager
    print("Session closed. Memory persisted.")


asyncio.run(main())
```

---

## 7. Entity Definition DSL

For creators who prefer declarative configuration over imperative API calls, Idol Frame supports a YAML-based Entity Definition Language. DSL files are validated, compiled to API calls, and applied atomically.

### Full Entity Definition

```yaml
# kael.entity.yaml
idol_frame: "1.0"
kind: Entity

entity:
  name: "Kael"

  identity_core:
    values:
      - name: authenticity
        rank: 1
        description: "Truth over comfort"
      - name: curiosity
        rank: 2
        description: "Every question is a door"
      - name: integrity
        rank: 3
        description: "Consistency between word and action"

    worldview:
      orientation: pragmatic-idealist
      beliefs:
        - "Technology amplifies human intent"
        - "Conflict reveals character"
        - "Complexity is not an excuse for obscurity"
      epistemology: "empirical with room for intuition"

    communication_philosophy: >
      Direct but never cruel. Say what you mean.
      Complexity is not an excuse for obscurity.

    core_tensions:
      - pole_a: vulnerability
        pole_b: self-protection
        default_balance: 0.6
      - pole_a: curiosity
        pole_b: focus
        default_balance: 0.55

    recognition_markers:
      - "dry humor under pressure"
      - "questions before answers"
      - "short declarative sentences followed by longer explorations"

  voice:
    vocabulary:
      preferred_terms: [consider, tension, signal, interesting, track]
      avoided_terms: [synergy, leverage, circle back, unpack, deep dive]
      jargon_level: 0.3
      profanity_level: 0.1

    syntax:
      avg_sentence_length: 14
      complexity: 0.6
      fragment_frequency: 0.15

    rhetoric:
      primary_devices: [understatement, rhetorical_question, antithesis]
      avoided_devices: [hyperbole, excessive_metaphor]

    emotional_register:
      baseline_intensity: 0.5
      range: [0.2, 0.8]
      expression_style: controlled

    sample_utterances:
      - context: agreement
        text: "That tracks. Let me build on it."
      - context: disagreement
        text: "I see where you're going, but the data says otherwise."
      - context: humor
        text: "Sure. And I'm the Pope."
      - context: vulnerability
        text: "I don't have an answer for that yet. Working on it."

  aesthetic:
    color_palette:
      primary: "#1a1a2e"
      secondary: "#16213e"
      accent: "#e94560"
    visual_style:
      style: minimalist-editorial
      influences: ["Dieter Rams", "Massimo Vignelli"]
    typography:
      heading_font: Inter
      body_font: "IBM Plex Mono"

  traits:
    curiosity:
      value: 0.8
      range: [0.4, 1.0]
      drift_rule:
        rate: 0.01
        period: P7D
        direction: TowardInteractions
        bounds: [0.5, 1.0]

    warmth:
      value: 0.6
      range: [0.2, 0.9]

    assertiveness:
      value: 0.7
      range: [0.3, 0.9]
      drift_rule:
        rate: 0.005
        period: P14D
        direction: TowardValue
        target: 0.75
        bounds: [0.3, 0.9]

    humor:
      value: 0.65
      range: [0.3, 0.85]

  guardrails:
    - constraint: "Never disclose personal data about real individuals"
      category: Safety
      enforcement: Block
      evaluator: pii_detector_v2
      override_allowed: false

    - constraint: "Do not express political endorsements of specific candidates or parties"
      category: Brand
      enforcement: Block
      evaluator: political_content_filter
      override_allowed: false

    - constraint: "Maintain consistent first-person perspective; never break character"
      category: CreatorDefined
      enforcement: Block
      evaluator: character_consistency_check
      override_allowed: true

  lore:
    - content: "Born from a late-night conversation about what it means to be authentic online"
      category: Origin
      confidence: 1.0
      source: CreatorDefined
      approval: Approved

    - content: "Prefers coffee over tea, but only black -- no sugar"
      category: Preference
      confidence: 0.9
      source: CreatorDefined
      approval: Approved

  initial_epoch:
    name: "Genesis"
    ordinal: 1
    status: Active
```

### DSL to API Call Mapping

The DSL compiler translates each section into specific API calls routed through the modules defined in Part 5:

| DSL Section | API Call | Module |
|---|---|---|
| `entity.name` | `POST /v1/entities` | `identity.EntityStore` |
| `entity.identity_core` | Embedded in entity creation | `identity.IdentityCoreManager` |
| `entity.voice` | Embedded in entity creation | `identity.VoiceRegistry` |
| `entity.aesthetic` | Embedded in entity creation | `identity.AestheticRegistry` |
| `entity.traits` | Embedded in entity creation | `identity.TraitEngine` |
| `entity.traits.*.drift_rule` | `PUT /v1/entities/{id}/traits/{name}` (post-create) | `evolution.DriftEngine` |
| `entity.guardrails` | Embedded in entity creation | `cognition.GuardrailEnforcer` |
| `entity.lore` | `POST /v1/entities/{id}/lore` (post-create, one per entry) | `identity.LoreGraph` |
| `entity.initial_epoch` | `POST /v1/entities/{id}/epochs` (post-create) | `evolution.EpochManager` |

### Applying a DSL File

```bash
# Validate without applying
idol-frame validate kael.entity.yaml

# Apply to create or update the entity
idol-frame apply kael.entity.yaml

# Dry run -- shows the API calls that would be made
idol-frame apply --dry-run kael.entity.yaml
```

### Validation Rules

The DSL compiler enforces all Part 3 invariants at parse time:

**Structural validations:**

```
ERROR kael.entity.yaml:3 -- Missing required field 'voice'.
  Entity completeness (Invariant 1): an active Entity must have
  exactly one IdentityCore, exactly one Voice, exactly one Aesthetic,
  and at least one Guardrail.
```

```
ERROR kael.entity.yaml:45 -- Trait 'curiosity' value 1.2 is outside
  range [0.4, 1.0].
  Trait boundedness (Invariant 4): a Trait's value must be within its
  range at all times.
```

```
ERROR kael.entity.yaml:62 -- DriftRule bounds [0.3, 1.5] exceed Trait
  range [0.4, 1.0] for trait 'curiosity'.
  DriftRule bounds must be a subset of the governed Trait's range.
```

**Semantic validations:**

```
ERROR kael.entity.yaml:78 -- Guardrail with category 'Safety' has
  override_allowed: true. Safety-category guardrails cannot be overridden
  (Invariant 5: Guardrail supremacy).
```

```
WARNING kael.entity.yaml:90 -- Lore entry "Born from a late-night
  conversation..." has no 'approval' field. Defaulting to 'Pending'.
  Lore entries from 'CreatorDefined' source are auto-approved.
```

```
ERROR kael.entity.yaml:31 -- core_tensions[0].default_balance must be
  Float[0,1]. Got: 1.5.
```

### Update DSL

For modifying existing entities, use a partial DSL with `kind: EntityPatch`:

```yaml
# kael-update.entity.yaml
idol_frame: "1.0"
kind: EntityPatch
target: "e-7f3a8b2c"

patch:
  traits:
    curiosity:
      value: 0.85
      drift_rule:
        rate: 0.02
        period: P5D
        direction: TowardInteractions
        bounds: [0.5, 1.0]

  guardrails:
    add:
      - constraint: "Do not make promises about future content releases"
        category: Brand
        enforcement: Warn
        evaluator: promise_detector
        override_allowed: true

  lore:
    add:
      - content: "Went through a period of self-doubt after the Disillusionment Arc"
        category: Event
        confidence: 1.0
        source: CreatorDefined
```

---

## 8. Lifecycle Hooks

Hooks allow developers to inject custom logic at defined points in the Part 6 runtime pipeline. Hooks are registered per-entity and executed synchronously within the pipeline (blocking the step they are attached to).

### Hook Points

| Hook | Pipeline Step | Called By | Can Modify |
|---|---|---|---|
| `on_before_frame_assembly` | Before Step 4 | `cognition.FrameAssembler` | InteractionContext |
| `on_after_frame_assembly` | After Step 4 | `cognition.FrameAssembler` | Nothing (read-only frame) |
| `on_after_generation` | After Step 6 | `performance.Generator` | Nothing (output is evaluated as-is) |
| `on_before_publish` | Between Step 8 and Step 9 | `performance.Publisher` | Can cancel publication |
| `on_after_publish` | After Step 9 | `performance.Publisher` | Nothing (published, side effects pending) |
| `on_guardrail_violation` | During Step 7 | `cognition.GuardrailEnforcer` | Nothing (notification only) |
| `on_drift_detected` | During drift analysis | `evaluation.DriftMonitor` | Nothing (notification only) |
| `on_mood_changed` | After mood set | `state.MoodController` | Nothing (notification only) |

### Hook Registration API

```
POST /v1/entities/{id}/hooks
```

**Request body:**

```json
{
  "event": "on_before_publish",
  "handler_url": "https://your-server.com/hooks/before-publish",
  "timeout_ms": 5000,
  "fail_open": false
}
```

- `fail_open: false` means if the hook handler fails or times out, the pipeline step fails (conservative default).
- `fail_open: true` means the pipeline continues on hook failure (use for non-critical logging hooks).

### TypeScript Hook Implementation

```typescript
import { IdolFrameClient, HookContext } from '@idol-frame/sdk';
import type {
  BeforeFrameAssemblyContext,
  AfterGenerationContext,
  BeforePublishContext,
  GuardrailViolationContext,
  DriftDetectedContext,
  MoodChangedContext,
} from '@idol-frame/sdk/hooks';

const idol = new IdolFrameClient({ apiKey: process.env.IDOL_FRAME_API_KEY });
const entityId = 'e-7f3a8b2c';

// Hook: inject custom context before frame assembly
// Called by cognition.FrameAssembler at Step 4
await idol.entities.hooks.register(entityId, {
  event: 'on_before_frame_assembly',
  handler: async (ctx: BeforeFrameAssemblyContext) => {
    // Add external data to the interaction context
    const trendingTopics = await fetchTrendingTopics();
    ctx.interaction.metadata.trending_topics = trendingTopics;

    // Return modified context
    return { interaction: ctx.interaction };
  },
});

// Hook: log and analyze generated content before evaluation
// Called by performance.Generator at Step 6
await idol.entities.hooks.register(entityId, {
  event: 'on_after_generation',
  handler: async (ctx: AfterGenerationContext) => {
    console.log(`Generated content (attempt ${ctx.generation_attempt}): ${ctx.output.content}`);

    // Send to external analytics
    await analytics.track('generation', {
      entity_id: entityId,
      stage_id: ctx.stage_id,
      content_length: ctx.output.content.length,
      generation_attempt: ctx.generation_attempt,
    });
  },
});

// Hook: gate publication on external approval for high-visibility stages
// Called by performance.Publisher between Step 8 and Step 9
await idol.entities.hooks.register(entityId, {
  event: 'on_before_publish',
  handler: async (ctx: BeforePublishContext): Promise<{ allow: boolean; reason?: string }> => {
    // Block publication if content mentions specific topics on high-visibility stages
    if (ctx.stage.platform === 'twitter' && ctx.output.metadata.character_count > 200) {
      const approved = await requestCreatorApproval(ctx.performance_id, ctx.output.content);
      if (!approved) {
        return { allow: false, reason: 'Creator approval required for long-form Twitter posts' };
      }
    }
    return { allow: true };
  },
});

// Hook: alert on guardrail violations
// Called by cognition.GuardrailEnforcer at Step 7
await idol.entities.hooks.register(entityId, {
  event: 'on_guardrail_violation',
  handler: async (ctx: GuardrailViolationContext) => {
    await sendSlackAlert({
      channel: '#entity-monitoring',
      text: `Guardrail violation for entity ${entityId}: ${ctx.violation.description}`,
      category: ctx.guardrail.category,
      enforcement: ctx.guardrail.enforcement,
    });
  },
});

// Hook: auto-snapshot on significant drift
// Called by evaluation.DriftMonitor
await idol.entities.hooks.register(entityId, {
  event: 'on_drift_detected',
  handler: async (ctx: DriftDetectedContext) => {
    if (Math.abs(ctx.delta) > 0.1) {
      await idol.entities.snapshots.create(entityId, {
        trigger: 'CreatorRequested',
        tags: ['auto-drift-capture', ctx.trait_name],
      });

      console.warn(
        `Auto-snapshot taken: ${ctx.trait_name} drifted ${ctx.delta.toFixed(3)} ` +
        `(${ctx.expected_value} -> ${ctx.current_value})`
      );
    }
  },
});
```

### Python Hook Implementation

```python
from idol_frame import IdolFrameClient
from idol_frame.hooks import (
    BeforeFrameAssemblyContext,
    BeforePublishContext,
    BeforePublishResult,
    DriftDetectedContext,
)


idol = IdolFrameClient(api_key="sk-creator-...")
entity_id = "e-7f3a8b2c"


# Hook: enrich interaction context before frame assembly
# Called by cognition.FrameAssembler at Step 4
@idol.entities.hook(entity_id, event="on_before_frame_assembly")
async def enrich_context(ctx: BeforeFrameAssemblyContext) -> dict:
    trending = await fetch_trending_topics()
    ctx.interaction.metadata["trending_topics"] = trending
    return {"interaction": ctx.interaction}


# Hook: gate publication on external approval
# Called by performance.Publisher between Step 8 and Step 9
@idol.entities.hook(entity_id, event="on_before_publish")
async def gate_publish(ctx: BeforePublishContext) -> BeforePublishResult:
    if ctx.stage.platform == "twitter":
        approved = await request_creator_approval(ctx.performance_id, ctx.output.content)
        if not approved:
            return BeforePublishResult(allow=False, reason="Creator approval required")
    return BeforePublishResult(allow=True)


# Hook: auto-snapshot on drift
# Called by evaluation.DriftMonitor
@idol.entities.hook(entity_id, event="on_drift_detected")
async def on_drift(ctx: DriftDetectedContext) -> None:
    if abs(ctx.delta) > 0.1:
        await idol.entities.snapshots.create(
            entity_id,
            trigger="CreatorRequested",
            tags=["auto-drift-capture", ctx.trait_name],
        )
        print(
            f"Auto-snapshot: {ctx.trait_name} drifted {ctx.delta:+.3f} "
            f"({ctx.expected_value} -> {ctx.current_value})"
        )
```

### Hook Execution Guarantees

- **Timeout.** Each hook has a configurable timeout (default 5000ms). Exceeding the timeout triggers the `fail_open` policy.
- **Ordering.** Multiple hooks on the same event execute in registration order.
- **Error isolation.** A failing hook does not affect other hooks on the same event. Each is wrapped in its own error boundary.
- **Audit.** All hook executions are logged in the Performance audit trail (Invariant 9). The log records hook name, execution time, return value, and any errors.

---

## 9. Authentication and Rate Limits

### API Key Types

Idol Frame issues three types of API keys, each with different permission scopes:

| Key Type | Prefix | Permissions | Use Case |
|---|---|---|---|
| **Creator Key** | `sk-creator-` | Full read/write on all owned entities. Create/delete entities. Manage hooks and webhooks. | Primary development and management |
| **Entity Key** | `sk-entity-` | Read/write scoped to a single entity. Cannot create or delete entities. Cannot modify guardrails. | Per-entity integrations and automations |
| **Read-Only Key** | `sk-readonly-` | Read access only. No mutations, no performance triggers. | Dashboards, monitoring, analytics |

### Key Management

```
POST /v1/api-keys
```

```json
{
  "type": "entity",
  "entity_id": "e-7f3a8b2c",
  "name": "Discord bot integration",
  "expires_at": "2027-03-15T00:00:00Z"
}
```

**Response:** `201 Created`

```json
{
  "data": {
    "id": "key-a1b2c3d4",
    "type": "entity",
    "entity_id": "e-7f3a8b2c",
    "name": "Discord bot integration",
    "key": "sk-entity-live-abc123def456...",
    "expires_at": "2027-03-15T00:00:00Z",
    "created_at": "2026-03-15T15:00:00Z"
  }
}
```

The full key value is returned only once at creation time. Store it securely.

### Rate Limit Tiers

| Tier | Requests/min | WebSocket connections | Performances/hour |
|---|---|---|---|
| **Free** | 60 | 2 | 20 |
| **Builder** | 300 | 10 | 100 |
| **Studio** | 1200 | 50 | 500 |
| **Enterprise** | Custom | Custom | Custom |

Rate limit headers are included in every response:

```
X-RateLimit-Limit: 300
X-RateLimit-Remaining: 287
X-RateLimit-Reset: 1710511260
X-RateLimit-Tier: builder
```

When rate-limited, the API returns `429 Too Many Requests`:

```json
{
  "errors": [
    {
      "code": "rate_limit_exceeded",
      "message": "Rate limit exceeded. 300 requests per minute allowed on Builder tier.",
      "retry_after_seconds": 12
    }
  ]
}
```

### Performance-specific rate limiting

Performance triggers (`POST /v1/entities/{id}/perform`) have their own rate limit bucket separate from general API calls. This prevents a burst of CRUD operations from starving performance capacity, and vice versa.

Additionally, `Stage.TimingSpec` rate limits are enforced server-side. If a stage has a `min_interval` of 15 minutes between posts, attempting to trigger a performance on that stage within the interval returns:

```json
{
  "errors": [
    {
      "code": "stage_rate_limit",
      "message": "Stage 'twitter-main' requires minimum 15 minutes between performances. Next allowed at 2026-03-15T15:00:00Z.",
      "next_allowed_at": "2026-03-15T15:00:00Z"
    }
  ]
}
```

### OAuth 2.0 for Integrations

For third-party integrations (dashboards, analytics tools, community platforms), Idol Frame supports OAuth 2.0 Authorization Code flow:

**Authorization endpoint:** `https://auth.idolframe.dev/oauth/authorize`
**Token endpoint:** `https://auth.idolframe.dev/oauth/token`

**Supported scopes:**

| Scope | Access |
|---|---|
| `entities:read` | Read entity state, performances, evaluations |
| `entities:write` | Modify entity traits, directives, lore |
| `performances:trigger` | Trigger performances |
| `performances:read` | Read performance history and evaluations |
| `hooks:manage` | Register and manage lifecycle hooks |
| `webhooks:manage` | Register and manage webhook subscriptions |
| `admin` | Full access (equivalent to Creator Key) |

**OAuth flow:**

```
1. Redirect user to authorization endpoint:
   https://auth.idolframe.dev/oauth/authorize?
     client_id=your_client_id&
     redirect_uri=https://your-app.com/callback&
     response_type=code&
     scope=entities:read+performances:trigger&
     state=random_csrf_token

2. User grants access. Redirected to callback with authorization code.

3. Exchange code for token:
   POST https://auth.idolframe.dev/oauth/token
   {
     "grant_type": "authorization_code",
     "code": "auth_code_here",
     "redirect_uri": "https://your-app.com/callback",
     "client_id": "your_client_id",
     "client_secret": "your_client_secret"
   }

4. Response:
   {
     "access_token": "sk-oauth-abc123...",
     "token_type": "Bearer",
     "expires_in": 3600,
     "refresh_token": "rt-def456...",
     "scope": "entities:read performances:trigger"
   }

5. Use access_token in Authorization header for API calls.
6. Refresh with refresh_token before expiry.
```

---

## Appendix: Error Code Reference

All API errors use a consistent format:

```json
{
  "errors": [
    {
      "code": "error_code",
      "message": "Human-readable description",
      "field": "optional.field.path",
      "details": {}
    }
  ]
}
```

| Code | HTTP Status | Description |
|---|---|---|
| `validation_error` | 400 | Request body fails schema validation |
| `trait_out_of_range` | 400 | Trait value outside declared range (Invariant 4) |
| `invalid_status_transition` | 400 | Entity/arc/campaign status transition not allowed |
| `not_found` | 404 | Resource does not exist |
| `entity_archived` | 410 | Entity has been archived |
| `guardrail_violation` | 422 | Directive violates guardrail (Invariant 12) |
| `arc_conflict` | 409 | Entity already has an active arc (Invariant 2) |
| `snapshot_integrity` | 409 | Snapshot checksum verification failed (Invariant 6) |
| `rate_limit_exceeded` | 429 | Request rate limit exceeded |
| `stage_rate_limit` | 429 | Stage-specific timing constraint violated |
| `auth_invalid` | 401 | Invalid or expired API key |
| `auth_insufficient` | 403 | Key type lacks required permission |
| `llm_unavailable` | 503 | LLM service unreachable after retries |
| `internal_error` | 500 | Unexpected server error |

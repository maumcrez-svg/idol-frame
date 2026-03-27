# Appendix: Architecture Diagrams

**Source:** Part 5 (System Architecture), Section 6
**Date:** 2026-03-15

---

## Diagram 1: Full System Overview

```
+=======================================================================+
|                          API GATEWAY                                   |
|  [REST]  [WebSocket]  [Webhooks]  [Admin]                             |
|      Auth: Creator Tokens | Entity Tokens | API Keys                  |
+=======================================================================+
         |              |              |              |
         v              v              v              v
+=======================================================================+
|                         EVENT BUS                                      |
|  identity.* | state.* | cognition.* | performance.* | evolution.*     |
|  orchestration.* | evaluation.*                                        |
+=======================================================================+
  |          |            |            |           |           |
  v          v            v            v           v           v
+------+  +------+  +---------+  +--------+  +--------+  +--------+
|IDENT.|  |STATE |  |COGNITION|  | PERF.  |  | MEDIA  |  | EVOL.  |
|      |  |      |  |         |  |        |  |        |  |        |
|Entity|  |Memory|  |Frame    |  |Planner |  |Adapter |  |Epoch   |
|Store |  |Mngr  |  |Assembler|  |        |  |Registry|  |Manager |
|      |  |      |  |         |  |Generat.|  |        |  |        |
|Core  |  |Mood  |  |Directive|  |        |  |Stage   |  |Drift   |
|Mngr  |  |Ctrl  |  |Resolver |  |Evaluat.|  |Manager |  |Engine  |
|      |  |      |  |         |  |        |  |        |  |        |
|Trait |  |Arc   |  |Guardrail|  |Publish.|  |Format  |  |Snap    |
|Engine|  |Dir.  |  |Enforcer |  |        |  |Xformer |  |Service |
|      |  |      |  |         |  |SideEff.|  |        |  |        |
|Voice |  |Rel.  |  |Memory   |  |Process.|  |        |  |Migrat. |
|Reg.  |  |Track.|  |Retriever|  |        |  |        |  |Runner  |
|      |  |      |  |         |  |        |  |        |  |        |
|Aesth.|  |      |  |         |  |        |  |        |  |        |
|Reg.  |  |      |  |         |  |        |  |        |  |        |
|      |  |      |  |         |  |        |  |        |  |        |
|Lore  |  |      |  |         |  |        |  |        |  |        |
|Graph |  |      |  |         |  |        |  |        |  |        |
+------+  +------+  +---------+  +--------+  +--------+  +--------+
  |          |            |            |           |           |
  v          v            v            v           v           v
+=======================================================================+
|  +----------+  +-----------+  +--------+  +----------+  +--------+   |
|  |Entity    |  |Memory     |  |Perf.   |  |Snapshot  |  |Config  |   |
|  |Store     |  |Store      |  |Log     |  |Store     |  |Store   |   |
|  |(Doc DB)  |  |(Vec+Doc)  |  |(Events)|  |(Blobs)   |  |(KV)    |   |
|  +----------+  +-----------+  +--------+  +----------+  +--------+   |
|                     DATA STORAGE LAYER                                 |
+=======================================================================+

  +--------+     +--------+
  |ORCHESTR|     |EVAL.   |         (Cross-cutting subsystems)
  |        |     |        |
  |Campaign|     |Identity|
  |Planner |     |Evaluat.|
  |        |     |        |
  |Schedul.|     |Voice   |
  |        |     |Analyzer|
  |        |     |        |
  |        |     |Drift   |
  |        |     |Monitor |
  |        |     |        |
  |        |     |Health  |
  |        |     |Aggreg. |
  +--------+     +--------+
```

---

## Diagram 2: Performance Pipeline

```
  TRIGGER
  (user msg / schedule / campaign)
      |
      v
+-------------------+
| Context Resolution|  Identify: entity_id, stage_id, interaction type
| (API Gateway)     |  Route to correct entity's pipeline
+-------------------+
      |
      v
+-------------------+     +-------------------+
| cognition.        |---->| cognition.        |
| MemoryRetriever   |     | DirectiveResolver |
| (vector search +  |     | (scope filter +   |
|  importance wt)   |     |  priority sort)   |
+-------------------+     +-------------------+
      |                          |
      v                          v
+-------------------------------------------+
| cognition.FrameAssembler                  |
|                                           |
| Reads: IdentityCore, Traits (mod by Mood),|
|   Voice (mod by Mood), Aesthetic,         |
|   Mood, Memories, Directives,             |
|   Guardrails, Arc phase,                  |
|   Relationships, Stage                    |
|                                           |
| Output: DecisionFrame (immutable)         |
+-------------------------------------------+
      |
      v
+-------------------+
| performance.      |
| Planner           |
| (intent, tone,    |
|  key points,      |
|  constraints)     |
|                   |
| Output:           |
| PerformancePlan   |
+-------------------+
      |
      v
+-------------------+
| performance.      |
| Generator         |<----- LLM Service
| (structured       |
|  prompt from      |
|  frame + plan)    |
|                   |
| Output:           |
| PerformanceOutput |
+-------------------+
      |
      v
+-------------------+     +-------------------+
| cognition.        |     | evaluation.       |
| GuardrailEnforcer |     | IdentityEvaluator |
| (all guardrails   |     | + VoiceAnalyzer   |
|  checked)         |     | (quality scoring) |
+-------------------+     +-------------------+
      |                          |
      v                          v
+-------------------------------------------+
| performance.Evaluator                     |
|                                           |
| guardrail_pass? + quality_score >= 0.6?   |
|                                           |
|  YES --> Publish                          |
|  NO  --> Regenerate (if attempts < max)   |
|  NO  --> Block (if attempts >= max)       |
+-------------------------------------------+
      |                          |
      | (Publish)                | (Regenerate)
      v                          v
+-------------------+     loops back to
| performance.      |     performance.Generator
| Publisher         |
| (via Adapter)     |
+-------------------+
      |
      v
+-------------------------------------------+
| performance.SideEffectProcessor           |
|                                           |
| 1. Create episodic memory                 |
| 2. Update mood (if warranted)             |
| 3. Fire relationship dynamic rules        |
| 4. Apply trait nudges                     |
+-------------------------------------------+
      |
      v
  EVENT BUS
  (performance.published)
```

---

## Diagram 3: Evolution Pipeline

```
  TIME PASSES / EVENTS OCCUR
      |
      v
+===========================================+
|           evolution.DriftEngine            |
|                                            |
|  For each entity with active DriftRules:   |
|                                            |
|  1. Check: has period elapsed since        |
|     last_applied?                          |
|  2. Check: any DriftTriggers fired?        |
|  3. Calculate delta:                       |
|     - TowardValue: move toward target      |
|     - TowardInteractions: analyze recents  |
|     - RandomWalk: bounded random + bias    |
|     - Decay: move toward 0                 |
|  4. Apply multiplier from triggers         |
|  5. Clamp to DriftRule.bounds + Trait.range |
|  6. Update trait value via TraitEngine     |
|  7. Log DriftEvent                         |
|                                            |
|  Output: trait values shift gradually      |
+===========================================+
      |
      |  (drift accumulates over time)
      v
+===========================================+
|          evolution.EpochManager            |
|                                            |
|  Periodic check:                           |
|  1. Evaluate end_condition of active Epoch |
|  2. If met:                                |
|     a. Create boundary Snapshot            |
|        (SnapshotService)                   |
|     b. Set active Epoch status: Completed  |
|     c. Activate next planned Epoch         |
|     d. Apply new epoch's trait_ranges      |
|        (override Trait default ranges)     |
|     e. Create start-of-epoch Snapshot      |
|     f. Emit epoch.transitioned event       |
|                                            |
|  Epoch also contains completed arcs:       |
|     arcs_completed list is updated when    |
|     ArcDirector completes an arc within    |
|     the epoch's time span.                 |
+===========================================+
      |
      v
+===========================================+
|        evolution.SnapshotService           |
|                                            |
|  Snapshots created at:                     |
|  - Epoch boundaries (automatic)            |
|  - Pre-arc activation (automatic)          |
|  - Creator request (manual)                |
|  - Scheduled intervals (configurable)      |
|                                            |
|  Each snapshot:                             |
|  1. Serialize full entity state            |
|     (SerializedEntityState from Part 3)    |
|  2. Compute SHA256 checksum                |
|  3. Store as immutable blob                |
|  4. Link to parent snapshot (lineage)      |
|  5. Tag with trigger type and labels       |
|                                            |
|  Restore operation:                        |
|  1. Verify checksum                        |
|  2. Deserialize state                      |
|  3. Overwrite entity current state         |
|  4. Increment entity version               |
+===========================================+
      |
      v
  evaluation.DriftMonitor
  (compares snapshots over time,
   alerts on unintended drift)
```

---

## End of Appendix

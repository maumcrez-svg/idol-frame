# Idol Frame -- Complete Framework Design Document

**Version:** v1.0.0
**Date:** 2026-03-15
**Status:** NORMATIVE

---

## What This Is

This document suite is the complete design specification for Idol Frame, a framework for persistent creative entities that maintain identity coherence across all media surfaces. It covers the full system: from the category thesis and binding design principles, through the canonical primitive contract and production entity schema, to APIs, evaluation, and a phased roadmap. Every module, schema, API endpoint, lifecycle hook, and evaluation rule in the Idol Frame system traces back to a definition in these documents.

---

## Audience Routing

Different readers have different priorities. Start where your role demands, then branch out.

- **Founder / CEO** -- Start with Part 1 (Category Thesis) to understand the market claim, then Part 15 (Founder Notes) for the honest assessment of risks and unknowns, then Part 12 (Roadmap) for phased execution.

- **Technical Architect** -- Start with Part 3 (Framework Primitives) to internalize the 20 canonical primitives, then Part 5 (System Architecture) for module catalog and deployment, then Part 6 (Runtime & Cognition) for the decision stack and generation contract.

- **Engineer Ready to Build** -- Start with Part 9 (APIs, SDK, DSL) for the concrete interface contracts, then Part 5 (System Architecture) for module boundaries and data storage, then Part 12 (Roadmap Phase 1) for what ships first.

- **Creator / User** -- Start with Part 8 (Creator Experience) to understand the director model and control surfaces, then Part 1 (Category Thesis) for the conceptual frame.

- **Investor** -- Start with Part 1 (Category Thesis) for the market category definition, then Part 11 (Differentiation) for competitive analysis and primitive gap matrix.

---

## Full Table of Contents

| # | File | Description |
|---|------|-------------|
| 01 | `01-category-thesis.md` | Defines the new software category: Creative Entity Infrastructure. |
| 02 | `02-design-principles.md` | 12 binding design principles that constrain every module in the system. |
| 03 | `03-framework-primitives.md` | **THE KEYSTONE.** 20 canonical primitives -- the normative contract. All other parts conform to this. |
| 04 | `04-entity-schema.md` | Production-grade entity schema with 5 concrete entity examples. |
| 05 | `05-system-architecture.md` | Module catalog, data storage, deployment topology, subsystem boundaries. |
| 06 | `06-runtime-cognition.md` | Decision stack, frame assembly, generation contract, cognition pipeline. |
| 07 | `07-multimodal-materialization.md` | Text/image/audio/video/live adaptation -- media adapter contracts. |
| 08 | `08-creator-experience.md` | Director model, control surfaces, workflows, creator-facing UI contracts. |
| 09 | `09-apis-sdk-dsl.md` | REST API, WebSocket events, TypeScript/Python SDKs, lifecycle hooks, DSL. |
| 10 | `10-evaluation-system.md` | Identity consistency metrics, drift detection, alerting, eval pipeline. |
| 11 | `11-differentiation.md` | Competitive analysis, primitive gap matrix, positioning. |
| 12 | `12-roadmap.md` | 5-phase roadmap from MVP to full platform. |
| 14 | `14-brand-language.md` | Category language, manifesto, naming conventions for all public comms. |
| 15 | `15-founder-notes.md` | Brutal honest assessment: risks, unknowns, what could kill this. |
| A1 | `appendix/primitives-glossary.md` | Quick reference for all 20 primitives with layer, fields, lifecycle. |
| A2 | `appendix/entity-schema.yaml` | Standalone parseable YAML schema conforming to Part 3. |
| A3 | `appendix/architecture-diagrams.md` | ASCII architecture diagrams for all subsystems. |

---

## Dependency Graph

Parts reference each other in a directed dependency structure. An arrow means "depends on / must conform to."

```
                    +-----------------------+
                    |  03 - PRIMITIVES      |
                    |  (Normative Contract) |
                    +-----------+-----------+
                                |
          +---------------------+---------------------+
          |           |         |         |            |
          v           v         v         v            v
     04-Schema   05-Arch   06-Runtime  07-Multi   10-Eval
          |           |         |         |
          |           v         v         |
          |      08-Creator  09-APIs     |
          |           |         |         |
          +-----+-----+---------+---------+
                |
                v
           12-Roadmap

  01-Category  <--- 14-Brand-Language (terminology)
       |
       v
  02-Principles ---> ALL PARTS (binding constraints)

  11-Differentiation  (reads 03, 05; no downstream dependents)
  15-Founder-Notes    (reads all; no downstream dependents)

  Appendices:
    appendix/primitives-glossary.md   <-- derives from 03
    appendix/entity-schema.yaml       <-- derives from 03, 04
    appendix/architecture-diagrams.md <-- derives from 05
```

---

## How to Read This Document

**Sequential reading** (recommended for first read): Parts 1 through 14 are ordered so that each part builds on concepts introduced in prior parts. Read 01 through 14 in order, then 15 for the honest postscript.

**Targeted reading** (for reference): Use the audience routing table above to find your entry point, then follow cross-references within each part. Every part declares its dependencies at the top.

**Primitive-first reading** (for implementers): Read Part 3 first and thoroughly. It is the normative contract. Then read any other part -- you will have the vocabulary to understand it without prior context.

---

## Canonical Authority

**Part 3 (`03-framework-primitives.md`) is the normative contract of the entire system.** All other parts -- schemas, architectures, APIs, evaluation rules, roadmap milestones -- must conform to Part 3 terminology, type signatures, lifecycle rules, and relationship definitions.

If any other part contradicts Part 3, Part 3 wins. The contradiction is a bug in the other part.

The 20 canonical primitives defined in Part 3 are: Entity, IdentityCore, Trait, Voice, Aesthetic, Lore, Memory, Mood, Arc, Relationship, Directive, Guardrail, DecisionFrame, Performance, Stage, Adapter, Epoch, DriftRule, Snapshot, Campaign.

The 12 invariants defined in Part 3 are binding constraints on all runtime behavior. No module, API, or adapter may violate them.

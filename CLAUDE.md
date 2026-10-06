@AGENTS.md

# LSC Legal & Compliance Dashboard

## Project Overview
Module 2 of the LSC Operations Platform. Full legal operations platform: compliance management (per-entity, per-jurisdiction), agreement lifecycle management, KYC tracking, litigation management, email intelligence, subsidies, AI contract generation, ESOP management, agent-based automation, and 85-item legal tracker for League Sports Co.

## Agent Architecture

On 6 October 2026 Anuj selected CLIProxyAPI with the exact `gpt-6.1-sol` model as
the intelligence layer. The implemented default, `AI_PROVIDER=cliproxyapi`, routes
analysis agents, template analysis and the generation worker through the private
Responses adapter. Authentication uses a fresh native Codex OAuth login owned by
the proxy, never copied desktop credentials. No proxy failure changes provider or
model. Explicit legacy settings preserve the earlier transports for rollback.
Native login and synthetic exact-model inference were verified on 6 October 2026.
Application and worker activation require their separate deployed acceptance
receipts in `docs/intelligence-proxy/verification-20261006.md`.

App requesters remain separate from the generation worker owner.
`GENERATION_ENABLED=1` alone is insufficient: the owner, requester, live heartbeat,
synthetic inference proof, exact connection identity and skill hash must pass.
Drafts require independent fairness and cross-reference reviews bound to their
content hash plus a fresh human approval before saving. See
`ops/generation-worker/README.md` and `ops/cli-proxy-api/README.md`.
Deterministic MNDA sending and FSP legal-review decisions remain separate.

Agents live in `src/lib/agents/`. Each extends `BaseAgent` and implements `run()`.

- **Orchestrator** (`orchestrator.ts`): Single registry for runnable agents and direct `runAgent()` triggers
- **Compliance Agent**: Legacy stored-record compliance and deadline checks
- **Agreement Analyzer**: AI-powered document categorization, clause extraction, file naming
- **Invoice Detection**: Scans emails for invoices, verifies math, routes to finance
- **Compliance Audit**: Legacy database audit producing AuditReport records; not the FSP source-backed legal review
- `AgentMessage` is diagnostic/legacy plumbing only; production workflows use direct triggers. Cross-dashboard events use the durable `CrossModuleEvent` queue.

## Tech Stack
- **Framework**: Next.js 16.3.5 (App Router, Server Components)
- **Database**: NeonDB (PostgreSQL) via Prisma 7.6.0
- **UI**: shadcn/ui + Tailwind CSS v4 (dark mode primary)
- **Charts**: Recharts
- **AI**: CLIProxyAPI v8.0.16 with verified native Codex OAuth and exact `gpt-6.1-sol`; private Responses transport, isolated generation worker and human approval. See the dated intelligence verification receipt for activation status.
- **Drag & Drop**: @dnd-kit/core
- **Icons**: lucide-react
- **Auth**: Custom cookie-based HMAC sessions
- **Deploy**: primary GCP Cloud Run `lsc-legal-dashboard` in `fsp-us-prod-499705` / `us-central1`; original `fsp-legal-esign` / `asia-southeast1` URL remains compatible. Existing Neon data, document bucket and signing URLs are retained.

## Key Rules
1. **Read Next.js 16 docs first**: Check `node_modules/next/dist/docs/` before writing any code. `params` and `searchParams` are Promises in page components — always `await` them.
2. **Server Components by default**: Only add `'use client'` when you need state, effects, or event handlers.
3. **Dark mode primary**: slate-950 background everywhere. See `.claude/skills/design-system.md` for full tokens.
4. **Prisma for all DB access**: Use the singleton from `src/lib/prisma.ts`. Never raw SQL unless reading finance tables.
5. **Server Actions for mutations**: All writes go through `src/actions/`. Always call `requireSession()` or `requireRole()` first.
6. **Financial figures use JetBrains Mono**: `font-mono tabular-nums` class on all numbers.
7. **USD reporting default**: Keep agreement-currency Decimal values and display native amounts with sourced USD references using `src/lib/money.ts`. Missing/stale FX and unknown amounts remain explicit. Never relabel native amounts or use floating-point money.

## Skills Reference
- `.claude/skills/agentic-flows.md` — Current agent registry, lifecycle triggers, cron/webhook/Finance sync rules, verification checklist
- `.claude/skills/design-system.md` — Colors, typography, component patterns, dark theme tokens
- `.claude/skills/prisma-schema.md` — Full database schema with all models and enums
- `.claude/skills/auth-pattern.md` — Cookie-based auth, roles, permissions, middleware
- `.claude/skills/page-specs.md` — Detailed spec for all 13 legal dashboard pages
- `.claude/skills/component-patterns.md` — Server/Client component patterns, reusable components
- `.claude/skills/api-and-actions.md` — Server actions, route handlers, mutation patterns
- `.claude/skills/tracker-seed-data.md` — All 85 tracker items with priorities and dependencies
- `.claude/skills/finance-integration.md` — How legal and finance modules connect

## Entity Structure
- **LSC** (parent holding company)
- **TBR** (Team Blue Rising — E1 racing)
- **FSP** (Future of Sports — tech platform)
- **Bowling, Squash, Basketball, Beer Pong, Padel** (tournament properties)
- **Foundation Events** (charitable)

## Permission Roles (8 roles from PRD)
Platform Admin (AK) | Finance Admin (Anuj) | Legal Admin (Arvind) | Ops Admin (AM) | FSP Finance (Tabitha, Sayan) | Commercial Officer | Team Member | External Auditor

## Legal OS v2 invariants

- The central document policy in `src/lib/document-access.ts` limits global access
  to the four confirmed futureofsports.io principals. Platform role alone does
  not bypass it. Fresh AppUser state controls sessions and individual grants.
- Artifact bytes and provenance are immutable. Signed lineage binds to the exact
  populated artifact sent to the provider, never the current attachment.
- Entity legal identities require sourced evidence; arena codes are a separate
  naming lexicon. Existing unclassified matters and unmapped KYC remain visible.
- Review schedule mutations and dependency events are durable database writes.
  Public cadence is 14 days for six calendar months; later cadence is unset.
- Backup archives are scoped document exports with manifests and missing-file
  reports, not proof of database or OpenSign recovery.
- Use explicit GCP project flags. The operator's default gcloud project is unrelated.
- Runtime configuration and credentials are separate from tested implementation.
  See `docs/v2/documents-runtime.md`, `docs/v2/entities-runtime.md`, and `PLAN.md`.

## FSP compliance integration

FSP compliance uses immutable source snapshots, three-valued applicability,
source and fact review, append-only legal decisions, and a restricted CISO
Assistant Community metadata outbox. The initial feed is for legal review, not
a certification. Human-requested delivery starts an isolated worker; recurring
Codex CLI review automation is deferred. The proxy intelligence integration does
not schedule FSP applicability reviews, approve legal decisions or deliver CISO
controls on its own. The generation service processes explicitly queued jobs.
See `docs/compliance-integration/PLAN.md` and
`docs/compliance-integration/deployment-20261006.md` before extending it.
The historical isolated API proof is in `implementation-cpl02.md`.

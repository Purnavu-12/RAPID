# RAPID — Revenue Autopilot for Intelligent Payment Recovery

> **AI proposes · deterministic policy authorizes · execution acts · outcome verifies.**

RAPID is a revenue recovery platform that detects at-risk payments, diagnoses the root cause with AI, selects the safest highest-value intervention, enforces policy guardrails, executes through Razorpay, and measures every recovery against a complete audit trail.

---

## The Problem

Revenue loss rarely comes from one isolated failure. It can occur at several points in a payment lifecycle:

| Revenue leak         | Typical signals                                                | Example causes                                                              |
| -------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Payment degradation  | `payment.failed`, repeated declines, gateway failures          | insufficient funds, issuer decline, timeout, authentication failure         |
| Checkout abandonment | checkout started but no successful payment                     | friction, hesitation, price shock, timeout, customer distraction            |
| Subscription failure | recurring charge fails or subscription enters a recovery state | balance shortage, mandate issue, bank rejection, payment instrument problem |
| Receivables aging    | invoice passes due date                                        | cash-flow delay, forgotten invoice, customer dispute, approval delay        |

---

## How It Works

```mermaid
flowchart LR
    A[Financial Event] --> B[Risk Detection]
    B --> C[Root-Cause Diagnosis]
    C --> D[Recoverability Prediction]
    D --> E[Intervention Selection]
    E --> F[Policy / Safety Gate]
    F --> G[Scheduled Execution]
    G --> H[Payment / Customer Outcome]
    H --> I[Recovery Measurement]
    I --> J[Audit + Learning Feedback]

    style A fill:#1e1e1e,stroke:#444,color:#fff
    style B fill:#1a1a2e,stroke:#444,color:#fff
    style C fill:#1a1a2e,stroke:#444,color:#fff
    style D fill:#1a1a2e,stroke:#444,color:#fff
    style E fill:#1a1a2e,stroke:#444,color:#fff
    style F fill:#2a1a1a,stroke:#444,color:#fff
    style G fill:#1a1a2e,stroke:#444,color:#fff
    style H fill:#1a1a2e,stroke:#444,color:#fff
    style I fill:#1a1a2e,stroke:#444,color:#fff
    style J fill:#1a1a2e,stroke:#444,color:#fff
```

### The Closed-Loop Recovery Pipeline

1. **Observe** — Receive provider webhooks and business events
2. **Detect** — Determine where revenue may be at risk
3. **Understand** — Diagnose the likely cause and estimate recoverability
4. **Decide** — Select the most valuable permitted intervention
5. **Govern** — Apply policy, risk limits, consent, and stopping rules
6. **Act** — Execute through controlled provider adapters
7. **Verify** — Reconcile actual financial state and measure recovered value

### Core Architectural Principles

- **Detection, Decide, and Act Are Separate** — The event that detects risk never directly sends a message or initiates a financial action.
- **Idempotency Everywhere** — Every external event and executable action has a deterministic idempotency key.
- **Policies Are Data** — Stopping rules, action limits, cooldowns, and thresholds live in versioned policy data.
- **AI Is Constrained Intelligence** — The AI layer can classify, reason over evidence, select from an approved action set, and generate bounded communication content — but it cannot bypass policy or directly execute payment APIs.
- **Financial State Is Authoritative** — Payment-provider APIs and verified webhook events are authoritative for financial state.
- **Event-First Auditability** — The same append-only event chain that powers the system also powers the audit trail.
- **Graceful Degradation** — When AI is unavailable, the financial system remains safe via deterministic fallback.

---

## Live Demo

RAPID ships with a **live demo** backed by real Razorpay test resources — no mocks.

### Quick Start

```bash
# 1. Start Supabase locally
supabase start

# 2. Reset the database with migrations + seed data
supabase db reset

# 3. Configure environment
cp .env.example .env.local
# Edit .env.local with your Supabase keys and Razorpay test credentials

# 4. Start the dev server
pnpm dev

# 5. Open the dashboard
open http://localhost:3000/dashboard
```

### What You'll See

- **Live recovery widget** on the homepage — real metrics from Acme Retail
- **Dashboard** — open cases, recovery funnel, audit trail
- **Simulation Lab** — run scenarios across all 9 payment-failure types
- **WITH vs WITHOUT** comparison — measure incremental recovery lift
- **Guided demo** at `/demo` — step-by-step walkthrough of the full pipeline

### Honest Boundaries

The demo uses **real Razorpay test resources** (Orders, Payment Links) and **real webhook signature verification**. The one exception is that `payment.failed` events are synthesized with genuine decline codes because a true card decline requires a live customer checkout flow that a server-side demo cannot drive. The failure reason is the only field not produced by a live card attempt. In production, Razorpay delivers real webhooks to a public endpoint.

---

## Judging Bar → Where to See It

| Buildathon Criterion | Where to Find It |
|---|---|
| **Measured money recovered across a batch** | Dashboard → "Simulation Lab" → "Run WITH vs WITHOUT" — shows recovery rate + revenue recovered vs. no-automation baseline |
| **Compliant escalation** | Dashboard → Cases table shows `ESCALATE_HUMAN` cases with amber badge; engine logic in `lib/policy/engine.ts` |
| **Stopping rules** | Engine enforces `max_attempts=3` → `MARK_EXHAUSTED`; tested in 46 unit tests at boundary conditions |
| **Audit trail** | Dashboard cases table → click any case to open the audit chain viewer (Event → Diagnosis → Decision → Action → Outcome) |
| **Graceful failure handling** | `lib/actions/executor.ts` handles errors by keeping actions SCHEDULED for safe retry; future UNKNOWN state + reconciliation |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│              Experience Plane                               │
│  Dashboard · Case Review · Simulation Lab · Analytics       │
└──────────────────────┬────────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────────┐
│              API Plane                                      │
│  Auth · Webhooks · Recovery APIs · Simulation APIs          │
└──────────────────────┬────────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────────┐
│              Intelligence Plane                            │
│  Detection · Diagnosis (rule-first + LLM) · Decision Agent  │
└──────────────────────┬────────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────────┐
│              Control Plane                                  │
│  Policy Engine · Risk Limits · Scheduling                 │
└──────────────────────┬────────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────────┐
│              Execution Plane                                │
│  Payment Workers · Communication · Human Escalation         │
└──────────────────────┬────────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────────┐
│              Data Plane                                     │
│  PostgreSQL (state + projections) · Redis (hot controls)    │
└──────────────────────┬────────────────────────────────────┘
                       │
┌──────────────────────▼────────────────────────────────────┐
│              Observability Plane                           │
│  Logs · Metrics · Traces · Audit                            │
└───────────────────────────────────────────────────────────┘
```

### Technology Stack

- **Frontend**: Next.js 16 + React 19 + TypeScript
- **Styling**: Tailwind CSS + custom design tokens
- **Database**: Supabase (PostgreSQL) with migration-based schema
- **Payment Provider**: Razorpay (test/live API + webhooks)
- **AI**: poolside.ai (OpenAI-compatible, `poolside/laguna-s-2.1`)
- **Testing**: Vitest (unit) + planned Playwright (E2E)
- **Deployment**: Vercel (planned)

---

## Repository Structure

```
RAPID/
├── app/                    # Next.js App Router pages
│   ├── api/                # API routes (webhooks, recovery, dev)
│   ├── dashboard/          # Recovery dashboard
│   ├── docs/               # Documentation pages
│   ├── page.tsx            # Landing page
│   └── ...                 # about, pricing, platform, how-it-works
├── components/             # React component library
│   ├── dashboard/          # Dashboard components
│   ├── landing/            # Landing page sections
│   └── ui/                 # Shadcn/UI primitives
├── lib/                    # Core business logic
│   ├── actions/            # Execution layer
│   ├── dev/                # Simulation harness
│   ├── policy/             # Decision engine + policy
│   ├── razorpay/           # Razorpay API client
│   ├── webhooks/           # Webhook ingestion
│   ├── supabase/           # Supabase client
│   ├── dashboard.ts        # Types
│   └── utils.ts            # Utilities
├── docs/
│   └── RAPID.md            # Full architecture specification
├── supabase/
│   ├── migrations/         # Database schema
│   ├── seed.sql            # Seed data
│   └── config.toml         # Supabase config
├── styles/
├── public/
├── package.json
├── tsconfig.json
├── tailwind.config.js
├── vitest.config.mts
└── .env.example
```

---

## Key Architectural Decisions

1. **Event-driven core** — Recovery workflows are asynchronous and survive bursts and downstream failures.
2. **PostgreSQL for transactional truth** — Recovery cases, policies, actions, and state transitions are relational and transactional.
3. **Rule-first diagnosis** — Known payment states do not consume expensive LLM inference.
4. **Policy as the financial boundary** — AI flexibility never translates into unrestricted financial authority.
5. **Reconciliation as first-class** — Provider state, not internal assumptions, determines whether money was actually recovered.

---

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Run linter
pnpm lint

# Type check
npx tsc --noEmit

# Build for production
pnpm build
```

---

## License

This project is part of the Razorpay AI Buildathon.

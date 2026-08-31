# Project: GrowthOS Redesign

## Architecture
GrowthOS is a frictionless, zero-configuration marketing and growth operations platform built with Next.js 15 App Router, TypeScript, Tailwind CSS, Radix UI, Lucide icons, `next-intl` bilingual localization (Hebrew RTL / English LTR), and a backend powered by NestJS, Firestore ORM models, and an extensible `AutomationActionExecutor` pipeline for Google Ads, Meta Ads, and Simulated Ad Accounts.

### System Topography & Module Boundaries
```
GrowthOS Navigation (Tri-Module Architecture)
├── Global Header (Locale Switcher EN/HE, Org/Project Selectors, AI Copilot Command Bar)
│
├── 1. Ads & Performance (מודעות וביצועים) [COMPLETED]
│   ├── Unified Campaigns & Ad Performance Cockpit (Meta & Google Ads, ROAS, Spend, Status Toggles)
│   ├── Creatives Gallery (Visual previews of images, copy, headlines, CTA)
│   └── Spend & ROAS Analytics (40d payback, quality calibration, budget targets)
│
├── 2. Funnel & Goals (משפך ויעדים) [NEXT]
│   ├── Visual Conversion Funnels (Multi-step conversion pipeline e.g. EasySign: Sent → Viewed → Signed)
│   ├── Metric Goals & Dynamic Pace (Thermometer progress, projected dates, target vs actual)
│   └── Revenue Health & Retention (Cohort retention heatmap, payback velocity)
│
├── 3. AI Copilot & Automation (עוזר AI ואוטומציה)
│   ├── Interactive Bilingual Copilot Chat (Hebrew & English natural language commands & queries)
│   ├── In-Context Smart Recommendations (Proactive cards with Before/After diffs & 1-click approve)
│   ├── Pending Proposals Queue & Action Hub (Explicit diffs, estimated impact summary)
│   ├── Execution Logs & Audit Trail (Real-time history, verification, 1-click rollback)
│   └── Safety & Guardrails (Emergency Kill Switch, budget policy limits)
│
└── 4. Settings & Resources (Secondary / Non-intrusive)
    └── Account Settings, API Keys, Cost Guardrails, Plugins, Audit Log
```

---

## Feature Inventory
| # | Feature | Description | Milestone | Source | Status |
|---|---------|-------------|-----------|--------|--------|
| 1 | Tri-Module Navigation Restructuring | Consolidate 32+ cluttered links into 3 clean modules (Ads, Funnel & Goals, Copilot & Automation) + secondary Settings | M1 | ORIGINAL_REQUEST §R1 | **DONE** |
| 2 | Unified Campaigns Cockpit | Visual campaign cards/table with Meta/Google platform badges, live spend, ROAS, and zero DB configs | M1 | ORIGINAL_REQUEST §R1 | **DONE** |
| 3 | 2-Click Campaign Actions | Inline daily budget adjustment and <= 2-click pause/activate status toggles | M1 | ORIGINAL_REQUEST §Acceptance Criteria | **DONE** |
| 4 | Creatives Preview Gallery | Visual ad preview cards for Meta & Google ads with image, headline, primary text, and CTA buttons | M1 | ORIGINAL_REQUEST §R1 | **DONE** |
| 5 | Visual Conversion Funnels | Multi-step conversion funnel (e.g. EasySign: Sent → Viewed → Signed) with drop-off percentages & counts | M2 | ORIGINAL_REQUEST §R1 | PLANNED |
| 6 | Business Metric Goals & Dynamic Pace | Active goals with target inputs, dynamic pace thermometers, and projected completion dates | M2 | ORIGINAL_REQUEST §R1 | PLANNED |
| 7 | Revenue Health & Cohorts | Cohort retention heatmap and customer velocity metrics | M2 | ORIGINAL_REQUEST §R1 | PLANNED |
| 8 | Bilingual Natural Language Copilot | Interactive conversational chat in Hebrew (RTL) and English (LTR) parsing analytics and action intents | M3 | ORIGINAL_REQUEST §R2 | PLANNED |
| 9 | Proactive In-Context Smart Cards | Embedded recommendation cards in campaign/funnel screens with Before/After diffs and impact summaries | M3 | ORIGINAL_REQUEST §R2 | PLANNED |
| 10 | 1-Click Action Execution | 1-click approval and instant execution via `AutomationActionExecutor` with fast verification | M3 | ORIGINAL_REQUEST §R2 | PLANNED |
| 11 | Audit Trail & 1-Click Rollback | Complete action history with verification and 1-click rollback execution | M3 | ORIGINAL_REQUEST §R2 | PLANNED |
| 12 | Zero-Setup Executive Blended Report | Blended cross-channel overview (Meta + Google spend, blended CAC, conversion velocity, churn/dunning) | M4 | ORIGINAL_REQUEST §R3 | PLANNED |
| 13 | Bilingual Symmetrical Localization | 100% UI strings localized in `messages/he.json` and `messages/en.json` passing `messages.test.ts` | M4 | ORIGINAL_REQUEST §R4 | PLANNED |
| 14 | RTL Layout & Visual Polish | Modern Tailwind CSS, Radix UI, Lucide icons, seamless RTL/LTR switching with zero layout breakage | M4 | ORIGINAL_REQUEST §R4 | PLANNED |
| 15 | Monorepo Build, Typecheck, Lint Clean | Monorepo passes `pnpm build`, `pnpm typecheck`, and `pnpm lint` with 0 errors | M4 | ORIGINAL_REQUEST §Acceptance Criteria | PLANNED |
| 16 | E2E Opaque-Box Test Suite (Tiers 1-4) | Comprehensive requirement-driven opaque-box test suite across all 3 modules and AI action engine | M5 | Project Pattern Dual Track | **READY** (57 tests passing) |
| 17 | Adversarial Coverage Hardening (Tier 5) | White-box adversarial test cases and edge-case hardening via Challenger loop | M5 | Project Pattern Dual Track | PLANNED |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Navigation & Tri-Module Foundation (Ads & Performance) | Restructure AppShell and sidebar to 3 clean modules; build unified Ads & Performance cockpit with Meta/Google cards, creatives gallery, spend/ROAS analytics, and <= 2-click status/budget controls | none | **DONE** |
| M2 | Funnel & Goals Module | Build visual multi-step conversion funnel (EasySign), dynamic goal pace thermometers, projected completion dates, and revenue health/retention matrix | M1 | **DONE** |
| M3 | Hybrid AI Action Engine & Copilot Integration | Build bilingual Copilot chat & command bar, proactive in-context smart recommendation cards with Before/After diffs, 1-click execution endpoint, and rollback pipeline | M1 | **DONE** |
| M4 | Zero-Setup Executive Reporting & Bilingual Polish | Build `ExecutiveBlendedReport`, complete 100% translation key parity in `messages/he.json` and `messages/en.json`, RTL layout polish, and verify `pnpm build`, `pnpm typecheck`, `pnpm lint` | M1, M2, M3 | **DONE** |
| M5 | Final Milestone: 100% E2E Test Suite & Adversarial Hardening | Phase 1: Verify 100% pass across all Tiers 1-4 tests published by E2E Testing Track; Phase 2: Tier 5 Adversarial Coverage Hardening | M1, M2, M3, M4 | **DONE** |

---

## Interface Contracts

### AI Copilot & Action Engine Contracts
```typescript
export interface CopilotMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  actionProposal?: CopilotActionProposal;
}

export interface CopilotActionProposal {
  actionType: 'budget_change' | 'campaign_activation' | 'campaign_draft_create' | 'keyword_edit' | 'ad_edit';
  targetId: string;
  targetLabel: string;
  beforeValue: string | number;
  afterValue: string | number;
  estimatedImpact: string;
  impactBadge: 'high' | 'medium' | 'low';
  payload: Record<string, unknown>;
  quickExecuteToken?: string;
}

export interface SmartRecommendationCardProps {
  id: string;
  category: 'budget' | 'ad_fatigue' | 'funnel_dropoff' | 'pacing';
  title: string;
  description: string;
  beforeDiff: string;
  afterDiff: string;
  projectedImpact: string;
  actionProposal: CopilotActionProposal;
  onApprove: (proposal: CopilotActionProposal) => Promise<void>;
  onDismiss: (id: string) => void;
}
```

### Blended Executive Reporting Contracts
```typescript
export interface ExecutiveBlendedMetrics {
  totalSpendUsd: number;
  metaSpendUsd: number;
  googleSpendUsd: number;
  blendedCacUsd: number;
  blendedRoas: number;
  totalConversions: number;
  conversionVelocityDays: number;
  churnRatePct: number;
  dunningRecoveryRatePct: number;
  periodComparison: {
    spendChangePct: number;
    cacChangePct: number;
    roasChangePct: number;
  };
}
```

---

## Code Layout
- `apps/web/app/[locale]/orgs/[orgId]/projects/[projectId]/`: App Router project pages
  - `layout.tsx`: Consolidated 3-module AppShell layout [DONE]
  - `page.tsx`: Redirect to `/campaigns` [DONE]
  - `campaigns/`: Ads & Performance module pages [DONE]
  - `funnel/`: Funnel & Goals module pages [NEXT]
  - `automation/`: AI Copilot & Automation module pages
  - `settings/`: Consolidated secondary settings [DONE]
- `apps/web/components/orgs/`: Shared project UI components
  - `app-shell.tsx`: Primary sidebar with 3 clean modules + settings [DONE]
  - `ads-performance-dashboard.tsx`: Unified Ads cockpit [DONE]
  - `campaign-list-table.tsx`: Campaigns table [DONE]
  - `campaign-status-toggle.tsx`: 1-click status switch [DONE]
  - `campaign-daily-budget-control.tsx`: 1-click presets & inline budget [DONE]
  - `meta-ad-preview-card.tsx` & `google-search-ad-preview-card.tsx`: Ad preview mockups [DONE]
  - `creative-preview-gallery.tsx`: Creatives gallery [DONE]
  - `visual-funnel-steps.tsx`: Multi-step conversion funnel [NEXT]
  - `funnel-goals-view.tsx`: Funnel & Goals consolidated view [NEXT]
  - `executive-blended-report.tsx`: Blended cross-channel overview
- `apps/web/components/ai/`: AI Copilot & Smart Card components
  - `copilot-chat-panel.tsx`: Bilingual conversational chat
  - `copilot-command-bar.tsx`: Quick NL command palette
  - `smart-recommendation-cards.tsx`: In-context 1-click optimization cards
- `apps/web/lib/orgs/`: Organization & metrics helpers
  - `ads-performance-synthesizer.ts`: Zero-config ads metrics synthesizer [DONE]
  - `funnel-goals-synthesizer.ts`: Funnel & goal pace synthesizer [NEXT]
- `apps/web/lib/ai/`: AI Copilot NLP & recommendation engine
  - `copilot-engine.ts`: Bilingual intent parsing & proposal generator
  - `recommendation-engine.ts`: Proactive recommendation generator
- `apps/web/messages/`: Localization files
  - `en.json`: English LTR messages [M1 DONE]
  - `he.json`: Hebrew RTL messages [M1 DONE]
- `apps/web/tests/e2e/`: Opaque-box E2E test suite (Tiers 1-4) [DONE]

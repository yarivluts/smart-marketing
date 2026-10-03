# Project: GrowthOS Navigation & Ingestion Architecture

## Architecture
GrowthOS is a multi-tenant B2B SaaS Growth & Marketing Intelligence platform built on Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, Lucide icons, `next-intl` bilingual localization (English LTR & Hebrew RTL), and a BigQuery/Firestore dbt semantic metrics layer.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                Unified Navigation Shell                                │
│   ┌───────────────────────────────┐ ┌──────────────────────────────────────────────┐   │
│   │ Desktop Collapsible Sidebar   │ │ Topbar & OmniSearch (Cmd+K) & Language/Theme │   │
│   │ (w-64 expanded / w-16 rail)   │ ├──────────────────────────────────────────────┤   │
│   │ • 6 Functional Clusters       │ │ Active Route View                            │   │
│   │ • Pinned Favorites            │ │ • Missing Integration Alert Overlay          │   │
│   │ • Missing Alerts Badge        │ │ • Metric Cards & BI Charts                   │   │
│   └───────────────────────────────┘ └──────────────────────────────────────────────┘   │
│   ┌────────────────────────────────────────────────────────────────────────────────┐   │
│   │ Mobile Shell: Slide-over Drawer + 5-Pill Bottom Quick Bar                      │   │
│   └────────────────────────────────────────────────────────────────────────────────┘   │
└────────────────────────────────────────────────┬───────────────────────────────────────┘
                                                 │
                                                 ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   Contextual Missing-Integration & Quick-Setup Layer                   │
│   • Missing Data Stream Detector (`useIntegrationPrerequisites`)                       │
│   • Reusable Alert Banners, Overlays & Chips (`<MissingIntegrationAlert />`)           │
│   • 1-Click Action Handlers (OAuth Connect, 1-Line Script Copy, Setup Guide)          │
│   • Mock Event Emission Engine (`/api/orgs/.../mock-event`) -> Instant Live Verify    │
└────────────────────────────────────────────────┬───────────────────────────────────────┘
                                                 │
                                                 ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                     Dedicated Integrations Hub (`/integrations`)                       │
│   • Connection Health Overview (Active, Degraded, Missing, Available)                  │
│   • Categorized Directory (Billing & Revenue, Ad Networks, Telemetry, CRM)             │
│   • Missing Integrations Triage Checklist                                             │
│   • Interactive Step-by-Step Setup Modals with Webhook URLs & Live Event Tester       │
└────────────────────────────────────────────────┬───────────────────────────────────────┘
                                                 │
                                                 ▼
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                   Canonical Schema Contracts & Ingestion Mapping Layer                 │
│   • 5 Canonical Schemas (Subscription State, Transactions, Ad Spend, Telemetry, CRM)   │
│   • Automated JSON Schema Validation Rules & Sample Payloads                           │
│   • Metric-to-Raw Mapping Engine (TROI, LTV, MRR Waterfall, CAC, DAU/MAU)             │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

## Feature Inventory
Every requirement from ORIGINAL_REQUEST.md is inventoried and verified:

| # | Feature | Description | Milestone | Status | Source |
|---|---------|-------------|-----------|--------|--------|
| F01 | 6 Functional Clusters Navigation | Organize 34+ routes into 6 hierarchical clusters: Executive & Overview, Marketing & Ad Cockpit, Economics & Cohorts, MRR & Revenue Intelligence, Product & Telemetry, Data & Integrations | M2 | DONE | R1 |
| F02 | Responsive Desktop Sidebar | Collapsible desktop sidebar (expanded w-64 vs icon-rail w-16) with smooth transitions, tooltips, and badges | M2 | DONE | R1 |
| F03 | Pinned Favorites | Ability to star/pin favorite navigation destinations stored in localStorage | M2 | DONE | R1 |
| F04 | Mobile Responsive Shell | Slide-over drawer menu + bottom 5-item quick-pill shortcut bar with touch-friendly targets | M2 | DONE | R1 |
| F05 | Active Route Highlighting | Precise active path prefix matching (`bestMatchingHref`) with visual indicator | M2 | DONE | R1 |
| F06 | Global Command Palette (Cmd+K) | Unified search dialog combining static 6-cluster navigation routes with live entity search | M2 | DONE | R1 |
| F07 | Bilingual RTL / LTR Parity | 100% translation coverage in English (`en.json`) and Hebrew (`he.json`), Tailwind logical properties (`ps-`, `pe-`, `start-`, `end-`, `rtl:rotate-180`), no hardcoded strings | M2 | DONE | R1 |
| F08 | Canonical Schema: Subscription State | JSON Schema contract, validation rules, and sample payload for `subscription_state_change` | M3 | DONE | R2 |
| F09 | Canonical Schema: Customer Transactions | JSON Schema contract, validation rules, and sample payload for `customer_transaction` | M3 | DONE | R2 |
| F10 | Canonical Schema: Ad Spend | JSON Schema contract, validation rules, and sample payload for `ad_spend` (Google, Meta, TikTok) | M3 | DONE | R2 |
| F11 | Canonical Schema: Product Telemetry | JSON Schema contract, validation rules, and sample payload for `product_telemetry` | M3 | DONE | R2 |
| F12 | Canonical Schema: CRM Lifecycle | JSON Schema contract, validation rules, and sample payload for `crm_lifecycle` | M3 | DONE | R2 |
| F13 | Automated Schema Validation Engine | Validation utility functions with clear field-level error diagnostics and type inference | M3 | DONE | R2 |
| F14 | Metric-to-Raw Ingestion Mapping | Formal mapping matrix connecting all 13+ BI metrics to raw stream prerequisites | M3 | DONE | R2 |
| F15 | Missing Data Stream Detection Hook | React hook / selector `useIntegrationPrerequisites` resolving connector status | M4 | DONE | R3 |
| F16 | Contextual Missing Alert Banners | Non-intrusive banner & card overlay components rendering missing fields and metric impact | M4 | DONE | R3 |
| F17 | 1-Click Quick Setup Actions | Interactive buttons: 1-click OAuth modal, 1-line script copy, setup guide generator | M4 | DONE | R3 |
| F18 | Mock Event Emission Engine | API endpoint and UI action to emit synthetic events and trigger optimistic `Missing -> Connected` transition | M4 | DONE | R3 |
| F19 | Dashboard Alert Integrations | Wiring contextual alerts into key screens (`/boards`, `/cohorts`, `/billing-ops-feed`, `/campaigns`, `/funnel`) | M4 | DONE | R3 |
| F20 | Integrations Hub: Health Overview | Bird's-eye health strip displaying Active, Degraded, Missing, and Available connector counts | M5 | DONE | R4 |
| F21 | Integrations Hub: Categorized Directory | Filterable grid across Billing & Revenue, Ad Networks, Telemetry & Identity, CRM & Sales | M5 | DONE | R4 |
| F22 | Integrations Hub: Missing Triage Tab | Dedicated checklist of missing integrations prioritized by affected dashboards | M5 | DONE | R4 |
| F23 | Integrations Hub: Interactive Setup Modals | Step-by-step wizard with API credentials, webhook URL copy, signing secret, and live receiver tester | M5 | DONE | R4 |
| F24 | E2E & Unit Test Coverage | Comprehensive unit, component, and integration test suite across navigation, schemas, alerts, and hub (1,393+ tests) | M1, M6 | DONE | Acceptance |

## Milestones

| # | Name | Scope | Dependencies | Status | Key Outputs |
|---|------|-------|-------------|--------|-------------|
| M1 | E2E Testing Suite Track | Opaque-box test suites for navigation, schemas, alerts, hub, and mock emission (Tiers 1-4) | none | DONE | `TEST_READY.md`, 1,248 tests |
| M2 | Modern Unified Navigation Shell | Canonical nav config, 6 clusters, desktop collapsible sidebar, mobile drawer/pill bar, Cmd+K, RTL/LTR parity | none | DONE | `apps/web/components/shell/`, 109 tests |
| M3 | Canonical Schemas & Ingestion Mapping | 5 schema contracts, validation rules, sample payloads, metric-to-raw mappings in `@growthos/shared` | none | DONE | `packages/shared/src/schemas/`, 957 tests |
| M4 | Contextual Alerts & Mock Event Engine | Alert banners/overlays, `useIntegrationPrerequisites`, mock emission API route, dashboard wiring | M3 | DONE | `apps/web/components/integrations/`, 210 tests |
| M5 | Dedicated Integrations Hub (/integrations) | `/integrations` page, health strip, categorized directory, missing triage checklist, setup modals | M3, M4 | DONE | `/integrations` page & components, 191 tests |
| M6 | Final Integration & Test Hardening | 100% E2E test pass (Tiers 1-4), adversarial test hardening (Tier 5), 0 typecheck errors, build verification | M1, M2, M3, M4, M5 | DONE | Gate PASS (2 Reviewers APPROVE, 2 Challengers APPROVE, Forensic Auditor CLEAN, 1,393+ tests pass) |

## Interface Contracts

### 1. Navigation Shell (`apps/web/config/nav-config.ts`)
```typescript
export interface NavItem {
  id: string;
  labelKey: string;
  href: string;
  iconName: string;
  badgeKey?: string;
  requiredConnector?: string;
  shortcut?: string;
}

export interface NavCluster {
  id: string;
  labelKey: string;
  descriptionKey?: string;
  iconName: string;
  items: NavItem[];
}

export interface NavConfig {
  clusters: NavCluster[];
  mobileQuickItems: string[]; // item IDs
  defaultFavorites: string[]; // item IDs
}
```

### 2. Canonical Schemas (`packages/shared/src/schemas/`)
```typescript
export type CanonicalEventType =
  | 'subscription_state_change'
  | 'customer_transaction'
  | 'ad_spend'
  | 'product_telemetry'
  | 'crm_lifecycle';

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors?: Array<{ path: string; message: string; code: string }>;
}
```

### 3. Contextual Missing-Integration Alert (`apps/web/components/integrations/`)
```typescript
export interface MissingIntegrationAlertProps {
  requiredConnectors: string[]; // e.g. ['stripe', 'meta_ads']
  affectedMetrics: string[]; // e.g. ['mrr_waterfall', 'gross_churn']
  missingDataPoints: string[]; // e.g. ['Subscription cancellation webhooks']
  onConnect?: (connectorId: string) => void;
  onEmitMock?: (connectorId: string) => Promise<void>;
  variant?: 'banner' | 'overlay' | 'inline' | 'card';
}
```

### 4. Mock Event Emission API (`apps/web/app/api/orgs/[orgId]/projects/[projectId]/integrations/mock-event/route.ts`)
```typescript
export interface MockEventRequest {
  connectorId: string;
  eventType: CanonicalEventType;
  payload?: Record<string, unknown>;
}

export interface MockEventResponse {
  success: boolean;
  eventCount: number;
  connectorStatus: 'active' | 'degraded' | 'missing';
  message: string;
}
```

## Code Layout

- `apps/web/config/nav-config.ts` — 6 functional clusters and navigation metadata
- `apps/web/components/shell/` — NavShell, Sidebar, Header, CommandPalette, MobileDrawer, MobileBottomBar
- `apps/web/components/integrations/` — MissingIntegrationAlert, MissingIntegrationOverlay, SetupModal, HealthOverviewStrip, ConnectorGrid, MissingTriageChecklist
- `apps/web/hooks/use-integration-status.ts` — Integration status detection hook
- `apps/web/app/[locale]/orgs/[orgId]/projects/[projectId]/integrations/page.tsx` — Dedicated Integrations Hub page
- `apps/web/app/api/orgs/[orgId]/projects/[projectId]/integrations/mock-event/route.ts` — Mock event emission API
- `packages/shared/src/schemas/` — Canonical schema definitions, validators, sample payloads
- `apps/web/messages/en.json` & `apps/web/messages/he.json` — 100% bilingual translation keys (2,121 keys in exact parity)

# E2E Test Infra: GrowthOS Navigation & Ingestion Architecture

## Test Philosophy
- **Opaque-box, requirement-driven**: Tests derive strictly from `ORIGINAL_REQUEST.md` and user-facing contracts, independent of internal module implementation.
- **Methodology**: 4-Tier verification incorporating Category-Partition, Boundary Value Analysis (BVA), Pairwise Combinatorial Testing, and Real-World SaaS Workload Scenarios.
- **Progressive Testability**: Tier 1 tests verify individual features in isolation with simple pass/fail assertions. Tier 2 tests boundary and edge cases. Tier 3 tests multi-feature interactions. Tier 4 tests full end-to-end user journeys.

## Feature Inventory & Test Coverage

| # | Feature | Requirement Source | Tier 1 (Count) | Tier 2 (Count) | Tier 3 (Pairwise) | Tier 4 (Workload) |
|---|---------|-------------------|:--------------:|:--------------:|:-----------------:|:-----------------:|
| F01 | 6 Functional Clusters Navigation | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F02 | Responsive Desktop Sidebar (Collapse/Expand) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F03 | Pinned Favorites Persistence | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F04 | Mobile Responsive Shell (Drawer + Pill Bar) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F05 | Active Route Highlighting | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F06 | Global Command Palette (Cmd+K) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F07 | Bilingual RTL / LTR Parity | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ | ✓ |
| F08 | Canonical Schema: Subscription State | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| F09 | Canonical Schema: Customer Transactions | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| F10 | Canonical Schema: Ad Spend | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| F11 | Canonical Schema: Product Telemetry | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| F12 | Canonical Schema: CRM Lifecycle | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| F13 | Automated Schema Validation Engine | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| F14 | Metric-to-Raw Ingestion Mapping | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ | ✓ |
| F15 | Missing Data Stream Detection Hook | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| F16 | Contextual Missing Alert Banners & Overlays | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| F17 | 1-Click Quick Setup Actions | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| F18 | Mock Event Emission Engine & Live Transition | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| F19 | Dashboard Contextual Alert Integration | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ | ✓ |
| F20 | Integrations Hub: Health Overview Strip | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| F21 | Integrations Hub: Categorized Directory | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| F22 | Integrations Hub: Missing Triage Checklist | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |
| F23 | Integrations Hub: Interactive Setup Modals | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ | ✓ |

## Test Architecture

### Test Runner Invocation
- **Web UI & Component Tests**:
  ```bash
  pnpm --filter @growthos/web exec vitest run
  ```
- **Shared Schema & Ingestion Mapping Tests**:
  ```bash
  pnpm --filter @growthos/shared test
  ```
- **Full Monorepo Typecheck**:
  ```bash
  pnpm --filter @growthos/web typecheck && pnpm --filter @growthos/shared typecheck
  ```

### Directory Layout for E2E Test Suite
- `apps/web/components/shell/__tests__/` — Navigation shell, desktop sidebar, mobile drawer, command palette, RTL tests
- `packages/shared/src/schemas/__tests__/` — Canonical schemas, validation rules, sample payloads, error formatters
- `apps/web/components/integrations/__tests__/` — MissingIntegrationAlert, MissingIntegrationOverlay, SetupModal, HealthStrip, IntegrationsHub tests
- `apps/web/app/api/orgs/[orgId]/projects/[projectId]/integrations/mock-event/__tests__/` — Mock event route handler and status transition tests

## Real-World Application Scenarios (Tier 4)
1. **Scenario 1: Fresh SaaS Onboarding Journey**:
   A new user lands on the Executive Pulse dashboard, sees the Contextual Missing-Integration banner ("Stripe & Google Ads missing"), clicks 1-Click Connect, enters test credentials/emits mock event, verifies the banner instantaneously transitions to Connected, and navigates to the Integrations Hub to confirm health status is Active.
2. **Scenario 2: Mobile Growth Marketer on the Go**:
   A user on mobile viewport (375px) opens GrowthOS, uses the bottom 5-pill shortcut bar to jump between Marketing Cockpit and Economics, opens the slide-over drawer to browse all 6 clusters, and verifies seamless RTL Hebrew alignment when switching locale.
3. **Scenario 3: Power User Command Palette Navigation**:
   A user presses `Cmd+K`, types "mrr", instantly filters navigation results to MRR Velocity and MRR Retention Heatmap, selects MRR Velocity via arrow keys and Enter, and arrives at the target view in 1 keypress.
4. **Scenario 4: Raw Webhook Ingestion & Validation Failure Triage**:
   A webhook payload arrives with an invalid timestamp (future clock skew) or negative ad spend. The validation engine quarantines the invalid event with descriptive error codes (`INVALID_TIMESTAMP`, `NEGATIVE_AMOUNT`), and alerts the user in the Missing Integrations Triage checklist.
5. **Scenario 5: Multi-Stream Metric Dependency Resolution**:
   A user views the Cohorts & TROI dashboard. Since TROI requires both Ad Spend (Meta/Google) and Customer Transactions (Stripe), the system detects partial data (Stripe connected, Meta missing), renders a partial data alert explaining that Ad Spend is missing for TROI calculation, and provides a direct setup action.

## Coverage Thresholds
- Tier 1: ≥115 unit/component tests (≥5 per feature across 23 features)
- Tier 2: ≥115 boundary & error handling tests
- Tier 3: ≥23 pairwise interaction tests
- Tier 4: ≥5 realistic end-to-end workload scenarios
- **Total Minimum Target: ≥258 comprehensive tests passing with 0 failures**

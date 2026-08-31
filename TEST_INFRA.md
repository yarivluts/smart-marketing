# GrowthOS E2E Test Infrastructure & Test Plan (Tiers 1–4)

## 1. Test Architecture & Runner Command

GrowthOS uses a requirement-driven, opaque-box E2E testing framework built on **Vitest**, **React Testing Library**, and **Next-Intl**. The test suite tests the system against external contract interfaces, user-visible DOM behaviors, natural language intents, and cross-module workflows without internal mock cheating.

### Test Runner Command
```bash
pnpm --filter @growthos/web exec vitest run tests/e2e
```

### Monorepo Validation Commands
```bash
# Run all E2E tests
pnpm --filter @growthos/web exec vitest run tests/e2e

# Run key translation parity test
pnpm --filter @growthos/web exec vitest run messages/messages.test.ts

# Full monorepo typecheck & lint
pnpm typecheck
pnpm lint
```

---

## 2. Feature Inventory & Coverage Matrix

| # | Feature | Requirements Source | E2E Test Suite File | Test Count | Tier |
|---|---------|-------------------|-------------------|------------|------|
| 1 | Tri-Module Navigation Restructuring | ORIGINAL_REQUEST §R1, PROJECT.md #1 | `tier1-tri-module-nav.test.tsx` | 6 | Tier 1 |
| 2 | Unified Campaigns Cockpit & Creatives | ORIGINAL_REQUEST §R1, PROJECT.md #2, #3, #4 | `tier1-ads-cockpit.test.tsx` | 6 | Tier 1 |
| 3 | Visual Funnels & Dynamic Goals | ORIGINAL_REQUEST §R1, PROJECT.md #5, #6, #7 | `tier1-funnel-goals.test.tsx` | 6 | Tier 1 |
| 4 | Bilingual Interactive AI Copilot & NLP | ORIGINAL_REQUEST §R2, PROJECT.md #8, #9 | `tier1-ai-copilot.test.tsx` | 6 | Tier 1 |
| 5 | 1-Click Action Execution & Rollback | ORIGINAL_REQUEST §R2, PROJECT.md #10, #11 | `tier1-action-execution-rollback.test.tsx` | 6 | Tier 1 |
| 6 | Zero-Setup Executive Blended Reporting | ORIGINAL_REQUEST §R3, PROJECT.md #12 | `tier1-blended-reporting.test.tsx` | 6 | Tier 1 |
| 7 | Bilingual Symmetrical RTL/LTR Localization | ORIGINAL_REQUEST §R4, PROJECT.md #13, #14 | `tier1-bilingual-localization.test.tsx` | 6 | Tier 1 |
| 8 | Boundary & Corner Cases | PROJECT.md §Milestones | `tier2-boundary-corner-cases.test.tsx` | 6 | Tier 2 |
| 9 | Cross-Feature Interactions | PROJECT.md §Milestones | `tier3-cross-feature-interactions.test.tsx` | 5 | Tier 3 |
| 10 | Real-World Growth Scenarios | ORIGINAL_REQUEST §R1–R4, PROJECT.md §Milestones | `tier4-real-world-scenarios.test.tsx` | 4 | Tier 4 |

**Total Test Count across Tiers 1–4:** **57 tests** (exceeding the >=5 requirement per feature).

---

## 3. Tier Specifications

### Tier 1: Feature Coverage (>=5 tests per feature)
- **Tri-Module Navigation (`tier1-tri-module-nav.test.tsx`)**:
  1. Consolidates sidebar into 3 clean modules (Ads & Performance, Funnel & Goals, AI Copilot & Automation) + secondary Settings.
  2. Sub-navigation tabs reachable within <= 1 click.
  3. Strict RBAC permission gating (Viewer vs Admin visibility).
  4. Responsive mobile bottom tab bar and slide-down menu.
  5. Exact active route highlighting without prefix pollution.
  6. Backwards compatibility for legacy sub-paths.

- **Unified Ads Cockpit (`tier1-ads-cockpit.test.tsx`)**:
  1. Unified table/cards with Meta Ads and Google Ads platform badges.
  2. Live spend, ROAS, and monthly budget targets rendering.
  3. High-frequency 2-click status toggles (pause / activate).
  4. Inline daily budget adjustment with instant state update.
  5. Visual Creatives Preview Gallery with ad image, headline, primary copy, and CTA button.
  6. Payback analytics and 40d ROI table rendering.

- **Visual Funnels & Business Goals (`tier1-funnel-goals.test.tsx`)**:
  1. Multi-step conversion pipeline rendering (EasySign: Sent → Viewed → Signed).
  2. Stage drop-off percentage and customer count computations.
  3. Active goals list with inline target inputs.
  4. Dynamic pace computation and thermometer statuses (`on_track`, `at_risk`, `off_track`).
  5. Linear projected completion dates and final value extrapolation.
  6. Revenue health and cohort retention heatmap display.

- **Bilingual AI Copilot & NLP (`tier1-ai-copilot.test.tsx`)**:
  1. Bilingual chat panel rendering in Hebrew (RTL) and English (LTR).
  2. Natural language analytics queries in Hebrew and English ("אילו מודעות הכי רווחיות השבוע?").
  3. Natural language action intents detection (budget adjustment, activation, campaign draft).
  4. Action proposal smart cards with explicit Before/After diffs and impact pills.
  5. Suggestion prompt chips for 1-click query insertion.
  6. Global AI Command Bar (Cmd+K) interaction.

- **1-Click Action Execution & Rollback (`tier1-action-execution-rollback.test.tsx`)**:
  1. 1-Click execution approval workflow.
  2. Safe execution through `AutomationActionExecutor` pipeline.
  3. Post-execution verification and metric regression detection.
  4. 1-Click rollback execution restoring previous campaign state.
  5. Comprehensive audit trail logging with before/after diffs.
  6. Emergency Kill Switch blocking automated modifications.

- **Zero-Setup Executive Blended Reporting (`tier1-blended-reporting.test.tsx`)**:
  1. Executive blended report overview rendering with zero manual SQL configuration.
  2. Cross-channel blended spend aggregation (Meta + Google spend).
  3. Blended CAC calculation (`Total Spend / Total Conversions`).
  4. Blended ROAS calculation (`Total Attributed Revenue / Total Spend`).
  5. Conversion velocity tracking (average days to conversion).
  6. Churn rate and dunning recovery rate health indicators.

- **Bilingual Symmetrical Localization (`tier1-bilingual-localization.test.tsx`)**:
  1. 100% key parity between `messages/en.json` and `messages/he.json`.
  2. Zero empty translation strings across all 59+ namespaces.
  3. Layout direction switching (`dir="rtl"` for Hebrew, `dir="ltr"` for English).
  4. Number/currency runs isolated with `<span dir="ltr">`.
  5. User-generated and ad copy rendered with `dir="auto"`.
  6. Runtime locale switcher navigation.

---

### Tier 2: Boundary & Corner Cases (`tier2-boundary-corner-cases.test.tsx`)
1. **Empty States**: Zero campaigns, zero funnel steps, zero active goals, empty copilot chat, zero spend gracefully render empty notices without crash.
2. **Budget Extremes & Overflows**: Handles $0 budget, max ceiling budgets ($100k/day), large numbers, and float precision.
3. **Zero Conversions & Div-by-Zero Safety**: Blended CAC handles 0 conversions ($0 spend = $0 CAC; >$0 spend = safe infinity/unbounded handling), ROAS handles $0 spend, goal pace handles 0 elapsed time.
4. **Missing Key Fallbacks & Whitespace**: Untranslated key fallback safety, whitespace-only copilot queries, special punctuation.
5. **Rapid Concurrency & Race Conditions**: Rapid clicks on status toggles, double 1-click execute clicks, rollback deduplication.
6. **Bilingual BiDi & Unicode Punctuation**: Hebrew quotes, parenthesis, and mixed English-Hebrew strings in ad creatives without layout distortion.

---

### Tier 3: Cross-Feature Interactions (`tier3-cross-feature-interactions.test.tsx`)
1. **Copilot Intent -> Action Proposal -> 1-Click Execute -> Cockpit Update -> Blended Metrics Update**:
   User prompts Copilot in Hebrew to increase budget on Meta campaign -> Copilot generates proposal -> User clicks 1-Click Execute -> Campaign Cockpit budget updates -> Executive Blended Report recalculates total spend.
2. **In-Context Smart Card -> Budget Approval -> Guardrail Check -> Audit Trail -> Rollback**:
   Proactive smart card approves $200 budget increase -> Guardrails evaluate pass -> Audit trail records action -> 1-Click Rollback reverts state and records rollback reason.
3. **Funnel Drop-off Alert -> Copilot Query -> Campaign Draft Creation -> Funnel Stage Rebalance**:
   Step 2 drop-off exceeds threshold -> Copilot recommends retargeting campaign draft -> User approves -> Campaign draft created and visible in Creatives Gallery.
4. **Goal Pace Alert (Off-Track) -> Copilot Budget Increase -> Goal Projection Recalibration**:
   Goal thermometer shows `off_track` -> Copilot executes budget boost -> Pace projection recalculates to `on_track`.
5. **Session Locale Switch Mid-Workflow**:
   Switching from EN (LTR) to HE (RTL) preserves ongoing Copilot conversation state, campaign filters, and active funnel tabs.

---

### Tier 4: Real-World Scenarios (`tier4-real-world-scenarios.test.tsx`)
1. **EasySign Funnel Optimization Flow**:
   End-to-end multi-step conversion funnel tracking (Sent → Viewed → Signed). Discovers 62% drop-off at Viewed stage; Copilot generates retargeting proposal; executes 1-click approval; verifies audit log and funnel pace recovery.
2. **Multi-Channel Budget Rebalancing**:
   Detects performance disparity (Meta ROAS 4.2x vs Google ROAS 1.5x); proactive smart card suggests reallocating $500/day from Google to Meta; executes 1-click reallocation; verifies blended CAC reduction and audit trail.
3. **Guardrail Protection & Emergency Kill Switch**:
   High-risk action exceeding spend ceiling ($15,000/day vs $5,000 ceiling) is blocked by safety guardrails; admin engages Emergency Kill Switch; all pending and automated actions are halted.
4. **Executive Growth Review & Payback Audit**:
   Executive loads Zero-Setup Blended Executive Report; drills into 40-day payback cohorts; inspects cancellation reasons distribution; verifies blended CAC across all marketing channels.

---

## 4. Test Harness & Contract Architecture

All tests use `apps/web/tests/e2e/helpers/test-harness.tsx`:
- Provides `renderWithIntl(ui, { locale: 'en' | 'he' })` wrapper with complete message catalogs.
- Provides contract-compliant mock state factories for `CopilotMessage`, `CopilotActionProposal`, `SmartRecommendationCardProps`, `ExecutiveBlendedMetrics`, and `FunnelStepView`.
- Simulates real user interactions with `@testing-library/react` (`fireEvent`, `screen`, `waitFor`).
- Zero reliance on internal implementation cheating — tests against user-visible contracts and accessibility roles.

# E2E Test Infra: GrowthOS UI/UX Overhaul

## Test Philosophy
- Opaque-box, requirement-driven verification derived from ORIGINAL_REQUEST.md.
- Multi-tier verification: Tier 1 (Feature Coverage), Tier 2 (Boundary & Corner Cases), Tier 3 (Cross-Feature Combinations), Tier 4 (Real-World Application Scenarios), Tier 5 (Adversarial Coverage Hardening).
- Strict bilingual RTL/LTR symmetry testing and translation dictionary parity checks.

## Feature Inventory
| # | Feature | Source (Requirement) | Tier 1 | Tier 2 | Tier 3 |
|---|---------|---------------------|:------:|:------:|:------:|
| 1 | Theme Tokens & Design Tokens | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 2 | Standardized UI Primitives | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 3 | App Shell & Global Navigation | ORIGINAL_REQUEST §R2.1 | 5 | 5 | ✓ |
| 4 | Cmd+K Omni-Search Modal | ORIGINAL_REQUEST §R2.1 | 5 | 5 | ✓ |
| 5 | Ads KPI Metric Scorecards | ORIGINAL_REQUEST §R2.2 | 5 | 5 | ✓ |
| 6 | Creative Preview Cards (Meta/Google) | ORIGINAL_REQUEST §R2.2 | 5 | 5 | ✓ |
| 7 | Campaign Interactive Controls & Budgets | ORIGINAL_REQUEST §R2.2 | 5 | 5 | ✓ |
| 8 | Blended Executive Reporting | ORIGINAL_REQUEST §R2.2 | 5 | 5 | ✓ |
| 9 | Conversion Funnel Flow | ORIGINAL_REQUEST §R2.3 | 5 | 5 | ✓ |
| 10 | Dynamic Goal Thermometers | ORIGINAL_REQUEST §R2.3 | 5 | 5 | ✓ |
| 11 | Cohort Retention Heatmaps | ORIGINAL_REQUEST §R2.3 | 5 | 5 | ✓ |
| 12 | TV Billboard Display Mode | ORIGINAL_REQUEST §R2.6 | 5 | 5 | ✓ |
| 13 | Operations & Settings Tables | ORIGINAL_REQUEST §R2.6 | 5 | 5 | ✓ |
| 14 | AI Copilot Chat Interface | ORIGINAL_REQUEST §R2.4 | 5 | 5 | ✓ |
| 15 | AI Proposal Diff Cards | ORIGINAL_REQUEST §R2.4 | 5 | 5 | ✓ |
| 16 | Execution Audit Trail | ORIGINAL_REQUEST §R2.4 | 5 | 5 | ✓ |
| 17 | Auth & Onboarding Cards | ORIGINAL_REQUEST §R2.5 | 5 | 5 | ✓ |
| 18 | Micro-Interactions & Transitions | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 19 | Bilingual RTL/LTR Symmetry | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 20 | Translation Dictionary Parity | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |

## Test Architecture
- **Test Runner (Unit & Component E2E)**: `pnpm --filter web test` (Vitest with React Testing Library)
- **Bilingual & Visual Verification Suites**: `apps/web/tests/` (73+ existing tests across 11 suites + expanded tier tests)
- **Typecheck**: `pnpm typecheck` (TypeScript across all packages)
- **Lint**: `pnpm lint` (ESLint across monorepo)
- **Build**: `pnpm build` (Full Next.js App Router static/dynamic build)

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Full Marketing Cockpit Navigation & Workflow | F3, F4, F5, F7, F8 | High |
| 2 | Conversion Funnel Analysis & Goal Pacing | F9, F10, F11 | High |
| 3 | AI Automation Proposal Approval & Audit Lifecycle | F14, F15, F16 | High |
| 4 | Bilingual Locale Switching & Layout Symmetry | F19, F20, F3, F5 | High |
| 5 | TV Display Mode & Operations Monitoring | F12, F13 | Medium |

## Coverage Thresholds
- Tier 1: ≥5 per feature (100+ tests)
- Tier 2: ≥5 per feature where boundaries exist (100+ tests)
- Tier 3: Pairwise coverage of major feature interactions (20+ tests)
- Tier 4: ≥5 realistic end-to-end application scenarios
- Tier 5: Adversarial edge cases and coverage hardening

# Project: GrowthOS UI/UX Overhaul

## Architecture
- **Framework**: Next.js 15 App Router (`apps/web`), React 19, TypeScript
- **Styling**: Tailwind CSS, PostCSS, CSS Variables (`globals.css`), Lucide React icons, Radix UI primitives
- **Internationalization**: `next-intl` with full bi-directional support (`he` RTL, `en` LTR)
- **State & Data Flow**: Zustand stores, React Query, Firebase Auth & Firestore client/emulator hooks

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Theme Tokens & CSS Palette | Slate backgrounds, Indigo primary, Emerald positive/growth, Amber warning, Rose alert tokens | M1 | ORIGINAL_REQUEST §R1, Explorer 1 |
| 2 | Standardized UI Primitives | 12+ shadcn/Radix-based primitives (badge, stat-card, table, tabs, dialog, select, skeleton, toast, switch, textarea, button, card) | M1 | ORIGINAL_REQUEST §R1, Explorer 1 |
| 3 | App Shell & Global Navigation | Modern floating header, workspace switcher, clean active route indicators, mobile navigation drawer | M1 | ORIGINAL_REQUEST §R2.1, Explorer 2 |
| 4 | Cmd+K Omni-Search Modal | Floating global search dialog with instant visual preview and keyboard navigation | M1 | ORIGINAL_REQUEST §R2.1, Explorer 2 |
| 5 | Ads KPI Metric Scorecards | Sleek metric scorecards with trend chips, positive/negative delta indicators, period comparisons | M2 | ORIGINAL_REQUEST §R2.2, Explorer 2 |
| 6 | Meta Feed & Google RSA Previews | Modern creative preview cards with live asset rendering and platform badges | M2 | ORIGINAL_REQUEST §R2.2, Explorer 2 |
| 7 | Campaign Interactive Controls | 1-click status toggles, inline daily budget sliders/steppers with instant feedback | M2 | ORIGINAL_REQUEST §R2.2, Explorer 2 |
| 8 | Blended Executive Reporting | Multi-channel aggregated performance charts and summary tables | M2 | ORIGINAL_REQUEST §R2.2, Explorer 2 |
| 9 | Conversion Funnel Flow | Step-by-step visual funnel with animated flow connectors and drop-off rate chips | M3 | ORIGINAL_REQUEST §R2.3, Explorer 2 |
| 10 | Dynamic Goal Thermometers | Statistical goal progress bars with pace badges and projected completion dates | M3 | ORIGINAL_REQUEST §R2.3, Explorer 2 |
| 11 | Cohort Retention Heatmaps | Interactive cohort matrix with color-graded retention cells | M3 | ORIGINAL_REQUEST §R2.3, Explorer 2 |
| 12 | TV Billboard Display Mode | High-impact full-screen TV dashboard with animated live win-feed | M3 | ORIGINAL_REQUEST §R2.6, Explorer 2 |
| 13 | Operations & Settings Tables | Modernized settings forms, member management tables with role badges, billing feed | M3 | ORIGINAL_REQUEST §R2.6, Explorer 2 |
| 14 | AI Copilot Chat Interface | Conversational AI chat panel with streaming message bubbles and suggested actions | M4 | ORIGINAL_REQUEST §R2.4, Explorer 2 |
| 15 | AI Proposal Diff Cards | Before/After visual diff cards with 1-click approve, reject, and rollback controls | M4 | ORIGINAL_REQUEST §R2.4, Explorer 2 |
| 16 | Execution Audit Trail | Filterable, searchable audit trail table with status pills and timestamps | M4 | ORIGINAL_REQUEST §R2.4, Explorer 2 |
| 17 | Auth & Onboarding Overhaul | Branded login, signup, and onboarding wizard cards with smooth transitions and validation | M4 | ORIGINAL_REQUEST §R2.5, Explorer 2 |
| 18 | Micro-Interactions & Transitions | Smooth hover states, button loading transitions, skeleton loaders, toast notifications | M1-M4 | ORIGINAL_REQUEST §R3, Explorer 1 |
| 19 | Bilingual RTL/LTR Symmetrical Polish | Complete Hebrew (RTL) and English (LTR) layout symmetry, directional icon flipping | M5 | ORIGINAL_REQUEST §R4, Explorer 3 |
| 20 | Translation Key Parity | 100% dictionary key parity between messages/he.json and messages/en.json with zero missing keys | M5 | ORIGINAL_REQUEST §R4, Explorer 3 |
| 21 | Full Monorepo Build, Typecheck, Lint & E2E Tests | Zero build errors, zero type errors, clean lint, 100% passing unit and E2E test suites | M5 | ORIGINAL_REQUEST Acceptance Criteria, Explorer 3 |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Design System Primitives & App Shell | Theme tokens (globals.css, tailwind.config.ts), UI primitives in components/ui/*, App Shell layout, floating header, workspace switcher, Cmd+K search dialog | none | DONE |
| M2 | Ads & Performance Cockpit | /campaigns page overhaul: KPI scorecards, Meta/Google creative cards, 1-click toggles, daily budget steppers/sliders, blended reporting | M1 | DONE |
| M3 | Funnel, Goals & Operations Hub | /funnel, /goals, /tv, /settings, /members, /billing-ops-feed: conversion funnel flow, goal thermometers, cohort heatmaps, TV billboard, settings tables | M1 | DONE |
| M4 | AI Copilot & Auth Screens | /automation, /login, /signup, /onboarding: AI chat panel, Before/After proposal diffs, audit trail, authentication & onboarding cards | M1 | DONE |
| M5 | Bilingual Polish & E2E Test Suite Pass | RTL/LTR mirroring, translation dictionary parity, E2E test suite pass (Tiers 1-4), adversarial hardening (Tier 5), typecheck, build, lint | M1, M2, M3, M4 | DONE |

## Interface Contracts
### UI Primitives Contract (`apps/web/components/ui/`)
- `Button`: `variant: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | 'emerald'`, `size: 'default' | 'sm' | 'lg' | 'icon'`, `isLoading?: boolean`
- `Badge`: `variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info'`
- `StatCard`: `title: string`, `value: string | number`, `change?: number`, `changeType?: 'increase' | 'decrease' | 'neutral'`, `period?: string`, `icon?: LucideIcon`, `trendData?: number[]`
- `Dialog` / `Modal`: Radix UI Dialog primitive with standard overlay, animated content wrapper, header, footer, close trigger
- `Table`: Standardized `Table`, `TableHeader`, `TableBody`, `TableHead`, `TableRow`, `TableCell` with zebra/hover support
- `Tabs`: Radix UI Tabs primitive with pill/underline variant, smooth active indicator
- `Skeleton`: Standardized pulse shimmer loader with configurable radius/height
- `Toast`: Global toast provider and hook (`useToast`, `toast({ title, description, variant })`)
- `Switch`: Accessible toggle switch with smooth transition and emerald active state

### Bi-directional Layout Contract
- Use Tailwind logical classes (`start`, `end`, `ms-*`, `me-*`, `ps-*`, `pe-*`, `text-start`, `text-end`) rather than left/right.
- Directional icons (arrows, chevrons, flow steps) must include `rtl:rotate-180` or directional context lookup.
- Numeric and currency strings (e.g. `$100/day`, `+14.2%`) must have `dir="ltr"` and `inline-block` to avoid RTL bi-di number inversion.

## Code Layout
- `apps/web/app/globals.css`: Root CSS theme variables (light/dark mode, slate/indigo/emerald/amber/rose palettes)
- `apps/web/tailwind.config.ts`: Tailwind color and animation extensions
- `apps/web/components/ui/`: Standardized UI primitive library
- `apps/web/components/shell/`: Floating header, workspace switcher, nav menu, Cmd+K omni-search
- `apps/web/components/campaigns/`: Campaign scorecards, budget sliders, creative preview cards
- `apps/web/components/funnel/`: Funnel step visualizer, goal thermometers, cohort heatmaps
- `apps/web/components/automation/`: AI chat panel, proposal diff cards, audit trail
- `apps/web/components/auth/`: Login, signup, onboarding cards
- `apps/web/components/tv/`: TV billboard display mode
- `apps/web/messages/`: `he.json`, `en.json` translation dictionaries

# KAN preproduction completion audit

UI review: 2026-09-10. Jira statuses reverified: 2026-09-12.

**30 stories moved to Done; 48 issues remain open (47 To Do, KAN-43 In Progress).** All 78 previously open issues were assessed against their Jira acceptance criteria. All 16 epics remain open because each has an unresolved child.

## Scope and evidence

The [preproduction dashboard](https://web-preprod-1098891924957.me-west1.run.app/en/dashboard) was inspected after Google sign-in. The review covered Smartech / Success Center organization and project management: resource library, audit log, registry, keys, schemas, metrics, field mapping, plugins, integrations, ingest, hooks, costs, boards and six-tile editor, goals, wins, automation, TV, attribution, cohorts, readiness and MCP.

Current local checks during the review passed: **981 shared tests, 1,932 web unit/component tests, and 25 API authorization/tool-inventory tests**.

[CI run 34516038628](https://github.com/yarivluts/smart-marketing/actions/runs/34516038628), commit `e2fcdfeab93724b16d2a89d5600f1c8ab5eb7a9f`, passed lint/typecheck/build and included 1,702 model/service tests, 144 API tests, 2,459 web tests, 36 browser tests and 250 dbt build operations. One invitation browser test passed on its configured retry.

The workspace HEAD was `bd7d215747b540e4616c6f3e10cc77327f5220f5` with substantial pre-existing changes. CI supports the specified implementation tests; it does not certify every uncommitted change or an exact deployed revision. The local full emulator suite could not start because Java was unavailable on PATH; the web unit command excluded emulator-dependent routes. The per-issue notes distinguish live UI observations from test-based evidence.

No source code, cloud infrastructure, real ads, audiences, connector credentials or account permissions were changed. The initial audit did not send Jira comments. In the user-requested follow-up, 48 issue-specific Hebrew comments were posted and individually read back to verify their contents. Each distinguishes observed failures from unverified acceptance criteria and lists remaining work; epic comments summarize unresolved child issues. Jira credentials remained in memory and were not printed or saved.

## Findings requiring follow-up

- **Illustrative health values:** the dashboard reports 99.98% uptime, <18ms and 3/3 synced pipelines. `apps/web/components/auth/dashboard-content.tsx:179` supplies literal values. The actual Integration Hub reports zero active streams and four missing prerequisites; ingest health has zero batches. Illustrative dashboard, attribution, cohort and guardrail figures were excluded as operational evidence.
- **Warehouse gap:** Marketing persists six tiles, but five fail because `growthos_core.fact_ad_spend` is absent in `me-west1`; Signups has no data.
- **Audit integrity:** the audit page reports a failed integrity check at `Mis4vPYNrMEfDtoe6Ve6`. Investigation is required; the warning does not establish actual tampering.
- **MCP deployment:** endpoint and generated client URL are blank. Ping Handshake fails with a body-stream-already-read error.
- **Acceptance gaps:** real Redis/Pub/Sub/scheduling, connector reconciliation, load benchmarks, 24-hour TV soak and measured onboarding/client setup remain unverified or partial.
- **Localization:** switching to Hebrew correctly changed `lang=he` and `dir=rtl`, then English was restored. Hard-coded strings remain outside translation files.

## All 78 decisions

Done verifies the implementation slice and acceptance evidence stated below. It does not imply dependent source connections are configured. An unresolved acceptance criterion keeps an issue open even where substantial implementation exists.

| Issue | Final Jira status | Evidence or remaining acceptance gap |
| --- | --- | --- |
| [KAN-1](https://genius-mind.atlassian.net/browse/KAN-1) | To Do | Retained open: child acceptance remains unresolved for KAN-18, KAN-19, KAN-20. A completed implementation slice does not complete the epic. |
| [KAN-2](https://genius-mind.atlassian.net/browse/KAN-2) | To Do | Retained open: child acceptance remains unresolved for KAN-26. A completed implementation slice does not complete the epic. |
| [KAN-3](https://genius-mind.atlassian.net/browse/KAN-3) | To Do | Retained open: child acceptance remains unresolved for KAN-29. A completed implementation slice does not complete the epic. |
| [KAN-4](https://genius-mind.atlassian.net/browse/KAN-4) | To Do | Retained open: child acceptance remains unresolved for KAN-32, KAN-33, KAN-34, KAN-36. A completed implementation slice does not complete the epic. |
| [KAN-5](https://genius-mind.atlassian.net/browse/KAN-5) | To Do | Retained open: child acceptance remains unresolved for KAN-38. A completed implementation slice does not complete the epic. |
| [KAN-6](https://genius-mind.atlassian.net/browse/KAN-6) | To Do | Retained open: child acceptance remains unresolved for KAN-42. A completed implementation slice does not complete the epic. |
| [KAN-7](https://genius-mind.atlassian.net/browse/KAN-7) | To Do | Retained open: child acceptance remains unresolved for KAN-43, KAN-44, KAN-45. A completed implementation slice does not complete the epic. |
| [KAN-8](https://genius-mind.atlassian.net/browse/KAN-8) | To Do | Retained open: child acceptance remains unresolved for KAN-47. A completed implementation slice does not complete the epic. |
| [KAN-9](https://genius-mind.atlassian.net/browse/KAN-9) | To Do | Retained open: child acceptance remains unresolved for KAN-49, KAN-50, KAN-51, KAN-52. A completed implementation slice does not complete the epic. |
| [KAN-10](https://genius-mind.atlassian.net/browse/KAN-10) | To Do | Retained open: child acceptance remains unresolved for KAN-55. A completed implementation slice does not complete the epic. |
| [KAN-11](https://genius-mind.atlassian.net/browse/KAN-11) | To Do | Retained open: child acceptance remains unresolved for KAN-58. A completed implementation slice does not complete the epic. |
| [KAN-12](https://genius-mind.atlassian.net/browse/KAN-12) | To Do | Retained open: child acceptance remains unresolved for KAN-61. A completed implementation slice does not complete the epic. |
| [KAN-13](https://genius-mind.atlassian.net/browse/KAN-13) | To Do | Retained open: child acceptance remains unresolved for KAN-65, KAN-67. A completed implementation slice does not complete the epic. |
| [KAN-14](https://genius-mind.atlassian.net/browse/KAN-14) | To Do | Retained open: child acceptance remains unresolved for KAN-68, KAN-69, KAN-70. A completed implementation slice does not complete the epic. |
| [KAN-15](https://genius-mind.atlassian.net/browse/KAN-15) | To Do | Retained open: child acceptance remains unresolved for KAN-72, KAN-73. A completed implementation slice does not complete the epic. |
| [KAN-16](https://genius-mind.atlassian.net/browse/KAN-16) | To Do | Retained open: child acceptance remains unresolved for KAN-75, KAN-76, KAN-78. A completed implementation slice does not complete the epic. |
| [KAN-17](https://genius-mind.atlassian.net/browse/KAN-17) | Done | Monorepo packages and CI build/test pipeline exist; today's CI run passed lint, typecheck, tests and build. Local shared/web/API checks passed; full local emulator run could not start without Java. |
| [KAN-18](https://genius-mind.atlassian.net/browse/KAN-18) | To Do | Partial infrastructure: TASKS documents unapplied Terraform/import reconciliation, shared environment datasets and missing Redis/Pub/Sub/scheduling. Preprod Marketing tiles fail because growthos_core.fact_ad_spend is absent. |
| [KAN-19](https://genius-mind.atlassian.net/browse/KAN-19) | To Do | CI exists and is green, but no evidence that every PR receives a deployed preview URL or that staging auto-deployment meets the full issue requirement. |
| [KAN-20](https://genius-mind.atlassian.net/browse/KAN-20) | To Do | Instrumentation exists, but no observed thrown error in a configured Sentry project with a trace ID; the operational acceptance criterion remains unverified. |
| [KAN-21](https://genius-mind.atlassian.net/browse/KAN-21) | Done | Preprod Google sign-in reached the authenticated dashboard; CI auth.spec.ts passed signup, login, logout, forged-cookie rejection and session redirects. |
| [KAN-22](https://genius-mind.atlassian.net/browse/KAN-22) | Done | CI models.emulator.test.ts passed model CRUD, multi-organization memberships and binding cascade coverage. Models use @arbel/firebase-orm. |
| [KAN-23](https://genius-mind.atlassian.net/browse/KAN-23) | Done | Local policy matrix passed in the 981-test shared suite; permission guard and HTTP unauthorized-request tests passed in the 25-test API run. |
| [KAN-24](https://genius-mind.atlassian.net/browse/KAN-24) | Done | Explicit permission/public annotations and guard enforcement are implemented; current permission-guard HTTP tests and route inventory checks passed; CI lint passed. |
| [KAN-25](https://genius-mind.atlassian.net/browse/KAN-25) | Done | Preprod displays three memberships, project navigation and environment controls; CI orgs.spec.ts passed context switching, invitations and project/environment switching. |
| [KAN-26](https://genius-mind.atlassian.net/browse/KAN-26) | To Do | Existing isolation suites cover many routes, but full required dual-membership org and sibling-project isolation across list/get/search/metrics/export was not established. Local page fallback redirects and expanded route surface require a dedicated boundary audit. |
| [KAN-27](https://genius-mind.atlassian.net/browse/KAN-27) | Done | Preprod Resource Library exposes credentials/templates/people and attachment management. CI resource-library service tests and browser lifecycle test passed, including two-project account slices and immediate detach revocation. |
| [KAN-28](https://genius-mind.atlassian.net/browse/KAN-28) | Done | CI key service tests passed scoped authentication, hash-only storage and immediate revocation; current API key UI is present. |
| [KAN-29](https://genius-mind.atlassian.net/browse/KAN-29) | To Do | Envelope encryption/rotation are implemented and tested, but source still uses LocalKmsProvider as a stand-in for real Cloud KMS; full vault requirement is not deployed. |
| [KAN-30](https://genius-mind.atlassian.net/browse/KAN-30) | Done | Preprod key management form exposes environment/scope selection. CI keys.spec.ts passed mint/copy-once/revoke and audit wiring tests passed. No real new credential was created during this audit. |
| [KAN-31](https://genius-mind.atlassian.net/browse/KAN-31) | Done | Preprod schema registry exposes versions, field types, PII and identity flags. CI schema-registry browser/service tests passed v1/v2 evolution and breaking-change rejection. |
| [KAN-32](https://genius-mind.atlassian.net/browse/KAN-32) | To Do | Batch ingest implementation/tests exist; no sustained 1,000 events/sec staging load-test evidence was found. |
| [KAN-33](https://genius-mind.atlassian.net/browse/KAN-33) | To Do | Historical notes describe BigQuery dual-write, but required Pub/Sub pipeline and fresh event-to-BigQuery-under-60s proof were not verified in this deployment. |
| [KAN-34](https://genius-mind.atlassian.net/browse/KAN-34) | To Do | Quarantine/replay tests pass, but rate limiting is explicitly in-process; requested Redis-backed distributed limiting remains unimplemented. |
| [KAN-35](https://genius-mind.atlassian.net/browse/KAN-35) | Done | Preprod ingest-health shows truthful empty batches, quarantine, failed deliveries and freshness sections. CI ingest-health browser tests passed populated broken-batch diagnosis and empty-state behavior. |
| [KAN-36](https://genius-mind.atlassian.net/browse/KAN-36) | To Do | Preprod exposes a manual Check now. No scheduled detection proving an alert within one hour without manual intervention was verified. |
| [KAN-37](https://genius-mind.atlassian.net/browse/KAN-37) | Done | Today's CI dbt build completed all 250 seed/model/test operations successfully against the fixture dataset; dbt models and CI integration are present. This does not prove full production warehouse provisioning. |
| [KAN-38](https://genius-mind.atlassian.net/browse/KAN-38) | To Do | Preprod reports no orchestration runs. Source/task notes describe manual local dbt execution, not verified scheduled runs and failed-run alerts. |
| [KAN-39](https://genius-mind.atlassian.net/browse/KAN-39) | Done | Preprod cost page shows real query attempts and timestamped per-query estimated costs. CI quota/cost service tests and cost-guardrails browser test passed. |
| [KAN-40](https://genius-mind.atlassian.net/browse/KAN-40) | Done | Preprod metric catalog exposes aggregation/formula definitions and evolve controls. CI browser test passed register/evolve and invalid formula rejection; current parsing/component tests passed. |
| [KAN-41](https://genius-mind.atlassian.net/browse/KAN-41) | Done | Current shared tests passed all compiler tests, including 14 golden SQL fixtures (exceeding the requested 10), comparison periods, dimensions, formulas and tenant predicates. |
| [KAN-42](https://genius-mind.atlassian.net/browse/KAN-42) | To Do | Query API/cache code exists, but cache is in-memory rather than Redis and no requested p95 benchmark on one million rows was verified. |
| [KAN-43](https://genius-mind.atlassian.net/browse/KAN-43) | In Progress | External Google/Meta application submission with demo assets and weekly tracking remains unverified. Existing In Progress status retained. |
| [KAN-44](https://genius-mind.atlassian.net/browse/KAN-44) | To Do | Preprod org audit-log explicitly reports Integrity check failed at entry Mis4vPYNrMEfDtoe6Ve6. Service tests pass, but the deployed integrity warning needs investigation before closure; it is not proof of actual tampering. |
| [KAN-45](https://genius-mind.atlassian.net/browse/KAN-45) | To Do | Language switch successfully changed to /he, lang=he and dir=rtl, but current code contains hard-coded English/Hebrew strings outside translation files, violating the zero-hard-coded-strings criterion. |
| [KAN-46](https://genius-mind.atlassian.net/browse/KAN-46) | Done | Preprod registry and installed metric-pack lifecycle controls exist. CI manifest/registry tests and browser install/disable/enable/uninstall test passed. |
| [KAN-47](https://genius-mind.atlassian.net/browse/KAN-47) | To Do | Incremental source-runtime tests pass, but source/task notes still describe manual Run now rather than required scheduled runtime; no restart/scheduling deployment proof. |
| [KAN-48](https://genius-mind.atlassian.net/browse/KAN-48) | Done | Preprod exposes the plugin gallery and installation controls. CI plugins.spec.ts passed typed configuration, scope consent and displayed run health. |
| [KAN-49](https://genius-mind.atlassian.net/browse/KAN-49) | To Do | Stripe code exists, but preprod shows Stripe missing and zero active streams; no MRR/collections comparison within 1% of a real test account. |
| [KAN-50](https://genius-mind.atlassian.net/browse/KAN-50) | To Do | Google Ads connection is missing; no approved access and no 1% spend reconciliation against Ads UI were verified. |
| [KAN-51](https://genius-mind.atlassian.net/browse/KAN-51) | To Do | Meta connection is missing; no approved access and no 1% reconciliation against Ads Manager were verified. |
| [KAN-52](https://genius-mind.atlassian.net/browse/KAN-52) | To Do | GA4 implementation exists but sessions/day reconciliation against a GA4 property was not verified; raw click-id capture is also documented as deferred. |
| [KAN-53](https://genius-mind.atlassian.net/browse/KAN-53) | Done | Preprod hook endpoint configuration and review queue exist. CI hooks.spec.ts created an endpoint and verified a posted payload appears in the queue; service/signature tests passed. |
| [KAN-54](https://genius-mind.atlassian.net/browse/KAN-54) | Done | Preprod field-mapping editor exposes rename/cast/template/static rules. Current mapping engine tests and CI field-mapping service tests passed the Shopify mapping and apply-to-delivery path. |
| [KAN-55](https://genius-mind.atlassian.net/browse/KAN-55) | To Do | Mapping suggestions use a deterministic heuristic, not an LLM. No measured three-field mapping usability result under two minutes. |
| [KAN-56](https://genius-mind.atlassian.net/browse/KAN-56) | Done | CI dbt synthetic identity fixtures passed anonymous-to-signup-to-purchase stitching and conflict resolution. This closes the fixture-based engine criterion, not live connector setup. |
| [KAN-57](https://genius-mind.atlassian.net/browse/KAN-57) | Done | CI touchpoint-capture emulator tests passed GCLID capture and conversion linking; tracking SDK tests passed. Preprod schema/keys pages expose setup and embedding surfaces. |
| [KAN-58](https://genius-mind.atlassian.net/browse/KAN-58) | To Do | First/last-touch dbt models have passing fixtures, but preprod attribution surface shows illustrative totals with missing integrations; correct channel CAC plus labeled API results was not established. |
| [KAN-59](https://genius-mind.atlassian.net/browse/KAN-59) | Done | Preprod installed SaaS metric pack registered the metric catalog; CI per-metric definition tests passed. Live population is separately blocked under KAN-61 by missing source/mart setup. |
| [KAN-60](https://genius-mind.atlassian.net/browse/KAN-60) | Done | Preprod Marketing board persists six tiles and exposes editor, metric picker, sizing, comparison and filters. CI boards.spec.ts passed adding/editing/removing tiles and reload persistence. Missing query data is tracked separately. |
| [KAN-61](https://genius-mind.atlassian.net/browse/KAN-61) | To Do | Default boards exist, but Marketing has five failed tiles due to missing growthos_core.fact_ad_spend and one no-data tile. Populated boards after source sync is not satisfied. |
| [KAN-62](https://genius-mind.atlassian.net/browse/KAN-62) | Done | CI cohort dbt fixture checks passed; current cohort/heatmap component tests passed. Preprod actual cohort panel handles no-data correctly; the decorative acquisition summary is not used as numerical evidence. |
| [KAN-63](https://genius-mind.atlassian.net/browse/KAN-63) | Done | CI engagement-pack registration and dbt L28 histogram fixture checks passed; current histogram components passed. Preprod offers the Engagement Pack and histogram tile type. |
| [KAN-64](https://genius-mind.atlassian.net/browse/KAN-64) | Done | CI goal CRUD/progress tests passed; current goal-progress tests passed minimize-goal green/red and pace/rhythm behavior and UI component tests passed. Preprod goals management is available, with owner prerequisite. |
| [KAN-65](https://genius-mind.atlassian.net/browse/KAN-65) | To Do | Win engine and feed UI exist, but no timed deployed purchase-to-feed test under five seconds or requested real Pub/Sub/WebSocket path was verified. |
| [KAN-66](https://genius-mind.atlassian.net/browse/KAN-66) | Done | CI win-rule tests passed reactivation and trial-conversion event types; current trial widget/chime tests passed. Preprod win-rules page exposes the trial pipeline and win feed. |
| [KAN-67](https://genius-mind.atlassian.net/browse/KAN-67) | To Do | TV pairing/settings exist, but the required 24-hour leak/crash soak test was not performed or evidenced. |
| [KAN-68](https://genius-mind.atlassian.net/browse/KAN-68) | To Do | Wizard/readiness UI exists; project is 0/4 ready and boards are not populated. No measured new-tenant-to-populated-board result under 30 minutes. |
| [KAN-69](https://genius-mind.atlassian.net/browse/KAN-69) | To Do | Individual board errors/empty states render, but overview still displays hard-coded healthy 3/3 pipelines and 99.98% uptime with zero real active streams; connector-kill-to-stale behavior not verified. |
| [KAN-70](https://genius-mind.atlassian.net/browse/KAN-70) | To Do | Product analytics implementation exists, but the selected project has no ingest batches and no verified GrowthOS design-partner activation tracking evidence was found. |
| [KAN-71](https://genius-mind.atlassian.net/browse/KAN-71) | Done | CI automation.emulator.test.ts passed simulated guardrails and rollback (the explicit acceptance criterion). Preprod exposes automation administration; real ad-account execution is not claimed. |
| [KAN-72](https://genius-mind.atlassian.net/browse/KAN-72) | To Do | Google Manage code and fake-client tests exist; no real test-account paused-create/approve/activate/rollback E2E evidence. No ad changes were attempted. |
| [KAN-73](https://genius-mind.atlassian.net/browse/KAN-73) | To Do | Meta Manage/audience code and fake-client tests exist; no real test-account segment-to-Custom-Audience E2E with reported match rate. No audience data was uploaded. |
| [KAN-74](https://genius-mind.atlassian.net/browse/KAN-74) | Done | CI resource-library/automation tests passed write-tier downgrade revocation and before/after auditing; preprod automation UI and resource surfaces are present. |
| [KAN-75](https://genius-mind.atlassian.net/browse/KAN-75) | To Do | Preprod MCP endpoint is blank, generated mcp-remote config has an empty URL, and Ping Handshake fails (body stream already read). Claude-to-web metric parity cannot be established. |
| [KAN-76](https://genius-mind.atlassian.net/browse/KAN-76) | To Do | MCP act authorization tests pass, but actual Claude-originated action/approval/guardrail flow cannot be verified with the broken preprod MCP connection. |
| [KAN-77](https://genius-mind.atlassian.net/browse/KAN-77) | Done | CI MCP cross-project/auth/audit/rate tests passed; current maintained tool inventory and per-call authorization tests passed. Operational client connectivity is separately blocked under KAN-75. |
| [KAN-78](https://genius-mind.atlassian.net/browse/KAN-78) | To Do | Documentation and headless example exist, but preprod provides an empty endpoint URL and failed handshake; the connect-in-under-10-minutes acceptance criterion is not met. |

## Saved evidence

Original generated files remain at the repository root:

- [Original Jira issues](../../../kan-audit-issues.json)
- [Decision record](../../../kan-audit-decisions.json)
- [Inspected transitions](../../../kan-audit-transitions.json)
- [30 confirmed Done transitions](../../../kan-audit-results.json)
- [48 remaining open issues](../../../kan-audit-remaining.json)
- [Shared tests](../../../kan-audit-shared-tests.log), [web tests](../../../kan-audit-web-tests.log), [API tests](../../../kan-audit-api-tests.log)
- [Emulator startup limitation](../../../kan-audit-model-tests.log)
- [Successful CI log](../../../kan-audit-ci.log)

On 2026-09-12 a fresh read of all 78 Jira statuses found zero differences from this report. The website was not re-audited on that date.

## Jira comment follow-up

All 48 open issues received one verified comment, with no status changes. See [comment contents](comment-drafts.json) and [verified comment IDs](comment-results.json). Existing comments were checked for the audit reference before posting to avoid duplicates. Findings remain dated to the original 2026-09-10 website review.

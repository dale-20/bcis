# Remaining Work and Feature Plan

## Purpose

This plan turns the requirements audit into sequenced, reviewable work. The requirements PDF and `docs/implementation-checklist.md` remain the source for required scope; this document separates confirmed gaps, release evidence still to collect, and a proposed product differentiator.

## Current baseline

The implemented foundation and core business workflows cover API security, subscriber operations, monthly billing, payments, collection route snapshots, recorded collections, remittance and variance reconciliation, authorized batch closing, and paginated receivable aging.

The latest verification after the mascot test fix reported:

- `npm run check`: passed; typecheck and lint passed, 21 test files and 182 tests passed.
- `npm run test:integration`: last run passed; 8 files and 71 PostgreSQL tests passed. It was not rerun for this renderer/test-only fix.
- `npm run test:e2e`: passed; both built Electron workflows passed. The mascot test now uses a dynamically assigned local API port and verifies seeded API login before opening Electron.

The desktop E2E KPI assertion was updated to match the current dashboard label, `Billed · period`. Counts in `docs/acceptance-report.md` and `docs/implementation-checklist.md` still need reconciliation against current results. Re-run the gates at the beginning of later milestones and record the actual run.

## Work sequence

### 0. Establish a trustworthy baseline

**Work**

- Re-run the current checks and record exact command output, counts, and environment in the acceptance report.
- Diagnose the reproducible mascot E2E sign-in failure: verify its seeded user, API/database target, setup/teardown, and credential path. Keep the test on synthetic data.
- Re-run the focused mascot workflow and the full E2E suite after fixing the cause.
- Compare every requirement and checklist row against the current implementation; mark each as implemented, partial, unverified, or missing, with file/evidence references.

**Exit criteria**

- The mascot E2E workflow passes reliably and the complete E2E result is recorded.
- Requirement status is traceable to implementation or test evidence; checklist and acceptance report no longer disagree about status or test counts.

### 1. Close confirmed operational-table gaps

**Work**

- Build a screen-by-screen matrix for large operational lists: subscribers, invoices, receivables, collection batches, remittances, and payments.
- For each screen, verify server-side search/filter/sort, bounded pagination, loading/empty/error states, keyboard behavior, visible status text, and export where required by the PDF.
- The collection batch list is a confirmed follow-up candidate: it currently has page/page-size pagination, while search, filters, sorting, and export are absent from its API/UI. Confirm the exact requirement before implementing each item.
- Reuse existing query patterns and table components where they fit. Keep authorization and filtering on the API; do not fetch full production tables into the renderer.
- Check sticky headers, tabular financial values, responsive behavior, and accessible focus on the actual screens. The shared palette and typography already exist, so this is a screen-completeness and consistency pass rather than a new theme project.

**Exit criteria**

- The matrix has evidence for every requirement-relevant table behavior.
- Confirmed gaps are implemented through shared contract, API/domain, tests, then UI increments; server pagination and permission checks remain in force.

### 2. Complete deployment and acceptance evidence

**Work**

- Exercise three physical LAN clients against the shared API and PostgreSQL instance; record authentication, concurrent reads, and representative authorized workflows.
- Run the approved backup/restore procedure in a production-equivalent setup, including stopping and restarting the service manager and checking the restored app/API state.
- Verify a clean Windows workstation install, first launch, migrations, synthetic seed/demo setup, and upgrade path. Record any Windows Application Control restriction as a blocker with its effect and evidence.
- Verify production TLS and firewall/service configuration; keep HTTP development-only.
- Render and visually review the PDF report output, including page breaks, totals, and legibility.
- Run representative-volume query/performance checks for important lists and reports. Record dataset size and measured results; do not claim sustained throughput from pagination tests alone.

**Exit criteria**

- Each applicable acceptance item is marked passed, failed, or blocked with dated evidence and a clear environment description.
- Any unavailable physical hardware or Windows policy restriction is explicitly recorded rather than inferred as a pass.

### 3. Upgrade the operational dashboard

The dashboard already has five KPI cards, a monthly posted-collections bar chart, payment-method mix, current receivables aging, a collector performance table, and recent receipts. The largest opportunity is to turn it from a set of current totals into a role-aware work surface: explain how billing and collection move over time, and make exceptions lead directly to the right workflow. Keep the existing live PostgreSQL values as the only source; empty states must stay empty rather than inventing chart points.

**Recommended dashboard layout**

1. A heading with a period selector (`30 days`, `90 days`, `6 months`, `12 months`, and `year to date`) and an “as of” date in the Manila business timezone.
2. A responsive KPI row for billed, collected, outstanding, overdue, and active subscribers. Keep all five visible as a coherent row on wide screens and wrap deliberately at smaller widths; the current four-column grid can leave the fifth card orphaned.
3. A primary **Billing vs. collections trend** chart, with monthly billed invoices and posted collections as distinct series. Add a table or accessible text equivalent with the exact values. Billed invoices use their invoice business date; collections use their payment business date. Do not label the difference as a collection rate or treat same-month billing and payment as matching cohorts: a payment may settle an older invoice.
4. A compact **Payment method mix** panel for the selected range (retain the existing useful summary), with counts, exact centavo totals, and an explicit empty state.
5. An **Attention queue** for actionable exceptions: overdue accounts ordered by oldest due date and balance, unresolved collection remittance variance, and pending GCash proofs where the signed-in role has verification permission. Each row/card should link to its existing detail workflow. Do not reveal subscriber-level data to roles that lack the corresponding receivables, collection, or GCash permission.
6. A **Collector results** comparison showing assigned versus collected route accounts and a separate signed shortage/overage amount. Keep the exact variance table available for keyboard and screen-reader users; never hide or normalize away a shortage.
7. The existing aging distribution and recent receipt list lower on the page, with links to their full receivables/payment screens.

**Graph and component proposals**

| Priority | Graph or component | Why it improves the current dashboard | Data and access requirements |
| --- | --- | --- | --- |
| P0 | Monthly billed-versus-collected grouped bar or line chart | Shows whether invoicing and incoming cash are moving together across periods; replaces the current one-series collection-only view. | Add monthly finalized invoice totals to the dashboard contract/query. Exclude draft/void invoices and non-posted payments. Keep exact integer-centavo values in the response and labels. |
| P0 | Period selector and intentional five-card KPI layout | Makes trend comparisons useful beyond the hard-coded YTD range and fixes the fifth KPI wrapping awkwardly. | Validate bounded date ranges on the API; calculate calendar dates using Manila business-date semantics, not mixed local/UTC `Date` methods. |
| P1 | Overdue follow-up queue | Converts overdue totals into prioritized work with oldest due date, age, balance, and a direct receivable-detail link. | Reuse a bounded, server-paginated query; require `receivables.view`. A dashboard preview can show only a small first page and link to the full list. |
| P1 | Remittance exception queue | Surfaces unresolved or non-zero batch differences before they are forgotten. Keep short and over separately represented. | Derive from collection batches/remittance state; require `collection.view` or `collection.reconcile` according to fields shown. Closing still follows `collection.close` on the API. |
| P1 | Pending GCash verification count/queue shortcut | Makes unverified proof actionable and reinforces that uploaded proof is not a posted payment. | Show queue details only with `payment.verify_gcash`; never count pending proof as collection or billed/collected cash. |
| P2 | Collector completion comparison | Makes route coverage easier to scan than a table alone while preserving per-collector amount and signed variance. | Current dashboard query already supplies assigned/collected counts, posted amount, and variance. Keep the table as the accessible exact-value view. |
| Later | Historical AR aging trend or subscriber growth | Could reveal whether exposure or active service base is improving over time. | Do not draw a trend from today’s aging or current subscriber status. First add reliable dated snapshots/status events, retention rules, and reconciliation tests. |

**Delivery increments**

1. **Dashboard data contract and date behavior:** add date-range presets, bounded server validation, Manila date handling, and monthly billing series. Test month boundaries, empty periods, void/draft exclusion, posted-payment inclusion, and totals against the existing billing-versus-collection report on real PostgreSQL.
2. **Finance trend and layout:** implement the grouped series, value labels/table equivalent, responsive KPI layout, loading/refresh/error/empty states, and accessible chart descriptions. Verify centavo conservation and that no floating-point arithmetic is used for financial totals.
3. **Permission-aware attention queues:** add small server-side preview queries and links for overdue receivables, remittance exceptions, and pending GCash verification. Add Fastify authorization tests for Cashier, Collection Supervisor, Viewer, and Auditor according to `docs/permission-matrix.md`; UI visibility alone is not authorization.
4. **Collector comparison and final polish:** make the signed variance visually distinct, retain an accessible table, check keyboard navigation, contrast, narrow-window behavior, and exact period labels. Validate the main desktop workflow against seeded synthetic data and include zero-data states.

**Exit criteria**

- Every chart is derived from named authoritative API fields and reconciles to an existing report or source query; no synthetic display values are introduced.
- The dashboard supports its selected range consistently in KPI summaries and time-series data, and business dates match Manila calendar dates.
- Each queue is bounded, permission-aware, and navigates to the existing authoritative workflow; pending GCash evidence is never presented as verified revenue.
- Financial values remain exact centavos, shortages and overages remain signed and visible, and chart information has an accessible textual equivalent.
- `npm run check`, relevant PostgreSQL integration tests, production build, and the applicable Electron E2E pass before calling the increment complete.

### 4. Prepare the demonstration and defense

**Work**

- Create the D8 presentation and rehearse a complete synthetic-data demonstration.
- Demonstrate the subscriber-to-invoice-to-payment path, oldest-unpaid allocation, collection route and batch close, remittance variance, permissions, reversals/audit history, and backup/restore.
- Prepare concise explanations of concurrency/integrity controls, deployment assumptions, limitations, and the acceptance evidence.

**Exit criteria**

- Presentation and operator walkthrough are complete and match the current tested product behavior.
- Demo data contains no real customer information or credentials.

### 5. Add the differentiating feature: collection outcomes and follow-up queue

**Why this feature**

Collection staff can capture what happened at a visit, while supervisors get a prioritized view of promised payments and unresolved callbacks. It makes the system feel purpose-built for field collection operations, builds on the existing route/batch and receivables workflows, and does not require a new payment provider or messaging service.

**Initial scope**

- Capture a visit outcome such as `PROMISED_TO_PAY`, `NO_ANSWER`, `ADDRESS_ISSUE`, `DISPUTE`, or `CALLBACK_REQUESTED`.
- Allow an optional follow-up business date and short note where appropriate.
- Provide a supervisor queue for due and overdue follow-ups, filterable by route/collector and status.
- Show the outcome history in the relevant subscriber/collection context.
- Keep payment posting in the existing cashier/receipt workflow. The feature records follow-up intent only; it does not promise or post money and does not require SMS/email integration in its first release.

**Implementation increments**

1. **Contract and policy:** define shared Zod request/response schemas, outcome/status types, date semantics, allowed transitions, and permission requirements. Confirm whether existing collection permissions cover capture and supervisor review or a distinct permission is needed.
2. **Persistence:** add a reviewed Drizzle migration for visit outcomes and follow-ups linked to the relevant subscriber and, where applicable, collection batch/account. Preserve who recorded each event and when. Keep follow-up records auditable; do not edit financial history.
3. **Domain/API:** implement repository and service operations, server-side authorization, validation, due/overdue queries, and stable paginated filtering. Use Manila business dates for due-date boundaries and define that behavior in tests.
4. **Verification:** add PostgreSQL integration coverage for constraints, permissions, valid/invalid transitions, date boundaries, and history preservation. Exercise migration from an empty database and the supported prior schema.
5. **Desktop:** add a quick outcome capture flow from the relevant collection/route context, a supervisor follow-up queue, and subscriber history. Use the typed preload/service boundary and provide loading, empty, error, keyboard, and busy states.
6. **Acceptance:** add E2E coverage for recording an outcome, seeing it in the correct queue, completing/canceling a follow-up, and confirming the audit/history remains visible. Run `npm run check`, `npm run test:integration`, production build, and `npm run test:e2e`; report exact results.

**Exit criteria**

- A collector can record an outcome without creating a financial posting.
- An authorized supervisor can find due/overdue follow-ups and close them with history retained.
- Unauthorized users cannot capture or manage records; API validation and database constraints enforce the contract.

## Later differentiator candidate

After the follow-up workflow is stable, evaluate QR receipt verification as a separate increment. It could let a customer or staff member confirm that a receipt is genuine, but needs a clearly scoped public verification surface, privacy review, and abuse controls. Keep it out of the first feature slice so it does not delay mandatory acceptance work.

## Delivery rules

- Read `docs/requirements.pdf` and `docs/implementation-checklist.md` before changing domain behavior; verify the relevant requirement wording in the PDF while working through each gap.
- Deliver small increments in the order shared contract, migration/domain/API, tests, then UI.
- Use synthetic data only. Keep secrets, local databases, backups, and generated test output out of commits.
- Before each milestone commit, run the required quality gates from `AGENTS.md`, including relevant PostgreSQL and Electron checks. Fix failures or record the precise blocker; do not mark a failed gate passed.
- Commit only the completed, verified increment with a focused message. Do not amend or discard existing user changes.

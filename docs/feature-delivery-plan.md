# BCIS mandatory feature delivery plan

This plan turns `requirements.pdf` into reviewable feature increments. It reflects the repository state on 2026-10-10. The server already contains much of the financial domain, but the desktop exposes only authentication, dashboard, subscribers, reports, service history, and connection diagnostics. A backend test or route does not make a workflow complete until the authorized user can perform it safely through the desktop application.

## Delivery rules

- Build every increment in this order: shared Zod contract, migration if required, repository/domain service, Fastify route and RBAC, integration tests, narrow Electron IPC, React workflow, Electron E2E test.
- Keep all money as integer centavos. Preserve finalized financial records and post every financial effect with its audit record in one transaction.
- Use server-side filtering, sorting, pagination, totals, and permissions. The renderer never fetches PostgreSQL or arbitrary URLs.
- Finish and verify one increment before starting the next. Run `npm run check`, relevant PostgreSQL integration tests, production build, and applicable Electron E2E tests at each gate.
- Use only synthetic data. Do not mark a requirement complete from a mock, static UI, hidden button, or untested manual assumption.

## Current baseline

### Available now

- Secure login, password change, logout, sessions, lockout, seven roles, database-backed permissions, and denied-action audit.
- Subscriber list, search, create, profile, multiple addresses/services, plans, areas, collectors, and synthetic seed data.
- Server domain and tests for monthly billing, immutable invoices, ledger entries, payments, oldest-first allocation, credit, GCash verification, reversals, collection batches, remittance differences, aging, dashboards, reports, and backup restoration.
- Desktop screens for dashboard, subscribers/profile, reports/exports, service history, and connection status.
- Windows build/release configuration and acceptance documentation.

### Main gaps

- Most operational server workflows have no desktop screen or typed preload method.
- Subscriber, plan, service, collector, and area maintenance lacks complete edit/archive/status workflows.
- Billing lacks list/detail/preview/void-adjustment desktop workflows and several supporting queries.
- Payments lack history, allocation preview, receipt preview/printing, GCash queue, reversal review, and proof-file storage UI.
- Collections lack batch lists, route-sheet printing, recording, remittance, reconciliation, and closing UI.
- Suspension/reconnection, user administration, audit viewer, settings, and guided backup/restore are incomplete.
- Physical three-PC, maximum-volume, and full desktop acceptance evidence remains incomplete.

## Increment 1 - Application shell and permission-aware navigation

**Goal:** Make every required module discoverable while exposing only actions the signed-in user may use.

- Add routed navigation for Dashboard, Subscribers, Billing, Payments, Collections, Receivables, Services, Reports, and Administration.
- Add required subnavigation and active-page state.
- Filter navigation and actions from server-issued permissions; keep server authorization authoritative.
- Add shared page, table, form, status, money, confirmation, loading, empty, and error components.
- Add session lock, automatic expired-session handling, and accessible keyboard/focus behavior.
- Preserve the professional navy/blue design, compact density, tabular money, and text-plus-color statuses.

**Gate:** Each demo role sees the correct modules; direct unauthorized API calls still return 403 and create audit evidence.

## Increment 2 - Subscriber, plan, and service maintenance

**Goal:** Complete the master data required by billing and collections.

- Add subscriber edit, archive/reactivate, status, notes, contacts, and address maintenance.
- Add service-account create/edit/status workflows, plan change for future billing, address assignment, billing/due day, current rate, area, and collector assignment.
- Add plan list/create/edit/activate/deactivate with Internet speed, Cable channel count, Combo attributes, price, fees, and description.
- Add collector and collection-area list/create/edit/activate/deactivate.
- Expand global search to invoice number, receipt number, and GCash reference.
- Complete subscriber profile tabs: overview, services, billing, payments, ledger, collection, history, documents, and audit.
- Preserve all history through statuses and dated assignment/service events; never delete historical subscribers or services.

**Gate:** Admin can maintain master data; Cashier can search/view but receives 403 for mutations; plan-rate changes do not alter finalized invoices.

## Increment 3 - Billing, invoices, adjustments, and ledger

**Goal:** Let Admin run and inspect monthly billing without using API tools.

- Add billing-cycle list, preview, generation progress/result, duplicate-run explanation, and cycle detail.
- Add server-paginated invoice list with period, status, subscriber, service, due date, and amount filters.
- Add invoice detail with immutable line items and ledger links.
- Add overdue-state processing.
- Add controlled debit/credit adjustment and invoice void workflows with reason, permission, and audit.
- Support subscription, installation, reconnection, discount, penalty, and adjustment line types.
- Add subscriber ledger with date range, reproducible running balance, and Statement of Account print/export.

**Gate:** Invoice creation, due dates, immutable values, ledger balance, rollback, and duplicate billing pass; AT-11 remains green; Admin and Owner can generate while Cashier cannot.

## Increment 4 - Cashier payments, receipts, and customer credit

**Goal:** Deliver the fast cashier workflow required by the laboratory.

- Build Receive Payment as search -> balance -> amount/method -> allocation preview -> confirmation -> atomic post -> receipt.
- Support Cash, GCash, Bank Transfer, Cheque, and Other with method-specific validation.
- Show oldest-first allocations, partial balances, and resulting unapplied customer credit before posting.
- Add payment history and detail with actor, timestamps, reference, notes, allocations, credit, and status.
- Add unique receipt preview/print layout; retain voided receipts and never reuse numbers.
- Add permission-controlled reversal/receipt-void workflow requiring reason and showing balance impact.
- Use idempotency keys and disable repeat submission while the server result is pending.

**Gate:** Desktop and PostgreSQL tests prove AT-01, AT-02, AT-03, AT-04, and AT-06. Every centavo is conserved and receipts are unique.

## Increment 5 - GCash proof and verification

**Goal:** Separate evidence capture from authorized posting.

- Build a two-pane pending queue with transaction details and proof preview.
- Add safe proof upload storage with MIME allow-list, size limit, generated storage key, SHA-256, restricted retrieval, and attachment backup inclusion.
- Normalize and check GCash references before submission; show a controlled duplicate conflict.
- Add verify/reject controls with reason, verifier identity, timestamp, and audit history.
- Post and allocate only after verification; an uploaded image never changes a balance by itself.

**Gate:** AT-05 passes through API and desktop; rejected/unverified proofs create no invoice allocation or receipt.

## Increment 6 - Collector routes, batches, and remittance

**Goal:** Complete the Collection Supervisor workspace.

- Add collector/area assignment management with effective dates.
- Add collection-batch list, create flow, detail, and lifecycle status.
- Generate printable route sheets with subscriber, account, address, current bill, arrears, and total due.
- Add per-account collection recording linked to posted payments.
- Add submission summary for expected receivable, Cash, non-cash, and uncollected amounts.
- Add remittance and reconciliation screens showing expected Cash, remitted Cash, difference, collected accounts, and exceptions.
- Require explicit authorized acknowledgement to close a nonzero variance.
- Add collector assignment, remittance, shortage/overage, and performance reports.

**Gate:** AT-07 and AT-08 pass through the real database and desktop; Cashier cannot close a batch.

## Increment 7 - Receivables, suspension, and reconnection

**Goal:** Turn aging data into controlled service operations.

- Add Outstanding, Overdue, Aging, and Suspension Candidates screens.
- Show subscriber, service, area, collector, months unpaid, oldest invoice, last payment, and total arrears.
- Add server filters for collector, area, plan, service type, and delinquency age; reconcile totals to invoice balances.
- Add configurable grace period, suspension threshold, and reconnection fee settings.
- Add suspension approval with reason, effective date, approver, and notes.
- Create reconnection requests after qualifying payments, assign a technician, and record request/completion dates and fees.
- Preserve every service-state transition in service history.
- Give Technicians only assigned service/reconnection operations allowed by `service.status.update`.

**Gate:** Aging boundaries and totals pass; two synthetic suspension/reconnection scenarios work end to end; financial actions remain unavailable to Technicians.

## Increment 8 - Administration, audit, settings, and recovery

**Goal:** Complete Owner/Admin control and auditability.

- Add user list/create/edit, role assignment, activate/deactivate, password reset, and forced password-change controls.
- Add read-only audit search by actor, action, entity, date, and request ID with before/after detail.
- Add application settings UI for billing, due dates, grace periods, suspension, numbering display, and company/report information.
- Add backup history, guided backup creation, verification status, checksum, and downloadable evidence.
- Keep restore Owner-only with explicit approval, maintenance-mode checks, test restore/integrity verification, and clear destructive-impact warning.
- Add user activity, adjustment, reversal, and voided-receipt reports.

**Gate:** AT-10 and AT-12 pass. Admin can manage users/create backups but cannot view audit or restore; Owner can perform all authorized recovery actions.

## Increment 9 - Reporting, printing, and dashboard completion

**Goal:** Finish all required management outputs using authoritative server data.

- Complete dashboard KPIs: billing versus collection, payment mix, aging, collector performance, overdue alerts, and recent payments.
- Add daily, weekly, monthly, and annual collection reports.
- Add revenue by plan, service, and area; outstanding balances; overdue; AR aging; subscriber master list; ledger/SOA; remittance/performance; reversals/voids; and user activity/audit reports.
- Use server-side report filters and exact centavo totals.
- Export applicable reports to PDF and XLSX and add navigation-free accessible print layouts.
- Verify exported totals against source queries and preserve filter/date metadata in every output.

**Gate:** At least six required reports have checked PDF/XLSX samples; printed and exported totals equal API/database totals.

## Increment 10 - Acceptance, scale, deployment, and submission

**Goal:** Prove the whole system rather than only individual modules.

- Expand the synthetic seed to three billing months, mixed payment cases, 10+ overdue accounts across aging buckets, a reversal/void, and two suspension/reconnection cases.
- Automate AT-01 through AT-12 and add Electron E2E coverage for the required live-demo sequence.
- Test three simultaneous sessions and physical LAN clients; verify unique numbering, authorization isolation, and connection recovery.
- Load-test representative queries toward 20,000 subscribers, 500,000 invoices, 500,000 payments, and 1,000,000 ledger entries; inspect query plans and add measured indexes.
- Run security checks for Electron boundaries, input validation, upload paths, log redaction, session handling, dependency risk, and HTTPS deployment.
- Build and smoke-test the Windows installer on a clean workstation.
- Update the technical documentation, ERD/data dictionary, API/IPC design, user manual, setup/deployment/backup guide, acceptance report, defect log, screenshots, report samples, and demo script.
- Clearly label passed, failed, and untested requirements. Do not count API-only workflows as completed desktop requirements.

**Gate:** AT-01 through AT-12 pass with retained evidence; clean install, migration, seed, launch, backup/restore, and demo rehearsal succeed.

## Role completion map

| Role | Desktop outcome required |
| --- | --- |
| Owner / Super Admin | Full dashboard, approvals, configuration, users, audit, reports, backup and Owner-only restore |
| Administrator | Subscriber/plan/service maintenance, billing, payments/reversals, collections, operational reports, users, settings, backup creation |
| Cashier | Subscriber lookup, balances, payment allocation/posting, receipts, approved GCash workflow, payment history |
| Collection Supervisor | Areas/routes, collectors, batches, route sheets, collection recording, remittance, reconciliation, authorized close, performance |
| Accounting / Auditor | Receivables, ledgers/SOA, reports/exports, adjustment/reversal review, audit trail without operational mutation |
| Technician | Assigned service, suspension, and reconnection information plus explicitly permitted completion updates only |
| Read-only Viewer | Dashboard and reports with no mutation or export permission unless separately granted |

## Recommended execution order

Implement increments 1-10 in order. Increments 3-6 are the highest business risk because they expose existing financial rules through real user workflows. Do not spend time on optional mobile, portal, SMS, GIS, inventory, prediction, or decorative UI features until all ten gates pass.

# Laboratory implementation checklist

Source: supplied `requirements.pdf`, sections 1–16 (18 PDF pages; printed numbering 1–17). Read in full, including mandatory acceptance tests and final submission criteria. Checked items have automated evidence; unchecked items remain deferred.

## Milestone 1 — Analysis and foundation (PDF §§2, 6 Phase 1)

- [x] Analyze the supplied PDF and record mandatory requirements and acceptance criteria.
- [x] Establish `apps/desktop`, `apps/api`, `packages/shared` and strict TypeScript.
- [x] Record architecture, domain invariants, workflow rules, and scope in `AGENTS.md`/`CLAUDE.md`.
- [x] Configure Electron/electron-vite, React, Tailwind, shadcn/ui, TanStack Query; reserve Table for operational data.
- [x] Configure Fastify, Pino logging, Zod contracts, PostgreSQL/Drizzle, generated migrations, and environment examples.
- [x] Implement API liveness and real database/schema readiness endpoints.
- [x] Implement a secure Electron window, narrow typed preload, and real API connection indicator.
- [x] Configure Vitest unit/API/component tests, real PostgreSQL integration tests, and Playwright Electron tests.
- [x] Provide setup/start/build/migration scripts and local/LAN setup instructions.
- [x] Verify typecheck, lint, unit/API tests, clean/repeat migrations, PostgreSQL integration, and Electron smoke tests; record results.
- [x] Commit verified Milestone 1 with meaningful history (`b36cdab`; later security and subscriber increments retain the same gates).

## Milestone 2 — Authentication and authorization (PDF §§3.1, 4.4, 5)

- [x] Users, roles, permissions, role_permissions, user_roles; secure password hashing, active/inactive accounts.
- [x] Login, logout, safe hashed session storage, idle/absolute expiry, failed-login lockout, password replacement, protected API routes.
- [x] Server-side granular permissions: subscriber.view, billing.generate, payment.create/reverse, collection.reconcile, report.export, user.manage, backup.restore.
- [x] Roles: owner/super admin (full), administrator (operational/user management), cashier (search/receive/approved GCash), collection supervisor (routes/batches/remittance), accounting/auditor (reports/audit), technician (service operations only), viewer (read-only dashboard/reports).
- [x] Seven synthetic demo identities, documented role matrix, direct API authorization tests proving Cashier denial (AT-10 security portion); hiding buttons is never authorization.

## Milestone 3 — Core operational data (PDF §§3.2–3.3, 5)

- [x] Subscribers: identity, unique account number, contacts, addresses, billing/due day, status, and notes support create/list/detail/edit plus guarded archive/reactivate; service area and collector remain attached through service accounts.
- [x] One subscriber may own multiple services and addresses. Unique service numbers and foreign keys for owned records.
- [x] Internet/Cable/Combo plans: code/name/price/fees/description/active status; speed/channel attributes where applicable.
- [x] Service accounts: plan, installation address, activation/billing start dates, billing/due day, current rate/status/collector.
- [x] Persist the service account's current rate when created and retain initial service history; finalized invoice rate preservation remains a billing milestone.
- [x] Global search: subscriber name/account/contact/address/service number plus invoice, receipt, and GCash reference lookup.
- [x] Permission-aware profile tabs: overview, services, billing, payments, ledger, collection, history, documents, audit.

## Milestone 4 — Billing and ledger (PDF §§3.4–3.5, 5)

- [x] Calendar-month billing cycles and subscription invoices generated for active service accounts.
- [x] DRAFT, UNPAID, PARTIALLY_PAID, PAID, OVERDUE, VOID, CREDITED states and payment/overdue/void transition workflows.
- [x] Exact subscription line items plus installation/reconnection, discount, penalty, and signed adjustment postings.
- [x] Database-sequenced unique invoice numbers and concurrent service/period duplicate protection (AT-11).
- [x] Finalized invoice values and items are database-immutable; reasoned adjustments and untouched-invoice voids are audited.
- [x] Chronological debit/credit ledger has reproducible running balances and date filters; SOA supports date-range print/PDF/XLSX.
- [x] Atomic invoice/item/ledger/audit posting with real PostgreSQL rollback evidence.

## Milestone 5 — Payments and receipts (PDF §§3.6–3.7, 3.11, 4.4)

- [x] Cash, Bank Transfer, Cheque, Other: payment datetime, amount, receipt, actor, method-specific reference, and notes post through the cashier desktop workflow.
- [x] GCash proof capture and pending status use API-validated JPEG/PNG/PDF files, a 5 MB limit, generated storage keys, SHA-256 checks, uploader-bound staged records, and permission-restricted retrieval.
- [x] Oldest unpaid invoice first; explicit authorized manual allocation policy if permitted. Exact, partial, and advance payment tests (AT-01–04).
- [x] Unallocated advance value remains customer credit, never disappears; document future-credit application policy.
- [x] Unique non-reusable receipt numbers, including voids; accessible receipt print layout.
- [x] Preserve original payment and add linked reversal restoring balances, allocations/credit, and audit (AT-06).
- [x] GCash queue: proof/reference/sender/amount capture, duplicate reference control (AT-05), authorized verify/reject, verifier identity/time.
- [x] Only verified GCash can post. Uploaded screenshot alone never marks an account paid.
- [x] Validate proof file type, size, safe generated keys; restricted attachment access and 24-hour cleanup of abandoned uploads.
- [x] Include `PAYMENT_PROOF_DIR` attachments in verified archives and prove restored file hashes on a separate PostgreSQL test restore (Increment 8 / AT-12).
- [x] Owner-only recovery approval is bound to a verified archive checksum and reason; the API enforces a shared maintenance gate and drains/stops before offline restore. The operator command stages and verifies the replacement, preserves rollback database/proofs, audits recovery, and requires the exact target database name. Rehearsed end to end only against the isolated `_test` database; production service-manager restart remains operator-specific.
- [x] Cashier flow: search, balance, amount/method, allocation preview, atomic post, receipt, and GCash evidence submission held for review.
- [x] All financial posting, numbering, credit, allocations and audit commit/rollback together; concurrent retry/idempotency tests.

## Milestone 6 — Collections (PDF §3.8)

- [x] Areas/routes, effective-dated collector assignments, batches, batch accounts, remittances; printable account/address/current-bill/arrears/total route sheet.
- [x] OPEN, IN_PROGRESS, SUBMITTED, REMITTED, RECONCILED, CLOSED lifecycle.
- [x] Expected receivable, cash/non-cash collected, uncollected totals; separate cash reconciliation.
- [x] Visible expected cash, remitted cash, shortage/overage, non-cash, collected accounts and exceptions (AT-07–08).
- [x] Authorized confirmation to close; never silently treat shortage/overage as balanced.

**Increment 6 verification:** Collection Supervisor batch UI and report flows are exposed through typed, sender-validated IPC. New service assignments and collector changes persist effective dates; existing assignment rows are not fabricated or backfilled because their original effective dates and actors are not recoverable. Cashier posts the payment first; the supervisor selects an eligible same-day posted receipt for the route account.

**Increment 7 verification (2026-10-11):** `npm run check` passed (97 tests), `npm run test:integration` passed (63 PostgreSQL tests), and `npm run test:e2e` passed (1 built Electron test). The desktop E2E generated overdue invoices, changed service policy, requested and approved a suspension, settled the subscriber balance through Cash posting, assigned the new reconnection to the Technician, and completed it through the Technician session. Reconnection and payment records were verified in PostgreSQL.

**Increment 8 recovery verification (2026-10-11):** `npm run check` passed (97 tests); `npm run test:integration` passed (7 files, 69 PostgreSQL tests); `npm run test:e2e` passed (1 built Electron test). The recovery integration creates a synthetic proof backup, restores the dump and attachment into a staged database, checks SHA-256/size and database integrity, switches the isolated `_test` database, confirms gate clearance and restore audit, and removes the rollback test database. Authorization tests deny Cashier/Admin restore approval and prove Owner maintenance-gate/cancel behavior. Production service-manager restart and recovery on a production deployment remain untested.

**Increment 8 report verification (2026-10-11):** User activity, billing adjustment, payment reversal, and voided receipt reports query preserved audit/financial rows. Integration tests assert synthetic records and status/reason/amount details; user activity requires `audit.view`; PDF and XLSX exports cover the added types. Increment 9 extends this with management dashboards, collection intervals, billing/revenue reports, subscriber master data, and collector performance. Dense operational-table pagination remains separately tracked below.

**Increment 9 verification (2026-10-11):** Dashboard and report workflows include billed/collected KPIs, overdue counts, collector performance, daily/ISO-weekly/monthly/annual collections, billing comparison, revenue grouping, subscriber master list, and six sample pairs under `reports-samples/`. The PostgreSQL suite reconciles interval grouping, billing, AR aging, and statement closing balances to source queries. `npm run reports:samples` passed (8 integration tests) and checks every XLSX title/date/totals against the API plus each PDF signature/size. `npm run check` passed (106 tests); `npm run test:integration` passed (69 PostgreSQL tests); `npm run test:e2e` passed (1 built Electron test, including report selection and print-media navigation). Final PDF visual review is untested because the environment has no local PDF renderer; the sample files and review steps are documented in `reports-samples/README.md`.

## Milestone 7 — Receivables and service control (PDF §§3.9–3.10)

- [x] Current/overdue receivable, overdue subscriber count, follow-up/suspension candidates.
- [x] AR aging: Current, 1–30, 31–60, 61–90, 90+; clarify boundary so day 90 is never counted twice.
- [x] Overdue subscriber/service/area/collector, months unpaid, oldest invoice, last payment, arrears.
- [x] Filters: collector, area, plan, service type, delinquency age; aging must reconcile to outstanding balances.
- [x] Configurable grace/threshold; suspension reason/effective date/approver/notes.
- [x] Qualifying payment creates reconnection request, optional fee, technician, request/completion dates; preserve service history.

## Milestone 8 — Dashboard and reporting (PDF §§3.11, 4.1–4.3)

- [x] 4–6 compact genuine KPIs; billing vs collection, payment methods, aging, collector performance, overdue alerts, recent payments.
- [x] Required permission-aware navigation: Dashboard; Subscribers (all/new/services); Billing (current/generate/invoices); Payments (receive/history/GCash); Collections (collectors/areas/routes/batches/remittance); Receivables (outstanding/overdue/aging/suspension); Services; Reports; Administration. Operational controls remain tracked in their workflow milestones.
- [x] Daily/weekly/monthly/annual collection reports with Manila-local grouping, bounded date filters, and reconciled exact-centavo totals; PDF/XLSX export.
- [x] Cash/GCash/method summaries, billing versus collection, billed subscription totals by plan/service/current area, and AR report coverage.
- [x] Subscriber master list/ledger/SOA; collector assignment/collection/remittance/shortage-overage/performance.
- [x] Adjustment, reversal, voided-receipt, user-activity, and audit reports. At least six report types have PDF/XLSX export evidence; user activity is additionally restricted to `audit.view`.
- [x] ExcelJS/pdfmake exports from authoritative data; clean print layouts without navigation.
- [ ] Dense tables: sticky headers, search/filter/sort, server pagination or virtualization, export/status badges.
- [x] Visible form labels/required markers/grouping/inline errors; accessible GCash two-pane review.
- [ ] Navy/blue/light neutral palette, professional typography, right-aligned tabular money, text+color statuses; no fabricated dashboards/decorative counters.

## Milestone 9 — Reliability, security, deployment (PDF §§4.4–5.2, 6 Phase 9)

- [ ] Append-only audit actor/action/time/reason/old-new values; no audit editing in normal screens.
- [ ] No password/secret/payment credential logs; understandable user errors and structured diagnostics.
- [ ] Index subscriber account/name/contact, invoice date/status, payment date/reference, collector/area.
- [ ] Target 20,000 subscribers, 500,000 invoices, 500,000 payments, 1,000,000 ledger-related entries with paginated server queries.
- [ ] Database and attachment backup, backup verification/integrity check, authorized restore, backup_history (AT-12).
- [ ] LAN deployment for three real Windows clients, database kept behind API, concurrent posting and numbering verification (AT-09).
- [ ] Windows installer/release; security review before exposing any business data.

## Milestone 10 — QA and submission (PDF §§7–14, 16)

- [ ] Mandatory acceptance suite below; automated financial/API output and E2E/manual workflow evidence.
- [ ] Bug log with defect, root cause, fix and regression evidence. Screenshots/reports show expected balances.
- [x] Synthetic demo data: 7 users spanning roles; 3 Internet, 2 Cable, 2 Combo plans; 50 subscribers; 60+ services; 2 collectors; 3 areas; six closed billing months plus the current cycle; mixed payment cases; 10+ overdue accounts across all aging buckets; one reversal/void; two suspension/reconnection scenarios. PostgreSQL seed integration verifies nonzero dashboard metrics and rows for all report types.
- [x] Scale-query evidence: synthetic isolated database reached 20,000 subscribers, 500,375 invoices, 500,375 payments, and 1,000,750 ledger entries; subscriber and aging page queries passed with analyzed query plans (`tests/evidence/scale-query-benchmark.json`). Sustained/concurrent throughput remains untested.
- [ ] D1 source, meaningful Git history, environments, migrations, seeds.
- [ ] D2 run-ready desktop release and documented server/database setup.
- [ ] D3 requirements, architecture/modules, ERD/data dictionary, API/IPC, security, deployment, backup/restore documentation.
- [ ] D4 user manual for all workflows and troubleshooting.
- [ ] D5 test plan/results/acceptance/defect package; D6 sample PDF/XLSX collection, AR, SOA, remittance/performance reports.
- [ ] D7 screenshots of dashboard/profile/payment/GCash/reconciliation/aging/reports; D8 presentation and defense. Six synthetic E2E captures now cover dashboard, profile, Cash receipt, pending GCash review, aging and reports in `docs/screenshots/`; reconciled batch-detail screenshot and presentation/defense materials remain outstanding.
- [ ] Submission folders: source, database/migrations+seeds, docs, tests/screenshots, reports-samples, release, README.
- [ ] Live demo: login; subscriber/service; invoice/ledger; cash/receipt; verified GCash/duplicates; SOA; overdue; collector/remittance; reversal/audit; exports; permissions; tested restore; simultaneous clients.
- [ ] Developer can explain all code, financial rules, API boundaries, concurrency, rollback and restore. AI use does not replace accountability.

## Mandatory acceptance matrix — verified status (2026-10-11)

| ID | Scenario | Required result | Current status |
| --- | --- | --- | --- |
| AT-01 | ₱999 invoice / ₱999 payment | Zero due, PAID, balanced ledger, receipt | PASSED — real PostgreSQL integration test |
| AT-02 | ₱999 invoice / ₱500 payment | ₱499 due, PARTIALLY_PAID, correct allocation/ledger | PASSED — real PostgreSQL integration test |
| AT-03 | ₱1,000 monthly / ₱3,000 payment | Documented allocation/credit preserves all value | PASSED — real PostgreSQL integration test |
| AT-04 | August + September ₱999 each / ₱1,200 | August cleared; September ₱798 due | PASSED — real PostgreSQL integration test |
| AT-05 | Reused verified GCash reference | Blocked or controlled audited duplicate handling | PASSED — real PostgreSQL integration test |
| AT-06 | Reverse posted payment | Original retained; linked reversal; balances restored; actor/reason audit | PASSED — real PostgreSQL integration test |
| AT-07 | ₱20,000 collected/remitted | Zero difference; authorized reconcile/close | PASSED — real PostgreSQL integration test |
| AT-08 | ₱20,000 collected / ₱19,500 remitted | Visible ₱500 shortage, never silently balanced | PASSED — real PostgreSQL integration test |
| AT-09 | Two/three concurrent clients | No corruption, duplicate numbering, or cross-session authorization leak | PARTIAL — three concurrent API sessions pass; physical LAN clients untested |
| AT-10 | Cashier calls admin API directly | Server denies user/backup operation | PASSED — Fastify injection and audit assertions |
| AT-11 | Generate same service/period twice | No duplicate finalized invoices | PASSED — concurrent real PostgreSQL integration test |
| AT-12 | Backup, mutate, approved restore | Verified integrity and expected restored records | PARTIAL — isolated restore/cutover passes; production service restart untested |

`npm run check` passed (107 tests), `npm run test:integration` passed (69 PostgreSQL tests), and `npm run test:e2e` passed (1 built-Electron test) on 2026-10-11. The current E2E also posts and reverses Cash with an audit reason, generates billing from synthetic service activation through the current month, and verifies nonzero month-end UI totals in all four AR-aging buckets. The six report sample export check passed 8 integration tests. `npm run dev:desktop` launched Electron with inherited `ELECTRON_RUN_AS_NODE=1` after the new guard; the existing API returned HTTP 200. Full `npm run dev` hit the already occupied API port 3001, so the existing server was left untouched. Release and deployment limits are recorded in `docs/acceptance-report.md`. Foundation-only concurrency reads and centavo validation **do not satisfy** financial AT-01–12. Optional enhancements (mobile/offline, reminders, portal, gateway, QR/GIS, technician inventory, predictive analytics) stay out of scope until mandatory work is complete.

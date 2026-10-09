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
- [ ] Verify typecheck, lint, unit/API tests, clean/repeat migrations, PostgreSQL integration, and Electron smoke tests; record results.
- [ ] Commit verified Milestone 1 with meaningful history.

## Milestone 2 — Authentication and authorization (PDF §§3.1, 4.4, 5)

- [x] Users, roles, permissions, role_permissions, user_roles; secure password hashing, active/inactive accounts.
- [x] Login, logout, safe hashed session storage, idle/absolute expiry, failed-login lockout, password replacement, protected API routes.
- [x] Server-side granular permissions: subscriber.view, billing.generate, payment.create/reverse, collection.reconcile, report.export, user.manage, backup.restore.
- [x] Roles: owner/super admin (full), administrator (operational/user management), cashier (search/receive/approved GCash), collection supervisor (routes/batches/remittance), accounting/auditor (reports/audit), technician (service operations only), viewer (read-only dashboard/reports).
- [x] Seven synthetic demo identities, documented role matrix, direct API authorization tests proving Cashier denial (AT-10 security portion); hiding buttons is never authorization.

## Milestone 3 — Core operational data (PDF §§3.2–3.3, 5)

- [ ] Subscribers: identity, unique account number, contacts, addresses, area, collector, billing/due day, status, notes; archive instead of deleting history.
- [ ] One subscriber may own multiple services and addresses. Unique service numbers and foreign keys for owned records.
- [ ] Internet/Cable/Combo plans: code/name/price/fees/description/active status; speed/channel attributes where applicable.
- [ ] Service accounts: plan, installation address, activation/billing start dates, billing/due day, current rate/status/collector.
- [ ] Preserve historical billed rates when plans change. Retain all service state history.
- [ ] Global search by subscriber name/account/contact/address, invoice/receipt number, and GCash reference.
- [ ] Profile tabs: overview, services, billing, payments, ledger, collection, history, documents, audit.

## Milestone 4 — Billing and ledger (PDF §§3.4–3.5, 5)

- [ ] Billing cycles, invoices, items, adjustments; monthly generation by active service account.
- [ ] DRAFT, UNPAID, PARTIALLY_PAID, PAID, OVERDUE, VOID, CREDITED states with controlled transitions.
- [ ] Subscription, installation/reconnection, discount, optional penalties, debit/credit adjustments, exact total.
- [ ] Unique invoice number and service/period duplicate protection enforced under concurrency (AT-11).
- [ ] Immutable finalized invoices; audited controlled adjustment/void workflows.
- [ ] Chronological ledger debits/credits with reproducible running balances and printable date-range SOA.
- [ ] Atomic invoice/ledger/audit posting and rollback tests.

## Milestone 5 — Payments and receipts (PDF §§3.6–3.7, 3.11, 4.4)

- [ ] Cash, GCash, Bank Transfer, Cheque, Other; payment datetime, amount, receipt, actor, method, reference, notes, optional proof.
- [ ] Oldest unpaid invoice first; explicit authorized manual allocation policy if permitted. Exact, partial, and advance payment tests (AT-01–04).
- [ ] Unallocated advance value remains customer credit, never disappears; document future-credit application policy.
- [ ] Unique non-reusable receipt numbers, including voids; dedicated receipt print layout.
- [ ] Preserve original payment and add linked reversal restoring balances, allocations/credit, and audit (AT-06).
- [ ] GCash queue: proof/reference/sender/amount capture, duplicate reference control (AT-05), authorized verify/reject, verifier identity/time.
- [ ] Only verified GCash can post. Uploaded screenshot alone never marks an account paid.
- [ ] Validate proof file type, size, safe paths; restricted attachment access.
- [ ] Cashier flow: search, balance, amount/method, allocation preview, atomic post, receipt.
- [ ] All financial posting, numbering, credit, allocations and audit commit/rollback together; concurrent retry/idempotency tests.

## Milestone 6 — Collections (PDF §3.8)

- [ ] Areas/routes, collector assignments, batches, batch accounts, remittances; printable account/address/current-bill/arrears/total route sheet.
- [ ] OPEN, IN_PROGRESS, SUBMITTED, REMITTED, RECONCILED, CLOSED lifecycle.
- [ ] Expected receivable, cash/non-cash collected, uncollected totals; separate cash reconciliation.
- [ ] Visible expected cash, remitted cash, shortage/overage, non-cash, collected accounts and exceptions (AT-07–08).
- [ ] Authorized confirmation to close; never silently treat shortage/overage as balanced.

## Milestone 7 — Receivables and service control (PDF §§3.9–3.10)

- [ ] Current/overdue receivable, overdue subscriber count, follow-up/suspension candidates.
- [ ] AR aging: Current, 1–30, 31–60, 61–90, 90+; clarify boundary so day 90 is never counted twice.
- [ ] Overdue subscriber/service/area/collector, months unpaid, oldest invoice, last payment, arrears.
- [ ] Filters: collector, area, plan, service type, delinquency age; aging must reconcile to outstanding balances.
- [ ] Configurable grace/threshold; suspension reason/effective date/approver/notes.
- [ ] Qualifying payment creates reconnection request, optional fee, technician, request/completion dates; preserve service history.

## Milestone 8 — Dashboard and reporting (PDF §§3.11, 4.1–4.3)

- [ ] 4–6 compact genuine KPIs; billing vs collection, payment methods, aging, collector performance, overdue alerts, recent payments.
- [ ] Required navigation: Dashboard; Subscribers (all/new/services); Billing (current/generate/invoices); Payments (receive/history/GCash); Collections (collectors/areas/routes/batches/remittance); Receivables (outstanding/overdue/aging/suspension); Services; Reports; Administration.
- [ ] Daily/weekly/monthly/annual collections, cash/GCash/method summaries, billing vs collection, revenue by plan/service/area, AR.
- [ ] Subscriber master list/ledger/SOA; collector assignment/collection/remittance/shortage-overage/performance.
- [ ] Adjustment/reversal/voided receipt/activity/audit reports. At least six required reports with PDF/XLSX evidence.
- [ ] ExcelJS/pdfmake exports from authoritative data; clean print layouts without navigation.
- [ ] Dense tables: sticky headers, search/filter/sort, server pagination or virtualization, export/status badges.
- [ ] Visible form labels/required markers/grouping/inline errors; GCash two-pane review.
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
- [ ] Synthetic demo data: 5 users spanning roles; 3 Internet, 2 Cable, 2 Combo plans; 50 subscribers; 60+ services; 2 collectors; 3 areas; 3 months of invoices; mixed payment cases; 10+ overdue accounts across aging; one approved reversal/void; two suspension/reconnection scenarios.
- [ ] D1 source, meaningful Git history, environments, migrations, seeds.
- [ ] D2 run-ready desktop release and documented server/database setup.
- [ ] D3 requirements, architecture/modules, ERD/data dictionary, API/IPC, security, deployment, backup/restore documentation.
- [ ] D4 user manual for all workflows and troubleshooting.
- [ ] D5 test plan/results/acceptance/defect package; D6 sample PDF/XLSX collection, AR, SOA, remittance/performance reports.
- [ ] D7 screenshots of dashboard/profile/payment/GCash/reconciliation/aging/reports; D8 presentation and defense.
- [ ] Submission folders: source, database/migrations+seeds, docs, tests/screenshots, reports-samples, release, README.
- [ ] Live demo: login; subscriber/service; invoice/ledger; cash/receipt; verified GCash/duplicates; SOA; overdue; collector/remittance; reversal/audit; exports; permissions; tested restore; simultaneous clients.
- [ ] Developer can explain all code, financial rules, API boundaries, concurrency, rollback and restore. AI use does not replace accountability.

## Mandatory acceptance matrix — all pending after Milestone 1

| ID | Scenario | Required result |
| --- | --- | --- |
| AT-01 | ₱999 invoice / ₱999 payment | Zero due, PAID, balanced ledger, receipt |
| AT-02 | ₱999 invoice / ₱500 payment | ₱499 due, PARTIALLY_PAID, correct allocation/ledger |
| AT-03 | ₱1,000 monthly / ₱3,000 payment | Documented allocation/credit preserves all value |
| AT-04 | August + September ₱999 each / ₱1,200 | August cleared; September ₱798 due |
| AT-05 | Reused verified GCash reference | Blocked or controlled audited duplicate handling |
| AT-06 | Reverse posted payment | Original retained; linked reversal; balances restored; actor/reason audit |
| AT-07 | ₱20,000 collected/remitted | Zero difference; authorized reconcile/close |
| AT-08 | ₱20,000 collected / ₱19,500 remitted | Visible ₱500 shortage, never silently balanced |
| AT-09 | Two/three concurrent clients | No corruption, duplicate numbering, or cross-session authorization leak |
| AT-10 | Cashier calls admin API directly | Server denies user/backup operation |
| AT-11 | Generate same service/period twice | No duplicate finalized invoices |
| AT-12 | Backup, mutate, approved restore | Verified integrity and expected restored records |

Foundation-only concurrency reads and centavo validation **do not satisfy** financial AT-01–12. Optional enhancements (mobile/offline, reminders, portal, gateway, QR/GIS, technician inventory, predictive analytics) stay out of scope until mandatory work is complete.

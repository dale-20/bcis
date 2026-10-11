# BCIS demonstration instructions

## Preparation

1. Start the isolated database, migrate and seed synthetic data.
2. Run `npm run check`, `npm run test:integration`, `npm run test:e2e`, and `npm run verify:restore`.
3. Start `npm run dev` or install the Windows release and start the API separately.
4. Keep `docs/acceptance-report.md` and `tests/evidence/at12-backup-restore.json` open for evidence.

## Controlled demo sequence

1. Sign in as `admin.demo`, replace the demo password, and explain server-side permissions.
2. Show dashboard KPIs, monthly collections, method mix, AR aging and recent payments.
3. Open Subscribers, search `BCIS-00001`, show multiple service accounts, addresses, collector assignment and service history.
4. Open Reports. Demonstrate monthly collections, AR aging, subscriber statement and collector remittance. Export one PDF and XLSX, then show the print layout.
5. Run the focused acceptance tests for AT-01–AT-08 and explain centavos, transactions, oldest-first allocation, credit, duplicate GCash handling, reversal and shortage preservation.
6. Show AT-09 evidence: two Cashier sessions post simultaneously while Viewer receives HTTP 403; payment and receipt identifiers remain unique.
7. Show AT-10 by calling `/admin/users` and `/system/backups` with a Cashier token; both return 403 and audit rows are created.
8. Show AT-11’s concurrent billing test and the service-period unique constraint.
9. Run `npm run verify:restore` only with the isolated `_test` database. Display the SHA-256, expected/restored counts, `pgAmcheck: true`, 69 foreign keys, and absent mutation marker.
10. Show `release/BCIS-Setup-0.1.0-x64.exe`, verify its SHA-256 from `docs/acceptance-report.md`, and disclose that it is not Authenticode-signed.

## Defense notes

- PostgreSQL is used because three clients need transactions, locks, constraints and safe concurrent writers; a shared SQLite file would not preserve the required server authorization boundary.
- Authoritative rules live in Fastify services/repositories and PostgreSQL constraints/triggers. React renders server results.
- Unique indexes and sequences protect invoices, receipts and GCash references. Advisory/row locks protect ordered allocations.
- Partial payment is a posted payment plus exact allocation rows; advance value is retained as subscriber credit.
- Reversal preserves evidence and adds compensating records so the ledger remains reproducible.
- A failed posting rolls back payment, allocation, invoice balance, receipt, credit, ledger and audit together.
- Backup validity is demonstrated by hash, successful isolated restore, pg_amcheck and expected-record comparison.

## Acceptance boundaries to disclose

The desktop contains payment, GCash review, collection/remittance, reversal, administration, backup, and report screens. AT-01–AT-08 and AT-10–AT-12 have real PostgreSQL API integration coverage; AT-09 exercises three concurrent API sessions. The current Electron E2E is one workflow and does not rehearse every role or financial path through the UI. Do not present API integration tests as desktop E2E coverage.

Physical three-PC LAN operation, production TLS/firewall configuration, production restore/service restart, maximum-volume load testing, clean-workstation install, and installer signing remain untested. The temporary installer install/launch/uninstall smoke passed on the development workstation, which is not a clean-machine result. The six report PDFs still need human visual review.

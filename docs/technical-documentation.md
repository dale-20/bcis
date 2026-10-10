# BCIS technical documentation

## System purpose and boundaries

BCIS is a Windows desktop subscription billing and collection system for three office workstations. Electron clients communicate with one Fastify API over the LAN. Only the API can access PostgreSQL. The renderer has no Node.js, filesystem, database, process, or unrestricted network capability.

The implemented server domain covers authentication/RBAC, subscribers and multiple services, monthly billing, immutable invoices, ledger posting, Cash/GCash payments, oldest-first allocations, credits, receipts, reversals, collectors, route snapshots, remittance reconciliation, aging, dashboards, reports, service history, user administration, audit, settings, and verified database-plus-proof backups. The desktop exposes operational workflows, reports, administration and backup creation/download. Automated live database replacement remains unavailable.

## Runtime architecture

```mermaid
flowchart LR
  A[Owner/Admin PC] -->|HTTPS in production| API[Fastify API]
  B[Cashier PC] -->|HTTPS in production| API
  C[Operations PC] -->|HTTPS in production| API
  API --> DB[(PostgreSQL)]
  API --> ATT[Restricted attachments]
  API -->|Owner/Admin backup.create| BKP[Verified database + proof archive]
  OPS[Owner-approved recovery procedure] --> DB
```

The monorepo contains `apps/desktop`, `apps/api`, and `packages/shared`. Shared Zod contracts define HTTP/IPC values. Authoritative money crosses JSON as canonical integer-centavo strings and is stored as PostgreSQL `bigint`.

## Modules

| Module | Responsibilities |
| --- | --- |
| Authentication | Salted scrypt passwords, hashed bearer sessions, lockout, password rotation and logout |
| RBAC | Database-backed roles and granular permission checks on every business route |
| Subscribers | Identity, contacts, addresses, service accounts, plans, areas and collectors |
| Billing | Calendar-month cycles, invoice snapshots, unique invoice numbers and ledger debits |
| Payments | Posting, GCash review, allocation, credits, receipts, reversal and compensating ledger entries |
| Collections | Route-sheet snapshots, recorded collections, remittance, variance and authorized close |
| Receivables | Outstanding balances, overdue filters and exact AR aging buckets |
| Reports | Dashboard queries, six tabular reports, audited PDF/XLSX export and print views |
| System | Company/billing settings, user administration, immutable audit search, verified backup history/create/download, isolated restore verification |

## Financial invariants

- All authoritative amounts are integer centavos; no floating-point posting occurs.
- Invoice `(service_account_id, billing_cycle_id)` and invoice/receipt numbers are database-unique.
- Finalized invoice totals and line items cannot be updated or deleted.
- Payment posting locks each subscriber, locks open invoices, and allocates oldest due invoice first.
- Allocations plus unapplied credit equal the posted payment amount.
- GCash stays pending until an authorized verifier acts; references are normalized and unique case-insensitively.
- Reversal retains the original payment, adds a linked reversal, voids the receipt, restores balances, and posts a compensating ledger debit.
- Remittance difference is always `remitted cash - expected cash`; closing a variance requires an acknowledgement.
- Financial writes and their audit records use the same PostgreSQL transaction.

## Database and concurrency

Drizzle migrations under `apps/api/drizzle` create normalized tables, foreign keys, named checks, unique indexes, sequences, and immutability triggers. Subscriber advisory locks serialize competing payment allocations. Idempotency-key locks make retried requests return the original payment. Database sequences produce invoice, receipt, and batch numbers without `MAX + 1` races.

AT-09 automated coverage creates three active API sessions. Two Cashier sessions post separate payments concurrently while a Viewer calls the same endpoint and receives HTTP 403. Tests prove two distinct payment IDs, two unique receipt numbers, two stored payments, and no unauthorized mutation. Physical three-PC LAN testing remains a deployment-site check.

## API and desktop boundary

Public routes are limited to health/readiness and login. Protected routes authenticate a bearer token and require explicit permissions. Relevant route groups are `/subscribers`, `/billing`, `/payments`, `/collection-batches`, `/receivables`, `/dashboard`, `/reports`, `/admin`, and `/system/backups`.

The preload exposes only named operations: session/authentication, connection status, subscriber operations, dashboard/report queries, exports, service history, audit/settings, and backup history/create/download. Main-process handlers validate IPC payloads and sender origin. Export and backup downloads are saved only after an explicit system file dialog choice.

## Security model

- Electron: context isolation, sandbox, no Node integration, web security, blocked navigation/windows, denied permissions, restrictive CSP and sender validation.
- API: Zod validation, bounded body/timeouts, safe error codes, authorization before handlers, structured logs and credential redaction.
- Identity: salted scrypt, generic login errors, lockout after five failures, 30-minute idle and eight-hour absolute session limits.
- Audit: authorization denials and financial mutations retain actor, request, reason and relevant before/after data; database triggers block audit changes/deletes.
- Attachments: proof metadata validates MIME type, size, SHA-256 and safe storage key. Backup creation includes all proof rows and verifies their file hashes before marking the archive verified.
- Transport: HTTP is development-only. Production LAN deployment requires HTTPS termination and a trusted certificate.

`npm audit --omit=dev` reported zero shipped production dependency vulnerabilities on 2026-10-10. The complete development tree reported 12 moderate findings in build/migration tooling; no high or critical findings remained after updating electron-builder to 26.15.3. The generated installer is not Authenticode-signed.

## Backup and restore

The desktop backup service creates a PostgreSQL custom-format dump, includes database-referenced GCash proofs and a SHA-256 manifest, verifies the dump and every proof after archive extraction, and records/audits status. Download rechecks the archive. `npm run verify:restore` accepts only a disposable `_test` source, restores to a separate derived database, verifies proof hashes, checks records and foreign keys, proves a post-backup mutation is absent, and writes evidence. Live replacement still requires an Owner-approved maintenance gate and controlled API stop/restart and is not exposed by the app; see `docs/backup-restore.md`.

## Known limits

- Automated live database replacement and distributed maintenance controls are not implemented.
- Three physical Windows clients and production HTTPS/firewall configuration are not laboratory-tested here.
- Installer is unsigned; Windows may show an unknown-publisher warning.
- Performance at the required maximum dataset has not been load-tested with 500,000 invoices/payments.
- Physical three-PC LAN deployment and production-volume performance remain untested.

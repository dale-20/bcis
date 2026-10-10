# BCIS acceptance and security report

Test date: 2026-10-10  
Environment: Windows, Node 24.18.0, PostgreSQL 18 isolated test cluster, Electron 44.7.0  
Data: synthetic only

## Acceptance results

| ID | Status | Automated evidence | Result |
| --- | --- | --- | --- |
| AT-01 | PASSED | `payments.integration.test.ts` | ₱999 exact Cash payment leaves zero, PAID, balanced ledger and receipt |
| AT-02 | PASSED | `payments.integration.test.ts` | ₱500 leaves ₱499 and PARTIALLY_PAID with exact allocation/ledger |
| AT-03 | PASSED | `payments.integration.test.ts` | ₱3,000 preserves ₱1,000 allocation and ₱2,000 unapplied credit |
| AT-04 | PASSED | `payments.integration.test.ts` | August cleared first; September retains ₱798 |
| AT-05 | PASSED | `payments.integration.test.ts` | Pending GCash is not posted; verified duplicate reference returns conflict |
| AT-06 | PASSED | `payments.integration.test.ts` | Original retained, reversal linked, receipt voided, balances restored and audit written |
| AT-07 | PASSED | `collections.integration.test.ts` | ₱20,000 expected/remitted yields zero and authorized close |
| AT-08 | PASSED | `collections.integration.test.ts` | ₱500 shortage remains visible; silent close rejected |
| AT-09 | PARTIAL | `payments.integration.test.ts` | Three simultaneous sessions passed: two postings, unique receipts, Viewer denied. Three physical PCs remain untested |
| AT-10 | PASSED | `authorization.integration.test.ts` | Cashier receives HTTP 403 for direct user and backup-history calls; both denials audited |
| AT-11 | PASSED | `billing.integration.test.ts` | Concurrent duplicate billing returns one created run and one skipped run; no duplicate invoices |
| AT-12 | PASSED | `backup.integration.test.ts`, `tests/evidence/at12-backup-restore.json` | Owner-approved dump/hash/restore, pg_amcheck, 67 foreign keys, expected counts and mutation rollback verified |

No acceptance test remains failed after corrections. AT-09 is not marked fully passed because physical LAN workstations were unavailable.

## Commands and outcomes

| Command | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm test` | 81 passed |
| `npm run test:integration` | 7 files, 47 passed |
| `npm run test:e2e` | Passed; 1 built-Electron workflow including accessibility and security checks |
| `npm run release:windows` | Passed; NSIS x64 installer produced |
| `npm audit --omit=dev` | Passed; zero production advisories |
| `npm audit` | 12 moderate development-tool advisories; zero high/critical after electron-builder 26.15.3 update |

## Defects found and fixed

| Defect | Root cause | Fix | Regression evidence |
| --- | --- | --- | --- |
| AT-09 first request returned 401 | Test rotated the Cashier password, correctly revoking the earlier session | Create another login session without rotating the password | AT-09 passes with two Cashier sessions and one Viewer session |
| Restore integrity check inspected unrelated databases | `pg_amcheck --all` included databases without the extension | Target restored database and use `--install-missing` | AT-12 passes and reports `pgAmcheck: true` |
| Desktop E2E expected Subscribers after login | Dashboard became the authorized default screen | Assert dashboard, then navigate using accessible sidebar control | Final E2E rerun recorded below |
| Initial packager version had high/critical build advisories | electron-builder 26.5.0 included vulnerable build dependencies | Updated to 26.15.3 | No high/critical advisories; production audit clean |

## Security checks

Passed: secure password hashing, generic login failure, lockout, session expiry/revocation, bearer hashing, server RBAC, denied-action audit, immutable audit/financial records, Zod input rejection, transaction rollback, unique constraints, IPC sender validation, Electron sandbox/context isolation/no Node integration, navigation/popup/permission denial, credential log redaction, production dependency audit.

Not met: installer Authenticode signature. The release is usable for laboratory evaluation but reports `NotSigned` and may show an unknown-publisher warning.

Untested: external penetration test, production TLS/certificate configuration, Windows service hardening, firewall rules, three physical PCs, power-loss recovery, maximum-volume performance, installer upgrade/uninstall migration and antivirus reputation.

Final E2E rerun: **PASSED** (1/1). It exercised the built Electron application against the real API/PostgreSQL test database, login/password rotation, dashboard, subscriber search/profile/form, reports, connection degradation/recovery, exact preload surface, sandbox preferences, axe accessibility, minimum-window overflow and API outage handling.

## Functional requirements still incomplete

Desktop UI is incomplete for billing, receive payment/receipt printing, GCash proof queue, collection batches/reconciliation, reversal/audit review, suspension/reconnection mutation, user administration and backup/restore. Proof metadata exists, but restricted proof-image binary storage and attachment backup do not. Global subscriber search does not cover receipt, invoice and GCash reference. These items are not claimed as passed by the AT API tests.

# BCIS acceptance and release report

Test date: 2026-10-11
Environment: Windows 10.0.26200, Node 24, PostgreSQL 18 isolated project cluster, Electron 44.7.0
Data: synthetic test/demo records only

## Acceptance results

| ID | Status | Evidence | Result and remaining limit |
| --- | --- | --- | --- |
| AT-01 | PASSED | `apps/api/test/payments.integration.test.ts` | Exact ₱999 Cash payment leaves zero due, PAID status, balanced ledger, and unique receipt. |
| AT-02 | PASSED | `apps/api/test/payments.integration.test.ts` | ₱500 payment leaves ₱499 due with exact allocation and ledger values. |
| AT-03 | PASSED | `apps/api/test/payments.integration.test.ts` | ₱3,000 payment preserves ₱1,000 allocation and ₱2,000 unapplied credit. |
| AT-04 | PASSED | `apps/api/test/payments.integration.test.ts` | Oldest invoice clears first; the next retains ₱798. |
| AT-05 | PASSED | `apps/api/test/payments.integration.test.ts` | Pending GCash cannot post; a reused verified reference is rejected. |
| AT-06 | PASSED | `apps/api/test/payments.integration.test.ts` | Original payment remains; linked reversal, void receipt, restored balances, actor/reason audit are checked. |
| AT-07 | PASSED | `apps/api/test/collections.integration.test.ts` | ₱20,000 expected and remitted reconciles to zero; authorized close succeeds. |
| AT-08 | PASSED | `apps/api/test/collections.integration.test.ts` | ₱500 shortage stays visible; silent close is denied and acknowledged close retains variance. |
| AT-09 | PARTIAL | `apps/api/test/payments.integration.test.ts` | Three simultaneous API sessions prove concurrent posting, unique receipts, and Viewer denial. Three physical Windows LAN clients are untested. |
| AT-10 | PASSED | `apps/api/test/authorization.integration.test.ts` | Cashier direct calls to Admin and backup operations return 403 and are audited. |
| AT-11 | PASSED | `apps/api/test/billing.integration.test.ts` | Concurrent same-period billing creates one run and skips the duplicate; no duplicate invoices. |
| AT-12 | PARTIAL | `apps/api/test/backup.integration.test.ts`, `tests/evidence/at12-*.json` | Isolated approved backup/restore and staged cutover verify database integrity, mutation removal, proof hashes, audit, maintenance-gate clearing, and rollback. Production service-manager restart remains untested. |

No automated AT-01–AT-12 case is currently reported failed. AT-09 and AT-12 remain partial because their physical/deployment acceptance environments are unavailable.

## Verification run

| Command | Result |
| --- | --- |
| `npm run check` | Passed: strict typecheck, lint, 21 unit/API/component/script files, 177 tests. |
| `npm run test:integration` | Passed: 7 PostgreSQL integration files, 69 tests. |
| `npm run test:e2e` | Passed: 2 built-Electron workflows. The desktop flow runs against real API/PostgreSQL, exercises dashboard, subscriber, billing, payments, collections, aging, reports, and recovery; it exports PDF and XLSX through the typed preload and main-process save path into isolated files, checks `%PDF` and ZIP `PK` signatures, and verifies that canceling the save dialog reports that no file was saved. Buddy feedback and reduced-motion behavior pass in the second workflow. |
| `npm run reports:samples` | Passed: 8 integration tests; six synthetic PDF/XLSX pairs generated and data-checked. |
| `npm run perf:scale` | Passed: isolated synthetic scale of 20,000 subscribers, 500,375 invoices, 500,375 payments, and 1,000,750 ledger entries. Seven measured runs per API repository path; median final subscriber page 74.26 ms, AR aging page 423.99 ms. `EXPLAIN (ANALYZE, BUFFERS)` used `subscribers_account_number_uq` and `invoices_open_receivable_due_idx`; detailed JSON is in `tests/evidence/scale-query-benchmark.json`. Temporary database was dropped. |
| `npm run db:migrate -w @bcis/api` | Passed on the configured isolated `bcis_dev`; additive index migration applied, and the already-running API readiness endpoint returned `database: connected`. |
| `npm run release:windows` | Passed: x64 NSIS installer rebuilt from current source on 2026-10-11. |
| Temporary installer smoke | Blocked: Windows Application Control policy refused to launch the rebuilt NSIS installer (`An Application Control policy has blocked this file`). Packaging and SHA-256 verification passed; install/launch/uninstall and clean-machine checks remain untested. |
| `npm run dev:desktop` launcher smoke | Electron processes stayed alive with inherited `ELECTRON_RUN_AS_NODE=1`; API readiness returned HTTP 200 from the existing local API. The desktop E2E separately confirms built windows and workflows. |
| `npm audit --omit=dev --offline` | Passed: 0 reported production vulnerabilities from the local npm audit data. Offline mode limits freshness. |
| `git diff --check` | Passed before the current report-export and screenshot evidence increment; rerun before commit. |

The E2E workflow covers seeded login, dashboard, subscriber search/profile and maintenance, billing, Cash and GCash posting, Cash reversal with audit reason, seeded billing-period handling, all four populated AR-aging buckets in the desktop view, report data/print media, saved PDF/XLSX output and export cancellation, verified database/proof backup, connection recovery, accessibility, and Electron boundary checks. Seven synthetic desktop captures are indexed in `docs/screenshots/`, including the reconciled batch detail. The save-dialog choices are automated to fixed temporary paths; a manual native-dialog and operator demo rehearsal remain untested. This automated run uses an isolated test database and synthetic records.

## Release artifact

- Installer: `release/BCIS-Setup-0.1.0-x64.exe`
- Size: 112,232,864 bytes
- SHA-256: `73F21A0F6BCD58EBEDD47A6EED4C758B858C94C08CAC765239CE0075E1F6DF23`
- Authenticode: `NotSigned`; Windows may show an unknown-publisher warning.
- Build warnings: Zod annotation comments are removed by Rollup; renderer JavaScript chunk is 813.88 kB and exceeds the 500 kB advisory threshold.

## Security and operational status

Verified: password hashing and session handling, server-side RBAC and denial audit, input validation, transaction rollback, database uniqueness/immutability, IPC sender validation, Electron sandbox/context isolation/no Node integration, navigation and permission denial, credential log redaction, isolated backup restore, and production dependency audit.

Still untested: external penetration test, production HTTPS/certificate and firewall setup, Windows service hardening, three physical LAN clients, production restore/restart, power-loss recovery, concurrent/throughput performance beyond the measured final-page repository query paths, clean-workstation install/migration/seed, installer upgrade/uninstall on a maintained installation, and antivirus reputation. Report PDF page layout has automated signature/data checks but still needs a visual review of the six files in `reports-samples/`.

## Defects found and corrected

| Defect | Cause | Correction | Regression evidence |
| --- | --- | --- | --- |
| AT-09 first request returned 401 | Test rotated Cashier password, revoking its earlier session. | Create distinct sessions without rotating the shared test password. | Concurrent AT-09 test passes with two Cashier sessions and a Viewer session. |
| Restore integrity check included unrelated databases | `pg_amcheck --all` examined databases without the extension. | Restrict integrity check to the restored database. | AT-12 isolated restore evidence records `pgAmcheck: true`. |
| E2E expected Subscribers after login | Dashboard is the authorized default. | Assert dashboard and navigate through the accessible sidebar. | Built Electron E2E passes. |
| Electron exited when started by IDE terminal | The IDE inherited `ELECTRON_RUN_AS_NODE=1`; Electron entered Node mode. | Route desktop dev/preview scripts through `scripts/run-electron-vite.mjs`, which removes only that variable. | Regression test passes; `npm run dev:desktop` process launch completed. |
| AR aging query timed out at target volume | Its outstanding-balance predicate and due-date ordering had no partial index that covered the paginated invoice fields. | Add the reviewed `invoices_open_receivable_due_idx` partial index and benchmark it with the real repository method under the configured 2-second statement timeout. | At 500,375 invoices, API repository path median 423.99 ms; PostgreSQL chose an index-only scan. |
| Aging UI rendered the 90+ bucket as `90–PLUS` | A generic underscore replacement formatted the `90_PLUS` domain key incorrectly. | Use one explicit shared label map for aging buckets on the dashboard, aging totals, and invoice rows. | Built Electron E2E checks nonzero labels/totals for all four buckets, including 90+, and the corrected Windows installer was rebuilt. |
| Posted invoice adjustments were absent from the invoice detail drawer | The API returned adjustment history, but the renderer showed only invoice lines and the ledger reference. | Added a read-only adjustment history with reason, amount, status, and timestamp. | Built Electron E2E posts a synthetic adjustment and verifies its reason is visible; `npm run check` passes 107 tests. |

The full `npm run dev` command could not bind its API because a pre-existing development server already owned port 3001. That service was left untouched; the desktop-only command was used against its healthy API.

## Requirements not yet complete

- AT-09 physical LAN clients and AT-12 production service restart are partial, as listed above.
- The 20,000/500,000/500,000/1,000,000 synthetic row-volume target and two representative page query plans are measured in the isolated benchmark. Sustained throughput, concurrent load, physical-client performance, and larger/heavier report queries remain untested.
- PDF visual review, clean-workstation deployment, TLS/firewall hardening, and the full operator demo remain pending.
- A signed installer requires an Authenticode certificate and a controlled release-signing process.

See `docs/implementation-checklist.md` for the requirement-level passed/partial/untested matrix and `docs/feature-delivery-plan.md` for the remaining delivery gates.

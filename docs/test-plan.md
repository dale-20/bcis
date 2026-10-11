# BCIS verification plan

Date of latest recorded run: 2026-10-11. All records used by automated tests are synthetic. PostgreSQL integration and Electron E2E tests must use the isolated database ending in `_test`; never point reset utilities at development or production databases.

## Quality gates

| Command | Scope | Latest recorded result |
| --- | --- | --- |
| `npm run check` | Strict TypeScript checks, ESLint, unit/API/component/script tests | Passed: 21 files, 177 tests |
| `npm run test:integration` | Fastify injection and real PostgreSQL migrations, constraints, financial transactions, RBAC, reports, restore | Passed: 7 files, 69 tests |
| `npm run test:e2e` | Built Electron, secure preload, synthetic API/database flows, report file save/cancel, accessibility | Passed: 2 workflows |
| `npm run reports:samples` | Synthetic report outputs reconciled to API results; XLSX contents and PDF signatures checked | Passed: 8 integration tests, six PDF/XLSX pairs |
| `npm run perf:scale` | Real repository pagination and query plans at target synthetic volume | Passed for measured subscriber and AR-aging queries; sustained load remains untested |
| `npm run verify:restore` | Isolated approved backup/restore validation | Passed in recorded AT-12 evidence; production service restart remains untested |

## Financial acceptance coverage

AT-01 through AT-08, AT-10, and AT-11 pass automated integration tests against real PostgreSQL. AT-09 passes with three concurrent API sessions; three physical Windows LAN clients remain untested. AT-12 passes isolated backup, integrity, and staged cutover checks; production service-manager restart remains untested. See the acceptance matrix in `implementation-checklist.md` and detailed outputs in `acceptance-report.md` and `tests/evidence/`.

## Desktop export verification

The built Electron test signs in to the real test API, requests server-generated report bytes over the authenticated API client, passes them through the validated preload/main-process export path, and substitutes deterministic paths for the native save dialog. It verifies a `%PDF` header, an XLSX ZIP `PK` header, the visible saved-path status, and the accessible cancellation message. This proves file transfer and saving logic; it does not test Windows shell file associations or a human-operated native dialog.

## Reproducible local run

```powershell
npm ci
npm run setup
npm run db:local:init
npm run db:local:start
npm run db:migrate
npm run db:seed:demo
npm run check
npm run test:integration
npm run test:e2e
```

Run the tests in order. Integration and E2E helpers reset only the configured test database. Do not run restore verification unless `TEST_DATABASE_URL` ends in `_test` and differs from `DATABASE_URL`.

## Manual checks still required

- Rehearse the complete demo with an operator and all user roles.
- Verify three separate Windows PCs over the intended LAN, HTTPS certificate, firewall rules, and simultaneous payment posting.
- Perform a clean-workstation install, migration, seed, launch, upgrade, and uninstall rehearsal.
- Rehearse a production-like restore including API service stop/restart and rollback.
- Visually inspect the six PDFs in `reports-samples/` with a PDF viewer.
- Complete and review the presentation/defense materials before submission.

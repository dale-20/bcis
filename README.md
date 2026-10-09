# BCIS Subscription Billing & Collection

Windows desktop foundation for Bukidnon Cable and Internet Services. **Milestone 1 only:** Electron/React shell, Fastify health API, PostgreSQL/Drizzle migration, typed preload, real connection status, and verification tools. Billing and payment workflows are not implemented yet.

## Requirements

- Windows 10/11, Node.js **24 LTS**, npm 11 or newer, Git.
- PostgreSQL 18 binaries. The local helper defaults to `C:\Program Files\PostgreSQL\18\bin`; set `PG_BIN` for another installation.
- Internet for initial `npm ci` and Electron download. No Docker required.

## First launch (PowerShell, repository root)

```powershell
npm ci
npm run setup
npm run db:local:init
npm run db:local:start
npm run db:migrate
npm run dev
```

`setup` creates ignored app `.env` files without overwriting existing values. `db:local:init` creates an isolated cluster in `.local/postgres`, generates a random local password, and replaces only placeholder API URLs. It does not modify the existing Windows PostgreSQL service. `db:local:start` listens only on `127.0.0.1:55432` and creates `bcis_dev` and separate `bcis_test` databases. Credentials and logs stay ignored in `.local/`.

The Electron window polls the API every 15 seconds and supports **Check again**. Green readiness requires a real database connection and applied migration. API-offline, database-unavailable and missing-migration states remain distinct. Disabled navigation names future modules; no financial results are fabricated.

Stop the foreground development processes with Ctrl+C, then stop the isolated database:

```powershell
npm run db:local:stop
```

On subsequent launches, use `npm run db:local:start` then `npm run dev`. Use `npm run db:migrate` after pulling schema changes. Never delete `.local/postgres` to repair a database that contains data you need.

## Existing PostgreSQL instead

Create separate empty `bcis_dev` and `bcis_test` databases with your database administrator. Run `npm run setup`, then edit `apps/api/.env` with their `DATABASE_URL` and `TEST_DATABASE_URL`. URL-encode password characters when necessary. Skip the `db:local:*` commands, run migrations, then start development. Do not use production data or credentials.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Build/watch shared contracts; start API and Electron/Vite together |
| `npm run dev:api` / `npm run dev:desktop` | Run one side during diagnosis or LAN development |
| `npm run check` | Typecheck, ESLint, Vitest unit/API/component checks |
| `npm run test:integration` | Reset foundation tables in dedicated `_test` DB; test migrations, constraints, rollback, readiness and simultaneous reads |
| `npm run test:e2e` | Build, launch real Electron and API on 3101 against migrated `_test` DB, test connection/failure/security/a11y; writes screenshots |
| `npm run build` | Compile shared/API and production Electron bundles |
| `npm run start:api` / `npm run start:desktop` | Run built API/desktop on separate terminals |
| `npm run db:generate` | Generate a reviewed migration after schema edits |
| `npm run db:migrate` | Apply committed migrations explicitly |

Run integration tests before E2E. Both use the separate synthetic `TEST_DATABASE_URL`; do not run them concurrently. Integration tests remove only the foundation table and Drizzle journal in that disposable database. Tests intentionally fail if the test URL is missing or does not end in `_test`. A foundation readiness read is not proof of financial posting correctness.

## API health

```powershell
Invoke-RestMethod http://127.0.0.1:3001/health
Invoke-RestMethod http://127.0.0.1:3001/health/ready
```

`/health` checks API liveness (200). `/health/ready` checks PostgreSQL and migration compatibility (200 ready, 503 degraded). The API remains alive during database failure so the desktop can explain the problem. No authentication/business endpoints are included in this increment.

## Three-client LAN setup

1. Run one API and PostgreSQL on the designated server. Set `API_HOST=0.0.0.0` in its `apps/api/.env`.
2. Keep PostgreSQL private to that server. Do not distribute `apps/api/.env` or database credentials to clients.
3. Permit the API port (default 3001) through the server firewall only for the trusted private LAN. This repository does not change firewall rules.
4. On each client, set `MAIN_VITE_API_URL=http://SERVER_PRIVATE_IP:3001` in `apps/desktop/.env` before development/build. For a built client, set `$env:BCIS_API_URL='http://SERVER_PRIVATE_IP:3001'` before `npm run start:desktop`.
5. Verify `/health/ready` and the desktop indicator from all three PCs. Actual three-PC financial concurrency remains a later acceptance gate.

Only health data is available now. Before any customer-data deployment, implement authentication/server RBAC, restricted DB roles, HTTPS/session security, audit, backup/restore and the remaining checklist. Installer packaging is deferred.

## Troubleshooting

- **API not connected:** confirm the API process and configured origin, firewall/network, and port 3001 availability.
- **Database unavailable:** start PostgreSQL; check the ignored API environment locally. Do not paste credentials into logs or chat.
- **Migration required:** run `npm run db:migrate` against the same database as the API.
- **Address already in use:** stop the conflicting process or change API/client settings together. Local cluster port 55432 and E2E API port 3101 must be available.
- **PostgreSQL binary not found:** `$env:PG_BIN='C:\path\to\PostgreSQL\bin'` before local DB commands.
- **Electron starts as Node:** remove an inherited `ELECTRON_RUN_AS_NODE` environment variable before launching.
- **Windows application control / `spawn EPERM`:** run the command from a trusted local PowerShell context allowed to launch Node, esbuild, Electron and PostgreSQL. Do not disable system-wide security policies.

## Project map and evidence

- [Laboratory checklist](docs/implementation-checklist.md)
- [Architecture and contracts](docs/architecture.md)
- [Engineering conventions](AGENTS.md)
- [Stack standards and official references](docs/engineering-standards.md)
- [Milestone evidence](docs/milestone-1-report.md)
- [Supplied requirements](docs/requirements.pdf)

Use synthetic subscriber/payment information only. The 12-hour project timebox does not change the requirement to stop after Milestone 1 in this delivery.

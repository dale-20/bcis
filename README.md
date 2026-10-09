# BCIS Subscription Billing & Collection

Windows desktop and API for Bukidnon Cable and Internet Services. It includes secure password sessions, server-side RBAC, append-only audit records, a searchable subscriber directory, detailed subscriber profiles, multi-service account creation, service plans, service addresses, collection areas, assigned collectors, and verification tools. Billing and payment posting workflows are not implemented yet.

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
npm run db:seed:demo
npm run dev
```

`setup` creates ignored app `.env` files without overwriting existing values. Before seeding, set `DEMO_ACCOUNT_PASSWORD` in `apps/api/.env` to a unique value of at least 12 characters. `db:local:init` creates an isolated cluster in `.local/postgres`, generates a random local password, and replaces only placeholder API URLs. It does not modify the existing Windows PostgreSQL service. `db:local:start` listens only on `127.0.0.1:55432` and creates `bcis_dev` and separate `bcis_test` databases. Credentials and logs stay ignored in `.local/`.

The seed creates seven synthetic identities listed in [the permission matrix](docs/permission-matrix.md), seven service plans, three collection areas, two collectors, 50 subscribers, and 65 service accounts. The identities share the configured seed password only for initial access. The API requires each account to replace that password before permission-protected operations. Re-running the seed intentionally resets the seven demo passwords and restores the password-change requirement; do not use it to manage real users.

The Electron application provides secure login, forced replacement of the seed password, subscriber search/filter/sort/pagination, detailed subscriber profiles, and transactional subscriber creation. The System connection screen checks live API/database readiness. Disabled navigation names future financial modules; no financial results are fabricated.

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
| `npm run db:seed:demo` | Idempotently seed authorization plus synthetic plans, routes, collectors, subscribers, and services |

Run integration tests before E2E. Both use the separate synthetic `TEST_DATABASE_URL`; do not run them concurrently. Integration tests recreate only the `public` and Drizzle schemas in that disposable database. Tests intentionally fail if the test URL is missing, equals `DATABASE_URL`, or does not end in `_test`. Schema, authentication, and authorization tests are not proof of later financial posting correctness.

## API endpoints

```powershell
Invoke-RestMethod http://127.0.0.1:3001/health
Invoke-RestMethod http://127.0.0.1:3001/health/ready
```

`/health` checks API liveness (200). `/health/ready` checks PostgreSQL and migration compatibility (200 ready, 503 degraded). The API remains alive during database failure so the desktop can explain the problem. Financial posting endpoints remain deferred.

Authentication endpoints are `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password`, and `POST /auth/logout`. Send the login token as `Authorization: Bearer TOKEN`; the database stores only its hash. `GET /admin/users` is the first permission-protected route and requires `user.manage`. The Cashier role receives HTTP 403 when it calls that route directly, and the denial is audited.

Subscriber endpoints are `GET /subscribers`, `GET /subscribers/:id`, and `POST /subscribers`. Listing supports bounded server-side pagination plus name, account, contact, address, and service-number search. `GET /reference-data` supplies active plans, areas, and collectors. Admin-only catalog creation uses `POST /service-plans`, `POST /collection-areas`, and `POST /collectors`. See [subscriber operations](docs/subscriber-operations.md) for the contracts and current limits.

## Three-client LAN setup

1. Run one API and PostgreSQL on the designated server. Set `API_HOST=0.0.0.0` in its `apps/api/.env`.
2. Keep PostgreSQL private to that server. Do not distribute `apps/api/.env` or database credentials to clients.
3. Permit the API port (default 3001) through the server firewall only for the trusted private LAN. This repository does not change firewall rules.
4. On each client, set `MAIN_VITE_API_URL=http://SERVER_PRIVATE_IP:3001` in `apps/desktop/.env` before development/build. For a built client, set `$env:BCIS_API_URL='http://SERVER_PRIVATE_IP:3001'` before `npm run start:desktop`.
5. Verify `/health/ready` and the desktop indicator from all three PCs. Actual three-PC financial concurrency remains a later acceptance gate.

Before any customer-data deployment, add HTTPS at the LAN boundary, a restricted production database role, the remaining financial services, verified backup/restore, and installer packaging.

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
- [Database schema](docs/database-schema.md)
- [Permission matrix](docs/permission-matrix.md)
- [Subscriber operations](docs/subscriber-operations.md)
- [Engineering conventions](AGENTS.md)
- [Stack standards and official references](docs/engineering-standards.md)
- [Milestone evidence](docs/milestone-1-report.md)
- [Supplied requirements](docs/requirements.pdf)

Use synthetic subscriber/payment information only. A created table does not mean its workflow is complete; follow the implementation checklist and automated evidence.

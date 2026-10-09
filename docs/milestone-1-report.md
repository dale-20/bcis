# Foundation and initialization verification

Verified on October 10, 2026, using the isolated project PostgreSQL cluster and synthetic data only.

## Delivered foundation

- npm workspaces for `apps/api`, `apps/desktop`, and `packages/shared`, all using strict TypeScript.
- Electron/electron-vite with a sandboxed renderer, context isolation, restrictive CSP, blocked navigation/popups, validated IPC senders, and a narrow typed preload.
- React, Tailwind CSS, shadcn-style owned components, TanStack Query, and TanStack Table.
- Fastify with validated environment configuration, structured logging, safe errors, health/readiness endpoints, authentication, and server-side permission hooks.
- PostgreSQL accessed only by the API through Drizzle, with committed migrations, constraints, foreign keys, indexes, transactions, and append-only audit protection.
- Zod contracts shared across API, Electron main/preload, and renderer boundaries.
- Setup, isolated local database, migration, seed, development, production build, and test scripts documented in the README.

Initialization was recorded in commit `b36cdab` (`init`). Security/schema and subscriber increments were recorded in `6e4a06c` and `c84e740`, with the same quality gates retained.

## Verification evidence

| Command / evidence | Result |
| --- | --- |
| `npm run setup` | Existing ignored API and desktop environments preserved; next-step instructions printed |
| `npm run check` | Strict typecheck and ESLint passed; 8 test files and 60 tests passed |
| `npm run test:integration` | 3 PostgreSQL files and 24 tests passed |
| Clean/repeat migration integration case | Drops disposable schemas, reports migration required, applies all migrations twice, then reports ready |
| Transaction/constraint integration cases | Rollback, singleton/version constraints, and duplicate nested subscriber rollback passed |
| Three-client readiness case | Three simultaneous API readiness requests returned HTTP 200 |
| Authorization cases | Cashier denied Admin user and subscriber/catalog mutations with HTTP 403 |
| `npm run test:e2e` | Production build passed; 1 built Electron workflow passed against real API/PostgreSQL |
| Electron security assertions | Exact preload surface, sandbox, context isolation, disabled Node integration, and web security passed |
| Accessibility | axe reported zero violations in the authenticated subscriber workflow |
| `npm audit --omit=dev` | 0 production dependency vulnerabilities |
| `git diff --check` | No whitespace errors before the milestone cleanup commit |

The production build reports a non-blocking Rollup size warning for the renderer JavaScript bundle. This is a performance optimization item for later route-level code splitting; it does not prevent the application from building or running.

## Local launch

From the repository root in PowerShell:

```powershell
npm ci
npm run setup
npm run db:local:init
npm run db:local:start
npm run db:migrate
npm run db:seed:demo
npm run dev
```

`db:local:init` is required only for the first launch. Later launches use `npm run db:local:start` followed by `npm run dev`. The seed uses `DEMO_ACCOUNT_PASSWORD` from the ignored `apps/api/.env` and resets demo-account passwords when rerun.

## Blockers and scope boundary

There are no remaining project-initialization blockers. Subscriber edit/archive and the billing, payment, reconciliation, reporting, backup/restore, installer, and financial acceptance milestones remain intentionally pending in the implementation checklist.

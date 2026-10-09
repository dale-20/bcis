# BCIS engineering conventions

## Scope and workflow

The current implemented scope includes the foundation, API security, subscriber operations, monthly billing, and the payment core: transactional Cash/verified-GCash posting, oldest-first allocation, receipts, unapplied credit, reversals, immutable financial history, audit, and reproducible ledgers. The full laboratory checklist is in `docs/implementation-checklist.md`; a table or dependency alone does not complete its later workflow milestone.

- Read `docs/requirements.pdf` and the checklist before changing domain behavior.
- Work in small feature increments: shared contract, migration/domain/API, tests, then UI.
- Run `npm run check` after each milestone and relevant database/Electron tests. Fix failures before proceeding. Record blocked checks honestly.
- Commit completed increments with meaningful messages. Do not amend or discard user changes.
- Use only synthetic test/demo data. Never commit environment secrets or database files.

## Standards authority

- This file is the durable development contract for every contributor and coding agent. Apply it to all future milestones unless a newer explicit user requirement supersedes it.
- `docs/engineering-standards.md` records the official sources and rationale. Recheck those sources before a major-version upgrade or when a rule no longer fits the installed version.
- Match the versions in `package-lock.json`. Do not copy examples from another major version without checking migration and compatibility notes.
- Prefer framework-native patterns and small, explicit modules. Add a dependency only when it removes more risk or complexity than it introduces.
- Keep changes feature-sized and reviewable. Do not mix formatting, dependency upgrades, schema changes, and domain behavior in one commit unless they are inseparable.

## Boundaries

- `apps/api` exclusively owns PostgreSQL, Drizzle, business services, permissions, audit, and financial posting.
- `apps/desktop` owns Electron main/preload and React. Renderer talks only through a narrow, typed preload API; no arbitrary IPC, filesystem, SQL, or network capabilities.
- `packages/shared` holds Zod contracts and pure domain value types; no Node, database, or Electron imports.
- TypeScript strict mode; no unexplained `any`. Validate all external input server-side with Zod.
- Use TanStack Query for server state, TanStack Table for future operational tables, and presentational components without service calls.
- Keep `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, restrictive CSP, IPC sender validation, and navigation/popup blocking.
- Three LAN clients use one API and PostgreSQL. Production authorization belongs on the server. Health and login are public; every business endpoint requires an active session and an explicit permission.
- Database schema changes require reviewed, committed Drizzle migrations. Use foreign keys, unique constraints, and relevant indexes as entities are added.

## Clean code rules

- Organize by business capability inside each app, then split by responsibility: route/controller, schema, service/domain, repository/query, and UI. Do not create generic `utils`, `helpers`, or `common` dumping grounds.
- Each module owns one reason to change. Functions should express one operation, use domain names, return early, and avoid hidden mutation or boolean-flag behavior.
- Keep public APIs small. Export only what another module needs. Use dependency injection at I/O boundaries so domain logic stays deterministic and testable.
- Represent workflow states with discriminated unions or explicit status types. Avoid parallel booleans and impossible states.
- Never use `any`, non-null assertions, `@ts-ignore`, or disabled lint rules without a nearby explanation and a narrower alternative being impractical. Prefer `unknown` plus validation/narrowing.
- Do not duplicate derived state or authoritative calculations. One concept has one source of truth.
- Comments explain constraints, business reasons, or non-obvious tradeoffs. Names and structure explain mechanics. Remove stale comments when behavior changes.
- Errors cross boundaries as stable typed codes and safe messages. Log internal causes once with a request/correlation ID. Never expose stack traces, SQL, secrets, or credentials to clients.
- Dates are stored as `timestamptz` UTC instants or `date` business dates according to meaning. Format in the user timezone only at the presentation boundary.
- No dead code, placeholder financial data, commented-out implementations, or TODOs without an owner or tracked milestone.

## TypeScript and shared contracts

- Keep `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, unused checks, and fallthrough checks enabled. Do not weaken the root compiler settings to fix local code.
- Infer types from Zod schemas and Drizzle tables when those are the runtime/source-of-truth definitions. Avoid handwritten duplicate interfaces that can drift.
- Validate every untrusted boundary: environment, HTTP params/query/body, IPC input/output, file metadata, database-decoded values that are not structurally guaranteed, and imported report data.
- Use `safeParse` for expected user input failures and `parse` for programmer-controlled invariants. Map validation issues to stable application errors at the boundary.
- `packages/shared` stays platform-neutral. It may contain schemas, DTOs, enums, and pure functions; it must not import Electron, Node filesystem/process APIs, Fastify, PostgreSQL, or React.
- Money crosses JSON as canonical integer-centavo strings within PostgreSQL `bigint` range. Convert to `bigint` only after validation; never serialize JavaScript `bigint` directly.

## Electron and desktop standards

- Treat the renderer as an untrusted web surface. Keep local packaged content, `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webSecurity: true`, restrictive CSP, permission denial, and blocked untrusted navigation/windows.
- Expose one narrow preload method per use case through `contextBridge`. Never expose `ipcRenderer`, generic `send/invoke`, raw filesystem, shell, process, environment, database, or unrestricted URL access.
- Validate every IPC sender, main-frame origin/URL, request payload, and response. IPC channel names and bridge types live in shared contracts.
- Main-process services own OS and network access. React components call a typed service layer, never Electron APIs or HTTP directly.
- Use HTTPS/WSS for production LAN traffic. Plain HTTP is development-only unless the deployment has an explicitly documented trusted transport control.
- Keep Electron current within the chosen supported major after reading breaking changes and running security/E2E checks. Never enable experimental Blink features or remote code execution paths.

## Fastify API standards

- Build each capability as an encapsulated Fastify plugin. Register infrastructure first, then authentication/authorization, then capability routes. Avoid mutable process-wide singletons.
- Define request and response schemas for every route. Reject unknown or malformed external input before business logic and serialize only declared response fields.
- Do not perform database access in schema validation. Run asynchronous authorization and existence checks in hooks/services after structural validation.
- Route handlers translate HTTP to application commands/queries. Domain services enforce rules. Repositories own Drizzle queries. React and route handlers contain no financial policy.
- Authenticate first and authorize every protected operation server-side using explicit permissions. A client-visible role or hidden button is never proof of authority.
- Use consistent error codes and HTTP status mapping. Do not catch an error merely to rethrow it or return HTTP 200 with an error payload.
- Apply bounded body sizes, timeouts, pagination limits, structured Pino logging, and secret redaction. Do not log full request bodies for authentication or payment endpoints.
- Health endpoints remain side-effect free. Liveness reports process health; readiness reports dependency/schema availability.

## PostgreSQL and Drizzle standards

- PostgreSQL is the final integrity boundary. Enforce invariants with `NOT NULL`, `CHECK`, `UNIQUE`/partial unique indexes, foreign keys, and explicit delete actions; API prechecks improve errors but never replace constraints.
- Name constraints and indexes by intent. Index foreign-key columns and measured query/filter paths. Verify important list/report queries with `EXPLAIN (ANALYZE, BUFFERS)` using representative synthetic volume before claiming performance.
- Define schema in Drizzle, generate SQL, then review the generated migration line by line. Commit schema, SQL, and metadata together. Production and CI apply committed migrations; never use `drizzle-kit push` as the deployment path.
- Migrations must be forward-safe, deterministic, and tested from an empty database plus the previous supported schema. Separate large backfills from blocking DDL when appropriate. Never edit an already-deployed migration.
- Keep transactions short and free of network/file/UI work. Pass the transaction handle through repositories so every write and audit entry uses the same connection.
- Choose concurrency control deliberately: database uniqueness for duplicate prevention; `SELECT ... FOR UPDATE` or advisory locks for ordered account-level work; Serializable transactions only with bounded retry for SQLSTATE `40001`. Acquire locks in a consistent order and handle `40P01` deadlocks with bounded whole-transaction retry.
- Never use read-then-insert, `MAX(number) + 1`, or application memory as a uniqueness/concurrency guarantee. Prefer sequences/identity columns, unique constraints, and idempotency keys.
- Parameterize all queries. Raw SQL requires placeholders, a reason Drizzle cannot express it clearly, and tests.

## React, TanStack, Tailwind, and shadcn standards

- Split container components that fetch/orchestrate from presentational components that render props and emit user actions. Components do not call `fetch`, preload APIs, or database code directly.
- Keep state at the lowest owner. Do not mirror props, query data, or derived values into local state. Use effects only to synchronize with external systems; event-driven work belongs in event handlers.
- TanStack Query owns server state. Use stable domain-based query keys, intentional `staleTime`, cancellation signals, explicit loading/error/empty states, and targeted invalidation after successful mutations.
- Do not optimistically update financial posting unless the server contract supplies idempotency and rollback behavior and the UX clearly shows pending state. Server response remains authoritative.
- TanStack Table is headless presentation state. Server owns filtering, sorting, pagination, totals, and permissions for large operational datasets; never load full production tables into the renderer.
- Use shadcn/ui as owned source code with consistent composition. Keep primitives under `components/ui`; product-specific components belong to their feature. Preserve Radix semantics, keyboard behavior, and accessible names when customizing.
- Use Tailwind theme tokens and shared variants. No ad hoc hex colors, spacing, z-index, inline styles, or duplicated class strings when a token/component variant fits. Dynamic runtime values are the limited inline-style exception.
- Every asynchronous screen has loading, success, empty, stale/refreshing, and recoverable error behavior. Every control has keyboard focus, disabled, busy, validation, and error states where applicable.
- Financial values use tabular numerals and right alignment. Status always uses text plus color/icon. Maintain WCAG 2.1 AA contrast and keyboard operation.

## Testing and quality gates

- Test behavior and contracts, not implementation details. Prefer real functions and adapters; mock only external boundaries. Restore mock state between tests.
- Pure financial rules receive table-driven unit tests for exact, boundary, invalid, and conservation cases. Property-based tests are preferred for allocation conservation when introduced.
- API tests use Fastify injection for validation, authorization, status codes, response shape, and safe errors. Database correctness uses real PostgreSQL, never an in-memory substitute.
- Integration tests cover migrations, named constraints, transaction rollback, idempotency, reversals, duplicates, lock ordering, serialization/deadlock retries, and at least three concurrent clients where relevant.
- Electron E2E tests use the built application and verify preload surface, security preferences, loading/error/recovery, keyboard access, and key workflows against the real test API/database.
- Tests must be deterministic: fixed clocks/IDs when time or randomness matters, synthetic fixtures, isolated `_test` database, no order dependence, and no network dependency unless the test explicitly owns it.
- A bug fix includes a regression test that fails for the root cause. Do not add tests that only restate the implementation or assert mocks were called without user/domain behavior.
- Before a milestone commit run `npm run check`, relevant integration tests, production build, and applicable Electron E2E. Record exact pass/fail counts and unresolved blockers.

## Dependency, security, and Git discipline

- Use the lockfile and `npm ci` for reproducible installs. Pin direct dependencies intentionally; inspect changelogs before major upgrades.
- Run `npm audit` and review provenance/maintenance for new packages. Do not apply `npm audit fix --force` blindly or downgrade core tools solely to silence a report.
- Never commit `.env`, credentials, local databases, proofs, backups, generated reports with sensitive data, or real customer information.
- Commit generated artifacts only when required for builds, migrations, or evidence. Do not commit `dist`, `out`, coverage, logs, local test output, or package caches.
- Commit only after the increment's checks pass, or explicitly label a checkpoint as blocked. Use imperative, meaningful messages such as `feat(api): add database readiness probe`.
- Never rewrite shared history, amend another contributor's commit, or discard unrelated workspace changes.

## Financial invariants (mandatory for all later financial work)

- Money is integer centavos (`bigint`) or exact decimals. JSON uses canonical integer strings. No floating-point money arithmetic.
- Enforce one finalized invoice per service account/period in the database, including concurrent requests.
- Allocate against oldest unpaid invoice first, with stable tie-breaking. Exact, partial, and advance payments retain every centavo; unallocated money remains customer credit.
- Receipt numbers are unique and never reused, including voided receipts. Use database-backed numbering, never `max + 1`.
- Finalized invoices, payments, receipts, allocations, and ledger history are never silently edited/deleted. Reversals preserve originals, link compensating entries, restore balances, and record actor/reason.
- Plan price changes affect future billing only. Persist historical invoice prices.
- GCash proof is unverified evidence. Only authorized verification can enable posting. Prevent duplicate canonical references in database constraints or an explicit audited exception workflow.
- Collector shortages/overages remain visible; closing requires authorized confirmation. Never force totals to balance.
- Post all financial effects, numbering, allocations, credit changes, and audit entries in one database transaction. Serialize competing postings on the same account and handle idempotency.
- Audit includes actor, action, timestamp, reason, and old/new values. Do not log secrets or sensitive credentials.
- Financial tests must cover happy paths, reversals, rollback, authorization, duplicates, and concurrent posting on real PostgreSQL. Do not claim mocks prove database correctness.

## Local verification

- `npm run check`: strict typecheck, lint, unit/API contract/component tests.
- `npm run test:integration`: real PostgreSQL migrations, constraints, rollback, readiness, and three-client reads in a dedicated `_test` database.
- `npm run test:e2e`: built Electron shell, secure bridge, and live API/database state transitions.
- `.local/` is a private, disposable development cluster; never point test reset utilities at an existing/production database.

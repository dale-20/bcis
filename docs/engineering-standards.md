# BCIS engineering standards reference

Last reviewed: 2026-10-09. This guide records why the enforceable rules in `AGENTS.md` exist. `AGENTS.md` is the concise authority during implementation; this file is the evidence and upgrade checklist.

## Source policy

Use official documentation for framework behavior, security, migration, and version decisions. Blog posts may help discovery but do not override primary sources. Check documentation for the installed major version before implementation.

## Electron and electron-vite

Electron's security checklist requires current Electron versions, context isolation, sandboxing, web security, restrictive CSP, limited navigation/windows, IPC sender validation, and no broad Electron API exposure. BCIS therefore treats the renderer as untrusted and exposes narrow use-case methods through preload.

- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security/)
- [Electron process model and context bridge](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [electron-vite environment boundaries](https://electron-vite.org/guide/env-and-mode)

Review on upgrade: Electron breaking changes, Chromium/Node versions, preload sandbox behavior, CSP, fuses, URL/origin validation, and E2E security assertions.

## TypeScript and Zod

TypeScript `strict` enables stronger correctness checks. This project also keeps unchecked-index and exact-optional checks because financial and API code must distinguish missing, undefined, and invalid data. Zod supplies runtime validation; inferred types prevent runtime/type drift.

- [TypeScript strict](https://www.typescriptlang.org/tsconfig/strict.html)
- [TypeScript TSConfig reference](https://www.typescriptlang.org/tsconfig/)
- [Zod basic usage](https://zod.dev/basics)

Review on upgrade: compiler flag changes, Zod parsing/refinement sequencing, error formatting, JSON Schema/route integration, and ESM behavior.

## Fastify

Fastify recommends schema-based request validation and response serialization. It warns against database access during initial validation; async work belongs after structural validation. Plugin encapsulation provides clear dependency and capability boundaries.

- [Fastify validation and serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/)
- [Fastify plugins and encapsulation](https://fastify.dev/docs/latest/Reference/Plugins/)
- [Fastify logging](https://fastify.dev/docs/latest/Reference/Logging/)

BCIS adds Zod at typed external boundaries while retaining the same rule: structural validation first, authorization and database work afterward. Every route declares its output contract so internal fields cannot leak by accident.

## Authentication and sessions

OWASP recommends Argon2id for new password stores and scrypt when Argon2id is unavailable, with a minimum scrypt profile of `N=2^17`, `r=8`, `p=1`. It also recommends generic authentication errors, server-side session state, cryptographically random opaque identifiers, idle and absolute timeouts, and session invalidation after security-sensitive events.

- [OWASP Password Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

BCIS uses Node's built-in scrypt implementation with that minimum profile to avoid a native runtime dependency. Password hashes carry their parameters and a random salt. Bearer tokens are 256 random bits; only SHA-256 token hashes are stored. Permission checks always run in Fastify, denied actions are audited, and seeded shared passwords block privileged operations until replaced.

## PostgreSQL and Drizzle

PostgreSQL documents constraints as the database mechanism for rejecting invalid state. Unique constraints create unique indexes, while foreign keys do not automatically index referencing columns. Serializable transactions can abort with serialization failures and require whole-transaction retry. Explicit locks can deadlock, so lock order and bounded retry matter.

- [PostgreSQL 18 constraints](https://www.postgresql.org/docs/18/ddl-constraints.html)
- [PostgreSQL 18 transaction isolation](https://www.postgresql.org/docs/18/transaction-iso.html)
- [PostgreSQL 18 explicit locking](https://www.postgresql.org/docs/18/explicit-locking.html)
- [Drizzle migrations](https://orm.drizzle.team/docs/migrations)
- [Drizzle indexes and constraints](https://orm.drizzle.team/docs/indexes-constraints)
- [Drizzle transactions](https://orm.drizzle.team/docs/transactions)

Review every migration for constraint names, null semantics, foreign-key delete/update actions, required referencing indexes, lock duration, data backfill, rollback/recovery plan, and effect on historical financial rows.

## React and TanStack

React recommends avoiding redundant, duplicated, contradictory, and deeply nested state. Effects synchronize with external systems; user-triggered work belongs in event handlers. TanStack Query considers data stale by default and may refetch on mount, focus, and reconnect, so each financial screen must set freshness intentionally. TanStack Table can paginate on the client or server; BCIS uses server operations for production-scale datasets.

- [React: choosing state structure](https://react.dev/learn/choosing-the-state-structure)
- [React: you might not need an effect](https://react.dev/learn/you-might-not-need-an-effect)
- [React: lifecycle of reactive effects](https://react.dev/learn/lifecycle-of-reactive-effects)
- [TanStack Query important defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults)
- [TanStack Query invalidation after mutations](https://tanstack.com/query/latest/docs/framework/react/guides/invalidations-from-mutations)
- [TanStack Table pagination](https://tanstack.com/table/latest/docs/guide/pagination)

Review on upgrade: query key factories, defaults, cancellation, mutation callbacks, cache invalidation, offline behavior, and table controlled-state APIs.

## Tailwind CSS and shadcn/ui

Tailwind v4 theme variables create shared utility tokens. State and responsive variants keep interaction behavior explicit. shadcn/ui distributes owned component source with a common composable interface, so BCIS customizes its local primitives while retaining accessible behavior.

- [Tailwind utility and state variants](https://tailwindcss.com/docs/styling-with-utility-classes)
- [Tailwind theme variables](https://tailwindcss.com/docs/theme)
- [shadcn/ui introduction](https://ui.shadcn.com/docs)
- [shadcn/ui official resources](https://ui.shadcn.com/docs/official)

Review local primitives after shadcn/Radix updates. Never replace accessible semantics with visually similar custom markup.

## Vitest and test design

Vitest's testing guidance starts from public contracts, representative inputs, boundary conditions, errors, and observable effects. Mock state must not leak between tests. BCIS reserves mocks for true external boundaries and uses real PostgreSQL for database behavior.

- [Vitest testing in practice](https://vitest.dev/guide/learn/testing-in-practice)
- [Vitest mock functions and cleanup](https://vitest.dev/guide/learn/mock-functions)
- [Vitest module mocking](https://vitest.dev/guide/mocking/modules)

Tests are evidence only for the layer they exercise. A mocked unit test does not prove a database constraint, transaction, Electron boundary, LAN concurrency, or generated report.

## Clean-code decision test

Before adding an abstraction, answer:

1. Which current duplication or change pressure does it remove?
2. Does its name use BCIS domain language?
3. Is its dependency direction clear?
4. Can its contract be tested without reaching through implementation details?
5. Does it preserve one authoritative source for state and calculations?

If these answers are unclear, keep the code direct until a second concrete use proves the abstraction.

Before merging a feature, confirm:

- external input is validated at the boundary;
- authorization and domain rules execute on the server;
- database constraints backstop concurrency-sensitive rules;
- writes, audit entries, and numbering share one transaction;
- UI covers loading, success, empty, stale/refreshing, validation, and failure states;
- logs and responses do not leak sensitive values;
- tests exercise the highest-risk behavior at the correct layer;
- documentation and the implementation checklist reflect the delivered behavior.

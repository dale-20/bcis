# Subscriber operations

The implemented subscriber increment uses shared Zod contracts, Fastify permission hooks, PostgreSQL transactions, a narrow Electron preload, TanStack Query, and TanStack Table.

## Available workflows

- Search subscribers by name, subscriber account, contact, address, or service account number.
- Filter by subscriber status, sort by account/name, and page on the server with a bounded page size.
- Open a profile containing identity, contacts, service addresses, and every service account with its plan, exact stored monthly rate, route, collector, and billing start date.
- Create one subscriber with one or more contacts, addresses, and service accounts in a single database transaction. Exactly one contact and one address must be primary.
- Choose only active seeded plans, collection areas, and collectors. The server reads the authoritative plan price rather than trusting a client-supplied amount.

`subscriber.view` protects list, profile, and reference queries. `subscriber.create` protects creation. Catalog creation routes use `plan.manage`, `collection.manage`, and `collector.manage`. A Cashier may search and view subscribers but receives HTTP 403 for subscriber creation and Admin-only catalog operations.

## Synthetic seed

`npm run db:seed:demo` seeds seven plans (three Internet, two Cable, two Combo), three areas, two collectors, 50 subscribers, and 65 service accounts. The first 15 subscribers have two service accounts and two service addresses. Identifiers are deterministic (`BCIS-00001`, `SVC-00001-1`) so search and profile demonstrations are repeatable. Re-running the command skips existing synthetic subscribers while upserting operational references; it also resets demo-account passwords as documented in the README.

## API surface

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/subscribers` | `subscriber.view` | Search, filter, sort, and paginate |
| GET | `/subscribers/:id` | `subscriber.view` | Detailed profile |
| POST | `/subscribers` | `subscriber.create` | Atomic nested creation |
| GET | `/reference-data` | `subscriber.view` | Active plans, areas, collectors |
| POST | `/service-plans` | `plan.manage` | Create a plan |
| POST | `/collection-areas` | `collection.manage` | Create an area |
| POST | `/collectors` | `collector.manage` | Create a collector |

Subscriber editing, archival, service changes after creation, and catalog management screens are not included in this increment.

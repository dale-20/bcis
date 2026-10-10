# Collections and receivables

Collection batches preserve a route-sheet snapshot for one collector, area, and collection date. Batch numbers come from PostgreSQL `collection_batch_number_seq`; a unique route/date key prevents duplicate batches. Each route row stores the subscriber, service account, installation address, current bill, arrears, and total due at creation time.

## Lifecycle and permissions

| Operation | Permission | State transition |
| --- | --- | --- |
| Create batch and route sheet | `collection.manage` | New batch is `OPEN` |
| Link a same-day posted payment | `collection.manage` | `OPEN` to `IN_PROGRESS` |
| Submit collector results | `collection.manage` | `OPEN`/`IN_PROGRESS` to `SUBMITTED` |
| Record remittance | `collection.reconcile` | `SUBMITTED` to `REMITTED` |
| Reconcile | `collection.reconcile` | `REMITTED` to `RECONCILED` |
| Close | `collection.close` | `RECONCILED` to `CLOSED` |

Remittance derives expected cash and noncash totals from linked posted payments. `difference_centavos` is always `remitted cash - expected cash`. A negative value is shortage; positive is overage. Reconciliation never changes that value. Closing a nonzero difference requires an authorized acknowledgement note, and the close audit retains the variance.

Database checks enforce lifecycle metadata. Triggers reject backward transitions, changes to route snapshots, edits to recorded collections, remittance mutation/deletion, and changes to a closed batch. Audit rows record actor, reason, request, before/after state, and financial totals.

## Receivable aging

`GET /receivables/aging` requires `receivables.view` and accepts an `asOf` date, `overdueOnly`, collector, area, page, and page size. Results and totals include only positive outstanding invoice balances.

| Bucket | Exact boundary |
| --- | --- |
| `CURRENT` | Due on or after `asOf` |
| `1_30` | 1 through 30 days overdue |
| `31_60` | 31 through 60 days overdue |
| `61_90` | 61 through 90 days overdue |
| `90_PLUS` | More than 90 days overdue |

Day 90 belongs only to `61_90`; `90_PLUS` begins at day 91. Bucket totals are computed over the full filtered result, independently of pagination, and sum to the reported outstanding total.

## Acceptance evidence

`apps/api/test/collections.integration.test.ts` uses disposable real PostgreSQL. AT-07 records ₱20,000 cash and ₱20,000 remittance, reconciles to zero, denies Cashier closing, and closes through the collection supervisor. AT-08 records ₱20,000 cash and ₱19,500 remittance, preserves the ₱500 shortage, rejects a silent close, and retains the shortage after an authorized acknowledged close. The suite also verifies route-sheet centavo conservation, immutable closed snapshots, collector/area management, aging reconciliation, exact boundaries, overdue filtering, and pagination.

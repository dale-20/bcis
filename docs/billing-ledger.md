# Monthly billing and subscriber ledger

## Posting rules

- The API accepts a calendar period in `YYYY-MM` form. PostgreSQL requires the stored cycle to span exactly the first through last day of that month.
- Only `ACTIVE` service accounts whose billing start date is on or before the period end are included.
- The invoice snapshots the service account's `current_rate_centavos`. Later plan or service-rate changes cannot alter the finalized invoice or its items.
- The normal invoice date is the service billing day within the period. During the first billed month, a later billing start date becomes the invoice date.
- The due day is used in the invoice month when it is on or after the invoice date. Otherwise it moves to the next month. Days beyond a month's length are clamped to its last day.
- No proration is applied in this increment. Every eligible active service receives its full stored monthly rate.
- A zero-rate service creates a finalized zero-balance `PAID` invoice and no zero-value ledger entry. Positive invoices finalize as `UNPAID`.

## Integrity and concurrency

`POST /billing/cycles/generate` requires `billing.generate`. It takes a transaction-scoped PostgreSQL advisory lock for the period. Cycle creation, invoice numbering, line items, ledger debits, audit evidence, and finalization commit together or roll back together.

Invoice numbers come from `invoice_number_seq` and use `INV-YYYYMM-NNNNNNNN`. Sequence gaps after a rolled-back transaction are valid; numbers are unique and are never derived from `MAX(number) + 1`.

The database unique constraint on `(service_account_id, billing_cycle_id)` is the final duplicate defense. Repeating or concurrently calling generation for a finalized period returns the existing totals and reports skipped duplicates without creating another invoice or ledger debit.

PostgreSQL triggers reject updates to finalized invoice identity, period, dates, total, finalization metadata, or line items, and reject finalized invoice deletion. Balance and status fields remain available to later controlled payment, overdue, credit, and void workflows.

## Exact money and ledger reproduction

All stored money uses PostgreSQL `bigint` centavos. JSON transports centavos as canonical integer strings, including signed strings where adjustments or running balances may require them. JavaScript floating-point arithmetic is not used.

`GET /subscribers/:id/ledger` requires `billing.view`. Entries are ordered by occurrence time, reference type, reference number, and immutable identifier. The API derives each running balance as cumulative debit minus credit, so repeated reads reproduce the same closing balance from stored history.

## API

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| POST | `/billing/cycles/generate` | `billing.generate` | Generate/finalize one monthly cycle atomically |
| GET | `/billing/cycles/:id` | `billing.view` | Read invoices and immutable line items |
| GET | `/subscribers/:id/ledger` | `billing.view` | Read chronological entries and running balances |

Payment allocation, adjustments, voiding, overdue transitions, date-range SOA rendering, and billing screens are later milestones.

# Payment posting and reversal

The API accepts authoritative money only as canonical positive integer-centavo strings. Cash posts immediately. GCash submission records the payment and proof as pending; it cannot allocate invoices, create a receipt, or credit the ledger until an authorized verification request succeeds.

## Routes

| Route | Permission | Result |
| --- | --- | --- |
| `POST /payments` | `payment.create` | Posts Cash or creates pending GCash. A UUID idempotency key is required. |
| `POST /payments/:id/gcash-verification` | `payment.verify_gcash` | Verifies and posts, or rejects, one pending GCash proof. |
| `POST /payments/:id/reverse` | `payment.reverse` | Preserves the payment, adds a linked reversal, voids its receipt, restores allocations/credit, and adds a compensating ledger entry. |

GCash references are trimmed and uppercased before storage. A case-insensitive partial unique index remains the final duplicate boundary. Proof metadata stores its SHA-256 digest, restricted MIME type, size, storage key, original name, status, verifier, and review time. The proof itself still requires the future restricted attachment-storage boundary.

## Posting transaction

One PostgreSQL transaction acquires an advisory lock for the idempotency key and subscriber. It then inserts or verifies the payment, locks outstanding invoices, allocates by `due_date`, `invoice_date`, `invoice_number`, and `id`, updates invoice balances/states, stores unapplied credit, obtains a receipt number from `receipt_number_seq`, posts the ledger credit, and appends audit evidence. Any failed step rolls back every effect. Three concurrent requests with one idempotency key return the same stored payment and receipt.

Reversal uses the same subscriber lock. It rejects payments that are not posted and credits that have already been consumed. The transaction restores each allocated invoice, marks unconsumed credit reversed, inserts `payment_reversals`, voids the receipt without reusing its number, marks the original payment reversed, posts a ledger debit, and appends actor/reason/before/after audit data.

Migration `0003_empty_gorgon.sql` adds receipt numbering, payment idempotency, allocation-conservation validation, and triggers that reject mutation or deletion of finalized payment, proof, allocation, receipt, reversal, credit origin, credit application, and ledger history.

## Acceptance evidence

`apps/api/test/payments.integration.test.ts` runs against disposable real PostgreSQL:

| Test | Proven result |
| --- | --- |
| AT-01 | ₱999 exact payment produces zero due, `PAID`, balanced ledger, and receipt. |
| AT-02 | ₱500 against ₱999 leaves ₱499 and `PARTIALLY_PAID`. |
| AT-03 | ₱3,000 against ₱1,000 stores ₱1,000 allocation plus ₱2,000 available credit. |
| AT-04 | ₱1,200 clears August first and leaves ₱798 on September. |
| AT-05 | GCash remains pending before review; verified canonical reference reuse returns conflict. |
| AT-06 | Reversal retains the original, links reversal/void/audit, restores the invoice, and compensates the ledger. |

The same suite proves Cashier reversal denial, concurrent idempotent replay, database-trigger immutability, and whole-transaction rollback on receipt failure.

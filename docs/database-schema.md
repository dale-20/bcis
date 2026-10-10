# Database schema

Migration `0001_true_nighthawk.sql` adds the normalized BCIS data model to the foundation schema. All monetary columns use signed or nonnegative PostgreSQL `bigint` centavos according to their meaning. Business dates use `date`; events use `timestamptz`.

| Domain | Tables | Key relationships and integrity rules |
| --- | --- | --- |
| Security | `users`, `roles`, `permissions`, `user_roles`, `role_permissions`, `user_sessions` | Normalized username and session-token hash are unique; assignments use composite keys; sessions reference users and carry idle/absolute expiry. |
| Subscribers | `subscribers`, `subscriber_contacts`, `subscriber_addresses` | Contacts and addresses are child records, allowing multiple values without repeating subscriber identity; account numbers are unique. |
| Service catalog/accounts | `service_types`, `service_plans`, `service_accounts`, `service_events` | Plans belong to types; service accounts belong to a subscriber, plan, and installation address; account numbers are unique; history is separate from current state. |
| Billing | `billing_cycles`, `invoices`, `invoice_items`, `adjustments`, `ledger_entries` | One invoice per service account and cycle is enforced by `invoices_service_cycle_uq`; finalized actor/time fields and child items preserve billed detail. Ledger entries are one-sided debit or credit records. |
| Payments | `payments`, `payment_allocations`, `payment_proofs`, `payment_reversals`, `receipts`, `subscriber_credits`, `credit_applications` | Allocations join payments to invoices; reversals preserve the original through a unique one-to-one link; receipt numbers are never reusable; unallocated value has an explicit credit record. |
| GCash | `payments`, `payment_proofs` | GCash requires a reference; a case-insensitive partial unique index blocks duplicate references; proof has an independent pending/verified/rejected status and verifier fields. |
| Collections | `collectors`, `collection_areas`, `collector_assignments`, `collection_batches`, `collection_batch_accounts`, `collector_remittances` | Time-bounded assignments preserve route history. One remittance belongs to a batch, and a check requires `difference = remitted cash - expected cash`, keeping shortage/overage visible. |
| Service operations | `suspension_records`, `reconnection_records` | Operational records reference the service account and actors; reconnection can link to the originating suspension. |
| Governance | `audit_logs`, `application_settings`, `backup_history`, `application_metadata` | Audit rows carry actor/session/action/reason/before/after/request metadata. A PostgreSQL trigger rejects audit updates and deletes. Metadata version 5 gates API readiness. |

Foreign keys use explicit delete behavior. Historical financial and operational records generally use `RESTRICT`; optional current assignments use `SET NULL`; pure authorization joins and sessions use `CASCADE` only where the parent identity owns the child. The schema adds indexes for subscriber lookup, service status/area/collector, invoice status/due date, payment date/reference, ledger chronology, collections, audit searches, and backup history.

Migration 0002 adds billing integrity and schema version 3. Migration 0003 adds receipt numbering, payment idempotency, immutable financial history, and schema version 4. Migrations 0004–0005 add sequenced collection batches, current/arrears route snapshots, lifecycle metadata checks, immutable recorded collections/remittances, and schema version 5. Backup execution remains a later milestone.


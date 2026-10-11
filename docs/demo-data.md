# Synthetic demo data

Run `npm run db:seed:demo` after migrations to populate the configured development database. The seed refreshes the seven role-specific demo accounts and the operational fixtures, then applies the financial workflow seed once. Set `DEMO_ACCOUNT_PASSWORD` in `apps/api/.env` before running it.

All subscriber, address, payment, GCash reference, and collection details created by the seed are synthetic. Billing cycles are generated through `BillingService`; payment, allocation, receipt, credit, proof, reversal, collection, and service-control history is created through its owning domain service. Amounts remain integer centavos. A database setting records completion so rerunning the command does not post duplicate financial workflows.

The demo data covers users, roles, permissions, user-role grants, service types and plans, collection areas and collectors, subscribers, contacts, addresses, service accounts and events, collector assignments, billing cycles, invoices and items, adjustments, ledger entries, payments, allocations, receipts, customer credits, payment proofs, reversals, collection batches and accounts, remittances, suspension and reconnection history, application settings, and audit records. Which suspension/reconnection records can be generated depends on overdue eligibility under the seeded service-control policy.

Some tables describe real runtime events and are deliberately not filled with fabricated rows: user sessions require an actual login, backup history requires an actual archive/verification operation, and application metadata is written by migrations. GCash proof attachments are valid tiny synthetic PNGs saved under `PAYMENT_PROOF_DIR`; they are not automatically trusted. The seed includes both a pending-verification payment and an authorized verified example.

The integration test `apps/api/test/seed-workflows.integration.test.ts` runs the seed against the isolated PostgreSQL `_test` database, asserts entity coverage, and verifies a second workflow-seed invocation does not add duplicate payments.

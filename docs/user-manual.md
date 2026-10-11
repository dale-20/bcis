# BCIS user manual

## Sign in

1. Start the BCIS desktop client while the API and PostgreSQL server are running.
2. Enter the assigned username and password.
3. Use the password provided by your administrator. The synthetic demo seed does not force a password change; replace demo passwords before deploying with real data.
4. Use **Sign out** in the sidebar account card when leaving the workstation.

Five failed attempts temporarily lock the account. Ask an administrator to investigate rather than repeatedly retrying.

## Dashboard

The dashboard shows live year-to-date posted collections, open and overdue balances, active subscribers, monthly collections, payment-method mix, aging, and recent receipts. Values come from the API. Refreshing the screen does not create financial records.

## Subscribers

Open **Subscribers** to search by identity or account data, filter status, sort, paginate, and open a profile. Administrators can select **New subscriber**, enter identity/contact/address data, add multiple service accounts, choose plans and routes, and submit validated data.

The profile shows service accounts, current rates, installation addresses, collection assignments, contacts, and permanent suspension/reconnection history. Historical financial data is never removed when a subscriber becomes inactive.

## Reports

Open **Reports**, choose a report and date range, then supply a subscriber or collector when required. Available report families include daily/weekly/monthly/annual collections, billing versus collection, billed revenue by plan/service/area, subscriber master list, payment methods, outstanding balances, AR aging, subscriber statement, collector assignment/remittance, adjustments, reversals, voided receipts, and user activity. The API filters reports by your assigned permissions.

- **Print** opens the clean print layout without navigation.
- **PDF** and **XLSX** ask where to save an audited server-generated export.
- Monetary totals are calculated by the API from posted records.

## Billing and account ledger

1. Open **Billing → Generate Billing**, choose a month, and review the eligible service count and total before generating.
2. If the preview reports zero eligible invoices, that service/period is already billed or is not eligible. Do not create a second invoice manually.
3. Open **Billing → Invoices** to search and inspect finalized invoice lines, due dates, balances, adjustments, and ledger references.
4. Open the subscriber profile's **Ledger** or **Statement** view to review opening, running, and closing balances. Use print/PDF/XLSX from Reports for a dated statement.
5. Authorized staff can post a debit/credit adjustment or void an untouched invoice with a reason. Finalized invoice values and history remain preserved.

## Payments and receipts

1. Open **Payments → Receive Payment**, find the subscriber, review the outstanding invoices and enter the amount and method.
2. Review the allocation preview. BCIS applies money to the oldest unpaid invoices first; any excess remains customer credit.
3. Confirm once. Wait for the server result and receipt number before starting another payment. Print the issued receipt from the receipt preview or payment detail.
4. For GCash, submit the reference, sender details, and proof. The payment remains pending until a user with verification permission reviews and explicitly verifies it.
5. Open **Payments → Payment History** for the permanent payment record. Authorized reversals require a reason, retain the original receipt as void, and create compensating entries.

## Collection route and remittance

1. Open **Collections → Collection Batches** and prepare a batch by collector, area, and collection date. The server snapshots the assigned route and current balances.
2. For each field collection, link an existing same-day posted receipt. Submit the route when the field work is complete.
3. Record the cash remitted. Compare expected and remitted cash; a shortage or overage remains visible and is never silently balanced.
4. A user with reconciliation permission records the reconciliation. An authorized closer confirms any remaining variance before closing. Print the route sheet from batch detail.

## Receivables and service control

Open **Receivables → Outstanding**, **Overdue**, or **Aging** and filter by route, plan, service type, or age. Day 90 belongs to the 61–90 bucket; older balances are 90+.

Request suspension from the qualifying service's row with an effective date and reason. An authorized approver confirms it. When the qualifying balance is paid, BCIS creates a reconnection request. Assign a technician and schedule the visit under **Services → Reconnection requests**; the technician completes assigned work in **My reconnection work**. Service history is retained.

## Administration

- **Users**: create staff with only the role they need, disable access, or reset a password. Server-side permissions remain authoritative.
- **Audit**: search by actor, action, time, or entity when your role has `audit.view`. Audit history is append-only.
- **Settings**: update billing and service-control policy; changes are audited and affect future operations according to their effective rules.
- **Backup & Restore**: create a verified database-plus-proof backup and save the archive to controlled storage. Owner restore approval is supported; production service stop/restart must follow the deployment runbook and has not been rehearsed on a live server.

## Connection diagnostics

Open **Connection** to see the configured API endpoint and database migration state. **Check again** retries. “Migration required” means the server database schema does not match the application; an administrator must run migrations.

## Financial workflows

Use the desktop screens for subscriber/service maintenance, monthly billing and invoices, payment posting/history/reversal, GCash proof review, collection batches/remittance, receivables and service control, user/audit/settings, and backup history/creation. The API enforces permissions and remains authoritative for every financial result. Some acceptance evidence is API integration coverage rather than a full desktop E2E; see `docs/acceptance-report.md` for passed, partial, and untested items.

## Backup and recovery

Open **Administration → Backup & Restore**, select **Create backup**, and wait for the API to verify the database dump and every included GCash proof. Check the VERIFIED status and SHA-256, then select **Save copy** to store the archive in an access-controlled location separate from the API/database host. Keep the archive encrypted and apply the organization's retention policy.

The Owner can approve recovery against a verified archive in the app; the separate operator command performs an offline staged cutover after the API is stopped. That workflow has only been rehearsed against a disposable `_test` database. Never restore into production without an approved maintenance window, tested service-manager steps, and a verified rollback archive. `npm run verify:restore` refuses any source that is not a disposable `_test` database.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| API unreachable | Start the API; confirm the configured server address and trusted-LAN firewall rule |
| Database unavailable | Start PostgreSQL and verify the server-side database configuration |
| Migration required | Run `npm run db:migrate` on the API server |
| Access denied | Sign in with the correct role; do not bypass the API |
| Demo password required | Complete the prompted password change |
| Export fails | Confirm `report.export`, choose a writable folder and retry |
| Windows warns about publisher | The laboratory installer is unsigned; verify its documented SHA-256 before use |

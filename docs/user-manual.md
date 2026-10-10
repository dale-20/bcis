# BCIS user manual

## Sign in

1. Start the BCIS desktop client while the API and PostgreSQL server are running.
2. Enter the assigned username and password.
3. Demo accounts must replace the seed password before using protected features.
4. Use **Sign out** in the sidebar account card when leaving the workstation.

Five failed attempts temporarily lock the account. Ask an administrator to investigate rather than repeatedly retrying.

## Dashboard

The dashboard shows live year-to-date posted collections, open and overdue balances, active subscribers, monthly collections, payment-method mix, aging, and recent receipts. Values come from the API. Refreshing the screen does not create financial records.

## Subscribers

Open **Subscribers** to search by identity or account data, filter status, sort, paginate, and open a profile. Administrators can select **New subscriber**, enter identity/contact/address data, add multiple service accounts, choose plans and routes, and submit validated data.

The profile shows service accounts, current rates, installation addresses, collection assignments, contacts, and permanent suspension/reconnection history. Historical financial data is never removed when a subscriber becomes inactive.

## Reports

Open **Reports**, choose a report and date range, then supply a subscriber or collector when required. Available reports are monthly collections, payment methods, outstanding balances, AR aging, subscriber statement, and collector remittance.

- **Print** opens the clean print layout without navigation.
- **PDF** and **XLSX** ask where to save an audited server-generated export.
- Monetary totals are calculated by the API from posted records.

## Connection diagnostics

Open **Connection** to see the configured API endpoint and database migration state. **Check again** retries. “Migration required” means the server database schema does not match the application; an administrator must run migrations.

## Financial workflows currently operated through API/test procedures

The domain services implement monthly billing, Cash/GCash posting, verification, reversals, collection batches and reconciliation, but their desktop operating screens are not complete. Do not ask ordinary users to run API commands. Until those screens exist, demonstrate these rules through the automated acceptance suite or an administrator-controlled API client in a laboratory environment.

## Backup procedure

The included restore verifier is for synthetic test data only:

```powershell
npm run verify:restore
```

It refuses non-test database names and requires an active Owner identity. Production backups must be scheduled and stored outside the application server with encryption and retention controls. Never restore a production database from an unverified file.

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

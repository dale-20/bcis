# Permission matrix

Authorization is evaluated by the Fastify API from database-backed role grants on every protected request. Desktop visibility is only a usability aid and never grants access. `OWNER` is the emergency/full-control role. `ADMIN` manages operations and users but cannot inspect audit records or restore backups. A dash means the role is denied.

| Permission | Owner | Admin | Cashier | Collection supervisor | Auditor | Technician | Viewer |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `dashboard.view` | ✓ | ✓ | ✓ | ✓ | ✓ | — | ✓ |
| `subscriber.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `subscriber.manage` | ✓ | ✓ | — | — | — | — | — |
| `plan.manage` | ✓ | ✓ | — | — | — | — | — |
| `service.view` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| `service.manage` | ✓ | ✓ | — | — | — | — | — |
| `service.status.update` | ✓ | ✓ | — | — | — | ✓ | — |
| `service.suspension.manage` | ✓ | ✓ | — | — | — | — | — |
| `service.reconnection.assign` | ✓ | ✓ | — | — | — | — | — |
| `service.reconnection.complete` | ✓ | ✓ | — | — | — | ✓ | — |
| `billing.view` | ✓ | ✓ | ✓ | — | ✓ | — | — |
| `billing.generate` | ✓ | ✓ | — | — | — | — | — |
| `billing.adjust` | ✓ | ✓ | — | — | — | — | — |
| `payment.create` | ✓ | ✓ | ✓ | — | — | — | — |
| `payment.verify_gcash` | ✓ | ✓ | ✓ | — | — | — | — |
| `payment.reverse` | ✓ | ✓ | — | — | — | — | — |
| `receipt.void` | ✓ | ✓ | — | — | — | — | — |
| `collection.view` | ✓ | ✓ | — | ✓ | ✓ | — | — |
| `collection.manage` | ✓ | ✓ | — | ✓ | — | — | — |
| `collection.reconcile` | ✓ | ✓ | — | ✓ | — | — | — |
| `collection.close` | ✓ | ✓ | — | ✓ | — | — | — |
| `receivables.view` | ✓ | ✓ | — | ✓ | ✓ | — | — |
| `report.view` | ✓ | ✓ | — | ✓ | ✓ | — | ✓ |
| `report.export` | ✓ | ✓ | — | ✓ | ✓ | — | — |
| `audit.view` | ✓ | — | — | — | ✓ | — | — |
| `user.manage` | ✓ | ✓ | — | — | — | — | — |
| `settings.manage` | ✓ | ✓ | — | — | — | — | — |
| `backup.create` | ✓ | ✓ | — | — | — | — | — |
| `backup.restore` | ✓ | — | — | — | — | — | — |

The canonical matrix is `roleDefinitions` in `apps/api/src/auth/permissions.ts`. The seed reconciles `roles`, `permissions`, and `role_permissions` to that definition in one transaction.

## Protected route map

| Route | Access rule | Audit behavior |
| --- | --- | --- |
| `POST /auth/login` | Public; generic credential errors; account lock after five failed attempts | Success and failure recorded |
| `GET /auth/me` | Valid, active, unexpired bearer session | Session idle expiry is refreshed |
| `POST /auth/change-password` | Valid bearer session | Password change recorded; other active sessions revoked |
| `POST /auth/logout` | Valid bearer session | Session revoked and logout recorded |
| `GET /dashboard` | `dashboard.view`; collector names/routes/variance require `collection.view`, receipt/subscriber rows require `subscriber.view` | Aggregate finance totals remain available to dashboard roles; restricted row data is omitted server-side |
| `GET /admin/users` | Valid session, changed demo password, `user.manage` | Missing permission recorded as `authorization.denied` |
| `POST /admin/users`, `PATCH /admin/users/:userId` | Valid session and `user.manage`; granting/managing OWNER requires OWNER role | Creation/role/status changes are audited; deactivation revokes active sessions; at least one active Owner is preserved |
| `POST /admin/users/:userId/password-reset` | Valid session and `user.manage`; resetting an OWNER account requires OWNER role | Stores a new scrypt hash, forces password change, revokes active sessions, and records no password value |
| `GET /system/audit` | Valid session and `audit.view` | Read-only, server-filtered by actor/action/entity/date/request ID and paginated with before/after values |
| `POST /payments` | Valid session and `payment.create` | Posting or pending GCash submission is audited atomically |
| `POST /payments/gcash/proofs` | Valid session and `payment.create` | Type/size validation, generated key, uploader-bound staged file |
| `GET /payments/gcash/pending`, `GET /payments/:id/proof` | Valid session and `payment.verify_gcash` | Queue and attachment retrieval remain restricted to authorized reviewers |
| `GET /payments/preview` | Valid session and `payment.create` | Read-only oldest-first allocation estimate; no financial record is written |
| `GET /payments`, `GET /payments/:id` | Valid session and `billing.view` | Paginated payment/receipt history and immutable detail |
| `POST /payments/:id/gcash-verification` | Valid session and `payment.verify_gcash` | Verification/rejection records verifier, time, and audit evidence |
| `POST /payments/:id/reverse` | Valid session and both `payment.reverse` and `receipt.void` | Reversal reason, actor, restored value, receipt void, and audit are atomic |
| `GET /collections/reference-data` | Valid session and `collection.view` | Read-only collectors and areas |
| `GET /collection-batches` | Valid session and `collection.view` | Server-side paginated batch list with collected/uncollected counts and remittance variance |
| `GET /collection-batches/:id/accounts/:accountId/eligible-payments` | Valid session and `collection.manage` | Lists at most 25 unlinked, posted same-day receipts for the route subscriber |
| `POST /collection-batches` | Valid session and `collection.manage` | Route snapshot and expected receivable audited atomically |
| `POST /collection-batches/:id/collections` | Valid session and `collection.manage` | Links one same-day posted payment to one route row |
| `POST /collection-batches/:id/submit` | Valid session and `collection.manage` | Freezes collection recording and audits submission |
| `POST /collection-batches/:id/remittance` | Valid session and `collection.reconcile` | Stores exact expected/remitted/noncash/difference values |
| `POST /collection-batches/:id/reconcile` | Valid session and `collection.reconcile` | Records reconciler, time, and notes |
| `POST /collection-batches/:id/close` | Valid session and `collection.close` | Nonzero variance requires an explicit acknowledgement note |
| `GET /receivables/aging` | Valid session and `receivables.view` | Server-side aging, overdue filters, totals, and pagination |
| `GET /receivables/accounts` | Valid session and `receivables.view` | Filtered service-level arrears, overdue subscriber count, oldest due date, last payment, and exact totals |
| `GET`, `PUT /service-control/policy` | Valid session and `settings.manage` | Read/update grace days, threshold, and reconnection fee; every update is audited |
| `GET`, `PUT /system/settings` | Valid session and `settings.manage` | Read/update company report details and new-service billing/due-day defaults; updates are transactional and audited |
| `POST`, `GET /service-control/suspensions`, `POST /service-control/suspensions/:id/approve` | Valid session and `service.suspension.manage` | Delinquency threshold checked on request and rechecked transactionally at approval; approval changes service status and writes event/audit together |
| `GET /service-control/reconnections`, `GET /service-control/technicians`, `PATCH /service-control/reconnections/:id/assignment` | Valid session and `service.reconnection.assign` | Assign only an active Technician; the operation is audited |
| `GET /service-control/my-reconnections`, `POST /service-control/reconnections/:id/complete` | Valid session and `service.reconnection.complete`; completion also requires assignment to the signed-in user | Assigned Technician completion reactivates service, lifts its suspension, and records service-history/audit evidence atomically |
| `GET /system/backups`, `POST /system/backups`, `GET /system/backups/:id/download` | Valid session and `backup.create` | Lists history, creates and verifies a database-plus-proof archive, and revalidates it on download; creation is audited; missing permission is audited |
| `POST /system/restore/approval`, `POST /system/restore/cancel` | Valid session and Owner-only `backup.restore` | Approval is bound to a verified backup checksum and reason; starts a database-backed maintenance gate, audits approval, and drains/stops the API; cancellation clears an unexecuted approval and is audited |
| `npm run restore:approved` | Offline server operator; requires the active Owner approval and exact target database confirmation | Verifies archive and proofs, stages and checks a replacement, switches database names, retains the previous database/proof directory for rollback, clears maintenance, records restore audit/evidence; operator restarts the API |
| `GET /reports/data`, `GET /reports/export` for `USER_ACTIVITY` | `report.view` / `report.export`; additionally `audit.view` | Shows user/action/entity/reason/request activity without old/new payloads; activity export requires audit permission too |

Bearer values contain 256 random bits. PostgreSQL stores only their SHA-256 hashes. Sessions expire after 30 minutes idle or eight hours absolute time, and inactive users cannot authenticate. Passwords use salted scrypt with production parameters `N=131072`, `r=8`, `p=1`; hashes and tokens are excluded from audit payloads and response objects.

## Synthetic demo identities

Run `npm run db:seed:demo` with a unique `DEMO_ACCOUNT_PASSWORD` to create these development-only accounts: `owner.demo`, `admin.demo`, `cashier.demo`, `collections.demo`, `auditor.demo`, `technician.demo`, and `viewer.demo`. The seed is blocked when `NODE_ENV=production`. All accounts must replace the shared seed password through `/auth/change-password` before a permission-protected operation succeeds. Re-running the seed resets only these demo identities to the configured password and restores their password-change flags.


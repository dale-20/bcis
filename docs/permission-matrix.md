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
| `GET /admin/users` | Valid session, changed demo password, `user.manage` | Missing permission recorded as `authorization.denied` |
| `POST /payments` | Valid session and `payment.create` | Posting or pending GCash submission is audited atomically |
| `POST /payments/:id/gcash-verification` | Valid session and `payment.verify_gcash` | Verification/rejection records verifier, time, and audit evidence |
| `POST /payments/:id/reverse` | Valid session and `payment.reverse` | Reversal reason, actor, restored value, receipt void, and audit are atomic |
| `GET /collections/reference-data` | Valid session and `collection.view` | Read-only collectors and areas |
| `POST /collection-batches` | Valid session and `collection.manage` | Route snapshot and expected receivable audited atomically |
| `POST /collection-batches/:id/collections` | Valid session and `collection.manage` | Links one same-day posted payment to one route row |
| `POST /collection-batches/:id/submit` | Valid session and `collection.manage` | Freezes collection recording and audits submission |
| `POST /collection-batches/:id/remittance` | Valid session and `collection.reconcile` | Stores exact expected/remitted/noncash/difference values |
| `POST /collection-batches/:id/reconcile` | Valid session and `collection.reconcile` | Records reconciler, time, and notes |
| `POST /collection-batches/:id/close` | Valid session and `collection.close` | Nonzero variance requires an explicit acknowledgement note |
| `GET /receivables/aging` | Valid session and `receivables.view` | Server-side aging, overdue filters, totals, and pagination |

Bearer values contain 256 random bits. PostgreSQL stores only their SHA-256 hashes. Sessions expire after 30 minutes idle or eight hours absolute time, and inactive users cannot authenticate. Passwords use salted scrypt with production parameters `N=131072`, `r=8`, `p=1`; hashes and tokens are excluded from audit payloads and response objects.

## Synthetic demo identities

Run `npm run db:seed:demo` with a unique `DEMO_ACCOUNT_PASSWORD` to create these development-only accounts: `owner.demo`, `admin.demo`, `cashier.demo`, `collections.demo`, `auditor.demo`, `technician.demo`, and `viewer.demo`. The seed is blocked when `NODE_ENV=production`. All accounts must replace the shared seed password through `/auth/change-password` before a permission-protected operation succeeds. Re-running the seed resets only these demo identities to the configured password and restores their password-change flags.


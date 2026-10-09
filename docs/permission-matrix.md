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

Bearer values contain 256 random bits. PostgreSQL stores only their SHA-256 hashes. Sessions expire after 30 minutes idle or eight hours absolute time, and inactive users cannot authenticate. Passwords use salted scrypt with production parameters `N=131072`, `r=8`, `p=1`; hashes and tokens are excluded from audit payloads and response objects.

## Synthetic demo identities

Run `npm run db:seed:demo` with a unique `DEMO_ACCOUNT_PASSWORD` to create these development-only accounts: `owner.demo`, `admin.demo`, `cashier.demo`, `collections.demo`, `auditor.demo`, `technician.demo`, and `viewer.demo`. The seed is blocked when `NODE_ENV=production`. All accounts must replace the shared seed password through `/auth/change-password` before a permission-protected operation succeeds.


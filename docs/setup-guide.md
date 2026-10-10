# BCIS setup and deployment guide

## Development workstation

Required: Windows 10/11, Node.js 24 LTS, npm 11+, Git and PostgreSQL 18 binaries.

```powershell
npm ci
npm run setup
npm run db:local:init
npm run db:local:start
npm run db:migrate
npm run db:seed:demo
npm run dev
```

The isolated cluster listens on `127.0.0.1:55432` and leaves the Windows PostgreSQL service untouched. Secrets remain in ignored `.env` and `.local` files.

## Validation

```powershell
npm run check
npm run test:integration
npm run test:e2e
npm run verify:restore
npm run release:windows
```

Integration and E2E tests reset only the configured database ending in `_test`. Never point test commands at development or production data.

## API server for three clients

1. Install Node/PostgreSQL on the server and clone/copy the reviewed release source.
2. Create separate database roles and databases for production and test; grant the application role only required schema privileges.
3. Set `DATABASE_URL`, `API_HOST=0.0.0.0`, `API_PORT`, `NODE_ENV=production`, pool limits, and strong secrets in a server-only environment.
4. Apply committed migrations with `npm run db:migrate`.
5. Do not run demo seeding in production; it is blocked by the seed script.
6. Run the API under a Windows service account with no interactive login.
7. Terminate HTTPS at a trusted reverse proxy or configure an equivalent protected LAN transport.
8. Restrict the firewall to the three workstation addresses. Never expose PostgreSQL to desktop clients.

## Desktop installation

The x64 installer is `release/BCIS-Setup-0.1.0-x64.exe`. Its tested SHA-256 is `7F61EA3D473547CCB5558E565AE464DC39EB00B9129F2542CEB16508D1C07B98`. The laboratory build is not Authenticode-signed.

Before starting a client, configure its API origin through the deployment environment:

```powershell
$env:BCIS_API_URL='https://bcis-server.example.local'
```

Install and verify `/health/ready` from each of the three PCs. Test unique login sessions and a non-production concurrent posting rehearsal before go-live.

## Backup schedule

- Daily custom-format PostgreSQL backup; more frequent if business recovery objectives require it.
- SHA-256 verification, off-server encrypted copy, least-privilege storage, and documented retention.
- Back up proof attachments with the database backup once binary attachment storage exists.
- Monthly restore rehearsal into an isolated server. Run integrity checks and compare expected counts.
- Only Owner may approve a restore. Record incident, backup ID/hash, approver, start/end time, verification and outcome.

## Release build

`npm run release:windows` builds shared/API/desktop artifacts and an NSIS x64 installer. Code signing requires an organization-owned certificate supplied through the secured build environment. Do not commit certificate files or passwords.

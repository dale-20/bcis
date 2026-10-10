# BCIS backup and recovery

## Verified backup workflow

The Administration → Backup & Restore screen calls Fastify. Users with `backup.create` (Owner and Administrator) can create an archive and save it to a local operator-selected path. PostgreSQL remains accessible only through the API.

Each archive is a `.tar.gz` containing:

- `database.dump`: a PostgreSQL custom-format `pg_dump` export. `pg_restore --list` checks that the dump can be read.
- `proofs/`: every payment-proof file referenced by the database. The API compares each file's SHA-256 and byte count to `payment_proofs` before packaging.
- `manifest.json`: format version, dump checksum/size, and each proof's generated storage key, MIME type, checksum, size, and archive path.

The API extracts the finished archive into a private temporary directory and verifies the manifest, database dump, and every proof hash before it marks the history row `VERIFIED`. Downloads re-check the stored artifact checksum and contents. The API does not expose its storage paths. Configure `BACKUP_DIR`, `PAYMENT_PROOF_DIR`, `PG_BIN` (if PostgreSQL tools are not on `PATH`), and `TAR_BIN` in `apps/api/.env`.

Keep downloaded backups on access-controlled storage separate from the BCIS database host. The archive contains personal information and payment evidence. Restrict access, encrypt it at rest and in transit, and apply the organization's retention policy.

## Owner-approved recovery

Only an active Owner has `backup.restore`. In Administration → Backup & Restore, the Owner chooses a `VERIFIED` archive, enters a reason, and types `RESTORE`. Fastify records the approval, archive SHA-256, actor, and reason in an audit row and turns on the database-backed maintenance gate. The gate is checked by the API on every request, so all three desktop clients receive HTTP 503 while recovery is active. The API then drains and closes its listener and database pool.

After the API has stopped, an operator runs this from the application workspace on the API host, substituting the exact target database name from the server's `DATABASE_URL`:

```powershell
npm run restore:approved -- --backup-id <approved-backup-uuid> --confirm-database <exact-database-name>
```

The command requires `DATABASE_URL` plus an offline-only `RESTORE_DATABASE_URL` that connects to a maintenance database on the same PostgreSQL server. The restore credential needs authority to create a staging database, rename the target, and terminate sessions; store it only in the API host's ignored `.env` or a protected operator environment. The API does not load or use that credential. The target application role must own the target database and have the normal schema-write rights used for `pg_restore`.

Before cutover, the command verifies the active Owner approval, exact backup ID and checksum, archive paths and manifest, PostgreSQL dump readability, every proof attachment, the staged database, proof metadata, and PostgreSQL integrity. It refuses to proceed if any other connection remains on the target or if the typed database name differs from the configured target. It restores into a new database first, then renames the current database to a unique rollback name and switches the verified staging database into place. On a failed cutover it attempts to restore the old database name. The previous database and payment-proof directory are retained; keep them until the restored service is checked. The command marks the archive `RESTORED`, clears the gate, and records an audit entry in the restored database. It also writes a recovery evidence JSON beside the archive.

Once the command reports `RESTORED`, start the API through the deployment's service manager or `npm run start:api`. Restart is an explicit operator step because service supervision differs by Windows/LAN deployment. If approval was made but the restore command has not begun, restart the API and use **Cancel active maintenance approval** in the Owner screen; cancellation is permission-checked and audited. Do not point desktop clients directly at PostgreSQL or run restore commands from a client machine.

`npm run verify:restore` remains a non-destructive acceptance check against a separate `TEST_DATABASE_URL` ending in `_test`; it restores only to a derived clone and checks a post-backup mutation is absent. The integration suite also runs the approved offline cutover end to end against the disposable `_test` database, verifies the proof file and hashes, verifies audit and gate clearance, and removes the generated rollback database afterward. These checks exercise the recovery code without replacing a production database. AT-12 production recovery still needs a deployment-specific rehearsal and retained evidence.

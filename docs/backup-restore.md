# BCIS backup and recovery

## Verified backup workflow

The Administration → Backup & Restore screen calls Fastify. Users with `backup.create` (Owner and Administrator) can create an archive and save it to a local operator-selected path. PostgreSQL remains accessible only through the API.

Each archive is a `.tar.gz` containing:

- `database.dump`: a PostgreSQL custom-format `pg_dump` export. `pg_restore --list` checks that the dump can be read.
- `proofs/`: every payment-proof file referenced by the database. The API compares each file's SHA-256 and byte count to `payment_proofs` before packaging.
- `manifest.json`: format version, dump checksum/size, and each proof's generated storage key, MIME type, checksum, size, and archive path.

The API extracts the finished archive into a private temporary directory and verifies the manifest, database dump, and every proof hash before it marks the history row `VERIFIED`. Downloads re-check the stored artifact checksum and contents. The API does not expose its storage paths. Configure `BACKUP_DIR`, `PAYMENT_PROOF_DIR`, `PG_BIN` (if PostgreSQL tools are not on `PATH`), and `TAR_BIN` in `apps/api/.env`.

Keep downloaded backups on access-controlled storage separate from the BCIS database host. The archive contains personal information and payment evidence. Restrict access, encrypt it at rest and in transit, and apply the organization's retention policy.

## Restore verification and live recovery status

AT-12 currently restores into a separate disposable database derived from `TEST_DATABASE_URL`; the script rejects any source that does not end in `_test`. It extracts the archive, validates proof file hashes and sizes, restores the PostgreSQL dump, and compares subscriber/invoice/payment/ledger counts and foreign-key integrity. It also confirms a post-backup mutation is absent. The generated evidence is `tests/evidence/at12-backup-restore.json`.

Live database replacement is not available as an in-app action yet. The screen explains that live recovery requires an Owner-approved maintenance window and a stopped API. Do not restore over the active database from a desktop client: connected clients and API workers would keep using the target while it is replaced. Before operational deployment, implement an Owner approval record, distributed maintenance gate, controlled API shutdown/restart, and an operator-reviewed restore command, then test that complete cutover and retain its evidence. Until then, a verified archive and a passing clone-restore test are not a claim that production recovery is automated.

For the isolated AT-12 test, use `npm run verify:restore` only after configuring `TEST_DATABASE_URL` to the disposable `_test` database and `--approved-by` to an active synthetic Owner. It creates and drops only the derived `_restore_at12` clone; never set the source to a production database.

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { AuthContext } from '../auth/service.js';
import type { Database } from '../db/client.js';
import { auditLogs, backupHistory, paymentProofs } from '../db/schema.js';
import { AppError } from '../errors.js';
import { GcashProofStorage } from '../payments/proof-storage.js';

const execute = promisify(execFile);
const proofExtension: Record<string, string> = { 'image/jpeg': '.jpg', 'image/png': '.png', 'application/pdf': '.pdf' };
const sha256 = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
const manifestSchema = z.object({
  formatVersion: z.literal(1), createdAt: z.iso.datetime(),
  databaseDump: z.object({ path: z.literal('database.dump'), sha256: z.string().regex(/^[a-f0-9]{64}$/), sizeBytes: z.string().regex(/^\d+$/) }).strict(),
  proofs: z.array(z.object({ storageKey: z.uuid(), mimeType: z.enum(['image/jpeg', 'image/png', 'application/pdf']), sizeBytes: z.string().regex(/^[1-9]\d*$/), sha256: z.string().regex(/^[a-f0-9]{64}$/), archivePath: z.string() }).strict()),
}).strict();

interface BackupOptions {
  database: Database;
  proofStorage: GcashProofStorage;
  databaseUrl: string;
  directory: string;
  pgBin?: string;
  tarBin?: string;
}

export class BackupService {
  private readonly directory: string;
  constructor(private readonly options: BackupOptions) { this.directory = resolve(options.directory); }

  async create(actor: AuthContext, requestId: string, ipAddress: string): Promise<{ id: string; sha256: string; sizeBytes: string; status: 'VERIFIED'; createdAt: string }> {
    const id = randomUUID();
    const artifactPath = join(this.directory, `${id}.tar.gz`);
    const stagePath = join(this.directory, `.stage-${id}`);
    const dumpPath = join(stagePath, 'database.dump');
    await mkdir(this.directory, { recursive: true });
    await mkdir(join(stagePath, 'proofs'), { recursive: true });
    const [started] = await this.options.database.db.insert(backupHistory).values({ id, status: 'STARTED', storagePath: artifactPath, initiatedByUserId: actor.userId }).returning({ id: backupHistory.id });
    try {
      await this.dumpDatabase(dumpPath);
      const proofRows = await this.options.database.db.select({ storageKey: paymentProofs.storageKey, mimeType: paymentProofs.mimeType, sizeBytes: paymentProofs.sizeBytes, sha256: paymentProofs.sha256 }).from(paymentProofs).orderBy(paymentProofs.storageKey);
      const manifestProofs: Array<{ storageKey: string; mimeType: string; sizeBytes: string; sha256: string; archivePath: string }> = [];
      for (const proof of proofRows) {
        const mimeType = proof.mimeType;
        const extension = proofExtension[mimeType];
        if (!extension) throw new AppError(500, 'BACKUP_PROOF_METADATA_INVALID', 'A stored payment proof has unsupported metadata');
        const bytes = await this.options.proofStorage.read(proof.storageKey, mimeType as 'image/jpeg' | 'image/png' | 'application/pdf');
        const digest = sha256(bytes);
        if (digest !== proof.sha256 || BigInt(bytes.byteLength) !== proof.sizeBytes) throw new AppError(500, 'BACKUP_PROOF_INTEGRITY_FAILED', 'A stored payment proof failed its recorded checksum');
        const archivePath = `proofs/${proof.storageKey}${extension}`;
        await writeFile(join(stagePath, archivePath), bytes, { flag: 'wx', mode: 0o600 });
        manifestProofs.push({ storageKey: proof.storageKey, mimeType, sizeBytes: proof.sizeBytes.toString(), sha256: digest, archivePath });
      }
      const manifest = { formatVersion: 1, createdAt: new Date().toISOString(), databaseDump: { path: 'database.dump', sha256: sha256(await readFile(dumpPath)), sizeBytes: (await stat(dumpPath)).size.toString() }, proofs: manifestProofs };
      await writeFile(join(stagePath, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
      await this.createArchive(stagePath, artifactPath);
      const bytes = await readFile(artifactPath);
      await this.verifyArchive(artifactPath, bytes);
      const now = new Date();
      const digest = sha256(bytes);
      const size = BigInt(bytes.byteLength);
      await this.options.database.db.transaction(async (transaction) => {
        await transaction.update(backupHistory).set({ status: 'VERIFIED', sha256: digest, sizeBytes: size, completedAt: now, verifiedAt: now }).where(eq(backupHistory.id, id));
        await transaction.insert(auditLogs).values({ actorUserId: actor.userId, sessionId: actor.sessionId, action: 'backup.created', entityType: 'backup', entityId: id, newValues: { sha256: digest, sizeBytes: size.toString(), proofCount: manifestProofs.length }, requestId, ipAddress, createdAt: now });
      });
      return { id: started?.id ?? id, sha256: digest, sizeBytes: size.toString(), status: 'VERIFIED', createdAt: now.toISOString() };
    } catch (cause) {
      await rm(artifactPath, { force: true }).catch(() => undefined);
      await this.options.database.db.update(backupHistory).set({ status: 'FAILED', errorCode: cause instanceof AppError ? cause.code : 'BACKUP_FAILED', completedAt: new Date() }).where(eq(backupHistory.id, id)).catch(() => undefined);
      throw cause instanceof AppError ? cause : new AppError(500, 'BACKUP_FAILED', 'Backup creation or verification failed');
    } finally {
      await rm(stagePath, { recursive: true, force: true });
    }
  }

  async readVerified(id: string): Promise<{ bytes: Buffer; filename: string }> {
    const [row] = await this.options.database.db.select().from(backupHistory).where(eq(backupHistory.id, id)).limit(1);
    if (!row || row.status !== 'VERIFIED' || !row.sha256) throw new AppError(404, 'BACKUP_NOT_FOUND', 'Verified backup was not found');
    try {
      const resolved = resolve(row.storagePath);
      if (basename(resolved) !== `${id}.tar.gz` || extname(resolved) !== '.gz' || !resolved.startsWith(`${this.directory}/`) && !resolved.startsWith(`${this.directory}\\`)) throw new Error('invalid path');
      const bytes = await readFile(resolved);
      if (sha256(bytes) !== row.sha256 || BigInt(bytes.byteLength) !== row.sizeBytes) throw new Error('checksum mismatch');
      await this.verifyArchive(resolved, bytes);
      return { bytes, filename: `bcis-backup-${id}.tar.gz` };
    } catch {
      throw new AppError(409, 'BACKUP_INTEGRITY_FAILED', 'Backup file is unavailable or failed integrity verification');
    }
  }

  private async dumpDatabase(output: string): Promise<void> {
    const connection = new URL(this.options.databaseUrl);
    const executable = (name: string) => this.options.pgBin ? join(this.options.pgBin, `${name}${process.platform === 'win32' ? '.exe' : ''}`) : name;
    const dbName = decodeURIComponent(connection.pathname.slice(1));
    const env = { ...process.env, PGHOST: connection.hostname, PGPORT: connection.port || '5432', PGUSER: decodeURIComponent(connection.username), PGPASSWORD: decodeURIComponent(connection.password), PGSSLMODE: connection.searchParams.get('sslmode') ?? 'prefer' };
    await execute(executable('pg_dump'), ['--format=custom', '--compress=9', '--no-password', '--file', output, dbName], { env, windowsHide: true, timeout: 10 * 60_000, maxBuffer: 2 * 1024 * 1024 });
    await execute(executable('pg_restore'), ['--list', '--no-password', output], { env, windowsHide: true, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
  }

  private async createArchive(stage: string, output: string): Promise<void> {
    const tar = this.options.tarBin ?? 'tar';
    await execute(tar, ['-czf', output, '-C', stage, 'database.dump', 'manifest.json', 'proofs'], { windowsHide: true, timeout: 10 * 60_000, maxBuffer: 2 * 1024 * 1024 });
  }

  private async verifyArchive(archivePath: string, bytes: Buffer): Promise<void> {
    if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) throw new Error('invalid gzip archive');
    const listing = await execute(this.options.tarBin ?? 'tar', ['-tzf', archivePath], { windowsHide: true, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
    if (!listing.stdout.split(/\r?\n/).some((name) => name.replace(/^\.\//, '') === 'manifest.json') || !listing.stdout.split(/\r?\n/).some((name) => name.replace(/^\.\//, '') === 'database.dump')) throw new Error('archive contents invalid');
    const extractionPath = join(this.directory, `.verify-${randomUUID()}`);
    await mkdir(extractionPath, { recursive: true });
    try {
      await execute(this.options.tarBin ?? 'tar', ['-xzf', archivePath, '-C', extractionPath, '--no-same-owner'], { windowsHide: true, timeout: 10 * 60_000, maxBuffer: 2 * 1024 * 1024 });
      const manifest = manifestSchema.parse(JSON.parse(await readFile(join(extractionPath, 'manifest.json'), 'utf8')));
      const dump = await readFile(join(extractionPath, manifest.databaseDump.path));
      if (sha256(dump) !== manifest.databaseDump.sha256 || String(dump.byteLength) !== manifest.databaseDump.sizeBytes) throw new Error('database dump checksum mismatch');
      for (const proof of manifest.proofs) {
        const expectedPath = `proofs/${proof.storageKey}${proofExtension[proof.mimeType]}`;
        if (proof.archivePath !== expectedPath) throw new Error('unsafe proof path in manifest');
        const proofBytes = await readFile(join(extractionPath, expectedPath));
        if (sha256(proofBytes) !== proof.sha256 || String(proofBytes.byteLength) !== proof.sizeBytes) throw new Error('proof checksum mismatch');
      }
    } finally {
      await rm(extractionPath, { recursive: true, force: true });
    }
  }
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, HardDriveDownload, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { Button } from '../../components/ui/button';
import { approveBackupRestore, cancelBackupRestore, createBackup, downloadBackup, listBackups } from '../../services/api';

const timestamp = (value: string | null) => value ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

export function BackupsPage({ mayCreate, mayRestore, title, description }: { mayCreate: boolean; mayRestore: boolean; title: string; description: string }) {
  const client = useQueryClient();
  const [backupId, setBackupId] = useState('');
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const backups = useQuery({ queryKey: ['administration', 'backups'], queryFn: listBackups, staleTime: 15_000 });
  const create = useMutation({ mutationFn: createBackup, onSuccess: async () => { await client.invalidateQueries({ queryKey: ['administration', 'backups'] }); } });
  const download = useMutation({ mutationFn: downloadBackup });
  const approve = useMutation({ mutationFn: approveBackupRestore });
  const cancel = useMutation({ mutationFn: cancelBackupRestore, onSuccess: async () => { await client.invalidateQueries({ queryKey: ['administration', 'backups'] }); } });
  const selectedBackup = backups.data?.items.find((item) => item.id === backupId && item.status === 'VERIFIED');

  return <div className="content-enter space-y-5">
    <header className="page-heading"><h1>{title}</h1><p>{description} Create a verified database and GCash-proof archive, then save a copy for safekeeping.</p></header>
    {mayCreate && <section className="list-surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3"><span className="rounded-lg bg-primary/10 p-3 text-primary"><HardDriveDownload aria-hidden="true" /></span><div><h2 className="font-semibold">Create a recovery point</h2><p className="mt-1 text-sm text-secondary">The API checks the database dump and includes every proof attachment referenced by PostgreSQL.</p></div></div>
      <Button onClick={() => create.mutate()} disabled={create.isPending}><HardDriveDownload aria-hidden="true" />{create.isPending ? 'Creating and verifying…' : 'Create backup'}</Button>
    </section>}
    {create.isError && <p role="alert" className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">Backup failed: {create.error.message}</p>}
    {create.data && <p role="status" className="rounded-lg border border-success/30 bg-success/5 p-3 text-sm">Backup verified. SHA-256: <code className="break-all font-mono">{create.data.sha256}</code></p>}
    <section className="list-surface overflow-hidden" aria-label="Backup history">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4"><ShieldCheck className="size-5 text-primary" aria-hidden="true" /><h2 className="font-semibold">Backup history</h2></div>
      {backups.isPending ? <p className="p-5 text-sm text-secondary">Loading backup history…</p> : backups.isError ? <div className="p-5"><p role="alert">Backup history unavailable: {backups.error.message}</p><Button variant="outline" className="mt-3" onClick={() => void backups.refetch()}>Retry</Button></div> : backups.data.items.length === 0 ? <p className="p-5 text-sm text-secondary">No backups have been created.</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>Created</th><th>Status</th><th>Archive size</th><th>SHA-256</th><th>Verified</th><th><span className="sr-only">Actions</span></th></tr></thead><tbody>{backups.data.items.map((backup) => <tr key={backup.id}>
        <td className="whitespace-nowrap">{timestamp(backup.startedAt)}</td><td><span className={`status-badge ${backup.status === 'VERIFIED' || backup.status === 'RESTORED' ? 'status-active' : backup.status === 'FAILED' ? 'status-suspended' : 'status-pending'}`}>{backup.status}</span></td>
        <td className="tabular-nums">{backup.sizeBytes ? `${(Number(backup.sizeBytes) / (1024 * 1024)).toFixed(2)} MB` : '—'}</td><td className="max-w-64 truncate font-mono text-xs" title={backup.sha256 ?? undefined}>{backup.sha256 ?? backup.errorCode ?? '—'}</td><td>{timestamp(backup.verifiedAt)}</td><td><Button variant="outline" size="sm" disabled={backup.status !== 'VERIFIED' || download.isPending} onClick={() => download.mutate(backup.id)}><Download aria-hidden="true" /> Save copy</Button></td>
      </tr>)}</tbody></table></div>}
      {download.isError && <p role="alert" className="px-5 pb-4 text-sm text-danger">Download failed: {download.error.message}</p>}
      {download.isSuccess && download.data.saved && <p role="status" className="px-5 pb-4 text-sm text-secondary">Backup saved to {download.data.filename}.</p>}
    </section>
    {mayRestore && <section className="list-surface space-y-4 p-5" aria-labelledby="restore-heading">
      <div><h2 id="restore-heading" className="font-semibold">Owner-approved database recovery</h2><p className="mt-1 text-sm text-secondary">This starts a maintenance window, blocks all API clients, and shuts down the API. The server operator then restores into a staged database, verifies it, and switches databases while retaining the current database as a rollback copy.</p></div>
      <label className="block text-sm font-medium">Verified archive<select className="form-input mt-1" value={backupId} onChange={(event) => setBackupId(event.target.value)} disabled={!backups.data}><option value="">Choose a verified archive</option>{backups.data?.items.filter((item) => item.status === 'VERIFIED').map((item) => <option key={item.id} value={item.id}>{timestamp(item.verifiedAt)} · {item.id} · {item.sha256?.slice(0, 12)}</option>)}</select></label>
      <label className="block text-sm font-medium">Reason for recovery<textarea className="form-input mt-1 min-h-20" minLength={10} maxLength={255} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      <label className="block text-sm font-medium">Type RESTORE to approve the maintenance window<input className="form-input mt-1" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" /></label>
      <div className="flex flex-wrap gap-2"><Button disabled={!selectedBackup || reason.trim().length < 10 || confirmation !== 'RESTORE' || approve.isPending} onClick={() => approve.mutate({ backupId, reason, confirmation: 'RESTORE' })}>{approve.isPending ? 'Starting maintenance…' : 'Approve recovery and stop API'}</Button><Button variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate()}>{cancel.isPending ? 'Clearing gate…' : 'Cancel active maintenance approval'}</Button></div>
      {approve.isError && <p role="alert" className="text-sm text-danger">Recovery approval failed: {approve.error.message}</p>}
      {approve.data && <div role="status" className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm"><strong>Maintenance gate active.</strong><p className="mt-1">API clients are blocked and the API is shutting down. On the server, run this command after it has stopped:</p><code className="mt-2 block break-all rounded bg-surface p-2 font-mono">npm run restore:approved -- --backup-id {approve.data.backupId} --confirm-database YOUR_DATABASE_NAME</code><p className="mt-2">Replace YOUR_DATABASE_NAME with the exact database name from the server's DATABASE_URL. After the command reports RESTORED, start the API. The old database remains as a rollback copy.</p></div>}
      {cancel.isError && <p role="alert" className="text-sm text-danger">Maintenance cancellation failed: {cancel.error.message}</p>}
    </section>}
    <aside className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm"><strong>Recovery safety</strong><p className="mt-1 text-secondary">The restore command requires this database's active Owner approval, the archive checksum, the exact target database name, and no other API clients. It stages and checks the full restore before switching. Keep the rollback database until service and payment-proof checks pass.</p></aside>
  </div>;
}

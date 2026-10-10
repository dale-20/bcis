import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, HardDriveDownload, ShieldCheck } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { createBackup, downloadBackup, listBackups } from '../../services/api';

const timestamp = (value: string | null) => value ? new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '—';

export function BackupsPage({ mayCreate, title, description }: { mayCreate: boolean; title: string; description: string }) {
  const client = useQueryClient();
  const backups = useQuery({ queryKey: ['administration', 'backups'], queryFn: listBackups, staleTime: 15_000 });
  const create = useMutation({ mutationFn: createBackup, onSuccess: async () => { await client.invalidateQueries({ queryKey: ['administration', 'backups'] }); } });
  const download = useMutation({ mutationFn: downloadBackup });

  return <div className="content-enter space-y-5">
    <header className="page-heading"><h1>{title}</h1><p>{description} Create a verified database and GCash-proof archive, then save a copy for safekeeping.</p></header>
    <section className="list-surface flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3"><span className="rounded-lg bg-primary/10 p-3 text-primary"><HardDriveDownload aria-hidden="true" /></span><div><h2 className="font-semibold">Create a recovery point</h2><p className="mt-1 text-sm text-secondary">The API checks the database dump and includes every proof attachment referenced by PostgreSQL.</p></div></div>
      {mayCreate && <Button onClick={() => create.mutate()} disabled={create.isPending}><HardDriveDownload aria-hidden="true" />{create.isPending ? 'Creating and verifying…' : 'Create backup'}</Button>}
    </section>
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
    <aside className="rounded-lg border border-warning/30 bg-warning/5 p-4 text-sm"><strong>Restore procedure</strong><p className="mt-1 text-secondary">Restoring replaces the live database and must be performed by an Owner during a planned maintenance window with the API stopped. This screen creates and exports verified recovery archives; live replacement remains an operator-controlled server procedure.</p></aside>
  </div>;
}

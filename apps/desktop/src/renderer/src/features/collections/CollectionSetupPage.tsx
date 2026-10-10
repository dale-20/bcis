import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, MapPinned, Pencil, Plus, RotateCcw, UserRound, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import type { AuthenticatedUser, CollectionAreaCreate, CollectionReferenceCatalog, CollectorCreate } from '@bcis/shared';
import { PageError, PageLoading } from '../../components/PageFeedback';
import { Button } from '../../components/ui/button';
import { changeCollectionAreaStatus, changeCollectorStatus, createCollectionArea, createCollector, getCollectionReferences, updateCollectionArea, updateCollector } from '../../services/api';

type Area = CollectionReferenceCatalog['areas'][number];
type Collector = CollectionReferenceCatalog['collectors'][number];

function AreaEditor({ area, pending, error, onClose, onSave }: { area: Area | null; pending: boolean; error: string | null; onClose: () => void; onSave: (input: CollectionAreaCreate) => Promise<void> }) {
  const form = useForm<CollectionAreaCreate>({ defaultValues: area ? { code: area.code, name: area.name, description: area.description ?? '' } : { code: '', name: '', description: '' } });
  return <div className="dialog-backdrop"><section className="status-dialog reference-dialog" role="dialog" aria-modal="true" aria-labelledby="area-editor-title"><header className="dialog-heading"><div><h2 id="area-editor-title">{area ? 'Edit collection area' : 'New collection area'}</h2><p>Maintain the route identity used for service assignments.</p></div><button className="icon-button" onClick={onClose} aria-label="Close area form"><X /></button></header>{error && <div className="form-alert" role="alert">{error}</div>}<form onSubmit={form.handleSubmit(onSave)}><div className="form-grid"><label className="field-label"><span>Area code *</span><input className="text-input" {...form.register('code', { required: true })} /></label><label className="field-label"><span>Area name *</span><input className="text-input" {...form.register('name', { required: true })} /></label><label className="field-label"><span>Description</span><textarea className="text-area" rows={3} {...form.register('description')} /></label></div><footer className="form-actions"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? 'Saving…' : area ? 'Save area' : 'Create area'}</Button></footer></form></section></div>;
}

function CollectorEditor({ collector, pending, error, onClose, onSave }: { collector: Collector | null; pending: boolean; error: string | null; onClose: () => void; onSave: (input: CollectorCreate) => Promise<void> }) {
  const form = useForm<CollectorCreate>({ defaultValues: collector ? { collectorNumber: collector.collectorNumber, name: collector.name } : { collectorNumber: '', name: '' } });
  return <div className="dialog-backdrop"><section className="status-dialog reference-dialog" role="dialog" aria-modal="true" aria-labelledby="collector-editor-title"><header className="dialog-heading"><div><h2 id="collector-editor-title">{collector ? 'Edit collector' : 'New collector'}</h2><p>Maintain the field collector identity used for assignments.</p></div><button className="icon-button" onClick={onClose} aria-label="Close collector form"><X /></button></header>{error && <div className="form-alert" role="alert">{error}</div>}<form onSubmit={form.handleSubmit(onSave)}><div className="form-grid"><label className="field-label"><span>Collector number *</span><input className="text-input" {...form.register('collectorNumber', { required: true })} /></label><label className="field-label"><span>Collector name *</span><input className="text-input" {...form.register('name', { required: true })} /></label></div><footer className="form-actions"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? 'Saving…' : collector ? 'Save collector' : 'Create collector'}</Button></footer></form></section></div>;
}

export function CollectionSetupPage({ user, mode }: { user: AuthenticatedUser; mode: 'areas' | 'collectors' }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['collection-reference-data'], queryFn: getCollectionReferences });
  const [editor, setEditor] = useState<Area | Collector | 'new' | null>(null);
  const [statusTarget, setStatusTarget] = useState<Area | Collector | null>(null);
  const [reason, setReason] = useState('');
  const canManage = user.permissions.includes('collection.manage');
  const save = useMutation({ mutationFn: async (input: CollectionAreaCreate | CollectorCreate) => {
    if (editor === null) throw new Error('Select a maintenance operation');
    if (mode === 'areas') {
      if ('collectorNumber' in input) throw new Error('Invalid area input');
      if (editor === 'new') { await createCollectionArea(input); return getCollectionReferences(); }
      return updateCollectionArea(editor.id, input);
    }
    if ('code' in input) throw new Error('Invalid collector input');
    if (editor === 'new') { await createCollector(input); return getCollectionReferences(); }
    return updateCollector(editor.id, input);
  }, onSuccess: (catalog) => { client.setQueryData(['collection-reference-data'], catalog); void client.invalidateQueries({ queryKey: ['subscriber-reference-data'] }); setEditor(null); } });
  const status = useMutation({ mutationFn: () => {
    if (!statusTarget) throw new Error('Select a reference record');
    const input = { status: statusTarget.status === 'ACTIVE' ? 'INACTIVE' as const : 'ACTIVE' as const, reason: reason.trim() };
    return mode === 'areas' ? changeCollectionAreaStatus(statusTarget.id, input) : changeCollectorStatus(statusTarget.id, input);
  }, onSuccess: (catalog) => { client.setQueryData(['collection-reference-data'], catalog); void client.invalidateQueries({ queryKey: ['subscriber-reference-data'] }); setStatusTarget(null); setReason(''); } });
  if (query.isPending) return <PageLoading label={`Loading ${mode === 'areas' ? 'collection areas' : 'collectors'}…`} />;
  if (query.isError) return <PageError title="Collection setup unavailable" message={query.error.message} onRetry={() => void query.refetch()} />;
  const rows = mode === 'areas' ? query.data.areas : query.data.collectors;
  const title = mode === 'areas' ? 'Areas & routes' : 'Collectors';
  return <div className="content-enter"><header className="page-heading page-heading-actions"><div><h1>{title}</h1><p>{mode === 'areas' ? 'Maintain accountable collection territories used by service accounts.' : 'Maintain field collectors and their availability for route assignments.'}</p></div>{canManage && <Button onClick={() => { save.reset(); setEditor('new'); }}><Plus /> New {mode === 'areas' ? 'area' : 'collector'}</Button>}</header><section className="list-surface"><div className="reference-summary"><span>{mode === 'areas' ? <MapPinned /> : <UserRound />}</span><div><strong>{rows.filter((row) => row.status === 'ACTIVE').length}</strong><p>Active {mode === 'areas' ? 'areas' : 'collectors'}</p></div><div><strong>{rows.length}</strong><p>Total records</p></div></div><div className="reference-table" role="table" aria-label={title}><div className="reference-table-head" role="row"><span role="columnheader">{mode === 'areas' ? 'Area' : 'Collector'}</span><span role="columnheader">Code / number</span><span role="columnheader">Status</span><span role="columnheader">Created</span><span role="columnheader">Actions</span></div>{rows.map((row) => <div className="reference-table-row" role="row" key={row.id}><div role="cell"><strong>{row.name}</strong>{'description' in row && <small>{row.description ?? 'No description'}</small>}</div><span role="cell">{'code' in row ? row.code : row.collectorNumber}</span><span role="cell"><i className={`status-badge status-${row.status.toLowerCase()}`}>{row.status}</i></span><time role="cell">{new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(row.createdAt))}</time><div role="cell">{canManage && <><button onClick={() => { save.reset(); setEditor(row); }}><Pencil /> Edit</button><button onClick={() => { status.reset(); setStatusTarget(row); }}>{row.status === 'ACTIVE' ? <Archive /> : <RotateCcw />}{row.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</button></>}</div></div>)}</div></section>
    {editor && mode === 'areas' && <AreaEditor area={editor === 'new' ? null : editor as Area} pending={save.isPending} error={save.error?.message ?? null} onClose={() => setEditor(null)} onSave={async (input) => { await save.mutateAsync(input); }} />}
    {editor && mode === 'collectors' && <CollectorEditor collector={editor === 'new' ? null : editor as Collector} pending={save.isPending} error={save.error?.message ?? null} onClose={() => setEditor(null)} onSave={async (input) => { await save.mutateAsync(input); }} />}
    {statusTarget && <div className="dialog-backdrop"><section className="status-dialog" role="dialog" aria-modal="true" aria-labelledby="reference-status-title"><header className="dialog-heading"><div><h2 id="reference-status-title">{statusTarget.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} record</h2><p>{statusTarget.name}</p></div><button className="icon-button" onClick={() => setStatusTarget(null)} aria-label="Close status dialog"><X /></button></header><label className="field-label"><span>Reason *</span><textarea className="text-area" rows={4} value={reason} onChange={(event) => setReason(event.target.value)} /></label>{status.error && <div className="form-alert" role="alert">{status.error.message}</div>}<footer className="form-actions"><Button variant="outline" onClick={() => setStatusTarget(null)}>Cancel</Button><Button disabled={reason.trim().length < 3 || status.isPending} onClick={() => status.mutate()}>{status.isPending ? 'Saving…' : statusTarget.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}</Button></footer></section></div>}
  </div>;
}

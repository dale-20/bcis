import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import type { AuthenticatedUser, ServicePlanCatalog, ServicePlanCreate } from '@bcis/shared';
import { PageError, PageLoading } from '../../components/PageFeedback';
import { Button } from '../../components/ui/button';
import { changeServicePlanStatus, createServicePlan, getServicePlans, updateServicePlan } from '../../services/api';

type Plan = ServicePlanCatalog['plans'][number];
type FormValues = { serviceTypeId: string; code: string; name: string; pricePesos: string; installationFeePesos: string; reconnectionFeePesos: string; speedMbps: string; channelCount: string; description: string };

function pesos(centavos: string): string {
  return `${BigInt(centavos) / 100n}.${(BigInt(centavos) % 100n).toString().padStart(2, '0')}`;
}
function centavos(value: string): string | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match?.[1]) return null;
  return (BigInt(match[1]) * 100n + BigInt((match[2] ?? '').padEnd(2, '0') || '0')).toString();
}
function money(value: string): string {
  return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(Number(BigInt(value)) / 100);
}

function PlanEditor({ catalog, plan, pending, error, onClose, onSave }: { catalog: ServicePlanCatalog; plan: Plan | null; pending: boolean; error: string | null; onClose: () => void; onSave: (input: ServicePlanCreate) => Promise<void> }) {
  const form = useForm<FormValues>({ defaultValues: plan ? { serviceTypeId: plan.serviceTypeId, code: plan.code, name: plan.name, pricePesos: pesos(plan.priceCentavos), installationFeePesos: pesos(plan.installationFeeCentavos), reconnectionFeePesos: pesos(plan.reconnectionFeeCentavos), speedMbps: plan.speedMbps?.toString() ?? '', channelCount: plan.channelCount?.toString() ?? '', description: plan.description ?? '' } : { serviceTypeId: catalog.serviceTypes[0]?.id ?? '', code: '', name: '', pricePesos: '', installationFeePesos: '0.00', reconnectionFeePesos: '0.00', speedMbps: '', channelCount: '', description: '' } });
  const selectedTypeId = useWatch({ control: form.control, name: 'serviceTypeId' });
  const selectedType = catalog.serviceTypes.find((type) => type.id === selectedTypeId);
  const submit = form.handleSubmit(async (values) => {
    const price = centavos(values.pricePesos); const installation = centavos(values.installationFeePesos); const reconnection = centavos(values.reconnectionFeePesos);
    if (price === null || installation === null || reconnection === null) { form.setError('root', { message: 'Enter valid Philippine peso amounts with up to two decimal places' }); return; }
    const input: ServicePlanCreate = { serviceTypeId: values.serviceTypeId, code: values.code, name: values.name, priceCentavos: price, installationFeeCentavos: installation, reconnectionFeeCentavos: reconnection, description: values.description, ...(values.speedMbps ? { speedMbps: Number(values.speedMbps) } : {}), ...(values.channelCount ? { channelCount: Number(values.channelCount) } : {}) };
    await onSave(input);
  });
  return <div className="dialog-backdrop" role="presentation"><section className="service-dialog" role="dialog" aria-modal="true" aria-labelledby="plan-form-title"><header className="dialog-heading"><div><h2 id="plan-form-title">{plan ? 'Edit service plan' : 'New service plan'}</h2><p>Rate changes apply to future bills. Finalized invoice values remain unchanged.</p></div><button className="icon-button" onClick={onClose} aria-label="Close plan form"><X aria-hidden="true" /></button></header>{(error || form.formState.errors.root?.message) && <div className="form-alert service-alert" role="alert">{error ?? form.formState.errors.root?.message}</div>}<form className="service-form" onSubmit={submit}><div className="form-grid two-columns">
    <label className="field-label"><span>Service type *</span><select className="select-input" {...form.register('serviceTypeId', { required: true })}>{catalog.serviceTypes.filter((type) => type.isActive || type.id === plan?.serviceTypeId).map((type) => <option value={type.id} key={type.id}>{type.name}</option>)}</select></label>
    <label className="field-label"><span>Plan code *</span><input className="text-input" {...form.register('code', { required: true })} /></label>
    <label className="field-label span-two"><span>Plan name *</span><input className="text-input" {...form.register('name', { required: true })} /></label>
    <label className="field-label"><span>Monthly price (PHP) *</span><input className="text-input" inputMode="decimal" {...form.register('pricePesos', { required: true })} /></label>
    <label className="field-label"><span>Installation fee (PHP) *</span><input className="text-input" inputMode="decimal" {...form.register('installationFeePesos', { required: true })} /></label>
    <label className="field-label"><span>Reconnection fee (PHP) *</span><input className="text-input" inputMode="decimal" {...form.register('reconnectionFeePesos', { required: true })} /></label>
    {(selectedType?.category === 'INTERNET' || selectedType?.category === 'COMBO') && <label className="field-label"><span>Speed (Mbps) *</span><input className="text-input" type="number" min="1" {...form.register('speedMbps', { required: true })} /></label>}
    {(selectedType?.category === 'CABLE' || selectedType?.category === 'COMBO') && <label className="field-label"><span>Channel count *</span><input className="text-input" type="number" min="1" {...form.register('channelCount', { required: true })} /></label>}
    <label className="field-label span-two"><span>Description</span><textarea className="text-area" rows={3} {...form.register('description')} /></label>
  </div><footer className="form-actions"><Button type="button" variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? 'Saving…' : plan ? 'Save plan' : 'Create plan'}</Button></footer></form></section></div>;
}

export function PlansPage({ user }: { user: AuthenticatedUser }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['service-plans'], queryFn: getServicePlans });
  const [editor, setEditor] = useState<Plan | 'new' | null>(null);
  const [statusPlan, setStatusPlan] = useState<Plan | null>(null);
  const [reason, setReason] = useState('');
  const canManage = user.permissions.includes('plan.manage');
  const save = useMutation({ mutationFn: async (input: ServicePlanCreate) => { if (editor === null) throw new Error('Select a plan operation'); if (editor === 'new') { await createServicePlan(input); return getServicePlans(); } return updateServicePlan(editor.id, input); }, onSuccess: (catalog) => { client.setQueryData(['service-plans'], catalog); void client.invalidateQueries({ queryKey: ['subscriber-reference-data'] }); setEditor(null); } });
  const status = useMutation({ mutationFn: () => { if (!statusPlan) throw new Error('Select a service plan'); return changeServicePlanStatus(statusPlan.id, { isActive: !statusPlan.isActive, reason: reason.trim() }); }, onSuccess: (catalog) => { client.setQueryData(['service-plans'], catalog); void client.invalidateQueries({ queryKey: ['subscriber-reference-data'] }); setStatusPlan(null); setReason(''); } });
  if (query.isPending) return <PageLoading label="Loading service plans…" />;
  if (query.isError) return <PageError title="Service plans unavailable" message={query.error.message} onRetry={() => void query.refetch()} />;
  return <div className="content-enter"><header className="page-heading page-heading-actions"><div><h1>Services &amp; plans</h1><p>Maintain subscription products and future billing rates.</p></div>{canManage && <Button onClick={() => { save.reset(); setEditor('new'); }}><Plus aria-hidden="true" /> New plan</Button>}</header><section className="list-surface"><div className="plan-grid">{query.data.plans.map((plan) => <article className="plan-card" key={plan.id}><div className="plan-card-heading"><div><span>{plan.category}</span><h2>{plan.name}</h2><p>{plan.code}</p></div><span className={`status-badge status-${plan.isActive ? 'active' : 'inactive'}`}>{plan.isActive ? 'ACTIVE' : 'INACTIVE'}</span></div><strong className="plan-price">{money(plan.priceCentavos)}<small>/month</small></strong><dl><div><dt>Speed</dt><dd>{plan.speedMbps ? `${plan.speedMbps} Mbps` : '—'}</dd></div><div><dt>Channels</dt><dd>{plan.channelCount ?? '—'}</dd></div><div><dt>Installation</dt><dd>{money(plan.installationFeeCentavos)}</dd></div><div><dt>Reconnection</dt><dd>{money(plan.reconnectionFeeCentavos)}</dd></div></dl><p className="plan-description">{plan.description ?? 'No description.'}</p>{canManage && <footer><Button size="sm" variant="outline" onClick={() => { save.reset(); setEditor(plan); }}><Pencil aria-hidden="true" /> Edit</Button><Button size="sm" variant="outline" onClick={() => { status.reset(); setStatusPlan(plan); }}>{plan.isActive ? <Archive aria-hidden="true" /> : <RotateCcw aria-hidden="true" />}{plan.isActive ? 'Deactivate' : 'Activate'}</Button></footer>}</article>)}</div></section>
    {editor && <PlanEditor catalog={query.data} plan={editor === 'new' ? null : editor} pending={save.isPending} error={save.error?.message ?? null} onClose={() => setEditor(null)} onSave={async (input) => { await save.mutateAsync(input); }} />}
    {statusPlan && <div className="dialog-backdrop"><section className="status-dialog" role="dialog" aria-modal="true" aria-labelledby="plan-status-title"><header className="dialog-heading"><div><h2 id="plan-status-title">{statusPlan.isActive ? 'Deactivate' : 'Activate'} plan</h2><p>{statusPlan.code} · {statusPlan.name}</p></div><button className="icon-button" onClick={() => setStatusPlan(null)} aria-label="Close plan status dialog"><X /></button></header><label className="field-label"><span>Reason *</span><textarea className="text-area" rows={4} value={reason} onChange={(event) => setReason(event.target.value)} /></label>{status.error && <div className="form-alert" role="alert">{status.error.message}</div>}<footer className="form-actions"><Button variant="outline" onClick={() => setStatusPlan(null)}>Cancel</Button><Button disabled={reason.trim().length < 3 || status.isPending} onClick={() => status.mutate()}>{status.isPending ? 'Saving…' : statusPlan.isActive ? 'Deactivate' : 'Activate'}</Button></footer></section></div>}
  </div>;
}

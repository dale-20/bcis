import { X } from 'lucide-react';
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { serviceAccountMaintenanceSchema, type ReferenceData, type ServiceAccountMaintenance, type SubscriberDetail } from '@bcis/shared';
import { Button } from '../../components/ui/button';
import { getOrganizationSettings } from '../../services/api';

type Service = SubscriberDetail['services'][number];

interface Props {
  subscriber: SubscriberDetail;
  references: ReferenceData;
  service?: Service;
  pending: boolean;
  serverError: string | null;
  onCancel: () => void;
  onSubmit: (input: ServiceAccountMaintenance) => Promise<void>;
}

export function ServiceAccountForm({ subscriber, references, service, pending, serverError, onCancel, onSubmit }: Props) {
  const settings = useQuery({ queryKey: ['organization-settings'], queryFn: getOrganizationSettings });
  const values = useMemo<ServiceAccountMaintenance>(() => service ? {
    serviceAccountNumber: service.serviceAccountNumber,
    planId: service.planId,
    installationAddressId: service.installationAddressId,
    collectionAreaId: service.collectionAreaId,
    assignedCollectorId: service.assignedCollectorId,
    assignmentEffectiveFrom: new Date().toISOString().slice(0, 10),
    activationDate: service.activationDate ?? undefined,
    billingStartDate: service.billingStartDate,
    billingDay: service.billingDay,
    dueDay: service.dueDay,
  } : {
    serviceAccountNumber: '', planId: '', installationAddressId: subscriber.addresses[0]?.id ?? '',
    collectionAreaId: null, assignedCollectorId: null, assignmentEffectiveFrom: new Date().toISOString().slice(0, 10), billingStartDate: new Date().toISOString().slice(0, 10),
    billingDay: settings.data?.defaultBillingDay ?? subscriber.billingDay, dueDay: settings.data?.defaultDueDay ?? subscriber.dueDay,
  }, [service, subscriber, settings.data]);
  const form = useForm<ServiceAccountMaintenance>({ values });
  const submit = form.handleSubmit(async (values) => {
    const parsed = serviceAccountMaintenanceSchema.safeParse(values);
    if (!parsed.success) { form.setError('root', { message: parsed.error.issues[0]?.message ?? 'Review the service information' }); return; }
    await onSubmit(parsed.data);
  });
  const currentPlanMissing = service && !references.servicePlans.some((plan) => plan.id === service.planId);
  return <div className="dialog-backdrop" role="presentation"><section className="service-dialog" role="dialog" aria-modal="true" aria-labelledby="service-form-title">
    <header className="dialog-heading"><div><h2 id="service-form-title">{service ? 'Edit service account' : 'Add service account'}</h2><p>Set the plan, installation address, route, collector, and billing schedule.</p></div><button className="icon-button" type="button" onClick={onCancel} aria-label="Close service form"><X aria-hidden="true" /></button></header>
    {(serverError || form.formState.errors.root?.message) && <div className="form-alert service-alert" role="alert">{serverError ?? form.formState.errors.root?.message}</div>}
    <form className="service-form" onSubmit={submit}><div className="form-grid two-columns">
      <label className="field-label"><span>Service account number *</span><input className="text-input" {...form.register('serviceAccountNumber', { required: true })} /></label>
      <label className="field-label"><span>Plan *</span><select className="select-input" {...form.register('planId', { required: true })}>{currentPlanMissing && <option value={service.planId}>{service.planCode} · {service.planName} (inactive)</option>}<option value="">Select a plan</option>{references.servicePlans.map((plan) => <option key={plan.id} value={plan.id}>{plan.code} · {plan.name}</option>)}</select></label>
      <label className="field-label span-two"><span>Installation address *</span><select className="select-input" {...form.register('installationAddressId', { required: true })}>{subscriber.addresses.map((address) => <option key={address.id} value={address.id}>{address.line1}, {address.barangay}</option>)}</select></label>
      <label className="field-label"><span>Collection area</span><select className="select-input" {...form.register('collectionAreaId', { setValueAs: (value: string) => value || null })}><option value="">Unassigned</option>{references.collectionAreas.map((area) => <option key={area.id} value={area.id}>{area.name}</option>)}</select></label>
      <label className="field-label"><span>Assigned collector</span><select className="select-input" {...form.register('assignedCollectorId', { setValueAs: (value: string) => value || null })}><option value="">Unassigned</option>{references.collectors.map((collector) => <option key={collector.id} value={collector.id}>{collector.name}</option>)}</select></label>
      <label className="field-label"><span>Assignment effective from</span><input className="text-input" type="date" {...form.register('assignmentEffectiveFrom')} /></label>
      <label className="field-label"><span>Billing start *</span><input className="text-input" type="date" {...form.register('billingStartDate', { required: true })} /></label>
      <label className="field-label"><span>Activation date</span><input className="text-input" type="date" {...form.register('activationDate', { setValueAs: (value: string) => value || undefined })} /></label>
      <label className="field-label"><span>Billing day *</span><input className="text-input" type="number" min="1" max="28" {...form.register('billingDay', { valueAsNumber: true })} /></label>
      <label className="field-label"><span>Due day *</span><input className="text-input" type="number" min="1" max="31" {...form.register('dueDay', { valueAsNumber: true })} /></label>
    </div><footer className="form-actions"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? 'Saving…' : service ? 'Save service' : 'Add service'}</Button></footer></form>
  </section></div>;
}

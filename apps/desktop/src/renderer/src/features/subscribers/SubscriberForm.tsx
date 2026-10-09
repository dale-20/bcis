import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { subscriberCreateSchema, type ReferenceData, type SubscriberCreate } from '@bcis/shared';
import { Button } from '../../components/ui/button';

interface Props {
  references: ReferenceData;
  pending: boolean;
  serverError: string | null;
  onCancel: () => void;
  onSubmit: (input: SubscriberCreate) => Promise<void>;
}

const today = new Date().toISOString().slice(0, 10);

export function SubscriberForm({ references, pending, serverError, onCancel, onSubmit }: Props) {
  const form = useForm<SubscriberCreate>({ defaultValues: {
    accountNumber: '', firstName: '', middleName: '', lastName: '', organizationName: '', billingDay: 1, dueDay: 11,
    status: 'ACTIVE', notes: '',
    contacts: [{ type: 'MOBILE', value: '', isPrimary: true }],
    addresses: [{ type: 'SERVICE', line1: '', line2: '', barangay: '', municipality: 'Malaybalay City', province: 'Bukidnon', postalCode: '8700', isPrimary: true }],
    services: [{ serviceAccountNumber: '', planId: '', installationAddressIndex: 0, collectionAreaId: '', assignedCollectorId: '', billingStartDate: today, billingDay: 1, dueDay: 11, status: 'PENDING' }],
  } });
  const contacts = useFieldArray({ control: form.control, name: 'contacts' });
  const addresses = useFieldArray({ control: form.control, name: 'addresses' });
  const services = useFieldArray({ control: form.control, name: 'services' });
  const addressValues = useWatch({ control: form.control, name: 'addresses' });
  const contactValues = useWatch({ control: form.control, name: 'contacts' });

  const submit = form.handleSubmit(async (values) => {
    const parsed = subscriberCreateSchema.safeParse(values);
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? 'Review the highlighted subscriber information';
      form.setError('root', { message });
      return;
    }
    await onSubmit(parsed.data);
  });

  return <div className="content-enter form-page">
    <button className="back-button" onClick={onCancel}><ArrowLeft aria-hidden="true" /> Back to subscribers</button>
    <div className="form-heading"><div><h1>New subscriber</h1><p>Create the subscriber, addresses, and service accounts in one transaction.</p></div><span>Required fields are marked *</span></div>
    {(serverError || form.formState.errors.root?.message) && <div className="form-alert" role="alert">{serverError ?? form.formState.errors.root?.message}</div>}
    <form onSubmit={submit} className="subscriber-form">
      <section className="form-section"><div className="form-section-title"><h2>Subscriber identity</h2><p>Account ownership and billing schedule</p></div><div className="form-grid three-columns">
        <label className="field-label"><span>Account number *</span><input className="text-input" placeholder="BCIS-00051" {...form.register('accountNumber', { required: true })} /></label>
        <label className="field-label"><span>First name *</span><input className="text-input" {...form.register('firstName', { required: true })} /></label>
        <label className="field-label"><span>Middle name</span><input className="text-input" {...form.register('middleName')} /></label>
        <label className="field-label"><span>Last name *</span><input className="text-input" {...form.register('lastName', { required: true })} /></label>
        <label className="field-label"><span>Organization</span><input className="text-input" {...form.register('organizationName')} /></label>
        <label className="field-label"><span>Status *</span><select className="select-input" {...form.register('status')}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option><option value="SUSPENDED">Suspended</option></select></label>
        <label className="field-label"><span>Billing day *</span><input className="text-input" type="number" min="1" max="28" {...form.register('billingDay', { valueAsNumber: true })} /></label>
        <label className="field-label"><span>Due day *</span><input className="text-input" type="number" min="1" max="31" {...form.register('dueDay', { valueAsNumber: true })} /></label>
        <label className="field-label span-two"><span>Notes</span><textarea className="text-area" rows={3} {...form.register('notes')} /></label>
      </div></section>

      <section className="form-section"><div className="form-section-title with-action"><div><h2>Contacts</h2><p>One contact must be marked primary</p></div><Button type="button" variant="outline" size="sm" onClick={() => contacts.append({ type: 'MOBILE', value: '', isPrimary: false })}><Plus aria-hidden="true" /> Add contact</Button></div>
        <div className="repeat-list">{contacts.fields.map((field, index) => <div className="repeat-row contact-row" key={field.id}>
          <label className="field-label"><span>Type *</span><select className="select-input" {...form.register(`contacts.${index}.type`)}><option value="MOBILE">Mobile</option><option value="PHONE">Phone</option><option value="EMAIL">Email</option><option value="OTHER">Other</option></select></label>
          <label className="field-label grow"><span>Contact value *</span><input className="text-input" {...form.register(`contacts.${index}.value`, { required: true })} /></label>
          <label className="choice-label"><input type="radio" name="primary-contact" checked={contactValues[index]?.isPrimary ?? false} onChange={() => contacts.fields.forEach((_item, itemIndex) => form.setValue(`contacts.${itemIndex}.isPrimary`, itemIndex === index))} /> Primary</label>
          <button className="icon-button destructive" type="button" onClick={() => contacts.remove(index)} disabled={contacts.fields.length === 1} aria-label="Remove contact"><Trash2 aria-hidden="true" /></button>
        </div>)}</div>
      </section>

      <section className="form-section"><div className="form-section-title with-action"><div><h2>Service addresses</h2><p>Add every installation or billing location</p></div><Button type="button" variant="outline" size="sm" onClick={() => addresses.append({ type: 'SERVICE', line1: '', line2: '', barangay: '', municipality: 'Malaybalay City', province: 'Bukidnon', postalCode: '8700', isPrimary: false })}><Plus aria-hidden="true" /> Add address</Button></div>
        <div className="repeat-list">{addresses.fields.map((field, index) => <div className="repeat-card" key={field.id}><div className="repeat-card-heading"><strong>Address {index + 1}</strong><button className="icon-button destructive" type="button" onClick={() => addresses.remove(index)} disabled={addresses.fields.length === 1} aria-label="Remove address"><Trash2 aria-hidden="true" /></button></div><div className="form-grid three-columns">
          <label className="field-label"><span>Type *</span><select className="select-input" {...form.register(`addresses.${index}.type`)}><option value="SERVICE">Service</option><option value="BILLING">Billing</option><option value="MAILING">Mailing</option><option value="OTHER">Other</option></select></label>
          <label className="field-label span-two"><span>Street address *</span><input className="text-input" {...form.register(`addresses.${index}.line1`, { required: true })} /></label>
          <label className="field-label"><span>Unit / landmark</span><input className="text-input" {...form.register(`addresses.${index}.line2`)} /></label>
          <label className="field-label"><span>Barangay *</span><input className="text-input" {...form.register(`addresses.${index}.barangay`, { required: true })} /></label>
          <label className="field-label"><span>Municipality *</span><input className="text-input" {...form.register(`addresses.${index}.municipality`, { required: true })} /></label>
          <label className="field-label"><span>Province *</span><input className="text-input" {...form.register(`addresses.${index}.province`, { required: true })} /></label>
          <label className="field-label"><span>Postal code</span><input className="text-input" {...form.register(`addresses.${index}.postalCode`)} /></label>
          <label className="choice-label align-end"><input type="radio" name="primary-address" checked={addressValues[index]?.isPrimary ?? false} onChange={() => addresses.fields.forEach((_item, itemIndex) => form.setValue(`addresses.${itemIndex}.isPrimary`, itemIndex === index))} /> Primary address</label>
        </div></div>)}</div>
      </section>

      <section className="form-section"><div className="form-section-title with-action"><div><h2>Service accounts</h2><p>Assign the plan, location, route, and collector</p></div><Button type="button" variant="outline" size="sm" onClick={() => services.append({ serviceAccountNumber: '', planId: '', installationAddressIndex: 0, collectionAreaId: '', assignedCollectorId: '', billingStartDate: today, billingDay: form.getValues('billingDay'), dueDay: form.getValues('dueDay'), status: 'PENDING' })}><Plus aria-hidden="true" /> Add service</Button></div>
        <div className="repeat-list">{services.fields.map((field, index) => <div className="repeat-card" key={field.id}><div className="repeat-card-heading"><strong>Service {index + 1}</strong><button className="icon-button destructive" type="button" onClick={() => services.remove(index)} disabled={services.fields.length === 1} aria-label="Remove service"><Trash2 aria-hidden="true" /></button></div><div className="form-grid three-columns">
          <label className="field-label"><span>Service number *</span><input className="text-input" placeholder="SVC-00051-1" {...form.register(`services.${index}.serviceAccountNumber`, { required: true })} /></label>
          <label className="field-label span-two"><span>Plan *</span><select className="select-input" {...form.register(`services.${index}.planId`, { required: true })}><option value="">Select a plan</option>{references.servicePlans.map((plan) => <option value={plan.id} key={plan.id}>{plan.code} · {plan.name}</option>)}</select></label>
          <label className="field-label"><span>Installation address *</span><select className="select-input" {...form.register(`services.${index}.installationAddressIndex`, { valueAsNumber: true })}>{addressValues.map((address, addressIndex) => <option key={addressIndex} value={addressIndex}>{address.line1 || `Address ${addressIndex + 1}`}</option>)}</select></label>
          <label className="field-label"><span>Collection area *</span><select className="select-input" {...form.register(`services.${index}.collectionAreaId`, { required: true })}><option value="">Select an area</option>{references.collectionAreas.map((area) => <option value={area.id} key={area.id}>{area.name}</option>)}</select></label>
          <label className="field-label"><span>Assigned collector *</span><select className="select-input" {...form.register(`services.${index}.assignedCollectorId`, { required: true })}><option value="">Select a collector</option>{references.collectors.map((collector) => <option value={collector.id} key={collector.id}>{collector.name}</option>)}</select></label>
          <label className="field-label"><span>Billing start *</span><input className="text-input" type="date" {...form.register(`services.${index}.billingStartDate`, { required: true })} /></label>
          <label className="field-label"><span>Activation date</span><input className="text-input" type="date" {...form.register(`services.${index}.activationDate`, { setValueAs: (value: string) => value || undefined })} /></label>
          <label className="field-label"><span>Status *</span><select className="select-input" {...form.register(`services.${index}.status`)}><option value="PENDING">Pending</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option></select></label>
          <label className="field-label"><span>Billing day *</span><input className="text-input" type="number" min="1" max="28" {...form.register(`services.${index}.billingDay`, { valueAsNumber: true })} /></label>
          <label className="field-label"><span>Due day *</span><input className="text-input" type="number" min="1" max="31" {...form.register(`services.${index}.dueDay`, { valueAsNumber: true })} /></label>
        </div></div>)}</div>
      </section>

      <div className="form-actions"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? 'Creating subscriber…' : 'Create subscriber'}</Button></div>
    </form>
  </div>;
}


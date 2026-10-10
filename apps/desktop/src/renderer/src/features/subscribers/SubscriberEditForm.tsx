import { Plus, Trash2, X } from 'lucide-react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { subscriberUpdateSchema, type SubscriberDetail, type SubscriberUpdate } from '@bcis/shared';
import { Button } from '../../components/ui/button';

interface Props {
  subscriber: SubscriberDetail;
  pending: boolean;
  serverError: string | null;
  onCancel: () => void;
  onSubmit: (input: SubscriberUpdate) => Promise<void>;
}

export function SubscriberEditForm({ subscriber, pending, serverError, onCancel, onSubmit }: Props) {
  const form = useForm<SubscriberUpdate>({ defaultValues: {
    accountNumber: subscriber.accountNumber,
    firstName: subscriber.firstName,
    middleName: subscriber.middleName ?? '',
    lastName: subscriber.lastName,
    organizationName: subscriber.organizationName ?? '',
    billingDay: subscriber.billingDay,
    dueDay: subscriber.dueDay,
    notes: subscriber.notes ?? '',
    contacts: subscriber.contacts.map((contact) => ({ id: contact.id, type: contact.type, value: contact.value, isPrimary: contact.isPrimary })),
    addresses: subscriber.addresses.map((address) => ({ id: address.id, type: address.type, line1: address.line1, line2: address.line2 ?? '', barangay: address.barangay, municipality: address.municipality, province: address.province, postalCode: address.postalCode ?? '', isPrimary: address.isPrimary })),
  } });
  const contacts = useFieldArray({ control: form.control, name: 'contacts' });
  const addresses = useFieldArray({ control: form.control, name: 'addresses' });
  const contactValues = useWatch({ control: form.control, name: 'contacts' });
  const addressValues = useWatch({ control: form.control, name: 'addresses' });
  const usedAddressIds = new Set(subscriber.services.map((service) => service.installationAddressId));

  const submit = form.handleSubmit(async (values) => {
    const parsed = subscriberUpdateSchema.safeParse(values);
    if (!parsed.success) {
      form.setError('root', { message: parsed.error.issues[0]?.message ?? 'Review the subscriber information' });
      return;
    }
    await onSubmit(parsed.data);
  });

  return <div className="dialog-backdrop" role="presentation">
    <section className="edit-dialog" role="dialog" aria-modal="true" aria-labelledby="edit-subscriber-title">
      <header className="dialog-heading"><div><h2 id="edit-subscriber-title">Edit subscriber</h2><p>Update identity, billing schedule, contacts, and addresses.</p></div><button className="icon-button" type="button" onClick={onCancel} aria-label="Close edit subscriber"><X aria-hidden="true" /></button></header>
      {(serverError || form.formState.errors.root?.message) && <div className="form-alert" role="alert">{serverError ?? form.formState.errors.root?.message}</div>}
      <form onSubmit={submit} className="subscriber-form edit-form">
        <section className="form-section"><div className="form-section-title"><h3>Subscriber identity</h3><p>Account ownership and billing schedule</p></div><div className="form-grid three-columns">
          <label className="field-label"><span>Account number *</span><input className="text-input" {...form.register('accountNumber', { required: true })} /></label>
          <label className="field-label"><span>First name *</span><input className="text-input" {...form.register('firstName', { required: true })} /></label>
          <label className="field-label"><span>Middle name</span><input className="text-input" {...form.register('middleName')} /></label>
          <label className="field-label"><span>Last name *</span><input className="text-input" {...form.register('lastName', { required: true })} /></label>
          <label className="field-label"><span>Organization</span><input className="text-input" {...form.register('organizationName')} /></label>
          <label className="field-label"><span>Billing day *</span><input className="text-input" type="number" min="1" max="28" {...form.register('billingDay', { valueAsNumber: true })} /></label>
          <label className="field-label"><span>Due day *</span><input className="text-input" type="number" min="1" max="31" {...form.register('dueDay', { valueAsNumber: true })} /></label>
          <label className="field-label span-two"><span>Notes</span><textarea className="text-area" rows={3} {...form.register('notes')} /></label>
        </div></section>

        <section className="form-section"><div className="form-section-title with-action"><div><h3>Contacts</h3><p>Keep exactly one primary contact</p></div><Button type="button" variant="outline" size="sm" onClick={() => contacts.append({ type: 'MOBILE', value: '', isPrimary: false })}><Plus aria-hidden="true" /> Add contact</Button></div>
          <div className="repeat-list">{contacts.fields.map((field, index) => <div className="repeat-row contact-row" key={field.id}>
            <label className="field-label"><span>Type *</span><select className="select-input" {...form.register(`contacts.${index}.type`)}><option value="MOBILE">Mobile</option><option value="PHONE">Phone</option><option value="EMAIL">Email</option><option value="OTHER">Other</option></select></label>
            <label className="field-label grow"><span>Contact value *</span><input className="text-input" {...form.register(`contacts.${index}.value`, { required: true })} /></label>
            <label className="choice-label"><input type="radio" name="edit-primary-contact" checked={contactValues[index]?.isPrimary ?? false} onChange={() => contacts.fields.forEach((_item, itemIndex) => form.setValue(`contacts.${itemIndex}.isPrimary`, itemIndex === index))} /> Primary</label>
            <button className="icon-button destructive" type="button" onClick={() => contacts.remove(index)} disabled={contacts.fields.length === 1} aria-label="Remove contact"><Trash2 aria-hidden="true" /></button>
          </div>)}</div>
        </section>

        <section className="form-section"><div className="form-section-title with-action"><div><h3>Addresses</h3><p>Addresses assigned to services cannot be removed</p></div><Button type="button" variant="outline" size="sm" onClick={() => addresses.append({ type: 'SERVICE', line1: '', line2: '', barangay: '', municipality: 'Malaybalay City', province: 'Bukidnon', postalCode: '8700', isPrimary: false })}><Plus aria-hidden="true" /> Add address</Button></div>
          <div className="repeat-list">{addresses.fields.map((field, index) => {
            const inUse = Boolean(field.id && usedAddressIds.has(field.id));
            return <div className="repeat-card" key={field.id}><div className="repeat-card-heading"><strong>Address {index + 1}{inUse ? ' · Assigned to service' : ''}</strong><button className="icon-button destructive" type="button" onClick={() => addresses.remove(index)} disabled={addresses.fields.length === 1 || inUse} title={inUse ? 'Move the service to another address before removing this address' : undefined} aria-label="Remove address"><Trash2 aria-hidden="true" /></button></div><div className="form-grid three-columns">
              <label className="field-label"><span>Type *</span><select className="select-input" {...form.register(`addresses.${index}.type`)}><option value="SERVICE">Service</option><option value="BILLING">Billing</option><option value="MAILING">Mailing</option><option value="OTHER">Other</option></select></label>
              <label className="field-label span-two"><span>Street address *</span><input className="text-input" {...form.register(`addresses.${index}.line1`, { required: true })} /></label>
              <label className="field-label"><span>Unit / landmark</span><input className="text-input" {...form.register(`addresses.${index}.line2`)} /></label>
              <label className="field-label"><span>Barangay *</span><input className="text-input" {...form.register(`addresses.${index}.barangay`, { required: true })} /></label>
              <label className="field-label"><span>Municipality *</span><input className="text-input" {...form.register(`addresses.${index}.municipality`, { required: true })} /></label>
              <label className="field-label"><span>Province *</span><input className="text-input" {...form.register(`addresses.${index}.province`, { required: true })} /></label>
              <label className="field-label"><span>Postal code</span><input className="text-input" {...form.register(`addresses.${index}.postalCode`)} /></label>
              <label className="choice-label align-end"><input type="radio" name="edit-primary-address" checked={addressValues[index]?.isPrimary ?? false} onChange={() => addresses.fields.forEach((_item, itemIndex) => form.setValue(`addresses.${itemIndex}.isPrimary`, itemIndex === index))} /> Primary address</label>
            </div></div>;
          })}</div>
        </section>
        <footer className="form-actions"><Button type="button" variant="outline" onClick={onCancel}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? 'Saving changes…' : 'Save changes'}</Button></footer>
      </form>
    </section>
  </div>;
}

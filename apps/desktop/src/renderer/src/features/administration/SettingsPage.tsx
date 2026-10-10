import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { organizationSettingsSchema, defaultOrganizationSettings, type AuthenticatedUser, type OrganizationSettings } from '@bcis/shared';
import { useForm } from 'react-hook-form';
import { Button } from '../../components/ui/button';
import { PageError, PageLoading } from '../../components/PageFeedback';
import { getOrganizationSettings, updateOrganizationSettings } from '../../services/api';
import { ServiceControlPage } from '../services/ServiceControlPage';

export function SettingsPage({ user }: { user: AuthenticatedUser }) {
  const client = useQueryClient();
  const settings = useQuery({ queryKey: ['organization-settings'], queryFn: getOrganizationSettings });
  const form = useForm<OrganizationSettings>({ values: settings.data ?? defaultOrganizationSettings });
  const save = useMutation({ mutationFn: updateOrganizationSettings, onSuccess: async () => client.invalidateQueries({ queryKey: ['organization-settings'] }) });
  if (settings.isPending) return <PageLoading label="Loading application settings…" />;
  if (settings.isError) return <PageError title="Settings unavailable" message={settings.error.message} onRetry={() => void settings.refetch()} />;
  return <div className="service-control-workspace">
    <header className="page-heading"><span className="eyebrow">Administration</span><h1>Application settings</h1><p>Defaults guide new service schedules and identify the organization on reports.</p></header>
    <form className="list-surface service-policy-form" onSubmit={form.handleSubmit((value) => { const parsed = organizationSettingsSchema.safeParse(value); if (parsed.success) save.mutate(parsed.data); })}>
      <div className="section-heading"><div><h2>Company and billing defaults</h2><p>Updates are recorded in the Owner audit trail.</p></div></div>
      <label className="field-label"><span>Company name *</span><input className="text-input" maxLength={120} {...form.register('companyName', { required: true })} /></label>
      <label className="field-label"><span>Contact number</span><input className="text-input" maxLength={40} {...form.register('contactNumber')} /></label>
      <label className="field-label"><span>Company address</span><input className="text-input" maxLength={240} {...form.register('companyAddress')} /></label>
      <label className="field-label"><span>Report footer</span><input className="text-input" maxLength={240} {...form.register('reportFooter')} /></label>
      <label className="field-label"><span>Default billing day</span><input className="text-input" type="number" min={1} max={28} {...form.register('defaultBillingDay', { valueAsNumber: true })} /></label>
      <label className="field-label"><span>Default due day</span><input className="text-input" type="number" min={1} max={31} {...form.register('defaultDueDay', { valueAsNumber: true })} /></label>
      <div className="service-policy-actions"><Button type="submit" disabled={save.isPending}>{save.isPending ? 'Saving…' : 'Save settings'}</Button><Button type="button" variant="outline" onClick={() => form.reset(settings.data)} disabled={!form.formState.isDirty}>Discard changes</Button>{save.error && <p role="alert" className="form-alert">{save.error.message}</p>}</div>
    </form>
    <section className="list-surface p-5"><div className="section-heading"><div><h2>Financial numbering</h2><p>Numbers are issued from PostgreSQL sequences and are never reused.</p></div></div><p className="text-sm text-secondary">Official receipt format: <strong className="font-mono text-foreground">OR-{new Date().getFullYear()}-########</strong></p></section>
    <ServiceControlPage mode="policy" user={user} />
  </div>;
}

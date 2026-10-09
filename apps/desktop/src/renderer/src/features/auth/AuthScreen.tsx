import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Wifi } from 'lucide-react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import type { AuthenticatedUser } from '@bcis/shared';
import { Button } from '../../components/ui/button';

interface LoginValues { username: string; password: string }
interface ChangeValues { currentPassword: string; newPassword: string; confirmPassword: string }

interface Props {
  user: AuthenticatedUser | null;
  pending: boolean;
  error: string | null;
  onLogin: (values: LoginValues) => Promise<void>;
  onChangePassword: (values: { currentPassword: string; newPassword: string }) => Promise<void>;
}

function PasswordField({ label, registration, error, autoComplete = 'current-password' }: { label: string; registration: UseFormRegisterReturn; error: string | undefined; autoComplete?: 'current-password' | 'new-password' }) {
  const [visible, setVisible] = useState(false);
  const inputId = `auth-${registration.name}`;
  return <div className="field-label"><label htmlFor={inputId}>{label}</label><span className="password-field"><input id={inputId} className="text-input" type={visible ? 'text' : 'password'} autoComplete={autoComplete} {...registration} /><button type="button" className="icon-button" onClick={() => setVisible((value) => !value)} aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></span>{error && <span className="field-error">{error}</span>}</div>;
}

export function AuthScreen({ user, pending, error, onLogin, onChangePassword }: Props) {
  const loginForm = useForm<LoginValues>({ defaultValues: { username: '', password: '' } });
  const changeForm = useForm<ChangeValues>({ defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' } });
  const changing = user?.mustChangePassword === true;

  return <main className="auth-layout">
    <section className="auth-brand-panel" aria-label="BCIS application introduction">
      <div className="auth-brand"><span className="brand-mark"><Wifi aria-hidden="true" /></span><span>BCIS<small>Subscription Billing &amp; Collection</small></span></div>
      <div className="auth-message"><h1>One reliable view of every subscriber.</h1><p>Manage services, installation addresses, plans, routes, and assigned collectors from the secure office network.</p></div>
      <p className="auth-footnote">Bukidnon Cable and Internet Services</p>
    </section>
    <section className="auth-form-panel">
      <div className="auth-form-wrap content-enter">
        <span className="auth-lock"><LockKeyhole aria-hidden="true" /></span>
        <h2>{changing ? 'Secure your demo account' : 'Sign in to BCIS'}</h2>
        <p>{changing ? `Welcome, ${user.displayName}. Replace the shared seed password before continuing.` : 'Use your assigned office account to continue.'}</p>
        {error && <div className="form-alert" role="alert">{error}</div>}
        {changing ? <form onSubmit={changeForm.handleSubmit(async (values) => {
          if (values.newPassword !== values.confirmPassword) {
            changeForm.setError('confirmPassword', { message: 'Passwords do not match' });
            return;
          }
          await onChangePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword });
        })}>
          <PasswordField label="Current password" registration={changeForm.register('currentPassword', { required: 'Current password is required' })} error={changeForm.formState.errors.currentPassword?.message} />
          <PasswordField label="New password" autoComplete="new-password" registration={changeForm.register('newPassword', { required: 'New password is required', minLength: { value: 12, message: 'Use at least 12 characters' } })} error={changeForm.formState.errors.newPassword?.message} />
          <PasswordField label="Confirm new password" autoComplete="new-password" registration={changeForm.register('confirmPassword', { required: 'Confirm the new password' })} error={changeForm.formState.errors.confirmPassword?.message} />
          <Button className="auth-submit" disabled={pending}>{pending ? 'Updating password…' : <>Update password <ArrowRight aria-hidden="true" /></>}</Button>
        </form> : <form onSubmit={loginForm.handleSubmit(onLogin)}>
          <label className="field-label"><span>Username</span><input className="text-input" autoComplete="username" autoFocus {...loginForm.register('username', { required: 'Username is required' })} />{loginForm.formState.errors.username && <span className="field-error">{loginForm.formState.errors.username.message}</span>}</label>
          <PasswordField label="Password" registration={loginForm.register('password', { required: 'Password is required' })} error={loginForm.formState.errors.password?.message} />
          <Button className="auth-submit" disabled={pending}>{pending ? 'Signing in…' : <>Sign in <ArrowRight aria-hidden="true" /></>}</Button>
        </form>}
      </div>
    </section>
  </main>;
}


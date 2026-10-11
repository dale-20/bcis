import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { useForm, type UseFormRegisterReturn } from 'react-hook-form';
import type { AuthenticatedUser } from '@bcis/shared';
import { Button } from '../../components/ui/button';
import bcisMark from '../../assets/bcis-mark.png';
import loginBuddy from '../../assets/bcis-mascot-login.png';

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
      <div className="auth-network" aria-hidden="true">
        <svg viewBox="0 0 1200 1000" preserveAspectRatio="xMidYMid slice" focusable="false">
          <defs>
            <radialGradient id="auth-network-glow"><stop stopColor="#55baff" stopOpacity=".22" /><stop offset="1" stopColor="#55baff" stopOpacity="0" /></radialGradient>
          </defs>
          <circle cx="825" cy="500" r="330" fill="url(#auth-network-glow)" />
          <g className="auth-network-orbits" fill="none" stroke="currentColor">
            <ellipse cx="825" cy="500" rx="278" ry="338" strokeDasharray="2 12" />
            <ellipse cx="825" cy="500" rx="224" ry="278" strokeDasharray="1 10" />
          </g>
          <g className="auth-network-routes" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
            <path d="M520 244h128l76 76h174l92-92h142" />
            <path d="M485 672h156l82-82h174l94 94h134" />
            <path d="M704 180v96l-62 62v128" />
            <path d="M1004 404h-92l-55 55h-98" />
            <path d="M1092 552h-122l-66-66h-82" />
            <path d="M849 806v-86l-68-68v-76" />
          </g>
          <g className="auth-network-nodes">
            <circle cx="520" cy="244" r="4" /><circle cx="648" cy="244" r="4" />
            <circle cx="902" cy="320" r="5" /><circle cx="1032" cy="228" r="4" />
            <circle cx="485" cy="672" r="4" /><circle cx="641" cy="672" r="4" />
            <circle cx="897" cy="590" r="5" /><circle cx="1066" cy="760" r="4" />
            <circle cx="704" cy="180" r="4" /><circle cx="704" cy="446" r="4" />
            <circle cx="1004" cy="404" r="4" /><circle cx="759" cy="459" r="5" />
            <circle cx="1092" cy="552" r="4" /><circle cx="822" cy="486" r="4" />
            <circle cx="849" cy="806" r="4" /><circle cx="781" cy="576" r="4" />
          </g>
        </svg>
      </div>
      <div className="auth-brand">
        <span className="auth-brand-logo"><img src={bcisMark} alt="" /></span>
        <span className="auth-brand-copy"><strong>BCIS</strong><small>Subscription billing &amp; collection</small></span>
      </div>
      <div className="auth-hero-stage">
        <div className="auth-message"><h1>One reliable view of every subscriber.</h1><p>Manage services, installation addresses, plans, routes, and assigned collectors from the secure office network.</p></div>
        <div className="auth-hero-art"><img src={loginBuddy} alt="Buddy, the BCIS mascot, welcomes you." /></div>
      </div>
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
          <PasswordField label="New password" autoComplete="new-password" registration={changeForm.register('newPassword', { required: 'New password is required', minLength: { value: 8, message: 'Use at least 8 characters' } })} error={changeForm.formState.errors.newPassword?.message} />
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


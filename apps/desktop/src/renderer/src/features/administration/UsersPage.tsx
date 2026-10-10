import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createManagedUser, listManagedUsers, resetManagedUserPassword, updateManagedUser } from '../../services/api';
import { Button } from '../../components/ui/button';

const roles = ['OWNER', 'ADMIN', 'CASHIER', 'COLLECTION_SUPERVISOR', 'AUDITOR', 'TECHNICIAN', 'VIEWER'] as const;

export function UsersPage() {
  const queryClient = useQueryClient();
  const users = useQuery({ queryKey: ['administration', 'users'], queryFn: listManagedUsers });
  const [createError, setCreateError] = useState('');
  const [resetTarget, setResetTarget] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const create = useMutation({ mutationFn: createManagedUser, onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['administration', 'users'] }); setCreateError(''); } });
  const update = useMutation({ mutationFn: ({ id, role }: { id: string; role: typeof roles[number] }) => updateManagedUser(id, { role }), onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['administration', 'users'] }) });
  const toggle = useMutation({ mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => updateManagedUser(id, { isActive }), onSuccess: async () => queryClient.invalidateQueries({ queryKey: ['administration', 'users'] }) });
  const reset = useMutation({ mutationFn: ({ id, password }: { id: string; password: string }) => resetManagedUserPassword(id, password), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['administration', 'users'] }); setResetTarget(''); setTemporaryPassword(''); } });

  function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const username = String(form.get('username') ?? '').trim();
    const displayName = String(form.get('displayName') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const role = String(form.get('role') ?? 'CASHIER');
    if (!roles.includes(role as typeof roles[number])) return setCreateError('Select a valid system role.');
    void create.mutateAsync({ username, displayName, role: role as typeof roles[number], password }).then(() => formElement.reset()).catch((error: unknown) => setCreateError(error instanceof Error ? error.message : 'Unable to create user.'));
  }

  return <div className="content-enter space-y-6">
    <header className="page-heading"><h1>Users &amp; Roles</h1><p>Manage office accounts and role-based access. Passwords are never displayed.</p></header>
    <section className="admin-panel p-5">
      <h2 className="text-base font-semibold">Create staff account</h2>
      <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={submitCreate}>
        <label className="field-label">Username<input className="text-input" name="username" minLength={3} maxLength={64} required autoComplete="off" /></label>
        <label className="field-label">Display name<input className="text-input" name="displayName" maxLength={120} required /></label>
        <label className="field-label">Role<select className="select-input" name="role" defaultValue="CASHIER">{roles.map((role) => <option key={role}>{role}</option>)}</select></label>
        <label className="field-label">Temporary password<input className="text-input" name="password" type="password" minLength={8} maxLength={128} required autoComplete="new-password" /></label>
        <div className="md:col-span-4 flex items-center gap-3"><Button type="submit" disabled={create.isPending}>{create.isPending ? 'Creating…' : 'Create account'}</Button>{createError && <p role="alert" className="text-sm text-danger">{createError}</p>}</div>
      </form>
    </section>
    <section className="admin-panel overflow-hidden">
      {users.isPending ? <p className="p-6 text-sm text-secondary">Loading staff accounts…</p> : users.isError ? <div className="p-6"><p role="alert">Could not load users: {users.error.message}</p><Button variant="outline" className="mt-3" onClick={() => void users.refetch()}>Retry</Button></div> : users.data.items.length === 0 ? <p className="p-6 text-sm text-secondary">No staff accounts found.</p> : <div className="overflow-x-auto"><table className="data-table min-w-[780px]"><thead><tr><th>Account</th><th>Role</th><th>Status</th><th>Password</th><th className="text-right">Actions</th></tr></thead><tbody>{users.data.items.map((user) => <tr key={user.id}>
        <td><span className="font-medium">{user.displayName}</span><span className="block text-xs text-secondary">{user.username}</span></td>
        <td><label className="sr-only" htmlFor={`role-${user.id}`}>Role for {user.username}</label><select id={`role-${user.id}`} className="select-input min-w-48" value={roles.find((role) => user.roles.includes(role)) ?? 'VIEWER'} onChange={(event) => { const role = event.target.value; if (roles.includes(role as typeof roles[number])) update.mutate({ id: user.id, role: role as typeof roles[number] }); }} disabled={update.isPending}>{roles.map((role) => <option key={role}>{role}</option>)}</select></td>
        <td><span className={`status-badge ${user.isActive ? 'status-active' : 'status-inactive'}`}>{user.isActive ? 'Active' : 'Inactive'}</span></td>
        <td>{user.mustChangePassword ? <span className="status-badge status-suspended">Change required</span> : <span className="text-sm text-secondary">Current</span>}</td>
        <td><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { setResetTarget(user.id); setTemporaryPassword(''); }}>Reset password</Button><Button variant="outline" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: user.id, isActive: !user.isActive })}>{user.isActive ? 'Deactivate' : 'Activate'}</Button></div></td>
      </tr>)}</tbody></table></div>}
    </section>
    {resetTarget && <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4" role="presentation"><section role="dialog" aria-modal="true" aria-labelledby="reset-title" className="admin-panel w-full max-w-md p-6"><h2 id="reset-title" className="text-lg font-semibold">Set temporary password</h2><p className="mt-1 text-sm text-secondary">The account will be required to change it at next login.</p><label className="field-label mt-4">New temporary password<input className="text-input" type="password" minLength={8} maxLength={128} autoComplete="new-password" value={temporaryPassword} onChange={(event) => setTemporaryPassword(event.target.value)} /></label>{reset.isError && <p role="alert" className="mt-2 text-sm text-danger">{reset.error.message}</p>}<div className="mt-5 flex justify-end gap-2"><Button variant="outline" onClick={() => setResetTarget('')}>Cancel</Button><Button disabled={temporaryPassword.length < 8 || reset.isPending} onClick={() => reset.mutate({ id: resetTarget, password: temporaryPassword })}>{reset.isPending ? 'Saving…' : 'Reset password'}</Button></div></section></div>}
  </div>;
}

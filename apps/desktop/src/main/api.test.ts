import { describe, expect, it, vi } from 'vitest';
import { DesktopApiClient } from './api.js';

const user = {
  userId: '018f70ea-7c89-7b61-bef2-4dfb1aaf33d0', username: 'admin.demo', displayName: 'Demo Administrator',
  mustChangePassword: false, roles: ['ADMIN'], permissions: ['subscriber.view'],
};

describe('DesktopApiClient', () => {
  it('keeps the bearer token in the main process and attaches it to protected requests', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'private-token', expiresAt: new Date().toISOString(), user }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [], page: 1, pageSize: 20, total: 0, pageCount: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const api = new DesktopApiClient('http://127.0.0.1:3001', request as unknown as typeof fetch);
    await expect(api.login({ username: 'admin.demo', password: 'synthetic-password' })).resolves.toEqual({ ok: true, data: user });
    expect(api.session()).toEqual({ ok: true, data: user });
    await api.listSubscribers({ query: '', status: 'ALL', page: 1, pageSize: 20, sort: 'name', direction: 'asc' });
    const secondInit = request.mock.calls[1]?.[1] as RequestInit;
    expect(new Headers(secondInit.headers).get('Authorization')).toBe('Bearer private-token');
    expect(JSON.stringify(api.session())).not.toContain('private-token');
  });

  it('clears the local session after an unauthorized API response', async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'private-token', expiresAt: new Date().toISOString(), user }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'SESSION_INVALID', message: 'Authentication required' }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    const api = new DesktopApiClient('http://127.0.0.1:3001', request as unknown as typeof fetch);
    await api.login({ username: 'admin.demo', password: 'synthetic-password' });
    const result = await api.getReferenceData();
    expect(result).toEqual({ ok: false, error: { code: 'SESSION_INVALID', message: 'Authentication required' } });
    expect(api.session()).toEqual({ ok: true, data: null });
  });
});


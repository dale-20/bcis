import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkConnection } from './connection.js';

afterEach(() => vi.unstubAllGlobals());
describe('desktop connection service', () => {
  const endpoint = 'http://127.0.0.1:3001';
  const health = { service: 'bcis-api', status: 'ready', database: 'connected', timestamp: new Date().toISOString() };
  it('validates a real-shaped health response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(health)));
    expect(await checkConnection(endpoint)).toEqual({ ok: true, endpoint, health });
  });
  it('preserves degraded responses instead of calling the API offline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ ...health, status: 'degraded', database: 'unavailable' }, { status: 503 })));
    expect(await checkConnection(endpoint)).toMatchObject({ ok: true, health: { database: 'unavailable' } });
  });
  it('rejects malformed data and mismatched HTTP status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(health, { status: 503 })));
    expect(await checkConnection(endpoint)).toMatchObject({ ok: false, reason: 'invalid_response' });
  });
  it('reports network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    expect(await checkConnection(endpoint)).toMatchObject({ ok: false, reason: 'unreachable' });
  });
});

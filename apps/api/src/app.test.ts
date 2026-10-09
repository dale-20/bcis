import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from './app.js';
import { environmentSchema } from './config.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
describe('health endpoints', () => {
  it('reports liveness without probing the database', async () => {
    const probe = vi.fn().mockRejectedValue(new Error('private database detail'));
    const app = await buildApp({ probeDatabase: probe, logLevel: 'silent' }); apps.push(app);
    const response = await app.inject('/health');
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ service: 'bcis-api', status: 'ok' });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(probe).not.toHaveBeenCalled();
  });
  it.each(['connected', 'unavailable', 'migration_required'] as const)('reports database state %s truthfully', async (database) => {
    const app = await buildApp({ probeDatabase: async () => database, logLevel: 'silent' }); apps.push(app);
    const response = await app.inject('/health/ready');
    expect(response.statusCode).toBe(database === 'connected' ? 200 : 503);
    expect(response.json()).toMatchObject({ database, status: database === 'connected' ? 'ready' : 'degraded' });
  });
  it('contains database failures without leaking secrets', async () => {
    const app = await buildApp({ probeDatabase: async () => { throw new Error('secret password'); }, logLevel: 'silent' }); apps.push(app);
    const response = await app.inject('/health/ready');
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('secret');
  });
  it('closes its database on shutdown', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    const app = await buildApp({ probeDatabase: async () => 'connected', closeDatabase: close, logLevel: 'silent' });
    await app.close(); expect(close).toHaveBeenCalledOnce();
  });
  it('does not expose future business endpoints', async () => {
    const app = await buildApp({ probeDatabase: async () => 'connected', logLevel: 'silent' }); apps.push(app);
    expect((await app.inject({ method: 'POST', url: '/payments', payload: { amount: '99900' } })).statusCode).toBe(404);
  });
});
describe('environment validation', () => {
  it('rejects missing database configuration', () => { expect(environmentSchema.safeParse({}).success).toBe(false); });
  it('rejects invalid port and database protocol', () => {
    expect(environmentSchema.safeParse({ DATABASE_URL: 'https://example.test', API_PORT: 70000 }).success).toBe(false);
    expect(environmentSchema.safeParse({ DATABASE_URL: 'invalid' }).success).toBe(false);
  });
});

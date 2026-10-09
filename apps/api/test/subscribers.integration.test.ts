import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { ReferenceData, SubscriberCreate, SubscriberDetail, SubscriberListResponse } from '@bcis/shared';
import { buildApp } from '../src/app.js';
import { PasswordHasher, type ScryptParameters } from '../src/auth/password.js';
import { seedAuthorization, type DemoAccount } from '../src/auth/seed.js';
import { AuthService } from '../src/auth/service.js';
import { createDatabase } from '../src/db/client.js';
import { seedOperationalDemoData } from '../src/db/seed-operational.js';

config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test') || url === process.env.DATABASE_URL) {
  throw new Error('Set TEST_DATABASE_URL to a separate disposable database ending in _test.');
}

const password = 'Synthetic-demo-password-1';
const testHasher = new PasswordHasher({ cost: 16_384, blockSize: 8, parallelization: 1, keyLength: 32, saltLength: 16, maxMemory: 64 * 1024 * 1024 } satisfies ScryptParameters);
const accounts: readonly DemoAccount[] = [
  { username: 'admin.demo', displayName: 'Demo Administrator', role: 'ADMIN' },
  { username: 'cashier.demo', displayName: 'Demo Cashier', role: 'CASHIER' },
];
const database = createDatabase({ DATABASE_URL: url, DATABASE_POOL_MAX: 5 });
const authService = new AuthService(database, testHasher);
const app = await buildApp({ database, authService, probeDatabase: database.probe, logLevel: 'silent' });
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));

async function activatedToken(username: string, newPassword: string): Promise<string> {
  const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { username, password } });
  expect(login.statusCode).toBe(200);
  const token = login.json<{ token: string }>().token;
  const changed = await app.inject({ method: 'POST', url: '/auth/change-password', headers: { authorization: `Bearer ${token}` }, payload: { currentPassword: password, newPassword } });
  expect(changed.statusCode).toBe(204);
  return token;
}

beforeAll(async () => {
  await database.pool.query('DROP SCHEMA IF EXISTS public CASCADE');
  await database.pool.query('CREATE SCHEMA public');
  await database.pool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
  await migrate(database.db, { migrationsFolder });
  await seedAuthorization(database, password, testHasher, accounts);
  await seedOperationalDemoData(database);
});

afterAll(async () => {
  await app.close();
  await database.close();
});

describe.sequential('subscriber operations', () => {
  let adminToken = '';
  let cashierToken = '';
  let references: ReferenceData;

  it('activates Admin and Cashier sessions', async () => {
    adminToken = await activatedToken('admin.demo', 'Synthetic-admin-password-2');
    cashierToken = await activatedToken('cashier.demo', 'Synthetic-cashier-password-2');
  });

  it('serves deterministic server-side pages and global search', async () => {
    const first = await app.inject({ method: 'GET', url: '/subscribers?page=1&pageSize=10&sort=account&direction=asc', headers: { authorization: `Bearer ${adminToken}` } });
    expect(first.statusCode).toBe(200);
    const page = first.json<SubscriberListResponse>();
    expect(page).toMatchObject({ page: 1, pageSize: 10, total: 50, pageCount: 5 });
    expect(page.items).toHaveLength(10);
    expect(page.items[0]?.accountNumber).toBe('BCIS-00001');
    expect(page.items[0]).toMatchObject({
      primaryContact: '0917 555 0001',
      primaryAddress: '101 Mahogany Street, Casisang, Malaybalay City',
      serviceCount: 2,
      activeServiceCount: 2,
    });

    const searched = await app.inject({ method: 'GET', url: '/subscribers?query=Market%20Road&page=1&pageSize=20', headers: { authorization: `Bearer ${adminToken}` } });
    expect(searched.statusCode).toBe(200);
    expect(searched.json<SubscriberListResponse>().total).toBe(15);
  });

  it('returns a detailed profile with multiple service accounts and addresses', async () => {
    const list = await app.inject({ method: 'GET', url: '/subscribers?query=BCIS-00001&page=1&pageSize=10', headers: { authorization: `Bearer ${adminToken}` } });
    const id = list.json<SubscriberListResponse>().items[0]?.id;
    expect(id).toBeTypeOf('string');
    const profile = await app.inject({ method: 'GET', url: `/subscribers/${id}`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(profile.statusCode).toBe(200);
    expect(profile.json<SubscriberDetail>()).toMatchObject({ accountNumber: 'BCIS-00001' });
    expect(profile.json<SubscriberDetail>().services).toHaveLength(2);
    expect(profile.json<SubscriberDetail>().addresses).toHaveLength(2);
  });

  it('returns active plans, collection areas, and assigned collectors', async () => {
    const response = await app.inject({ method: 'GET', url: '/reference-data', headers: { authorization: `Bearer ${adminToken}` } });
    expect(response.statusCode).toBe(200);
    references = response.json<ReferenceData>();
    expect(references.servicePlans).toHaveLength(7);
    expect(references.collectionAreas).toHaveLength(3);
    expect(references.collectors).toHaveLength(2);
  });

  it('creates a subscriber and two services atomically from validated references', async () => {
    const planA = references.servicePlans[0];
    const planB = references.servicePlans[1];
    const area = references.collectionAreas[0];
    const collector = references.collectors[0];
    if (!planA || !planB || !area || !collector) throw new Error('Synthetic references missing');
    const input: SubscriberCreate = {
      accountNumber: 'BCIS-90001', firstName: 'Test', lastName: 'Subscriber', billingDay: 8, dueDay: 18, status: 'ACTIVE',
      contacts: [{ type: 'MOBILE', value: '0917 000 9001', isPrimary: true }],
      addresses: [
        { type: 'SERVICE', line1: '1 Integration Street', barangay: 'Casisang', municipality: 'Malaybalay City', province: 'Bukidnon', postalCode: '8700', isPrimary: true },
        { type: 'SERVICE', line1: '2 Integration Street', barangay: 'Sumpong', municipality: 'Malaybalay City', province: 'Bukidnon', postalCode: '8700', isPrimary: false },
      ],
      services: [
        { serviceAccountNumber: 'SVC-90001-1', planId: planA.id, installationAddressIndex: 0, collectionAreaId: area.id, assignedCollectorId: collector.id, billingStartDate: '2026-10-01', billingDay: 8, dueDay: 18, status: 'ACTIVE' },
        { serviceAccountNumber: 'SVC-90001-2', planId: planB.id, installationAddressIndex: 1, collectionAreaId: area.id, assignedCollectorId: collector.id, billingStartDate: '2026-10-01', billingDay: 8, dueDay: 18, status: 'PENDING' },
      ],
    };
    const response = await app.inject({ method: 'POST', url: '/subscribers', headers: { authorization: `Bearer ${adminToken}` }, payload: input });
    expect(response.statusCode).toBe(201);
    expect(response.json<SubscriberDetail>()).toMatchObject({ accountNumber: 'BCIS-90001' });
    expect(response.json<SubscriberDetail>().services).toHaveLength(2);
  });

  it('rolls back nested records when a unique account identifier conflicts', async () => {
    const before = await database.pool.query<{ count: string }>('SELECT count(*)::text AS count FROM subscriber_contacts');
    const plan = references.servicePlans[0];
    const area = references.collectionAreas[0];
    const collector = references.collectors[0];
    if (!plan || !area || !collector) throw new Error('Synthetic references missing');
    const response = await app.inject({ method: 'POST', url: '/subscribers', headers: { authorization: `Bearer ${adminToken}` }, payload: {
      accountNumber: 'BCIS-90001', firstName: 'Duplicate', lastName: 'Account', billingDay: 1, dueDay: 10, status: 'ACTIVE',
      contacts: [{ type: 'MOBILE', value: '0917 000 9999', isPrimary: true }],
      addresses: [{ type: 'SERVICE', line1: 'Duplicate Street', barangay: 'Casisang', municipality: 'Malaybalay City', province: 'Bukidnon', isPrimary: true }],
      services: [{ serviceAccountNumber: 'SVC-99999-1', planId: plan.id, installationAddressIndex: 0, collectionAreaId: area.id, assignedCollectorId: collector.id, billingStartDate: '2026-10-01', billingDay: 1, dueDay: 10, status: 'ACTIVE' }],
    } });
    expect(response.statusCode).toBe(409);
    const after = await database.pool.query<{ count: string }>('SELECT count(*)::text AS count FROM subscriber_contacts');
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });

  it('rejects structurally invalid subscriber forms', async () => {
    const response = await app.inject({ method: 'POST', url: '/subscribers', headers: { authorization: `Bearer ${adminToken}` }, payload: {
      accountNumber: 'bad value', firstName: '', lastName: '', billingDay: 0, dueDay: 40, contacts: [], addresses: [], services: [],
    } });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: 'VALIDATION_ERROR' });
  });

  it('allows Cashier to view subscribers but denies subscriber creation', async () => {
    expect((await app.inject({ method: 'GET', url: '/subscribers?page=1&pageSize=10', headers: { authorization: `Bearer ${cashierToken}` } })).statusCode).toBe(200);
    const denied = await app.inject({ method: 'POST', url: '/subscribers', headers: { authorization: `Bearer ${cashierToken}` }, payload: {} });
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).toMatchObject({ error: 'FORBIDDEN' });
  });

  it('creates plan, area, and collector references through protected Admin APIs', async () => {
    const serviceTypeId = references.servicePlans[0]?.serviceTypeId;
    if (!serviceTypeId) throw new Error('Synthetic service type missing');
    const plan = await app.inject({ method: 'POST', url: '/service-plans', headers: { authorization: `Bearer ${adminToken}` }, payload: {
      serviceTypeId, code: 'TEST-PLAN', name: 'Test Plan', priceCentavos: '123400', installationFeeCentavos: '0', reconnectionFeeCentavos: '0', speedMbps: 75,
    } });
    const area = await app.inject({ method: 'POST', url: '/collection-areas', headers: { authorization: `Bearer ${adminToken}` }, payload: { code: 'TEST-AREA', name: 'Test Area' } });
    const collector = await app.inject({ method: 'POST', url: '/collectors', headers: { authorization: `Bearer ${adminToken}` }, payload: { collectorNumber: 'COL-TEST', name: 'Test Collector' } });
    expect([plan.statusCode, area.statusCode, collector.statusCode]).toEqual([201, 201, 201]);
  });
});


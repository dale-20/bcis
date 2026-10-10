import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import type { CollectionReferenceCatalog, ReferenceData, ServiceAccountMaintenance, ServicePlanCatalog, SubscriberAudit, SubscriberCreate, SubscriberDetail, SubscriberFinancialProfile, SubscriberListResponse, SubscriberUpdate } from '@bcis/shared';
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
  { username: 'technician.demo', displayName: 'Demo Technician', role: 'TECHNICIAN' },
  { username: 'collections.demo', displayName: 'Demo Collection Supervisor', role: 'COLLECTION_SUPERVISOR' },
  { username: 'auditor.demo', displayName: 'Demo Auditor', role: 'AUDITOR' },
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
  let technicianToken = '';
  let supervisorToken = '';
  let auditorToken = '';
  let createdSubscriberId = '';
  let references: ReferenceData;

  it('activates Admin and Cashier sessions', async () => {
    adminToken = await activatedToken('admin.demo', 'Synthetic-admin-password-2');
    cashierToken = await activatedToken('cashier.demo', 'Synthetic-cashier-password-2');
    technicianToken = await activatedToken('technician.demo', 'Synthetic-technician-password-2');
    supervisorToken = await activatedToken('collections.demo', 'Synthetic-collections-password-2');
    auditorToken = await activatedToken('auditor.demo', 'Synthetic-auditor-password-2');
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
    createdSubscriberId = response.json<SubscriberDetail>().id;
  });

  it('updates subscriber identity, contacts, and addresses with an audit record', async () => {
    const profile = (await app.inject({ method: 'GET', url: `/subscribers/${createdSubscriberId}`, headers: { authorization: `Bearer ${adminToken}` } })).json<SubscriberDetail>();
    const input: SubscriberUpdate = {
      accountNumber: profile.accountNumber,
      firstName: 'Updated',
      middleName: '',
      lastName: profile.lastName,
      organizationName: 'Synthetic Test Organization',
      billingDay: 9,
      dueDay: 19,
      notes: 'Maintained through the subscriber profile.',
      contacts: [
        ...profile.contacts.map((contact, index) => ({ id: contact.id, type: contact.type, value: index === 0 ? '0917 000 9111' : contact.value, isPrimary: contact.isPrimary })),
        { type: 'EMAIL' as const, value: 'subscriber@example.test', isPrimary: false },
      ],
      addresses: profile.addresses.map((address, index) => ({ id: address.id, type: address.type, line1: index === 0 ? '11 Updated Integration Street' : address.line1, line2: address.line2 ?? '', barangay: address.barangay, municipality: address.municipality, province: address.province, postalCode: address.postalCode ?? '', isPrimary: address.isPrimary })),
    };
    const response = await app.inject({ method: 'PATCH', url: `/subscribers/${createdSubscriberId}`, headers: { authorization: `Bearer ${adminToken}` }, payload: input });
    expect(response.statusCode).toBe(200);
    expect(response.json<SubscriberDetail>()).toMatchObject({ firstName: 'Updated', organizationName: 'Synthetic Test Organization', billingDay: 9, dueDay: 19 });
    expect(response.json<SubscriberDetail>().contacts[0]?.value).toBe('0917 000 9111');
    expect(response.json<SubscriberDetail>().contacts).toHaveLength(2);
    expect(response.json<SubscriberDetail>().contacts.some((contact) => contact.value === 'subscriber@example.test')).toBe(true);
    expect(response.json<SubscriberDetail>().addresses[0]?.line1).toBe('11 Updated Integration Street');
    const audit = await database.pool.query<{ action: string }>('SELECT action FROM audit_logs WHERE entity_id = $1 AND action = $2', [createdSubscriberId, 'subscriber.updated']);
    expect(audit.rows).toHaveLength(1);
  });

  it('rolls back all subscriber edits when removing an address used by a service', async () => {
    const before = (await app.inject({ method: 'GET', url: `/subscribers/${createdSubscriberId}`, headers: { authorization: `Bearer ${adminToken}` } })).json<SubscriberDetail>();
    const usedAddressId = before.addresses.find((address) => !address.isPrimary)?.id;
    expect(usedAddressId).toBeTypeOf('string');
    const response = await app.inject({ method: 'PATCH', url: `/subscribers/${createdSubscriberId}`, headers: { authorization: `Bearer ${adminToken}` }, payload: {
      accountNumber: before.accountNumber, firstName: 'Must Roll Back', middleName: before.middleName ?? '', lastName: before.lastName,
      organizationName: before.organizationName ?? '', billingDay: before.billingDay, dueDay: before.dueDay, notes: before.notes ?? '',
      contacts: before.contacts.map((contact) => ({ id: contact.id, type: contact.type, value: contact.value, isPrimary: contact.isPrimary })),
      addresses: before.addresses.filter((address) => address.id !== usedAddressId).map((address) => ({ id: address.id, type: address.type, line1: address.line1, line2: address.line2 ?? '', barangay: address.barangay, municipality: address.municipality, province: address.province, postalCode: address.postalCode ?? '', isPrimary: address.isPrimary })),
    } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: 'ADDRESS_IN_USE' });
    const after = (await app.inject({ method: 'GET', url: `/subscribers/${createdSubscriberId}`, headers: { authorization: `Bearer ${adminToken}` } })).json<SubscriberDetail>();
    expect(after.firstName).toBe(before.firstName);
    expect(after.addresses).toHaveLength(before.addresses.length);
  });

  it('denies Cashier subscriber maintenance actions', async () => {
    const profile = (await app.inject({ method: 'GET', url: `/subscribers/${createdSubscriberId}`, headers: { authorization: `Bearer ${cashierToken}` } })).json<SubscriberDetail>();
    const input: SubscriberUpdate = {
      accountNumber: profile.accountNumber, firstName: profile.firstName, middleName: profile.middleName ?? '', lastName: profile.lastName,
      organizationName: profile.organizationName ?? '', billingDay: profile.billingDay, dueDay: profile.dueDay, notes: profile.notes ?? '',
      contacts: profile.contacts.map((contact) => ({ id: contact.id, type: contact.type, value: contact.value, isPrimary: contact.isPrimary })),
      addresses: profile.addresses.map((address) => ({ id: address.id, type: address.type, line1: address.line1, line2: address.line2 ?? '', barangay: address.barangay, municipality: address.municipality, province: address.province, postalCode: address.postalCode ?? '', isPrimary: address.isPrimary })),
    };
    expect((await app.inject({ method: 'PATCH', url: `/subscribers/${createdSubscriberId}`, headers: { authorization: `Bearer ${cashierToken}` }, payload: input })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/subscribers/${createdSubscriberId}/status`, headers: { authorization: `Bearer ${cashierToken}` }, payload: { status: 'ARCHIVED', reason: 'Cashier must not archive' } })).statusCode).toBe(403);
  });

  it('creates, edits, and transitions a service account with split permissions and audit history', async () => {
    const profile = (await app.inject({ method: 'GET', url: `/subscribers/${createdSubscriberId}`, headers: { authorization: `Bearer ${adminToken}` } })).json<SubscriberDetail>();
    const address = profile.addresses[0];
    const plan = references.servicePlans[0];
    const area = references.collectionAreas[0];
    const collector = references.collectors[0];
    if (!address || !plan || !area || !collector) throw new Error('Synthetic service references missing');
    const input: ServiceAccountMaintenance = { serviceAccountNumber: 'SVC-90001-3', planId: plan.id, installationAddressId: address.id, collectionAreaId: area.id, assignedCollectorId: collector.id, billingStartDate: '2026-10-01', billingDay: 9, dueDay: 19 };
    const created = await app.inject({ method: 'POST', url: `/subscribers/${createdSubscriberId}/services`, headers: { authorization: `Bearer ${adminToken}` }, payload: input });
    expect(created.statusCode).toBe(201);
    const service = created.json<SubscriberDetail>().services.find((item) => item.serviceAccountNumber === input.serviceAccountNumber);
    expect(service).toMatchObject({ status: 'PENDING', currentRateCentavos: plan.priceCentavos });
    if (!service) throw new Error('Created service missing');

    const edited = await app.inject({ method: 'PATCH', url: `/subscribers/${createdSubscriberId}/services/${service.id}`, headers: { authorization: `Bearer ${adminToken}` }, payload: { ...input, activationDate: '2026-10-02', billingDay: 10 } });
    expect(edited.statusCode).toBe(200);
    expect(edited.json<SubscriberDetail>().services.find((item) => item.id === service.id)).toMatchObject({ activationDate: '2026-10-02', billingDay: 10 });
    expect((await app.inject({ method: 'PATCH', url: `/subscribers/${createdSubscriberId}/services/${service.id}`, headers: { authorization: `Bearer ${technicianToken}` }, payload: input })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/subscribers/${createdSubscriberId}/services/${service.id}/status`, headers: { authorization: `Bearer ${cashierToken}` }, payload: { status: 'ACTIVE', reason: 'Cashier denied transition' } })).statusCode).toBe(403);
    const activated = await app.inject({ method: 'POST', url: `/subscribers/${createdSubscriberId}/services/${service.id}/status`, headers: { authorization: `Bearer ${technicianToken}` }, payload: { status: 'ACTIVE', reason: 'Installation completed' } });
    expect(activated.statusCode).toBe(200);
    expect(activated.json<SubscriberDetail>().services.find((item) => item.id === service.id)?.status).toBe('ACTIVE');
    const invalid = await app.inject({ method: 'POST', url: `/subscribers/${createdSubscriberId}/services/${service.id}/status`, headers: { authorization: `Bearer ${technicianToken}` }, payload: { status: 'PENDING', reason: 'Invalid backward transition' } });
    expect(invalid.statusCode).toBe(409);
    expect(invalid.json()).toMatchObject({ error: 'SERVICE_STATUS_INVALID' });
  });

  it('updates future plan rates without changing finalized invoice values', async () => {
    const catalogResponse = await app.inject({ method: 'GET', url: '/service-plans', headers: { authorization: `Bearer ${adminToken}` } });
    expect(catalogResponse.statusCode).toBe(200);
    const catalog = catalogResponse.json<ServicePlanCatalog>();
    const plan = catalog.plans.find((item) => item.category === 'INTERNET' && item.speedMbps !== null);
    if (!plan) throw new Error('Synthetic Internet plan missing');
    const service = (await app.inject({ method: 'GET', url: `/subscribers/${createdSubscriberId}`, headers: { authorization: `Bearer ${adminToken}` } })).json<SubscriberDetail>().services.find((item) => item.planId === plan.id);
    if (!service) throw new Error('Service for plan missing');
    const user = await database.pool.query<{ id: string }>('SELECT id FROM users WHERE username = $1', ['admin.demo']);
    const cycle = await database.pool.query<{ id: string }>("INSERT INTO billing_cycles (period_start, period_end, status, finalized_at, finalized_by_user_id) VALUES ('2026-09-01', '2026-09-30', 'FINALIZED', now(), $1) RETURNING id", [user.rows[0]?.id]);
    await database.pool.query("INSERT INTO invoices (invoice_number, subscriber_id, service_account_id, billing_cycle_id, invoice_date, due_date, status, total_centavos, balance_centavos, finalized_at, finalized_by_user_id) VALUES ('INV-PLAN-HISTORY', $1, $2, $3, '2026-09-01', '2026-09-19', 'UNPAID', $4, $4, now(), $5)", [createdSubscriberId, service.id, cycle.rows[0]?.id, plan.priceCentavos, user.rows[0]?.id]);
    const payment = await database.pool.query<{ id: string }>("INSERT INTO payments (idempotency_key,subscriber_id,payment_date,amount_centavos,method,status,reference_number,posted_by_user_id,posted_at,created_by_user_id) VALUES ('profile-search-cash',$1,now(),10000,'CASH','POSTED',null,$2,now(),$2) RETURNING id", [createdSubscriberId, user.rows[0]?.id]);
    await database.pool.query("INSERT INTO receipts (receipt_number,payment_id,issued_by_user_id) VALUES ('OR-PROFILE-001',$1,$2)", [payment.rows[0]?.id, user.rows[0]?.id]);
    await database.pool.query("INSERT INTO payments (idempotency_key,subscriber_id,payment_date,amount_centavos,method,status,reference_number,created_by_user_id) VALUES ('profile-search-gcash',$1,now(),5000,'GCASH','PENDING_VERIFICATION','GCASH-PROFILE-001',$2)", [createdSubscriberId, user.rows[0]?.id]);
    const nextPrice = (BigInt(plan.priceCentavos) + 10_000n).toString();
    const updated = await app.inject({ method: 'PATCH', url: `/service-plans/${plan.id}`, headers: { authorization: `Bearer ${adminToken}` }, payload: { serviceTypeId: plan.serviceTypeId, code: plan.code, name: plan.name, priceCentavos: nextPrice, installationFeeCentavos: plan.installationFeeCentavos, reconnectionFeeCentavos: plan.reconnectionFeeCentavos, speedMbps: plan.speedMbps ?? undefined, channelCount: plan.channelCount ?? undefined, description: plan.description ?? '' } });
    expect(updated.statusCode).toBe(200);
    const rate = await database.pool.query<{ current_rate_centavos: string }>('SELECT current_rate_centavos::text FROM service_accounts WHERE id = $1', [service.id]);
    const invoice = await database.pool.query<{ total_centavos: string }>('SELECT total_centavos::text FROM invoices WHERE invoice_number = $1', ['INV-PLAN-HISTORY']);
    expect(rate.rows[0]?.current_rate_centavos).toBe(nextPrice);
    expect(invoice.rows[0]?.total_centavos).toBe(plan.priceCentavos);
    expect((await app.inject({ method: 'PATCH', url: `/service-plans/${plan.id}`, headers: { authorization: `Bearer ${cashierToken}` }, payload: {} })).statusCode).toBe(403);
    const deactivated = await app.inject({ method: 'POST', url: `/service-plans/${plan.id}/status`, headers: { authorization: `Bearer ${adminToken}` }, payload: { isActive: false, reason: 'Synthetic plan retirement' } });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json<ServicePlanCatalog>().plans.find((item) => item.id === plan.id)?.isActive).toBe(false);
  });

  it('searches financial references and returns permission-scoped profile tabs', async () => {
    for (const reference of ['INV-PLAN-HISTORY', 'OR-PROFILE-001', 'GCASH-PROFILE-001']) {
      const response = await app.inject({ method: 'GET', url: `/subscribers?query=${encodeURIComponent(reference)}&page=1&pageSize=10`, headers: { authorization: `Bearer ${adminToken}` } });
      expect(response.statusCode).toBe(200);
      expect(response.json<SubscriberListResponse>().items.some((item) => item.id === createdSubscriberId)).toBe(true);
    }
    const financial = await app.inject({ method: 'GET', url: `/subscribers/${createdSubscriberId}/financial-profile`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(financial.statusCode).toBe(200);
    expect(financial.json<SubscriberFinancialProfile>().invoices.some((item) => item.invoiceNumber === 'INV-PLAN-HISTORY')).toBe(true);
    expect(financial.json<SubscriberFinancialProfile>().payments.some((item) => item.receiptNumber === 'OR-PROFILE-001')).toBe(true);
    expect((await app.inject({ method: 'GET', url: `/subscribers/${createdSubscriberId}/financial-profile`, headers: { authorization: `Bearer ${technicianToken}` } })).statusCode).toBe(403);
    const audit = await app.inject({ method: 'GET', url: `/subscribers/${createdSubscriberId}/audit`, headers: { authorization: `Bearer ${auditorToken}` } });
    expect(audit.statusCode).toBe(200);
    expect(audit.json<SubscriberAudit>().entries.some((entry) => entry.action === 'subscriber.updated')).toBe(true);
    expect((await app.inject({ method: 'GET', url: `/subscribers/${createdSubscriberId}/audit`, headers: { authorization: `Bearer ${adminToken}` } })).statusCode).toBe(403);
  });

  it('blocks archival with live services, then archives and reactivates with immutable audit history', async () => {
    const blocked = await app.inject({ method: 'POST', url: `/subscribers/${createdSubscriberId}/status`, headers: { authorization: `Bearer ${adminToken}` }, payload: { status: 'ARCHIVED', reason: 'Synthetic account closure' } });
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ error: 'ACTIVE_SERVICES_EXIST' });

    await database.pool.query("UPDATE service_accounts SET status = 'TERMINATED' WHERE subscriber_id = $1", [createdSubscriberId]);
    const archived = await app.inject({ method: 'POST', url: `/subscribers/${createdSubscriberId}/status`, headers: { authorization: `Bearer ${adminToken}` }, payload: { status: 'ARCHIVED', reason: 'Synthetic account closure' } });
    expect(archived.statusCode).toBe(200);
    expect(archived.json<SubscriberDetail>().status).toBe('ARCHIVED');
    const reactivated = await app.inject({ method: 'POST', url: `/subscribers/${createdSubscriberId}/status`, headers: { authorization: `Bearer ${adminToken}` }, payload: { status: 'ACTIVE', reason: 'Synthetic account restored' } });
    expect(reactivated.statusCode).toBe(200);
    expect(reactivated.json<SubscriberDetail>().status).toBe('ACTIVE');
    const audit = await database.pool.query<{ reason: string }>('SELECT reason FROM audit_logs WHERE entity_id = $1 AND action = $2 ORDER BY created_at', [createdSubscriberId, 'subscriber.status_changed']);
    expect(audit.rows.map((row) => row.reason)).toEqual(['Synthetic account closure', 'Synthetic account restored']);
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

  it('lets Collection Supervisor maintain areas and collectors while Cashier is denied', async () => {
    const catalogResponse = await app.inject({ method: 'GET', url: '/collection-reference-data', headers: { authorization: `Bearer ${supervisorToken}` } });
    expect(catalogResponse.statusCode).toBe(200);
    const catalog = catalogResponse.json<CollectionReferenceCatalog>();
    const area = catalog.areas.find((item) => item.code === 'TEST-AREA');
    const collector = catalog.collectors.find((item) => item.collectorNumber === 'COL-TEST');
    if (!area || !collector) throw new Error('Created collection references missing');
    const updatedArea = await app.inject({ method: 'PATCH', url: `/collection-areas/${area.id}`, headers: { authorization: `Bearer ${supervisorToken}` }, payload: { code: area.code, name: 'Updated Test Area', description: 'Synthetic maintained route' } });
    expect(updatedArea.statusCode).toBe(200);
    expect(updatedArea.json<CollectionReferenceCatalog>().areas.find((item) => item.id === area.id)?.name).toBe('Updated Test Area');
    const updatedCollector = await app.inject({ method: 'PATCH', url: `/collectors/${collector.id}`, headers: { authorization: `Bearer ${supervisorToken}` }, payload: { collectorNumber: collector.collectorNumber, name: 'Updated Test Collector' } });
    expect(updatedCollector.statusCode).toBe(200);
    expect(updatedCollector.json<CollectionReferenceCatalog>().collectors.find((item) => item.id === collector.id)?.name).toBe('Updated Test Collector');
    const inactive = await app.inject({ method: 'POST', url: `/collectors/${collector.id}/status`, headers: { authorization: `Bearer ${supervisorToken}` }, payload: { status: 'INACTIVE', reason: 'Synthetic leave period' } });
    expect(inactive.statusCode).toBe(200);
    expect(inactive.json<CollectionReferenceCatalog>().collectors.find((item) => item.id === collector.id)?.status).toBe('INACTIVE');
    expect((await app.inject({ method: 'PATCH', url: `/collection-areas/${area.id}`, headers: { authorization: `Bearer ${cashierToken}` }, payload: {} })).statusCode).toBe(403);
  });
});


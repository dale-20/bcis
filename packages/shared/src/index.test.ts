import { describe, expect, it } from 'vitest';
import { apiUrlSchema, billingPeriodSchema, centavosSchema, readinessSchema, signedCentavosSchema, subscriberCreateSchema, subscriberListQuerySchema } from './index.js';

describe('centavo transport contract', () => {
  it.each(['0', '1', '99900', '300000', '9007199254740993', '9223372036854775807'])('preserves exact integer %s', (value) => {
    expect(centavosSchema.parse(value)).toBe(value);
  });
  it.each(['-1', '1.01', '01', '1e3', 'NaN', '', '9223372036854775808', 999.5, 99900])('rejects noncanonical or unsafe value %s', (value) => {
    expect(centavosSchema.safeParse(value).success).toBe(false);
  });
  it.each(['0', '99900', '-99900', '-9223372036854775808'])('accepts signed centavos %s', (value) => {
    expect(signedCentavosSchema.parse(value)).toBe(value);
  });
  it.each(['-0', '1.5', '9223372036854775808', '-9223372036854775809'])('rejects noncanonical signed centavos %s', (value) => {
    expect(signedCentavosSchema.safeParse(value).success).toBe(false);
  });
});

describe('billing period contract', () => {
  it.each(['2026-01', '9999-12'])('accepts calendar month %s', (period) => {
    expect(billingPeriodSchema.parse(period)).toBe(period);
  });
  it.each(['0000-01', '2026-00', '2026-13', '26-01'])('rejects invalid period %s', (period) => {
    expect(billingPeriodSchema.safeParse(period).success).toBe(false);
  });
});

describe('subscriber contracts', () => {
  const valid = {
    accountNumber: 'BCIS-00051', firstName: 'Synthetic', lastName: 'Subscriber', billingDay: 1, dueDay: 11, status: 'ACTIVE',
    contacts: [{ type: 'MOBILE', value: '0917 000 0051', isPrimary: true }],
    addresses: [{ type: 'SERVICE', line1: '51 Test Street', barangay: 'Casisang', municipality: 'Malaybalay City', province: 'Bukidnon', isPrimary: true }],
    services: [{ serviceAccountNumber: 'SVC-00051-1', planId: '018f70ea-7c89-7b61-bef2-4dfb1aaf33d0', installationAddressIndex: 0, collectionAreaId: '018f70ea-7c89-7b61-bef2-4dfb1aaf33d1', assignedCollectorId: '018f70ea-7c89-7b61-bef2-4dfb1aaf33d2', billingStartDate: '2026-10-01', billingDay: 1, dueDay: 11, status: 'ACTIVE' }],
  } as const;

  it('accepts a complete nested subscriber command', () => {
    expect(subscriberCreateSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects invalid address references and missing primary records', () => {
    const result = subscriberCreateSchema.safeParse({
      ...valid,
      contacts: [{ ...valid.contacts[0], isPrimary: false }],
      services: [{ ...valid.services[0], installationAddressIndex: 4 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.map((issue) => issue.message)).toEqual(expect.arrayContaining([
      'Select exactly one primary contact', 'Select an existing service address',
    ]));
  });

  it('bounds server pagination', () => {
    expect(subscriberListQuerySchema.parse({ page: '2', pageSize: '20' })).toMatchObject({ page: 2, pageSize: 20 });
    expect(subscriberListQuerySchema.safeParse({ page: 1, pageSize: 101 }).success).toBe(false);
  });
});
describe('API contracts', () => {
  it.each(['http://127.0.0.1:3001', 'http://192.168.1.10:3001', 'https://bcis.example.test'])('accepts configured origin %s', (value) => {
    expect(apiUrlSchema.safeParse(value).success).toBe(true);
  });
  it.each(['not a url', '', 'file:///etc/passwd', 'https://user:secret@server', 'http://server/path', 'http://server?token=secret', 'http://server#fragment'])('rejects unsafe origin %s', (value) => {
    expect(apiUrlSchema.safeParse(value).success).toBe(false);
  });
  it('rejects a ready claim when the database is unavailable', () => {
    expect(readinessSchema.safeParse({ service: 'bcis-api', status: 'ready', database: 'unavailable', timestamp: new Date().toISOString() }).success).toBe(false);
  });
});

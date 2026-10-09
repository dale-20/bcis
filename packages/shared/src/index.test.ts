import { describe, expect, it } from 'vitest';
import { apiUrlSchema, centavosSchema, readinessSchema } from './index.js';

describe('centavo transport contract', () => {
  it.each(['0', '1', '99900', '300000', '9007199254740993', '9223372036854775807'])('preserves exact integer %s', (value) => {
    expect(centavosSchema.parse(value)).toBe(value);
  });
  it.each(['-1', '1.01', '01', '1e3', 'NaN', '', '9223372036854775808', 999.5, 99900])('rejects noncanonical or unsafe value %s', (value) => {
    expect(centavosSchema.safeParse(value).success).toBe(false);
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

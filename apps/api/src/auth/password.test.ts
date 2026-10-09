import { describe, expect, it } from 'vitest';
import { PasswordHasher, productionScryptParameters, type ScryptParameters } from './password.js';

const testParameters: ScryptParameters = {
  cost: 16_384,
  blockSize: 8,
  parallelization: 1,
  keyLength: 32,
  saltLength: 16,
  maxMemory: 64 * 1024 * 1024,
};

describe('PasswordHasher', () => {
  it('uses the OWASP scrypt minimum in production', () => {
    expect(productionScryptParameters).toMatchObject({
      cost: 131_072,
      blockSize: 8,
      parallelization: 1,
    });
  });

  it('verifies the correct password and rejects a wrong password', async () => {
    const hasher = new PasswordHasher(testParameters);
    const hash = await hasher.hash('Synthetic-demo-password-1');
    expect(hash).not.toContain('Synthetic-demo-password-1');
    await expect(hasher.verify('Synthetic-demo-password-1', hash)).resolves.toBe(true);
    await expect(hasher.verify('wrong-password', hash)).resolves.toBe(false);
  });

  it('uses a unique random salt for every hash', async () => {
    const hasher = new PasswordHasher(testParameters);
    const first = await hasher.hash('Synthetic-demo-password-1');
    const second = await hasher.hash('Synthetic-demo-password-1');
    expect(first).not.toBe(second);
  });

  it('rejects malformed and out-of-policy hash records', async () => {
    const hasher = new PasswordHasher(testParameters);
    await expect(hasher.verify('password', 'plain-text')).resolves.toBe(false);
    await expect(hasher.verify('password', '$scrypt$N=1,r=8,p=1,l=32$AA$AA')).resolves.toBe(false);
  });
});

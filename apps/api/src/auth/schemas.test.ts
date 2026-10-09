import { describe, expect, it } from 'vitest';
import { changePasswordSchema, demoPasswordSchema } from './schemas.js';

describe('development password policy', () => {
  it('accepts password as an eight-character password', () => {
    expect(demoPasswordSchema.parse('password')).toBe('password');
    expect(changePasswordSchema.parse({ currentPassword: 'password', newPassword: 'password' })).toEqual({
      currentPassword: 'password',
      newPassword: 'password',
    });
  });

  it('rejects passwords shorter than eight characters', () => {
    expect(demoPasswordSchema.safeParse('short').success).toBe(false);
    expect(changePasswordSchema.safeParse({ currentPassword: 'existing', newPassword: 'short' }).success).toBe(false);
  });
});

import { z } from 'zod';

// Integer centavos travel as strings so JSON never rounds authoritative amounts.
export const centavosSchema = z.string().max(19).regex(/^(0|[1-9]\d*)$/)
  .pipe(z.string().refine((value) => BigInt(value) <= 9_223_372_036_854_775_807n, 'Amount exceeds PostgreSQL bigint range'));

export const signedCentavosSchema = z.string().max(20).regex(/^(0|-?[1-9]\d*)$/)
  .pipe(z.string().refine((value) => {
    const amount = BigInt(value);
    return amount >= -9_223_372_036_854_775_808n && amount <= 9_223_372_036_854_775_807n;
  }, 'Amount exceeds PostgreSQL bigint range'));


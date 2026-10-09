import { describe, expect, it } from 'vitest';
import { invoiceDates, periodBounds } from './dates.js';

describe('monthly billing dates', () => {
  it('returns exact calendar-month bounds including leap years', () => {
    expect(periodBounds('2028-02')).toEqual({ periodStart: '2028-02-01', periodEnd: '2028-02-29' });
  });

  it('keeps a due day after the billing day in the same month', () => {
    expect(invoiceDates('2026-08', '2026-07-01', 1, 11)).toEqual({ invoiceDate: '2026-08-01', dueDate: '2026-08-11' });
  });

  it('moves an earlier due day into the next month and clamps it', () => {
    expect(invoiceDates('2026-01', '2025-01-01', 28, 31)).toEqual({ invoiceDate: '2026-01-28', dueDate: '2026-01-31' });
    expect(invoiceDates('2026-01', '2025-01-01', 20, 10)).toEqual({ invoiceDate: '2026-01-20', dueDate: '2026-02-10' });
  });

  it('uses a later first-month billing start as the invoice date', () => {
    expect(invoiceDates('2026-08', '2026-08-15', 1, 11)).toEqual({ invoiceDate: '2026-08-15', dueDate: '2026-09-11' });
  });
});

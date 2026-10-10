// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { postPayment } from './api';

afterEach(() => { vi.restoreAllMocks(); Object.defineProperty(window, 'bcis', { configurable: true, value: undefined }); });

const payment = {
  paymentId: '11111111-1111-4111-8111-111111111111',
  subscriberId: '22222222-2222-4222-8222-222222222222',
  method: 'CASH',
  status: 'POSTED',
  amountCentavos: '10000',
  receiptNumber: 'RCPT-000001',
  allocatedCentavos: '10000',
  unappliedCreditCentavos: '0',
  allocations: [],
};
const input = {
  subscriberId: payment.subscriberId,
  amountCentavos: '10000',
  paymentDate: '2026-10-11T00:00:00.000Z',
  idempotencyKey: '33333333-3333-4333-8333-333333333333',
  method: 'CASH' as const,
};

describe('financial mascot event integration', () => {
  it('announces success only after the API confirms a posted payment', async () => {
    Object.defineProperty(window, 'bcis', { configurable: true, value: { postPayment: vi.fn().mockResolvedValue({ ok: true, data: payment }) } });
    const received: string[] = [];
    const listener = (event: Event) => { if (event instanceof CustomEvent && typeof event.detail === 'string') received.push(event.detail); };
    window.addEventListener('bcis:mascot-event', listener);
    await postPayment(input);
    window.removeEventListener('bcis:mascot-event', listener);
    expect(received).toEqual(['payment-posted']);
  });

  it('announces failure without ever announcing a payment success', async () => {
    Object.defineProperty(window, 'bcis', { configurable: true, value: { postPayment: vi.fn().mockResolvedValue({ ok: false, error: { code: 'PAYMENT_REJECTED', message: 'Payment rejected' } }) } });
    const received: string[] = [];
    const listener = (event: Event) => { if (event instanceof CustomEvent && typeof event.detail === 'string') received.push(event.detail); };
    window.addEventListener('bcis:mascot-event', listener);
    await expect(postPayment(input)).rejects.toThrow('Payment rejected');
    window.removeEventListener('bcis:mascot-event', listener);
    expect(received).toEqual(['payment-error']);
  });
});

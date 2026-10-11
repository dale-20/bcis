// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { postPayment, selectAndUploadGcashProof, verifyGcashPayment } from './api';
import { announceMascotEvent } from '../features/mascot/mascot-events';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); Object.defineProperty(window, 'bcis', { configurable: true, value: undefined }); });

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
    const listener = (event: Event) => { if (event instanceof CustomEvent && event.detail && typeof event.detail === 'object' && 'type' in event.detail) received.push(String(event.detail.type)); };
    window.addEventListener('bcis:mascot-event', listener);
    await postPayment(input);
    window.removeEventListener('bcis:mascot-event', listener);
    expect(received).toEqual(['payment-posted']);
  });

  it('announces failure without ever announcing a payment success', async () => {
    Object.defineProperty(window, 'bcis', { configurable: true, value: { postPayment: vi.fn().mockResolvedValue({ ok: false, error: { code: 'PAYMENT_REJECTED', message: 'Payment rejected' } }) } });
    const received: string[] = [];
    const listener = (event: Event) => { if (event instanceof CustomEvent && event.detail && typeof event.detail === 'object' && 'type' in event.detail) received.push(String(event.detail.type)); };
    window.addEventListener('bcis:mascot-event', listener);
    await expect(postPayment(input)).rejects.toThrow('Payment rejected');
    window.removeEventListener('bcis:mascot-event', listener);
    expect(received).toEqual(['payment-error']);
  });

  it('does not announce payment success while the posting request is still pending', async () => {
    let resolve: ((result: { ok: true; data: typeof payment }) => void) | undefined;
    Object.defineProperty(window, 'bcis', { configurable: true, value: { postPayment: vi.fn(() => new Promise((done) => { resolve = done; })) } });
    const received: string[] = [];
    const listener = (event: Event) => { if (event instanceof CustomEvent && event.detail && typeof event.detail === 'object' && 'type' in event.detail) received.push(String(event.detail.type)); };
    window.addEventListener('bcis:mascot-event', listener);
    const request = postPayment(input);
    expect(received).toEqual([]);
    resolve?.({ ok: true, data: { ...payment, paymentId: '55555555-5555-4555-8555-555555555555' } });
    await request;
    window.removeEventListener('bcis:mascot-event', listener);
    expect(received).toEqual(['payment-posted']);
  });

  it('does not announce success for a GCash proof upload or an unposted payment', async () => {
    const pending = { ...payment, status: 'PENDING_VERIFICATION' };
    Object.defineProperty(window, 'bcis', { configurable: true, value: {
      selectAndUploadGcashProof: vi.fn().mockResolvedValue({ ok: true, data: { proofId: 'proof' } }),
      postPayment: vi.fn().mockResolvedValue({ ok: true, data: pending }),
    } });
    const received: string[] = [];
    const listener = (event: Event) => { if (event instanceof CustomEvent && event.detail && typeof event.detail === 'object' && 'type' in event.detail) received.push(String(event.detail.type)); };
    window.addEventListener('bcis:mascot-event', listener);
    await selectAndUploadGcashProof();
    await postPayment({ ...input, method: 'GCASH', referenceNumber: 'GCASH-123456', senderDetails: 'Synthetic sender', proof: { storageKey: '44444444-4444-4444-8444-444444444444', originalFilename: 'proof.png', mimeType: 'image/png', sizeBytes: '100', sha256: 'a'.repeat(64) } });
    window.removeEventListener('bcis:mascot-event', listener);
    expect(received).toEqual([]);
  });

  it('announces GCash approval only after the server returns a posted payment', async () => {
    Object.defineProperty(window, 'bcis', { configurable: true, value: { verifyGcashPayment: vi.fn().mockResolvedValue({ ok: true, data: payment }) } });
    const received: string[] = [];
    const listener = (event: Event) => { if (event instanceof CustomEvent && event.detail && typeof event.detail === 'object' && 'type' in event.detail) received.push(String(event.detail.type)); };
    window.addEventListener('bcis:mascot-event', listener);
    await verifyGcashPayment(payment.paymentId, { decision: 'VERIFIED' });
    window.removeEventListener('bcis:mascot-event', listener);
    expect(received).toEqual(['gcash-approved']);
  });

  it('deduplicates repeated events for the same completed operation', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-11T00:00:00.000Z'));
    const received: string[] = [];
    const listener = (event: Event) => { if (event instanceof CustomEvent && event.detail && typeof event.detail === 'object' && 'type' in event.detail) received.push(String(event.detail.type)); };
    window.addEventListener('bcis:mascot-event', listener);
    announceMascotEvent('backup-success', 'synthetic-backup-42');
    announceMascotEvent('backup-success', 'synthetic-backup-42');
    expect(received).toEqual(['backup-success']);
    vi.advanceTimersByTime(5_001);
    announceMascotEvent('backup-success', 'synthetic-backup-42');
    window.removeEventListener('bcis:mascot-event', listener);
    expect(received).toEqual(['backup-success', 'backup-success']);
  });
});

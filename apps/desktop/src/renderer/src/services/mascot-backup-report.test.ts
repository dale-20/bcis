// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBackup, exportReport } from './api';
import { MASCOT_EVENT } from '../features/mascot/mascot-events';

afterEach(() => {
  vi.restoreAllMocks();
  Object.defineProperty(window, 'bcis', { configurable: true, value: undefined });
});

async function captureEvents(operation: (received: readonly string[]) => Promise<unknown>): Promise<string[]> {
  const received: string[] = [];
  const listener = (event: Event) => {
    if (event instanceof CustomEvent && event.detail && typeof event.detail === 'object' && 'type' in event.detail) {
      received.push(String(event.detail.type));
    }
  };
  window.addEventListener(MASCOT_EVENT, listener);
  try {
    await operation(received);
    return received;
  } finally {
    window.removeEventListener(MASCOT_EVENT, listener);
  }
}

describe('Buddy backup and export feedback', () => {
  it('announces backup success only after a validated VERIFIED result', async () => {
    let resolve: ((value: unknown) => void) | undefined;
    Object.defineProperty(window, 'bcis', { configurable: true, value: {
      createBackup: () => new Promise((done) => { resolve = done; }),
    } });
    const events = await captureEvents(async (received) => {
      const pending = createBackup();
      expect(received).toEqual(['backup-start']);
      resolve?.({ ok: true, data: { id: '11111111-1111-4111-8111-111111111111', sha256: 'a'.repeat(64), sizeBytes: '100', status: 'VERIFIED', createdAt: '2026-10-11T00:00:00.000Z' } });
      await pending;
    });
    expect(events).toEqual(['backup-start', 'backup-success']);
  });

  it.each([
    { ok: false, error: { code: 'BACKUP_FAILED', message: 'Backup failed' } },
    { ok: true, data: { status: 'COMPLETED' } },
  ])('never celebrates failed or unverified backups (%j)', async (result) => {
    Object.defineProperty(window, 'bcis', { configurable: true, value: { createBackup: vi.fn().mockResolvedValue(result) } });
    const events = await captureEvents(async () => { await expect(createBackup()).rejects.toThrow(); });
    expect(events).toEqual(['backup-start', 'backup-error']);
  });

  it('settles canceled exports without announcing success', async () => {
    Object.defineProperty(window, 'bcis', { configurable: true, value: { exportReport: vi.fn().mockResolvedValue({ ok: true, data: { saved: false } }) } });
    const events = await captureEvents(() => exportReport({ report: 'MONTHLY_COLLECTIONS', from: '2026-10-01', to: '2026-10-31', format: 'PDF' }));
    expect(events).toEqual(['report-start', 'report-canceled']);
  });
});

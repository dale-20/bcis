export const MASCOT_EVENT = 'bcis:mascot-event';

export const MASCOT_EVENTS = [
  'login',
  'subscriber-created',
  'billing-start',
  'billing-success',
  'billing-error',
  'payment-posted',
  'payment-error',
  'gcash-approved',
  'overdue-found',
  'report-start',
  'report-finish',
  'report-error',
  'backup-success',
  'connection-lost',
  'connection-restored',
  'extended-inactivity',
] as const;

export type MascotEvent = typeof MASCOT_EVENTS[number];
export type MascotEventDetail = { type: MascotEvent; eventId: string };

const deduplicationWindowMs = 5_000;
const lastEventByKey = new Map<string, number>();
let eventSequence = 0;

/**
 * Emits UI-only events. Keys may identify a completed operation, but must never
 * contain customer-visible data. No event detail is rendered as dialogue.
 */
export function announceMascotEvent(event: MascotEvent, dedupeKey?: string): void {
  const now = Date.now();
  for (const [key, timestamp] of lastEventByKey) {
    if (now - timestamp > deduplicationWindowMs) lastEventByKey.delete(key);
  }
  if (dedupeKey) {
    const key = `${event}:${dedupeKey}`;
    const previous = lastEventByKey.get(key);
    if (previous !== undefined && now - previous < deduplicationWindowMs) return;
    lastEventByKey.set(key, now);
  }
  const detail: MascotEventDetail = { type: event, eventId: `${now}:${++eventSequence}` };
  window.dispatchEvent(new CustomEvent<MascotEventDetail>(MASCOT_EVENT, { detail }));
}

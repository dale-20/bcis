import type { MascotEvent } from './mascot-events';

export type MascotMood = 'neutral' | 'hello' | 'happy' | 'thinking' | 'surprised' | 'concerned' | 'sleepy' | 'celebrating' | 'processing' | 'walking';

export type MascotReaction = {
  mood: MascotMood;
  message: string;
  priority: number;
  durationMs: number;
};

export const mascotReactions = {
  login: { mood: 'hello', message: 'Hello! Ready to manage BCIS today?', priority: 3, durationMs: 5_000 },
  'subscriber-created': { mood: 'happy', message: 'Subscriber profile saved.', priority: 3, durationMs: 4_000 },
  'billing-start': { mood: 'processing', message: 'Preparing this billing run…', priority: 2, durationMs: 60_000 },
  'billing-success': { mood: 'celebrating', message: 'Billing run completed.', priority: 5, durationMs: 4_000 },
  'billing-error': { mood: 'concerned', message: 'Billing needs attention. Check the result.', priority: 6, durationMs: 5_000 },
  'payment-posted': { mood: 'celebrating', message: 'Payment posted successfully.', priority: 5, durationMs: 4_000 },
  'payment-error': { mood: 'concerned', message: 'Payment could not be confirmed. Check payment history before retrying.', priority: 6, durationMs: 5_000 },
  'gcash-approved': { mood: 'happy', message: 'GCash proof verified.', priority: 5, durationMs: 4_000 },
  'overdue-found': { mood: 'concerned', message: 'Overdue accounts need review.', priority: 4, durationMs: 5_000 },
  'report-start': { mood: 'processing', message: 'Preparing your report…', priority: 2, durationMs: 60_000 },
  'report-finish': { mood: 'happy', message: 'Report is ready.', priority: 3, durationMs: 4_000 },
  'report-error': { mood: 'concerned', message: 'Report could not be prepared. Check the report screen.', priority: 6, durationMs: 5_000 },
  'backup-success': { mood: 'celebrating', message: 'Backup verified and ready.', priority: 5, durationMs: 4_000 },
  'connection-lost': { mood: 'surprised', message: 'Connection to the office server was lost.', priority: 7, durationMs: 7_000 },
  'connection-restored': { mood: 'happy', message: 'Office server connection restored.', priority: 5, durationMs: 4_000 },
} satisfies Record<MascotEvent, MascotReaction>;

export function isMascotEvent(value: string): value is MascotEvent {
  return Object.hasOwn(mascotReactions, value);
}

import type { MascotEvent } from './mascot-events';
import type { MascotAnimationName } from './mascot-animation';

export type MascotMood = 'neutral' | 'hello' | 'happy' | 'thinking' | 'surprised' | 'concerned' | 'sleepy' | 'celebrating' | 'processing' | 'walking';

export type MascotReaction = {
  animation: MascotAnimationName;
  mood: MascotMood;
  message: string;
  priority: number;
  durationMs: number | null;
};

export const mascotReactions = {
  login: { animation: 'greeting', mood: 'hello', message: 'Welcome back!', priority: 3, durationMs: 3_800 },
  'subscriber-created': { animation: 'happy', mood: 'happy', message: 'Subscriber created successfully.', priority: 3, durationMs: 3_200 },
  'billing-start': { animation: 'processing', mood: 'processing', message: 'Generating invoices…', priority: 2, durationMs: 60_000 },
  'billing-success': { animation: 'success', mood: 'celebrating', message: 'Invoice generation completed.', priority: 5, durationMs: 2_800 },
  'billing-error': { animation: 'error', mood: 'concerned', message: 'Invoice generation failed.', priority: 7, durationMs: 1_800 },
  'payment-posted': { animation: 'success', mood: 'celebrating', message: 'Payment recorded successfully!', priority: 5, durationMs: 2_800 },
  'payment-error': { animation: 'error', mood: 'concerned', message: 'Payment could not be confirmed. Check payment history before retrying.', priority: 7, durationMs: 1_800 },
  'gcash-approved': { animation: 'success', mood: 'celebrating', message: 'GCash verification approved.', priority: 5, durationMs: 2_800 },
  'overdue-found': { animation: 'warning', mood: 'concerned', message: 'Overdue accounts need review.', priority: 6, durationMs: 5_000 },
  'report-start': { animation: 'processing', mood: 'processing', message: 'Preparing your report…', priority: 2, durationMs: 60_000 },
  'report-finish': { animation: 'happy', mood: 'happy', message: 'Your report is ready.', priority: 3, durationMs: 3_200 },
  'report-error': { animation: 'error', mood: 'concerned', message: 'Report could not be prepared. Check the report screen.', priority: 7, durationMs: 1_800 },
  'backup-success': { animation: 'success', mood: 'celebrating', message: 'Backup verified and ready.', priority: 5, durationMs: 2_800 },
  'connection-lost': { animation: 'warning', mood: 'concerned', message: 'Connection to the office server was lost.', priority: 8, durationMs: 5_000 },
  'connection-restored': { animation: 'happy', mood: 'happy', message: 'Connection restored.', priority: 5, durationMs: 3_200 },
  'extended-inactivity': { animation: 'sleep', mood: 'sleepy', message: 'Taking a quiet moment.', priority: 0, durationMs: null },
} satisfies Record<MascotEvent, MascotReaction>;

export function isMascotEvent(value: string): value is MascotEvent {
  return Object.hasOwn(mascotReactions, value);
}

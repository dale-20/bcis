export const MASCOT_EVENT = 'bcis:mascot-event';

export type MascotEvent =
  | 'login'
  | 'subscriber-created'
  | 'billing-start'
  | 'billing-success'
  | 'billing-error'
  | 'payment-posted'
  | 'payment-error'
  | 'gcash-approved'
  | 'overdue-found'
  | 'report-start'
  | 'report-finish'
  | 'report-error'
  | 'backup-success'
  | 'connection-lost'
  | 'connection-restored';

export function announceMascotEvent(event: MascotEvent): void {
  window.dispatchEvent(new CustomEvent<MascotEvent>(MASCOT_EVENT, { detail: event }));
}

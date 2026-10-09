import {
  authResultSchema,
  changePasswordInputSchema,
  loginInputSchema,
  referenceDataResultSchema,
  sessionResultSchema,
  subscriberCreateSchema,
  subscriberDetailResultSchema,
  subscriberListQuerySchema,
  subscriberListResultSchema,
  type AuthenticatedUser,
  type ReferenceData,
  type SubscriberCreate,
  type SubscriberDetail,
  type SubscriberListQuery,
  type SubscriberListResponse,
} from '@bcis/shared';

export class DesktopServiceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DesktopServiceError';
  }
}

function bridge() {
  if (!window.bcis) throw new DesktopServiceError('BRIDGE_UNAVAILABLE', 'Launch BCIS through the Electron desktop application');
  return window.bcis;
}

function unwrap<T>(result: { ok: true; data: T } | { ok: false; error: { code: string; message: string } }): T {
  if (!result.ok) throw new DesktopServiceError(result.error.code, result.error.message);
  return result.data;
}

export async function getSession(): Promise<AuthenticatedUser | null> {
  return unwrap(sessionResultSchema.parse(await bridge().getSession()));
}

export async function login(input: unknown): Promise<AuthenticatedUser> {
  const command = loginInputSchema.parse(input);
  return unwrap(authResultSchema.parse(await bridge().login(command)));
}

export async function changePassword(input: unknown): Promise<AuthenticatedUser> {
  const command = changePasswordInputSchema.parse(input);
  return unwrap(authResultSchema.parse(await bridge().changePassword(command)));
}

export async function logout(): Promise<void> {
  const result = await bridge().logout();
  if (!result.ok) throw new DesktopServiceError(result.error.code, result.error.message);
}

export async function listSubscribers(query: SubscriberListQuery): Promise<SubscriberListResponse> {
  const command = subscriberListQuerySchema.parse(query);
  return unwrap(subscriberListResultSchema.parse(await bridge().listSubscribers(command)));
}

export async function getSubscriber(id: string): Promise<SubscriberDetail> {
  return unwrap(subscriberDetailResultSchema.parse(await bridge().getSubscriber(id)));
}

export async function createSubscriber(input: SubscriberCreate): Promise<SubscriberDetail> {
  const command = subscriberCreateSchema.parse(input);
  return unwrap(subscriberDetailResultSchema.parse(await bridge().createSubscriber(command)));
}

export async function getReferenceData(): Promise<ReferenceData> {
  return unwrap(referenceDataResultSchema.parse(await bridge().getReferenceData()));
}


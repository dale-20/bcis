import { z } from 'zod';
import {
  referenceDataSchema,
  subscriberCreateSchema,
  subscriberDetailSchema,
  subscriberListQuerySchema,
  subscriberListResponseSchema,
  type ReferenceData,
  type SubscriberCreate,
  type SubscriberDetail,
  type SubscriberListQuery,
  type SubscriberListResponse,
} from './subscribers.js';

export const AUTH_LOGIN_CHANNEL = 'bcis:auth:login';
export const AUTH_LOGOUT_CHANNEL = 'bcis:auth:logout';
export const AUTH_SESSION_CHANNEL = 'bcis:auth:session';
export const AUTH_CHANGE_PASSWORD_CHANNEL = 'bcis:auth:change-password';
export const SUBSCRIBERS_LIST_CHANNEL = 'bcis:subscribers:list';
export const SUBSCRIBERS_GET_CHANNEL = 'bcis:subscribers:get';
export const SUBSCRIBERS_CREATE_CHANNEL = 'bcis:subscribers:create';
export const REFERENCE_DATA_CHANNEL = 'bcis:reference-data:get';

export const authenticatedUserSchema = z.object({
  userId: z.uuid(), username: z.string(), displayName: z.string(), mustChangePassword: z.boolean(),
  roles: z.array(z.string()), permissions: z.array(z.string()),
});
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

export const loginInputSchema = z.object({ username: z.string().trim().min(3).max(64), password: z.string().min(1).max(256) });
export const changePasswordInputSchema = z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(12).max(128) });
export const apiFailureSchema = z.object({ code: z.string(), message: z.string() });
export type ApiFailure = z.infer<typeof apiFailureSchema>;
export type DesktopResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

export const authResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: authenticatedUserSchema }),
  z.object({ ok: z.literal(false), error: apiFailureSchema }),
]);
export const sessionResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: authenticatedUserSchema.nullable() }),
  z.object({ ok: z.literal(false), error: apiFailureSchema }),
]);
export const subscriberListResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: subscriberListResponseSchema }),
  z.object({ ok: z.literal(false), error: apiFailureSchema }),
]);
export const subscriberDetailResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: subscriberDetailSchema }),
  z.object({ ok: z.literal(false), error: apiFailureSchema }),
]);
export const referenceDataResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: referenceDataSchema }),
  z.object({ ok: z.literal(false), error: apiFailureSchema }),
]);

export interface DesktopBridge {
  getConnection: () => Promise<import('./index.js').ConnectionResult>;
  getSession: () => Promise<DesktopResult<AuthenticatedUser | null>>;
  login: (input: z.infer<typeof loginInputSchema>) => Promise<DesktopResult<AuthenticatedUser>>;
  changePassword: (input: z.infer<typeof changePasswordInputSchema>) => Promise<DesktopResult<AuthenticatedUser>>;
  logout: () => Promise<DesktopResult<null>>;
  listSubscribers: (query: SubscriberListQuery) => Promise<DesktopResult<SubscriberListResponse>>;
  getSubscriber: (id: string) => Promise<DesktopResult<SubscriberDetail>>;
  createSubscriber: (input: SubscriberCreate) => Promise<DesktopResult<SubscriberDetail>>;
  getReferenceData: () => Promise<DesktopResult<ReferenceData>>;
}

export const desktopRequestSchemas = {
  login: loginInputSchema,
  changePassword: changePasswordInputSchema,
  subscriberList: subscriberListQuerySchema,
  subscriberId: z.uuid(),
  subscriberCreate: subscriberCreateSchema,
};


import {
  authenticatedUserSchema,
  referenceDataSchema,
  subscriberDetailSchema,
  subscriberListResponseSchema,
  type AuthenticatedUser,
  type DesktopResult,
  type ReferenceData,
  type SubscriberCreate,
  type SubscriberDetail,
  type SubscriberListQuery,
  type SubscriberListResponse,
  dashboardSchema, reportDataSchema, serviceHistorySchema,
  type Dashboard, type DashboardQuery, type ReportData, type ReportRequest, type ServiceHistory,
} from '@bcis/shared';
import { z } from 'zod';

const loginResponseSchema = z.object({ token: z.string(), expiresAt: z.iso.datetime(), user: authenticatedUserSchema });
const serverErrorSchema = z.object({ error: z.string(), message: z.string() });

export class DesktopApiClient {
  private token: string | null = null;
  private user: AuthenticatedUser | null = null;

  constructor(private readonly endpoint: string, private readonly request: typeof fetch = fetch) {}

  session(): DesktopResult<AuthenticatedUser | null> {
    return { ok: true, data: this.user };
  }

  async login(input: { username: string; password: string }): Promise<DesktopResult<AuthenticatedUser>> {
    const result = await this.call('/auth/login', { method: 'POST', body: JSON.stringify(input) }, loginResponseSchema, false);
    if (!result.ok) return result;
    this.token = result.data.token;
    this.user = result.data.user;
    return { ok: true, data: result.data.user };
  }

  async changePassword(input: { currentPassword: string; newPassword: string }): Promise<DesktopResult<AuthenticatedUser>> {
    const changed = await this.call('/auth/change-password', { method: 'POST', body: JSON.stringify(input) }, z.null(), true, true);
    if (!changed.ok) return changed;
    const refreshed = await this.call('/auth/me', { method: 'GET' }, authenticatedUserSchema);
    if (!refreshed.ok) return refreshed;
    this.user = refreshed.data;
    return refreshed;
  }

  async logout(): Promise<DesktopResult<null>> {
    const result = await this.call('/auth/logout', { method: 'POST' }, z.null(), true, true);
    this.token = null;
    this.user = null;
    return result;
  }

  listSubscribers(query: SubscriberListQuery): Promise<DesktopResult<SubscriberListResponse>> {
    const search = new URLSearchParams({
      query: query.query,
      status: query.status,
      page: String(query.page),
      pageSize: String(query.pageSize),
      sort: query.sort,
      direction: query.direction,
    });
    return this.call(`/subscribers?${search.toString()}`, { method: 'GET' }, subscriberListResponseSchema);
  }

  getSubscriber(id: string): Promise<DesktopResult<SubscriberDetail>> {
    return this.call(`/subscribers/${encodeURIComponent(id)}`, { method: 'GET' }, subscriberDetailSchema);
  }

  createSubscriber(input: SubscriberCreate): Promise<DesktopResult<SubscriberDetail>> {
    return this.call('/subscribers', { method: 'POST', body: JSON.stringify(input) }, subscriberDetailSchema);
  }

  getReferenceData(): Promise<DesktopResult<ReferenceData>> {
    return this.call('/reference-data', { method: 'GET' }, referenceDataSchema);
  }

  getDashboard(query: DashboardQuery): Promise<DesktopResult<Dashboard>> {
    return this.call(`/dashboard?${new URLSearchParams(query).toString()}`, { method: 'GET' }, dashboardSchema);
  }

  getReport(query: ReportRequest): Promise<DesktopResult<ReportData>> {
    const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    return this.call(`/reports/data?${search.toString()}`, { method: 'GET' }, reportDataSchema);
  }

  getServiceHistory(id: string): Promise<DesktopResult<ServiceHistory>> {
    return this.call(`/subscribers/${encodeURIComponent(id)}/service-history`, { method: 'GET' }, serviceHistorySchema);
  }

  async downloadReport(query: ReportRequest & { format: 'PDF' | 'XLSX' }): Promise<DesktopResult<{ buffer: Uint8Array; filename: string }>> {
    if (!this.token) return { ok: false, error: { code: 'SESSION_INVALID', message: 'Sign in to continue' } };
    const search = new URLSearchParams(Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
    try {
      const response = await this.request(new URL(`/reports/export?${search.toString()}`, this.endpoint), { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${this.token}` } });
      if (!response.ok) {
        const parsed = serverErrorSchema.safeParse(await response.json().catch(() => null));
        return { ok: false, error: parsed.success ? { code: parsed.data.error, message: parsed.data.message } : { code: 'API_ERROR', message: 'The report could not be exported' } };
      }
      const disposition = response.headers.get('content-disposition') ?? '';
      const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? `bcis-report.${query.format.toLowerCase()}`;
      return { ok: true, data: { buffer: new Uint8Array(await response.arrayBuffer()), filename } };
    } catch { return { ok: false, error: { code: 'CONNECTION_ERROR', message: 'Unable to download the report' } }; }
  }

  private async call<T>(path: string, init: RequestInit, schema: z.ZodType<T>, authenticated = true, emptyResponse = false): Promise<DesktopResult<T>> {
    if (authenticated && !this.token) return { ok: false, error: { code: 'SESSION_INVALID', message: 'Sign in to continue' } };
    try {
      const response = await this.request(new URL(path, this.endpoint), {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(8000),
        headers: {
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(authenticated && this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
      });
      if (!response.ok) {
        const parsed = serverErrorSchema.safeParse(await response.json().catch(() => null));
        if (response.status === 401) {
          this.token = null;
          this.user = null;
        }
        return { ok: false, error: parsed.success ? { code: parsed.data.error, message: parsed.data.message } : { code: 'API_ERROR', message: 'The server could not complete the request' } };
      }
      if (emptyResponse) return { ok: true, data: null as T };
      return { ok: true, data: schema.parse(await response.json()) };
    } catch {
      return { ok: false, error: { code: 'CONNECTION_ERROR', message: 'Unable to reach the BCIS server' } };
    }
  }
}


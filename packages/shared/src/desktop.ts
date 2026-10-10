import { z } from 'zod';
import {
  referenceDataSchema,
  collectionAreaCreateSchema,
  collectionAreaUpdateSchema,
  collectionReferenceCatalogSchema,
  collectorCreateSchema,
  collectorUpdateSchema,
  referenceStatusChangeSchema,
  serviceAccountMaintenanceSchema,
  serviceAccountStatusChangeSchema,
  servicePlanCatalogSchema,
  subscriberCreateSchema,
  subscriberDetailSchema,
  subscriberAuditSchema,
  subscriberFinancialProfileSchema,
  subscriberListQuerySchema,
  subscriberListResponseSchema,
  subscriberStatusChangeSchema,
  subscriberUpdateSchema,
  servicePlanCreateSchema,
  servicePlanStatusChangeSchema,
  servicePlanUpdateSchema,
  type ReferenceData,
  type CollectionAreaCreate,
  type CollectionAreaUpdate,
  type CollectionReferenceCatalog,
  type CollectorCreate,
  type CollectorUpdate,
  type ReferenceStatusChange,
  type ServiceAccountMaintenance,
  type ServiceAccountStatusChange,
  type ServicePlanCatalog,
  type ServicePlanCreate,
  type ServicePlanStatusChange,
  type ServicePlanUpdate,
  type SubscriberCreate,
  type SubscriberDetail,
  type SubscriberAudit,
  type SubscriberFinancialProfile,
  type SubscriberListQuery,
  type SubscriberListResponse,
  type SubscriberStatusChange,
  type SubscriberUpdate,
} from './subscribers.js';
import { dashboardQuerySchema, reportRequestSchema, type Dashboard, type DashboardQuery, type ExportResult, type ReportData, type ReportRequest, type ServiceHistory } from './reports.js';

export const AUTH_LOGIN_CHANNEL = 'bcis:auth:login';
export const AUTH_LOGOUT_CHANNEL = 'bcis:auth:logout';
export const AUTH_SESSION_CHANNEL = 'bcis:auth:session';
export const AUTH_CHANGE_PASSWORD_CHANNEL = 'bcis:auth:change-password';
export const SUBSCRIBERS_LIST_CHANNEL = 'bcis:subscribers:list';
export const SUBSCRIBERS_GET_CHANNEL = 'bcis:subscribers:get';
export const SUBSCRIBERS_CREATE_CHANNEL = 'bcis:subscribers:create';
export const SUBSCRIBERS_UPDATE_CHANNEL = 'bcis:subscribers:update';
export const SUBSCRIBERS_STATUS_CHANNEL = 'bcis:subscribers:status';
export const SUBSCRIBERS_FINANCIAL_CHANNEL = 'bcis:subscribers:financial';
export const SUBSCRIBERS_AUDIT_CHANNEL = 'bcis:subscribers:audit';
export const SERVICES_CREATE_CHANNEL = 'bcis:services:create';
export const SERVICES_UPDATE_CHANNEL = 'bcis:services:update';
export const SERVICES_STATUS_CHANNEL = 'bcis:services:status';
export const PLANS_LIST_CHANNEL = 'bcis:plans:list';
export const PLANS_CREATE_CHANNEL = 'bcis:plans:create';
export const PLANS_UPDATE_CHANNEL = 'bcis:plans:update';
export const PLANS_STATUS_CHANNEL = 'bcis:plans:status';
export const COLLECTION_REFERENCES_LIST_CHANNEL = 'bcis:collection-references:list';
export const AREAS_CREATE_CHANNEL = 'bcis:areas:create';
export const AREAS_UPDATE_CHANNEL = 'bcis:areas:update';
export const AREAS_STATUS_CHANNEL = 'bcis:areas:status';
export const COLLECTORS_CREATE_CHANNEL = 'bcis:collectors:create';
export const COLLECTORS_UPDATE_CHANNEL = 'bcis:collectors:update';
export const COLLECTORS_STATUS_CHANNEL = 'bcis:collectors:status';
export const REFERENCE_DATA_CHANNEL = 'bcis:reference-data:get';
export const DASHBOARD_GET_CHANNEL = 'bcis:dashboard:get';
export const REPORT_GET_CHANNEL = 'bcis:report:get';
export const REPORT_EXPORT_CHANNEL = 'bcis:report:export';
export const SERVICE_HISTORY_CHANNEL = 'bcis:service-history:get';

export const authenticatedUserSchema = z.object({
  userId: z.uuid(), username: z.string(), displayName: z.string(), mustChangePassword: z.boolean(),
  roles: z.array(z.string()), permissions: z.array(z.string()),
});
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

export const loginInputSchema = z.object({ username: z.string().trim().min(3).max(64), password: z.string().min(1).max(256) });
export const changePasswordInputSchema = z.object({ currentPassword: z.string().min(1).max(256), newPassword: z.string().min(8).max(128) });
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
export const subscriberFinancialResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: subscriberFinancialProfileSchema }),
  z.object({ ok: z.literal(false), error: apiFailureSchema }),
]);
export const subscriberAuditResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: subscriberAuditSchema }),
  z.object({ ok: z.literal(false), error: apiFailureSchema }),
]);
export const referenceDataResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: referenceDataSchema }),
  z.object({ ok: z.literal(false), error: apiFailureSchema }),
]);
export const servicePlanCatalogResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: servicePlanCatalogSchema }),
  z.object({ ok: z.literal(false), error: apiFailureSchema }),
]);
export const servicePlanCreatedSchema = z.object({ id: z.uuid(), code: z.string(), name: z.string() });
export const servicePlanCreatedResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: servicePlanCreatedSchema }),
  z.object({ ok: z.literal(false), error: apiFailureSchema }),
]);
export const collectionReferenceCatalogResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: collectionReferenceCatalogSchema }),
  z.object({ ok: z.literal(false), error: apiFailureSchema }),
]);
export const referenceCreatedResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: z.object({ id: z.uuid() }) }),
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
  updateSubscriber: (id: string, input: SubscriberUpdate) => Promise<DesktopResult<SubscriberDetail>>;
  changeSubscriberStatus: (id: string, input: SubscriberStatusChange) => Promise<DesktopResult<SubscriberDetail>>;
  getSubscriberFinancialProfile: (id: string) => Promise<DesktopResult<SubscriberFinancialProfile>>;
  getSubscriberAudit: (id: string) => Promise<DesktopResult<SubscriberAudit>>;
  createServiceAccount: (subscriberId: string, input: ServiceAccountMaintenance) => Promise<DesktopResult<SubscriberDetail>>;
  updateServiceAccount: (subscriberId: string, serviceId: string, input: ServiceAccountMaintenance) => Promise<DesktopResult<SubscriberDetail>>;
  changeServiceAccountStatus: (subscriberId: string, serviceId: string, input: ServiceAccountStatusChange) => Promise<DesktopResult<SubscriberDetail>>;
  getServicePlans: () => Promise<DesktopResult<ServicePlanCatalog>>;
  createServicePlan: (input: ServicePlanCreate) => Promise<DesktopResult<z.infer<typeof servicePlanCreatedSchema>>>;
  updateServicePlan: (id: string, input: ServicePlanUpdate) => Promise<DesktopResult<ServicePlanCatalog>>;
  changeServicePlanStatus: (id: string, input: ServicePlanStatusChange) => Promise<DesktopResult<ServicePlanCatalog>>;
  getCollectionReferences: () => Promise<DesktopResult<CollectionReferenceCatalog>>;
  createCollectionArea: (input: CollectionAreaCreate) => Promise<DesktopResult<{ id: string }>>;
  updateCollectionArea: (id: string, input: CollectionAreaUpdate) => Promise<DesktopResult<CollectionReferenceCatalog>>;
  changeCollectionAreaStatus: (id: string, input: ReferenceStatusChange) => Promise<DesktopResult<CollectionReferenceCatalog>>;
  createCollector: (input: CollectorCreate) => Promise<DesktopResult<{ id: string }>>;
  updateCollector: (id: string, input: CollectorUpdate) => Promise<DesktopResult<CollectionReferenceCatalog>>;
  changeCollectorStatus: (id: string, input: ReferenceStatusChange) => Promise<DesktopResult<CollectionReferenceCatalog>>;
  getReferenceData: () => Promise<DesktopResult<ReferenceData>>;
  getDashboard: (query: DashboardQuery) => Promise<DesktopResult<Dashboard>>;
  getReport: (query: ReportRequest) => Promise<DesktopResult<ReportData>>;
  exportReport: (input: ReportRequest & { format: 'PDF' | 'XLSX' }) => Promise<DesktopResult<ExportResult>>;
  getServiceHistory: (subscriberId: string) => Promise<DesktopResult<ServiceHistory>>;
}

export const desktopRequestSchemas = {
  login: loginInputSchema,
  changePassword: changePasswordInputSchema,
  subscriberList: subscriberListQuerySchema,
  subscriberId: z.uuid(),
  subscriberCreate: subscriberCreateSchema,
  subscriberUpdate: z.object({ id: z.uuid(), input: subscriberUpdateSchema }),
  subscriberStatus: z.object({ id: z.uuid(), input: subscriberStatusChangeSchema }),
  serviceCreate: z.object({ subscriberId: z.uuid(), input: serviceAccountMaintenanceSchema }),
  serviceUpdate: z.object({ subscriberId: z.uuid(), serviceId: z.uuid(), input: serviceAccountMaintenanceSchema }),
  serviceStatus: z.object({ subscriberId: z.uuid(), serviceId: z.uuid(), input: serviceAccountStatusChangeSchema }),
  planCreate: servicePlanCreateSchema,
  planUpdate: z.object({ id: z.uuid(), input: servicePlanUpdateSchema }),
  planStatus: z.object({ id: z.uuid(), input: servicePlanStatusChangeSchema }),
  areaCreate: collectionAreaCreateSchema,
  areaUpdate: z.object({ id: z.uuid(), input: collectionAreaUpdateSchema }),
  areaStatus: z.object({ id: z.uuid(), input: referenceStatusChangeSchema }),
  collectorCreate: collectorCreateSchema,
  collectorUpdate: z.object({ id: z.uuid(), input: collectorUpdateSchema }),
  collectorStatus: z.object({ id: z.uuid(), input: referenceStatusChangeSchema }),
  dashboard: dashboardQuerySchema,
  report: reportRequestSchema,
  reportExport: reportRequestSchema.extend({ format: z.enum(['PDF', 'XLSX']) }),
};


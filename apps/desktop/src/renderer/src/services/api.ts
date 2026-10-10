import {
  authResultSchema,
  collectionAreaCreateSchema,
  collectionAreaUpdateSchema,
  collectionReferenceCatalogResultSchema,
  changePasswordInputSchema,
  loginInputSchema,
  collectorCreateSchema,
  collectorUpdateSchema,
  referenceCreatedResultSchema,
  referenceStatusChangeSchema,
  referenceDataResultSchema,
  serviceAccountMaintenanceSchema,
  serviceAccountStatusChangeSchema,
  servicePlanCatalogResultSchema,
  servicePlanCreateSchema,
  servicePlanCreatedResultSchema,
  servicePlanStatusChangeSchema,
  servicePlanUpdateSchema,
  sessionResultSchema,
  subscriberCreateSchema,
  subscriberStatusChangeSchema,
  subscriberDetailResultSchema,
  subscriberAuditResultSchema,
  subscriberFinancialResultSchema,
  subscriberUpdateSchema,
  subscriberListQuerySchema,
  subscriberListResultSchema,
  type AuthenticatedUser,
  type CollectionAreaCreate,
  type CollectionAreaUpdate,
  type CollectionReferenceCatalog,
  type CollectorCreate,
  type CollectorUpdate,
  type ReferenceData,
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
  dashboardQuerySchema, dashboardSchema, reportDataSchema, reportRequestSchema, serviceHistorySchema, exportResultSchema,
  type Dashboard, type DashboardQuery, type ExportResult, type ReportData, type ReportRequest, type ServiceHistory,
} from '@bcis/shared';

export class DesktopServiceError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'DesktopServiceError';
  }
}

export const SESSION_INVALID_EVENT = 'bcis:session-invalid';

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

export async function updateSubscriber(id: string, input: SubscriberUpdate): Promise<SubscriberDetail> {
  const command = subscriberUpdateSchema.parse(input);
  return unwrap(subscriberDetailResultSchema.parse(await bridge().updateSubscriber(id, command)));
}

export async function changeSubscriberStatus(id: string, input: SubscriberStatusChange): Promise<SubscriberDetail> {
  const command = subscriberStatusChangeSchema.parse(input);
  return unwrap(subscriberDetailResultSchema.parse(await bridge().changeSubscriberStatus(id, command)));
}

export async function getSubscriberFinancialProfile(id: string): Promise<SubscriberFinancialProfile> {
  return unwrap(subscriberFinancialResultSchema.parse(await bridge().getSubscriberFinancialProfile(id)));
}

export async function getSubscriberAudit(id: string): Promise<SubscriberAudit> {
  return unwrap(subscriberAuditResultSchema.parse(await bridge().getSubscriberAudit(id)));
}

export async function createServiceAccount(subscriberId: string, input: ServiceAccountMaintenance): Promise<SubscriberDetail> {
  const command = serviceAccountMaintenanceSchema.parse(input);
  return unwrap(subscriberDetailResultSchema.parse(await bridge().createServiceAccount(subscriberId, command)));
}

export async function updateServiceAccount(subscriberId: string, serviceId: string, input: ServiceAccountMaintenance): Promise<SubscriberDetail> {
  const command = serviceAccountMaintenanceSchema.parse(input);
  return unwrap(subscriberDetailResultSchema.parse(await bridge().updateServiceAccount(subscriberId, serviceId, command)));
}

export async function changeServiceAccountStatus(subscriberId: string, serviceId: string, input: ServiceAccountStatusChange): Promise<SubscriberDetail> {
  const command = serviceAccountStatusChangeSchema.parse(input);
  return unwrap(subscriberDetailResultSchema.parse(await bridge().changeServiceAccountStatus(subscriberId, serviceId, command)));
}

export async function getServicePlans(): Promise<ServicePlanCatalog> {
  return unwrap(servicePlanCatalogResultSchema.parse(await bridge().getServicePlans()));
}

export async function createServicePlan(input: ServicePlanCreate): Promise<{ id: string; code: string; name: string }> {
  const command = servicePlanCreateSchema.parse(input);
  return unwrap(servicePlanCreatedResultSchema.parse(await bridge().createServicePlan(command)));
}

export async function updateServicePlan(id: string, input: ServicePlanUpdate): Promise<ServicePlanCatalog> {
  const command = servicePlanUpdateSchema.parse(input);
  return unwrap(servicePlanCatalogResultSchema.parse(await bridge().updateServicePlan(id, command)));
}

export async function changeServicePlanStatus(id: string, input: ServicePlanStatusChange): Promise<ServicePlanCatalog> {
  const command = servicePlanStatusChangeSchema.parse(input);
  return unwrap(servicePlanCatalogResultSchema.parse(await bridge().changeServicePlanStatus(id, command)));
}

export async function getCollectionReferences(): Promise<CollectionReferenceCatalog> {
  return unwrap(collectionReferenceCatalogResultSchema.parse(await bridge().getCollectionReferences()));
}

export async function createCollectionArea(input: CollectionAreaCreate): Promise<{ id: string }> {
  return unwrap(referenceCreatedResultSchema.parse(await bridge().createCollectionArea(collectionAreaCreateSchema.parse(input))));
}

export async function updateCollectionArea(id: string, input: CollectionAreaUpdate): Promise<CollectionReferenceCatalog> {
  return unwrap(collectionReferenceCatalogResultSchema.parse(await bridge().updateCollectionArea(id, collectionAreaUpdateSchema.parse(input))));
}

export async function changeCollectionAreaStatus(id: string, input: ReferenceStatusChange): Promise<CollectionReferenceCatalog> {
  return unwrap(collectionReferenceCatalogResultSchema.parse(await bridge().changeCollectionAreaStatus(id, referenceStatusChangeSchema.parse(input))));
}

export async function createCollector(input: CollectorCreate): Promise<{ id: string }> {
  return unwrap(referenceCreatedResultSchema.parse(await bridge().createCollector(collectorCreateSchema.parse(input))));
}

export async function updateCollector(id: string, input: CollectorUpdate): Promise<CollectionReferenceCatalog> {
  return unwrap(collectionReferenceCatalogResultSchema.parse(await bridge().updateCollector(id, collectorUpdateSchema.parse(input))));
}

export async function changeCollectorStatus(id: string, input: ReferenceStatusChange): Promise<CollectionReferenceCatalog> {
  return unwrap(collectionReferenceCatalogResultSchema.parse(await bridge().changeCollectorStatus(id, referenceStatusChangeSchema.parse(input))));
}

export async function getReferenceData(): Promise<ReferenceData> {
  return unwrap(referenceDataResultSchema.parse(await bridge().getReferenceData()));
}

export async function getDashboard(input: DashboardQuery): Promise<Dashboard> {
  const result = await bridge().getDashboard(dashboardQuerySchema.parse(input));
  if (!result.ok) throw new DesktopServiceError(result.error.code, result.error.message);
  return dashboardSchema.parse(result.data);
}

export async function getReport(input: ReportRequest): Promise<ReportData> {
  const result = await bridge().getReport(reportRequestSchema.parse(input));
  if (!result.ok) throw new DesktopServiceError(result.error.code, result.error.message);
  return reportDataSchema.parse(result.data);
}

export async function exportReport(input: ReportRequest & { format: 'PDF' | 'XLSX' }): Promise<ExportResult> {
  const query = { ...reportRequestSchema.parse(input), format: input.format };
  const result = await bridge().exportReport(query);
  if (!result.ok) throw new DesktopServiceError(result.error.code, result.error.message);
  return exportResultSchema.parse(result.data);
}

export async function getServiceHistory(subscriberId: string): Promise<ServiceHistory> {
  const result = await bridge().getServiceHistory(subscriberId);
  if (!result.ok) throw new DesktopServiceError(result.error.code, result.error.message);
  return serviceHistorySchema.parse(result.data);
}


import {
  authResultSchema,
  receivableAgingDesktopResultSchema, receivableAgingQuerySchema,
  receivableAccountDesktopResultSchema, receivableAccountQuerySchema, servicePolicyDesktopResultSchema,
  suspensionListDesktopResultSchema, reconnectionListDesktopResultSchema, technicianListDesktopResultSchema,
  suspensionCreateDesktopResultSchema, serviceControlMutationDesktopResultSchema, serviceControlPolicySchema, createSuspensionInputSchema, reconnectionAssignmentSchema,
  auditSearchSchema, auditSearchDesktopResultSchema, managedUserCreateDesktopResultSchema, managedUserCreateSchema,
  managedUserListDesktopResultSchema, adminMutationDesktopResultSchema, managedUserPatchSchema,
  type AuditSearchQuery, type ManagedUserCreate, type ManagedUserPatch,
  organizationSettingsDesktopResultSchema, organizationSettingsSchema, type OrganizationSettings,
  collectionBatchDesktopResultSchema, collectionBatchListDesktopResultSchema, eligibleCollectionPaymentsDesktopResultSchema,
  collectionBatchListQuerySchema, createCollectionBatchInputSchema, recordCollectionInputSchema,
  remittanceInputSchema, reconciliationInputSchema, closeBatchInputSchema,
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
  type ReceivableAgingQuery, type ReceivableAgingResponse,
  type ReceivableAccountQuery, type ReceivableAccountResponse, type ServiceControlPolicy,
  type CreateSuspensionInput, type ReconnectionAssignment, type ReconnectionListResponse,
  type CollectionBatch, type CollectionBatchList, type CollectionBatchListQuery, type CreateCollectionBatchInput,
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
  billingCycleDetailResultSchema, billingCycleListResultSchema, billingGenerationResultDesktopSchema, billingPreviewResultSchema,
  generateBillingCycleInputSchema, invoiceDetailResultSchema, invoiceListQuerySchema, invoiceListResultSchema,
  type BillingCycleDetail, type BillingCycleList, type BillingGenerationResult, type BillingPreview,
  type GenerateBillingCycleInput, type InvoiceDetail, type InvoiceListQuery, type InvoiceListResponse,
  invoiceMutationResultDesktopSchema, overdueResultDesktopSchema,
  type PostInvoiceAdjustment, type ProcessOverdue, type InvoiceMutationResult, type OverdueResult, type VoidInvoice,
  postInvoiceAdjustmentSchema, processOverdueSchema, voidInvoiceSchema,
  subscriberLedgerDesktopResultSchema, subscriberLedgerQuerySchema, type SubscriberLedger, type SubscriberLedgerQuery,
  paymentDetailDesktopResultSchema, paymentListDesktopResultSchema, paymentListQuerySchema,
  paymentPreviewDesktopResultSchema, paymentPreviewQuerySchema, paymentResultDesktopResultSchema,
  gcashProofQueueDesktopResultSchema, gcashProofContentDesktopResultSchema, verifyGcashInputSchema,
  postPaymentInputSchema, reversePaymentInputSchema,
  type PaymentDetail, type PaymentList, type PaymentListQuery, type PaymentPreview, type PaymentPreviewQuery,
  type PaymentResult, type PostPaymentInput, type ReversePaymentInput,
  type VerifyGcashInput,
} from '@bcis/shared';
import { announceMascotEvent } from '../features/mascot/mascot-events';

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
  const subscriber = unwrap(subscriberDetailResultSchema.parse(await bridge().createSubscriber(command)));
  announceMascotEvent('subscriber-created');
  return subscriber;
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
  announceMascotEvent('report-start');
  try {
    const result = await bridge().getReport(reportRequestSchema.parse(input));
    if (!result.ok) throw new DesktopServiceError(result.error.code, result.error.message);
    const report = reportDataSchema.parse(result.data);
    announceMascotEvent('report-finish');
    return report;
  } catch (error) {
    announceMascotEvent('report-error');
    throw error;
  }
}

export async function exportReport(input: ReportRequest & { format: 'PDF' | 'XLSX' }): Promise<ExportResult> {
  const query = { ...reportRequestSchema.parse(input), format: input.format };
  announceMascotEvent('report-start');
  try {
    const result = await bridge().exportReport(query);
    if (!result.ok) throw new DesktopServiceError(result.error.code, result.error.message);
    const exported = exportResultSchema.parse(result.data);
    if (exported.saved) announceMascotEvent('report-finish');
    return exported;
  } catch (error) {
    announceMascotEvent('report-error');
    throw error;
  }
}

export async function getServiceHistory(subscriberId: string): Promise<ServiceHistory> {
  const result = await bridge().getServiceHistory(subscriberId);
  if (!result.ok) throw new DesktopServiceError(result.error.code, result.error.message);
  return serviceHistorySchema.parse(result.data);
}

export async function listBillingCycles(): Promise<BillingCycleList> {
  return unwrap(billingCycleListResultSchema.parse(await bridge().listBillingCycles()));
}

export async function previewBilling(input: GenerateBillingCycleInput): Promise<BillingPreview> {
  return unwrap(billingPreviewResultSchema.parse(await bridge().previewBilling(generateBillingCycleInputSchema.parse(input))));
}

export async function generateBilling(input: GenerateBillingCycleInput): Promise<BillingGenerationResult> {
  announceMascotEvent('billing-start');
  try {
    const result = unwrap(billingGenerationResultDesktopSchema.parse(await bridge().generateBilling(generateBillingCycleInputSchema.parse(input))));
    announceMascotEvent('billing-success');
    return result;
  } catch (error) {
    announceMascotEvent('billing-error');
    throw error;
  }
}

export async function getBillingCycle(id: string): Promise<BillingCycleDetail> {
  return unwrap(billingCycleDetailResultSchema.parse(await bridge().getBillingCycle(id)));
}

export async function listInvoices(query: InvoiceListQuery): Promise<InvoiceListResponse> {
  return unwrap(invoiceListResultSchema.parse(await bridge().listInvoices(invoiceListQuerySchema.parse(query))));
}

export async function getInvoice(id: string): Promise<InvoiceDetail> {
  return unwrap(invoiceDetailResultSchema.parse(await bridge().getInvoice(id)));
}

export async function postInvoiceAdjustment(id: string, input: PostInvoiceAdjustment): Promise<InvoiceMutationResult> {
  const command = postInvoiceAdjustmentSchema.parse(input);
  return unwrap(invoiceMutationResultDesktopSchema.parse(await bridge().postInvoiceAdjustment(id, command)));
}

export async function voidInvoice(id: string, input: VoidInvoice): Promise<InvoiceMutationResult> {
  const command = voidInvoiceSchema.parse(input);
  return unwrap(invoiceMutationResultDesktopSchema.parse(await bridge().voidInvoice(id, command)));
}

export async function processOverdueInvoices(input: ProcessOverdue): Promise<OverdueResult> {
  const command = processOverdueSchema.parse(input);
  return unwrap(overdueResultDesktopSchema.parse(await bridge().processOverdueInvoices(command)));
}

export async function getSubscriberLedger(id: string, input: SubscriberLedgerQuery = {}): Promise<SubscriberLedger> {
  const query = subscriberLedgerQuerySchema.parse(input);
  return unwrap(subscriberLedgerDesktopResultSchema.parse(await bridge().getSubscriberLedger(id, query)));
}

export async function previewPayment(input: PaymentPreviewQuery): Promise<PaymentPreview> {
  const query = paymentPreviewQuerySchema.parse(input);
  return unwrap(paymentPreviewDesktopResultSchema.parse(await bridge().previewPayment(query)));
}

export async function listPayments(input: PaymentListQuery): Promise<PaymentList> {
  const query = paymentListQuerySchema.parse(input);
  return unwrap(paymentListDesktopResultSchema.parse(await bridge().listPayments(query)));
}

export async function getPayment(id: string): Promise<PaymentDetail> {
  return unwrap(paymentDetailDesktopResultSchema.parse(await bridge().getPayment(id)));
}

export async function postPayment(input: PostPaymentInput): Promise<PaymentResult> {
  const command = postPaymentInputSchema.parse(input);
  try {
    const payment = unwrap(paymentResultDesktopResultSchema.parse(await bridge().postPayment(command)));
    if (payment.status === 'POSTED') announceMascotEvent('payment-posted');
    return payment;
  } catch (error) {
    announceMascotEvent('payment-error');
    throw error;
  }
}

export async function reversePayment(id: string, input: ReversePaymentInput): Promise<PaymentResult> {
  const command = reversePaymentInputSchema.parse(input);
  return unwrap(paymentResultDesktopResultSchema.parse(await bridge().reversePayment(id, command)));
}

export async function selectAndUploadGcashProof() {
  const result = await bridge().selectAndUploadGcashProof();
  if (!result.ok) throw new DesktopServiceError(result.error.code, result.error.message);
  return result.data;
}

export async function listGcashProofs(page: number, pageSize: number) {
  return unwrap(gcashProofQueueDesktopResultSchema.parse(await bridge().listGcashProofs(page, pageSize)));
}

export async function getGcashProof(paymentId: string) {
  return unwrap(gcashProofContentDesktopResultSchema.parse(await bridge().getGcashProof(paymentId)));
}

export async function verifyGcashPayment(paymentId: string, input: VerifyGcashInput): Promise<PaymentResult> {
  const command = verifyGcashInputSchema.parse(input);
  const payment = unwrap(paymentResultDesktopResultSchema.parse(await bridge().verifyGcashPayment(paymentId, command)));
  if (command.decision === 'VERIFIED' && payment.status === 'POSTED') announceMascotEvent('gcash-approved');
  return payment;
}

export async function listCollectionBatches(query: CollectionBatchListQuery): Promise<CollectionBatchList> {
  const command = collectionBatchListQuerySchema.parse(query);
  return unwrap(collectionBatchListDesktopResultSchema.parse(await bridge().listCollectionBatches(command)));
}

export async function createCollectionBatch(input: CreateCollectionBatchInput): Promise<CollectionBatch> {
  const command = createCollectionBatchInputSchema.parse(input);
  return unwrap(collectionBatchDesktopResultSchema.parse(await bridge().createCollectionBatch(command)));
}

export async function getCollectionBatch(id: string): Promise<CollectionBatch> {
  return unwrap(collectionBatchDesktopResultSchema.parse(await bridge().getCollectionBatch(id)));
}

export async function getEligibleCollectionPayments(id: string, accountId: string) {
  return unwrap(eligibleCollectionPaymentsDesktopResultSchema.parse(await bridge().getEligibleCollectionPayments(id, accountId)));
}

export async function getReceivableAging(query: ReceivableAgingQuery): Promise<ReceivableAgingResponse> {
  const command = receivableAgingQuerySchema.parse(query);
  return unwrap(receivableAgingDesktopResultSchema.parse(await bridge().getReceivableAging(command)));
}

export async function getReceivableAccounts(query: ReceivableAccountQuery): Promise<ReceivableAccountResponse> {
  const command = receivableAccountQuerySchema.parse(query);
  const result = unwrap(receivableAccountDesktopResultSchema.parse(await bridge().getReceivableAccounts(command)));
  if (command.overdueOnly && result.total > 0) announceMascotEvent('overdue-found');
  return result;
}
export async function getServiceControlPolicy(): Promise<ServiceControlPolicy> {
  return unwrap(servicePolicyDesktopResultSchema.parse(await bridge().getServiceControlPolicy()));
}
export async function updateServiceControlPolicy(input: ServiceControlPolicy): Promise<ServiceControlPolicy> {
  const command = serviceControlPolicySchema.parse(input);
  return unwrap(servicePolicyDesktopResultSchema.parse(await bridge().updateServiceControlPolicy(command)));
}
export async function listSuspensions(page = 1, pageSize = 25) {
  return unwrap(suspensionListDesktopResultSchema.parse(await bridge().listSuspensions(page, pageSize)));
}
export async function createSuspension(input: CreateSuspensionInput): Promise<{ id: string }> {
  const command = createSuspensionInputSchema.parse(input);
  return unwrap(suspensionCreateDesktopResultSchema.parse(await bridge().createSuspension(command)));
}
export async function approveSuspension(id: string): Promise<null> {
  return unwrap(serviceControlMutationDesktopResultSchema.parse(await bridge().approveSuspension(id)));
}
export async function listReconnections(page = 1, pageSize = 25): Promise<ReconnectionListResponse> {
  return unwrap(reconnectionListDesktopResultSchema.parse(await bridge().listReconnections(page, pageSize)));
}
export async function listMyReconnections(page = 1, pageSize = 25): Promise<ReconnectionListResponse> {
  return unwrap(reconnectionListDesktopResultSchema.parse(await bridge().listMyReconnections(page, pageSize)));
}
export async function listTechnicians() {
  return unwrap(technicianListDesktopResultSchema.parse(await bridge().listTechnicians()));
}
export async function assignReconnection(id: string, input: ReconnectionAssignment): Promise<null> {
  const command = reconnectionAssignmentSchema.parse(input);
  return unwrap(serviceControlMutationDesktopResultSchema.parse(await bridge().assignReconnection(id, command)));
}
export async function completeReconnection(id: string): Promise<null> {
  return unwrap(serviceControlMutationDesktopResultSchema.parse(await bridge().completeReconnection(id)));
}

export async function listManagedUsers() {
  return unwrap(managedUserListDesktopResultSchema.parse(await bridge().listManagedUsers()));
}
export async function createManagedUser(input: ManagedUserCreate): Promise<{ id: string }> {
  return unwrap(managedUserCreateDesktopResultSchema.parse(await bridge().createManagedUser(managedUserCreateSchema.parse(input))));
}
export async function updateManagedUser(id: string, input: ManagedUserPatch): Promise<null> {
  return unwrap(adminMutationDesktopResultSchema.parse(await bridge().updateManagedUser(id, managedUserPatchSchema.parse(input))));
}
export async function resetManagedUserPassword(id: string, password: string): Promise<null> {
  return unwrap(adminMutationDesktopResultSchema.parse(await bridge().resetManagedUserPassword(id, password)));
}
export async function searchAudit(query: AuditSearchQuery) {
  return unwrap(auditSearchDesktopResultSchema.parse(await bridge().searchAudit(auditSearchSchema.parse(query))));
}
export async function getOrganizationSettings(): Promise<OrganizationSettings> {
  return unwrap(organizationSettingsDesktopResultSchema.parse(await bridge().getOrganizationSettings()));
}
export async function updateOrganizationSettings(input: OrganizationSettings): Promise<OrganizationSettings> {
  return unwrap(organizationSettingsDesktopResultSchema.parse(await bridge().updateOrganizationSettings(organizationSettingsSchema.parse(input))));
}

export async function recordCollection(id: string, input: { batchAccountId: string; paymentId: string; notes?: string }): Promise<CollectionBatch> {
  const command = recordCollectionInputSchema.parse(input);
  return unwrap(collectionBatchDesktopResultSchema.parse(await bridge().recordCollection(id, command)));
}

export async function submitCollectionBatch(id: string): Promise<CollectionBatch> {
  return unwrap(collectionBatchDesktopResultSchema.parse(await bridge().submitCollectionBatch(id)));
}

export async function remitCollectionBatch(id: string, input: { remittedCashCentavos: string; notes?: string }): Promise<CollectionBatch> {
  const command = remittanceInputSchema.parse(input);
  return unwrap(collectionBatchDesktopResultSchema.parse(await bridge().remitCollectionBatch(id, command)));
}

export async function reconcileCollectionBatch(id: string, input: { notes: string }): Promise<CollectionBatch> {
  const command = reconciliationInputSchema.parse(input);
  return unwrap(collectionBatchDesktopResultSchema.parse(await bridge().reconcileCollectionBatch(id, command)));
}

export async function closeCollectionBatch(id: string, input: { notes?: string }): Promise<CollectionBatch> {
  const command = closeBatchInputSchema.parse(input);
  return unwrap(collectionBatchDesktopResultSchema.parse(await bridge().closeCollectionBatch(id, command)));
}


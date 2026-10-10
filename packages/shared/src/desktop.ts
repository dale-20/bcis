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
import {
  billingCycleDetailSchema, billingCycleListSchema, billingGenerationResultSchema, billingPreviewSchema,
  generateBillingCycleInputSchema, invoiceDetailSchema, invoiceListQuerySchema, invoiceListResponseSchema,
  postInvoiceAdjustmentSchema, processOverdueSchema, invoiceMutationResultSchema, overdueResultSchema, voidInvoiceSchema,
  type BillingCycleDetail, type BillingCycleList, type BillingGenerationResult, type BillingPreview,
  type GenerateBillingCycleInput, type InvoiceDetail, type InvoiceListQuery, type InvoiceListResponse,
  type PostInvoiceAdjustment, type ProcessOverdue, type InvoiceMutationResult, type OverdueResult, type VoidInvoice,
  subscriberLedgerQuerySchema, type SubscriberLedger, type SubscriberLedgerQuery,
  subscriberLedgerSchema,
} from './billing.js';
import {
  paymentDetailSchema, paymentListQuerySchema, paymentListSchema, paymentPreviewQuerySchema, paymentPreviewSchema,
  postPaymentInputSchema, paymentResultSchema, reversePaymentInputSchema,
  gcashProofContentSchema, gcashProofMetadataSchema, gcashProofQueueSchema, gcashProofUploadInputSchema, verifyGcashInputSchema,
  type PaymentDetail, type PaymentList, type PaymentListQuery, type PaymentPreview, type PaymentPreviewQuery,
  type PostPaymentInput, type PaymentResult, type ReversePaymentInput,
  type GcashProofContent, type GcashProofMetadata, type GcashProofQueue, type VerifyGcashInput,
} from './payments.js';
import { collectionBatchListQuerySchema, collectionBatchListSchema, collectionBatchSchema, createCollectionBatchInputSchema, eligibleCollectionPaymentsSchema, recordCollectionInputSchema, remittanceInputSchema, reconciliationInputSchema, closeBatchInputSchema, type CollectionBatch, type CollectionBatchList, type CollectionBatchListQuery, type CreateCollectionBatchInput, type EligibleCollectionPayment, type RemittanceInput } from './collections.js';
import { receivableAgingQuerySchema, receivableAgingResponseSchema, type ReceivableAgingQuery, type ReceivableAgingResponse } from './receivables.js';
import { createSuspensionInputSchema, organizationSettingsSchema, receivableAccountQuerySchema, receivableAccountResponseSchema, reconnectionAssignmentSchema, reconnectionListResponseSchema, serviceControlPolicySchema, serviceTechnicianListSchema, suspensionListResponseSchema, type CreateSuspensionInput, type OrganizationSettings, type ReceivableAccountQuery, type ReceivableAccountResponse, type ReconnectionAssignment, type ReconnectionListResponse, type ServiceControlPolicy } from './service-control.js';

export const RECEIVABLE_AGING_CHANNEL = 'bcis:receivables:aging';
export const RECEIVABLE_ACCOUNTS_CHANNEL = 'bcis:receivables:accounts';
export const SERVICE_POLICY_GET_CHANNEL = 'bcis:service-control:policy:get';
export const SERVICE_POLICY_UPDATE_CHANNEL = 'bcis:service-control:policy:update';
export const ORGANIZATION_SETTINGS_GET_CHANNEL = 'bcis:system:settings:get';
export const ORGANIZATION_SETTINGS_UPDATE_CHANNEL = 'bcis:system:settings:update';
export const SUSPENSIONS_LIST_CHANNEL = 'bcis:service-control:suspensions:list';
export const SUSPENSION_CREATE_CHANNEL = 'bcis:service-control:suspension:create';
export const SUSPENSION_APPROVE_CHANNEL = 'bcis:service-control:suspension:approve';
export const RECONNECTIONS_LIST_CHANNEL = 'bcis:service-control:reconnections:list';
export const RECONNECTIONS_MINE_CHANNEL = 'bcis:service-control:reconnections:mine';
export const TECHNICIANS_LIST_CHANNEL = 'bcis:service-control:technicians:list';
export const RECONNECTION_ASSIGN_CHANNEL = 'bcis:service-control:reconnection:assign';
export const RECONNECTION_COMPLETE_CHANNEL = 'bcis:service-control:reconnection:complete';
export const ADMIN_USERS_LIST_CHANNEL = 'bcis:admin:users:list';
export const ADMIN_USER_CREATE_CHANNEL = 'bcis:admin:user:create';
export const ADMIN_USER_UPDATE_CHANNEL = 'bcis:admin:user:update';
export const ADMIN_USER_PASSWORD_RESET_CHANNEL = 'bcis:admin:user:password-reset';
export const AUDIT_SEARCH_CHANNEL = 'bcis:audit:search';

export const managedRoleSchema = z.enum(['OWNER', 'ADMIN', 'CASHIER', 'COLLECTION_SUPERVISOR', 'AUDITOR', 'TECHNICIAN', 'VIEWER']);
export const managedUserCreateSchema = z.object({ username: z.string().trim().min(3).max(64).regex(/^[a-zA-Z0-9._-]+$/), displayName: z.string().trim().min(1).max(120), role: managedRoleSchema, password: z.string().min(8).max(128) }).strict();
export const managedUserPatchSchema = z.object({ displayName: z.string().trim().min(1).max(120).optional(), role: managedRoleSchema.optional(), isActive: z.boolean().optional() }).strict().refine((value) => Object.keys(value).length > 0);
export const auditSearchSchema = z.object({ actor: z.string().max(64).default(''), action: z.string().max(100).default(''), entity: z.string().max(80).default(''), requestId: z.string().max(100).default(''), from: z.iso.date().optional(), to: z.iso.date().optional(), page: z.number().int().min(1).default(1), pageSize: z.number().int().min(1).max(100).default(25) }).strict();
export const managedUserListSchema = z.object({ items: z.array(z.object({ id: z.uuid(), username: z.string(), displayName: z.string(), isActive: z.boolean(), mustChangePassword: z.boolean(), roles: z.array(z.string()) })) });
export const auditSearchResultSchema = z.object({ items: z.array(z.object({ id: z.uuid(), actorId: z.uuid().nullable(), actor: z.string().nullable(), action: z.string(), entityType: z.string(), entityId: z.string().nullable(), reason: z.string().nullable(), oldValues: z.unknown().nullable(), newValues: z.unknown().nullable(), requestId: z.string(), createdAt: z.iso.datetime() })), page: z.number().int(), pageSize: z.number().int(), total: z.number().int() });
export type ManagedUserCreate = z.infer<typeof managedUserCreateSchema>;
export type ManagedUserPatch = z.infer<typeof managedUserPatchSchema>;
export type AuditSearchQuery = z.input<typeof auditSearchSchema>;

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
export const BILLING_CYCLES_LIST_CHANNEL = 'bcis:billing-cycles:list';
export const BILLING_PREVIEW_CHANNEL = 'bcis:billing:preview';
export const BILLING_GENERATE_CHANNEL = 'bcis:billing:generate';
export const BILLING_CYCLE_GET_CHANNEL = 'bcis:billing-cycle:get';
export const INVOICES_LIST_CHANNEL = 'bcis:invoices:list';
export const INVOICE_GET_CHANNEL = 'bcis:invoice:get';
export const INVOICE_ADJUST_CHANNEL = 'bcis:invoice:adjust';
export const INVOICE_VOID_CHANNEL = 'bcis:invoice:void';
export const BILLING_OVERDUE_PROCESS_CHANNEL = 'bcis:billing:overdue-process';
export const SUBSCRIBER_LEDGER_CHANNEL = 'bcis:subscriber-ledger:get';
export const PAYMENTS_PREVIEW_CHANNEL = 'bcis:payments:preview';
export const PAYMENTS_LIST_CHANNEL = 'bcis:payments:list';
export const PAYMENT_DETAIL_CHANNEL = 'bcis:payment:detail';
export const PAYMENT_POST_CHANNEL = 'bcis:payment:post';
export const PAYMENT_REVERSE_CHANNEL = 'bcis:payment:reverse';
export const GCASH_PROOF_UPLOAD_CHANNEL = 'bcis:gcash-proof:select-upload';
export const GCASH_PROOF_QUEUE_CHANNEL = 'bcis:gcash-proof:queue';
export const GCASH_PROOF_GET_CHANNEL = 'bcis:gcash-proof:get';
export const GCASH_VERIFY_CHANNEL = 'bcis:gcash:verify';
export const COLLECTION_BATCHES_LIST_CHANNEL = 'bcis:collection-batches:list';
export const COLLECTION_BATCH_CREATE_CHANNEL = 'bcis:collection-batches:create';
export const COLLECTION_BATCH_GET_CHANNEL = 'bcis:collection-batches:get';
export const COLLECTION_RECORD_CHANNEL = 'bcis:collection-batches:record';
export const COLLECTION_SUBMIT_CHANNEL = 'bcis:collection-batches:submit';
export const COLLECTION_REMIT_CHANNEL = 'bcis:collection-batches:remit';
export const COLLECTION_RECONCILE_CHANNEL = 'bcis:collection-batches:reconcile';
export const COLLECTION_CLOSE_CHANNEL = 'bcis:collection-batches:close';
export const COLLECTION_ELIGIBLE_PAYMENTS_CHANNEL = 'bcis:collection-batches:eligible-payments';

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
const desktopResult = <T extends z.ZodType>(schema: T) => z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), data: schema }), z.object({ ok: z.literal(false), error: apiFailureSchema }),
]);
export const billingCycleListResultSchema = desktopResult(billingCycleListSchema);
export const billingPreviewResultSchema = desktopResult(billingPreviewSchema);
export const billingGenerationResultDesktopSchema = desktopResult(billingGenerationResultSchema);
export const billingCycleDetailResultSchema = desktopResult(billingCycleDetailSchema);
export const invoiceListResultSchema = desktopResult(invoiceListResponseSchema);
export const invoiceDetailResultSchema = desktopResult(invoiceDetailSchema);
export const invoiceMutationResultDesktopSchema = desktopResult(invoiceMutationResultSchema);
export const overdueResultDesktopSchema = desktopResult(overdueResultSchema);
export const subscriberLedgerDesktopResultSchema = desktopResult(subscriberLedgerSchema);
export const paymentPreviewDesktopResultSchema = desktopResult(paymentPreviewSchema);
export const paymentListDesktopResultSchema = desktopResult(paymentListSchema);
export const paymentDetailDesktopResultSchema = desktopResult(paymentDetailSchema);
export const paymentResultDesktopResultSchema = desktopResult(paymentResultSchema);
export const gcashProofQueueDesktopResultSchema = desktopResult(gcashProofQueueSchema);
export const gcashProofMetadataDesktopResultSchema = desktopResult(gcashProofMetadataSchema);
export const gcashProofContentDesktopResultSchema = desktopResult(gcashProofContentSchema);
export const collectionBatchListDesktopResultSchema = desktopResult(collectionBatchListSchema);
export const collectionBatchDesktopResultSchema = desktopResult(collectionBatchSchema);
export const eligibleCollectionPaymentsDesktopResultSchema = desktopResult(eligibleCollectionPaymentsSchema);
export const receivableAgingDesktopResultSchema = desktopResult(receivableAgingResponseSchema);
export const receivableAccountDesktopResultSchema = desktopResult(receivableAccountResponseSchema);
export const servicePolicyDesktopResultSchema = desktopResult(serviceControlPolicySchema);
export const suspensionListDesktopResultSchema = desktopResult(suspensionListResponseSchema);
export const reconnectionListDesktopResultSchema = desktopResult(reconnectionListResponseSchema);
export const technicianListDesktopResultSchema = desktopResult(serviceTechnicianListSchema);
export const managedUserListDesktopResultSchema = desktopResult(managedUserListSchema);
export const organizationSettingsDesktopResultSchema = desktopResult(organizationSettingsSchema);
export const managedUserCreateDesktopResultSchema = desktopResult(z.object({ id: z.uuid() }));
export const adminMutationDesktopResultSchema = desktopResult(z.null());
export const auditSearchDesktopResultSchema = desktopResult(auditSearchResultSchema);
export const suspensionCreateDesktopResultSchema = desktopResult(servicePlanCreatedSchema.pick({ id: true }));
export const serviceControlMutationDesktopResultSchema = desktopResult(z.null());

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
  listBillingCycles: () => Promise<DesktopResult<BillingCycleList>>;
  previewBilling: (input: GenerateBillingCycleInput) => Promise<DesktopResult<BillingPreview>>;
  generateBilling: (input: GenerateBillingCycleInput) => Promise<DesktopResult<BillingGenerationResult>>;
  getBillingCycle: (id: string) => Promise<DesktopResult<BillingCycleDetail>>;
  listInvoices: (query: InvoiceListQuery) => Promise<DesktopResult<InvoiceListResponse>>;
  getInvoice: (id: string) => Promise<DesktopResult<InvoiceDetail>>;
  postInvoiceAdjustment: (id: string, input: PostInvoiceAdjustment) => Promise<DesktopResult<InvoiceMutationResult>>;
  voidInvoice: (id: string, input: VoidInvoice) => Promise<DesktopResult<InvoiceMutationResult>>;
  processOverdueInvoices: (input: ProcessOverdue) => Promise<DesktopResult<OverdueResult>>;
  getSubscriberLedger: (id: string, query: SubscriberLedgerQuery) => Promise<DesktopResult<SubscriberLedger>>;
  previewPayment: (query: PaymentPreviewQuery) => Promise<DesktopResult<PaymentPreview>>;
  listPayments: (query: PaymentListQuery) => Promise<DesktopResult<PaymentList>>;
  getPayment: (id: string) => Promise<DesktopResult<PaymentDetail>>;
  postPayment: (input: PostPaymentInput) => Promise<DesktopResult<PaymentResult>>;
  reversePayment: (id: string, input: ReversePaymentInput) => Promise<DesktopResult<PaymentResult>>;
  selectAndUploadGcashProof: () => Promise<DesktopResult<GcashProofMetadata>>;
  listGcashProofs: (page: number, pageSize: number) => Promise<DesktopResult<GcashProofQueue>>;
  getGcashProof: (paymentId: string) => Promise<DesktopResult<GcashProofContent>>;
  verifyGcashPayment: (paymentId: string, input: VerifyGcashInput) => Promise<DesktopResult<PaymentResult>>;
  listCollectionBatches: (query: CollectionBatchListQuery) => Promise<DesktopResult<CollectionBatchList>>;
  createCollectionBatch: (input: CreateCollectionBatchInput) => Promise<DesktopResult<CollectionBatch>>;
  getCollectionBatch: (id: string) => Promise<DesktopResult<CollectionBatch>>;
  recordCollection: (id: string, input: z.infer<typeof recordCollectionInputSchema>) => Promise<DesktopResult<CollectionBatch>>;
  submitCollectionBatch: (id: string) => Promise<DesktopResult<CollectionBatch>>;
  remitCollectionBatch: (id: string, input: RemittanceInput) => Promise<DesktopResult<CollectionBatch>>;
  reconcileCollectionBatch: (id: string, input: z.infer<typeof reconciliationInputSchema>) => Promise<DesktopResult<CollectionBatch>>;
  closeCollectionBatch: (id: string, input: z.infer<typeof closeBatchInputSchema>) => Promise<DesktopResult<CollectionBatch>>;
  getEligibleCollectionPayments: (id: string, accountId: string) => Promise<DesktopResult<EligibleCollectionPayment[]>>;
  getReceivableAging: (query: ReceivableAgingQuery) => Promise<DesktopResult<ReceivableAgingResponse>>;
  getReceivableAccounts: (query: ReceivableAccountQuery) => Promise<DesktopResult<ReceivableAccountResponse>>;
  getServiceControlPolicy: () => Promise<DesktopResult<ServiceControlPolicy>>;
  updateServiceControlPolicy: (policy: ServiceControlPolicy) => Promise<DesktopResult<ServiceControlPolicy>>;
  listSuspensions: (page: number, pageSize: number) => Promise<DesktopResult<z.infer<typeof suspensionListResponseSchema>>>;
  createSuspension: (input: CreateSuspensionInput) => Promise<DesktopResult<{ id: string }>>;
  approveSuspension: (id: string) => Promise<DesktopResult<null>>;
  listReconnections: (page: number, pageSize: number) => Promise<DesktopResult<ReconnectionListResponse>>;
  listMyReconnections: (page: number, pageSize: number) => Promise<DesktopResult<ReconnectionListResponse>>;
  listTechnicians: () => Promise<DesktopResult<z.infer<typeof serviceTechnicianListSchema>>>;
  assignReconnection: (id: string, input: ReconnectionAssignment) => Promise<DesktopResult<null>>;
  completeReconnection: (id: string) => Promise<DesktopResult<null>>;
  listManagedUsers: () => Promise<DesktopResult<z.infer<typeof managedUserListSchema>>>;
  createManagedUser: (input: z.infer<typeof managedUserCreateSchema>) => Promise<DesktopResult<{ id: string }>>;
  updateManagedUser: (id: string, input: z.infer<typeof managedUserPatchSchema>) => Promise<DesktopResult<null>>;
  resetManagedUserPassword: (id: string, password: string) => Promise<DesktopResult<null>>;
  searchAudit: (query: z.infer<typeof auditSearchSchema>) => Promise<DesktopResult<z.infer<typeof auditSearchResultSchema>>>;
  getOrganizationSettings: () => Promise<DesktopResult<OrganizationSettings>>;
  updateOrganizationSettings: (input: OrganizationSettings) => Promise<DesktopResult<OrganizationSettings>>;
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
  billingPeriod: generateBillingCycleInputSchema,
  billingCycleId: z.uuid(),
  invoiceList: invoiceListQuerySchema,
  invoiceId: z.uuid(),
  invoiceAdjustment: z.object({ id: z.uuid(), input: postInvoiceAdjustmentSchema }),
  invoiceVoid: z.object({ id: z.uuid(), input: voidInvoiceSchema }),
  overdueProcess: processOverdueSchema,
  subscriberLedger: z.object({ id: z.uuid(), query: subscriberLedgerQuerySchema }),
  paymentPreview: paymentPreviewQuerySchema,
  paymentList: paymentListQuerySchema,
  paymentId: z.uuid(),
  paymentCreate: postPaymentInputSchema,
  paymentReverse: z.object({ id: z.uuid(), input: reversePaymentInputSchema }),
  gcashProofQueue: z.object({ page: z.number().int().min(1), pageSize: z.number().int().min(10).max(100) }),
  paymentVerification: z.object({ id: z.uuid(), input: verifyGcashInputSchema }),
  collectionBatchList: collectionBatchListQuerySchema,
  collectionBatchCreate: createCollectionBatchInputSchema,
  collectionBatchId: z.uuid(),
  collectionAccount: z.object({ id: z.uuid(), accountId: z.uuid() }),
  collectionRecord: z.object({ id: z.uuid(), input: recordCollectionInputSchema }),
  collectionRemittance: z.object({ id: z.uuid(), input: remittanceInputSchema }),
  collectionReconciliation: z.object({ id: z.uuid(), input: reconciliationInputSchema }),
  collectionClose: z.object({ id: z.uuid(), input: closeBatchInputSchema }),
  receivableAging: receivableAgingQuerySchema,
  receivableAccounts: receivableAccountQuerySchema,
  servicePolicy: serviceControlPolicySchema,
  page: z.object({ page: z.number().int().min(1), pageSize: z.number().int().min(1).max(100) }),
  suspensionCreate: createSuspensionInputSchema,
  suspensionId: z.uuid(),
  reconnectionAssignment: z.object({ id: z.uuid(), input: reconnectionAssignmentSchema }),
  reconnectionId: z.uuid(),
  managedUserCreate: managedUserCreateSchema,
  managedUserUpdate: z.object({ id: z.uuid(), input: managedUserPatchSchema }),
  managedUserPasswordReset: z.object({ id: z.uuid(), password: z.string().min(8).max(128) }),
  auditSearch: auditSearchSchema,
  organizationSettings: organizationSettingsSchema,
  gcashProofUpload: gcashProofUploadInputSchema,
};


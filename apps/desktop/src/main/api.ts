import {
  authenticatedUserSchema,
  receivableAgingQuerySchema, receivableAgingResponseSchema,
  collectionReferenceCatalogSchema,
  collectionBatchListSchema, collectionBatchSchema, eligibleCollectionPaymentsSchema,
  referenceDataSchema,
  servicePlanCatalogSchema,
  servicePlanCreatedSchema,
  subscriberDetailSchema,
  subscriberAuditSchema,
  subscriberFinancialProfileSchema,
  subscriberListResponseSchema,
  type AuthenticatedUser,
  type ReceivableAgingQuery, type ReceivableAgingResponse,
  type CollectionAreaCreate,
  type CollectionAreaUpdate,
  type CollectionReferenceCatalog,
  type CollectorCreate,
  type CollectorUpdate,
  type CollectionBatch, type CollectionBatchList, type CollectionBatchListQuery, type CreateCollectionBatchInput,
  type EligibleCollectionPayment,
  type RemittanceInput,
  type DesktopResult,
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
  dashboardSchema, reportDataSchema, serviceHistorySchema,
  type Dashboard, type DashboardQuery, type ReportData, type ReportRequest, type ServiceHistory,
  billingCycleDetailSchema, billingCycleListSchema, billingGenerationResultSchema, billingPreviewSchema,
  invoiceDetailSchema, invoiceListResponseSchema,
  type BillingCycleDetail, type BillingCycleList, type BillingGenerationResult, type BillingPreview,
  type GenerateBillingCycleInput, type InvoiceDetail, type InvoiceListQuery, type InvoiceListResponse,
  invoiceMutationResultSchema, overdueResultSchema,
  type PostInvoiceAdjustment, type ProcessOverdue, type InvoiceMutationResult, type OverdueResult, type VoidInvoice,
  postInvoiceAdjustmentSchema, processOverdueSchema, voidInvoiceSchema,
  subscriberLedgerSchema, subscriberLedgerQuerySchema, type SubscriberLedger, type SubscriberLedgerQuery,
  paymentDetailSchema, paymentListSchema, paymentListQuerySchema, paymentPreviewSchema, paymentPreviewQuerySchema,
  paymentResultSchema, postPaymentInputSchema, reversePaymentInputSchema,
  gcashProofContentSchema, gcashProofMetadataSchema, gcashProofQueueSchema, gcashProofUploadInputSchema, verifyGcashInputSchema,
  type PaymentDetail, type PaymentList, type PaymentListQuery, type PaymentPreview, type PaymentPreviewQuery,
  type PaymentResult, type PostPaymentInput, type ReversePaymentInput,
  type GcashProofContent, type GcashProofMetadata, type GcashProofQueue, type GcashProofUploadInput, type VerifyGcashInput,
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

  updateSubscriber(id: string, input: SubscriberUpdate): Promise<DesktopResult<SubscriberDetail>> {
    return this.call(`/subscribers/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }, subscriberDetailSchema);
  }

  changeSubscriberStatus(id: string, input: SubscriberStatusChange): Promise<DesktopResult<SubscriberDetail>> {
    return this.call(`/subscribers/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify(input) }, subscriberDetailSchema);
  }

  getSubscriberFinancialProfile(id: string): Promise<DesktopResult<SubscriberFinancialProfile>> {
    return this.call(`/subscribers/${encodeURIComponent(id)}/financial-profile`, { method: 'GET' }, subscriberFinancialProfileSchema);
  }

  getSubscriberAudit(id: string): Promise<DesktopResult<SubscriberAudit>> {
    return this.call(`/subscribers/${encodeURIComponent(id)}/audit`, { method: 'GET' }, subscriberAuditSchema);
  }

  createServiceAccount(subscriberId: string, input: ServiceAccountMaintenance): Promise<DesktopResult<SubscriberDetail>> {
    return this.call(`/subscribers/${encodeURIComponent(subscriberId)}/services`, { method: 'POST', body: JSON.stringify(input) }, subscriberDetailSchema);
  }

  updateServiceAccount(subscriberId: string, serviceId: string, input: ServiceAccountMaintenance): Promise<DesktopResult<SubscriberDetail>> {
    return this.call(`/subscribers/${encodeURIComponent(subscriberId)}/services/${encodeURIComponent(serviceId)}`, { method: 'PATCH', body: JSON.stringify(input) }, subscriberDetailSchema);
  }

  changeServiceAccountStatus(subscriberId: string, serviceId: string, input: ServiceAccountStatusChange): Promise<DesktopResult<SubscriberDetail>> {
    return this.call(`/subscribers/${encodeURIComponent(subscriberId)}/services/${encodeURIComponent(serviceId)}/status`, { method: 'POST', body: JSON.stringify(input) }, subscriberDetailSchema);
  }

  getServicePlans(): Promise<DesktopResult<ServicePlanCatalog>> {
    return this.call('/service-plans', { method: 'GET' }, servicePlanCatalogSchema);
  }

  createServicePlan(input: ServicePlanCreate): Promise<DesktopResult<{ id: string; code: string; name: string }>> {
    return this.call('/service-plans', { method: 'POST', body: JSON.stringify(input) }, servicePlanCreatedSchema);
  }

  updateServicePlan(id: string, input: ServicePlanUpdate): Promise<DesktopResult<ServicePlanCatalog>> {
    return this.call(`/service-plans/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }, servicePlanCatalogSchema);
  }

  changeServicePlanStatus(id: string, input: ServicePlanStatusChange): Promise<DesktopResult<ServicePlanCatalog>> {
    return this.call(`/service-plans/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify(input) }, servicePlanCatalogSchema);
  }

  getCollectionReferences(): Promise<DesktopResult<CollectionReferenceCatalog>> {
    return this.call('/collection-reference-data', { method: 'GET' }, collectionReferenceCatalogSchema);
  }

  listCollectionBatches(query: CollectionBatchListQuery): Promise<DesktopResult<CollectionBatchList>> {
    return this.call(`/collection-batches?${new URLSearchParams({ page: String(query.page), pageSize: String(query.pageSize) })}`, { method: 'GET' }, collectionBatchListSchema);
  }

  createCollectionBatch(input: CreateCollectionBatchInput): Promise<DesktopResult<CollectionBatch>> {
    return this.call('/collection-batches', { method: 'POST', body: JSON.stringify(input) }, collectionBatchSchema);
  }

  getCollectionBatch(id: string): Promise<DesktopResult<CollectionBatch>> {
    return this.call(`/collection-batches/${encodeURIComponent(id)}`, { method: 'GET' }, collectionBatchSchema);
  }

  getEligibleCollectionPayments(id: string, accountId: string): Promise<DesktopResult<EligibleCollectionPayment[]>> {
    return this.call(`/collection-batches/${encodeURIComponent(id)}/accounts/${encodeURIComponent(accountId)}/eligible-payments`, { method: 'GET' }, eligibleCollectionPaymentsSchema);
  }

  recordCollection(id: string, input: { batchAccountId: string; paymentId: string; notes?: string | undefined }): Promise<DesktopResult<CollectionBatch>> {
    return this.call(`/collection-batches/${encodeURIComponent(id)}/collections`, { method: 'POST', body: JSON.stringify(input) }, collectionBatchSchema);
  }

  submitCollectionBatch(id: string): Promise<DesktopResult<CollectionBatch>> {
    return this.call(`/collection-batches/${encodeURIComponent(id)}/submit`, { method: 'POST' }, collectionBatchSchema);
  }

  remitCollectionBatch(id: string, input: RemittanceInput): Promise<DesktopResult<CollectionBatch>> {
    return this.call(`/collection-batches/${encodeURIComponent(id)}/remittance`, { method: 'POST', body: JSON.stringify(input) }, collectionBatchSchema);
  }

  reconcileCollectionBatch(id: string, input: { notes: string }): Promise<DesktopResult<CollectionBatch>> {
    return this.call(`/collection-batches/${encodeURIComponent(id)}/reconcile`, { method: 'POST', body: JSON.stringify(input) }, collectionBatchSchema);
  }

  closeCollectionBatch(id: string, input: { notes?: string | undefined }): Promise<DesktopResult<CollectionBatch>> {
    return this.call(`/collection-batches/${encodeURIComponent(id)}/close`, { method: 'POST', body: JSON.stringify(input) }, collectionBatchSchema);
  }

  createCollectionArea(input: CollectionAreaCreate): Promise<DesktopResult<{ id: string }>> {
    return this.call('/collection-areas', { method: 'POST', body: JSON.stringify(input) }, z.object({ id: z.uuid() }));
  }

  updateCollectionArea(id: string, input: CollectionAreaUpdate): Promise<DesktopResult<CollectionReferenceCatalog>> {
    return this.call(`/collection-areas/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }, collectionReferenceCatalogSchema);
  }

  changeCollectionAreaStatus(id: string, input: ReferenceStatusChange): Promise<DesktopResult<CollectionReferenceCatalog>> {
    return this.call(`/collection-areas/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify(input) }, collectionReferenceCatalogSchema);
  }

  createCollector(input: CollectorCreate): Promise<DesktopResult<{ id: string }>> {
    return this.call('/collectors', { method: 'POST', body: JSON.stringify(input) }, z.object({ id: z.uuid() }));
  }

  updateCollector(id: string, input: CollectorUpdate): Promise<DesktopResult<CollectionReferenceCatalog>> {
    return this.call(`/collectors/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(input) }, collectionReferenceCatalogSchema);
  }

  changeCollectorStatus(id: string, input: ReferenceStatusChange): Promise<DesktopResult<CollectionReferenceCatalog>> {
    return this.call(`/collectors/${encodeURIComponent(id)}/status`, { method: 'POST', body: JSON.stringify(input) }, collectionReferenceCatalogSchema);
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

  getReceivableAging(query: ReceivableAgingQuery): Promise<DesktopResult<ReceivableAgingResponse>> {
    const parsed = receivableAgingQuerySchema.parse(query);
    const parameters = new URLSearchParams({ asOf: parsed.asOf, overdueOnly: String(parsed.overdueOnly), page: String(parsed.page), pageSize: String(parsed.pageSize) });
    if (parsed.collectorId) parameters.set('collectorId', parsed.collectorId);
    if (parsed.collectionAreaId) parameters.set('collectionAreaId', parsed.collectionAreaId);
    return this.call(`/receivables/aging?${parameters.toString()}`, { method: 'GET' }, receivableAgingResponseSchema);
  }

  listBillingCycles(): Promise<DesktopResult<BillingCycleList>> {
    return this.call('/billing/cycles', { method: 'GET' }, billingCycleListSchema);
  }

  previewBilling(input: GenerateBillingCycleInput): Promise<DesktopResult<BillingPreview>> {
    return this.call(`/billing/cycles/preview?period=${encodeURIComponent(input.period)}`, { method: 'GET' }, billingPreviewSchema);
  }

  generateBilling(input: GenerateBillingCycleInput): Promise<DesktopResult<BillingGenerationResult>> {
    return this.call('/billing/cycles/generate', { method: 'POST', body: JSON.stringify(input) }, billingGenerationResultSchema);
  }

  getBillingCycle(id: string): Promise<DesktopResult<BillingCycleDetail>> {
    return this.call(`/billing/cycles/${encodeURIComponent(id)}`, { method: 'GET' }, billingCycleDetailSchema);
  }

  listInvoices(query: InvoiceListQuery): Promise<DesktopResult<InvoiceListResponse>> {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) if (value !== undefined) search.set(key, String(value));
    return this.call(`/invoices?${search.toString()}`, { method: 'GET' }, invoiceListResponseSchema);
  }

  getInvoice(id: string): Promise<DesktopResult<InvoiceDetail>> {
    return this.call(`/invoices/${encodeURIComponent(id)}`, { method: 'GET' }, invoiceDetailSchema);
  }

  postInvoiceAdjustment(id: string, input: PostInvoiceAdjustment): Promise<DesktopResult<InvoiceMutationResult>> {
    return this.call(`/invoices/${encodeURIComponent(id)}/adjustments`, { method: 'POST', body: JSON.stringify(postInvoiceAdjustmentSchema.parse(input)) }, invoiceMutationResultSchema);
  }

  voidInvoice(id: string, input: VoidInvoice): Promise<DesktopResult<InvoiceMutationResult>> {
    return this.call(`/invoices/${encodeURIComponent(id)}/void`, { method: 'POST', body: JSON.stringify(voidInvoiceSchema.parse(input)) }, invoiceMutationResultSchema);
  }

  processOverdueInvoices(input: ProcessOverdue): Promise<DesktopResult<OverdueResult>> {
    return this.call('/billing/overdue/process', { method: 'POST', body: JSON.stringify(processOverdueSchema.parse(input)) }, overdueResultSchema);
  }

  getSubscriberLedger(id: string, query: SubscriberLedgerQuery): Promise<DesktopResult<SubscriberLedger>> {
    const parsedQuery = subscriberLedgerQuerySchema.parse(query);
    const parameters = new URLSearchParams();
    if (parsedQuery.from) parameters.set('from', parsedQuery.from);
    if (parsedQuery.to) parameters.set('to', parsedQuery.to);
    return this.call(`/subscribers/${encodeURIComponent(id)}/ledger?${parameters.toString()}`, { method: 'GET' }, subscriberLedgerSchema);
  }

  previewPayment(query: PaymentPreviewQuery): Promise<DesktopResult<PaymentPreview>> {
    const input = paymentPreviewQuerySchema.parse(query);
    const parameters = new URLSearchParams(input);
    return this.call(`/payments/preview?${parameters.toString()}`, { method: 'GET' }, paymentPreviewSchema);
  }

  listPayments(query: PaymentListQuery): Promise<DesktopResult<PaymentList>> {
    const input = paymentListQuerySchema.parse(query);
    const parameters = new URLSearchParams(Object.entries(input).filter((entry): entry is [string, string | number] => entry[1] !== undefined).map(([key, value]) => [key, String(value)]));
    return this.call(`/payments?${parameters.toString()}`, { method: 'GET' }, paymentListSchema);
  }

  getPayment(id: string): Promise<DesktopResult<PaymentDetail>> {
    return this.call(`/payments/${encodeURIComponent(id)}`, { method: 'GET' }, paymentDetailSchema);
  }

  postPayment(input: PostPaymentInput): Promise<DesktopResult<PaymentResult>> {
    return this.call('/payments', { method: 'POST', body: JSON.stringify(postPaymentInputSchema.parse(input)) }, paymentResultSchema);
  }

  reversePayment(id: string, input: ReversePaymentInput): Promise<DesktopResult<PaymentResult>> {
    return this.call(`/payments/${encodeURIComponent(id)}/reverse`, { method: 'POST', body: JSON.stringify(reversePaymentInputSchema.parse(input)) }, paymentResultSchema);
  }

  uploadGcashProof(input: GcashProofUploadInput): Promise<DesktopResult<GcashProofMetadata>> {
    return this.call('/payments/gcash/proofs', { method: 'POST', body: JSON.stringify(gcashProofUploadInputSchema.parse(input)) }, gcashProofMetadataSchema);
  }

  listGcashProofs(page: number, pageSize: number): Promise<DesktopResult<GcashProofQueue>> {
    const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    return this.call(`/payments/gcash/pending?${query}`, { method: 'GET' }, gcashProofQueueSchema);
  }

  getGcashProof(paymentId: string): Promise<DesktopResult<GcashProofContent>> {
    return this.call(`/payments/${encodeURIComponent(paymentId)}/proof`, { method: 'GET' }, gcashProofContentSchema);
  }

  verifyGcashPayment(paymentId: string, input: VerifyGcashInput): Promise<DesktopResult<PaymentResult>> {
    return this.call(`/payments/${encodeURIComponent(paymentId)}/gcash-verification`, { method: 'POST', body: JSON.stringify(verifyGcashInputSchema.parse(input)) }, paymentResultSchema);
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


import type { BillingCycleDetail, BillingCycleList, BillingGenerationResult, BillingPreview, InvoiceDetail, InvoiceListQuery, InvoiceListResponse, InvoiceMutationResult, OverdueResult, PostInvoiceAdjustment, SubscriberLedger, SubscriberLedgerQuery } from '@bcis/shared';
import type { Database } from '../db/client.js';
import { AppError } from '../errors.js';
import { BillingRepository } from './repository.js';

export class BillingService {
  private readonly repository: BillingRepository;
  constructor(database: Database) { this.repository = new BillingRepository(database); }

  async generate(period: string, actorUserId: string, requestId: string): Promise<BillingGenerationResult> {
    const result = await this.repository.generate({ period, actorUserId, requestId });
    return { ...result, totalInvoicedCentavos: result.totalInvoicedCentavos.toString() };
  }

  async preview(period: string): Promise<BillingPreview> {
    const result = await this.repository.preview(period);
    const row = result.row;
    const existingCycle = row?.cycle_id && row.cycle_status ? {
      id: row.cycle_id, period, periodStart: result.periodStart, periodEnd: result.periodEnd,
      status: row.cycle_status, finalizedAt: row.finalized_at?.toISOString() ?? null,
      invoiceCount: row.invoice_count, totalInvoicedCentavos: row.cycle_total,
    } : null;
    return {
      period, periodStart: result.periodStart, periodEnd: result.periodEnd,
      eligibleServices: row?.eligible_services ?? 0, alreadyInvoicedServices: row?.already_invoiced_services ?? 0,
      invoicesToCreate: row?.invoices_to_create ?? 0, projectedTotalCentavos: row?.projected_total ?? '0', existingCycle,
    };
  }

  async cycles(): Promise<BillingCycleList> {
    const result = await this.repository.listCycles();
    return { items: result.rows.map((row) => ({
      id: row.id, period: row.period_start.slice(0, 7), periodStart: row.period_start, periodEnd: row.period_end,
      status: row.status, finalizedAt: row.finalized_at?.toISOString() ?? null,
      invoiceCount: row.invoice_count, totalInvoicedCentavos: row.total,
    })) };
  }

  async invoices(query: InvoiceListQuery): Promise<InvoiceListResponse> {
    const result = await this.repository.listInvoices(query);
    return {
      items: result.rows.map((row) => ({
        id: row.id, invoiceNumber: row.invoice_number, period: row.period, subscriberId: row.subscriber_id,
        subscriberAccountNumber: row.subscriber_account_number, subscriberName: row.subscriber_name,
        serviceAccountId: row.service_account_id, serviceAccountNumber: row.service_account_number,
        invoiceDate: row.invoice_date, dueDate: row.due_date, status: row.status,
        totalCentavos: row.total, balanceCentavos: row.balance,
      })),
      page: query.page, pageSize: query.pageSize, total: result.total,
      pageCount: result.total === 0 ? 0 : Math.ceil(result.total / query.pageSize),
    };
  }

  async invoice(id: string): Promise<InvoiceDetail> {
    const result = await this.repository.findInvoice(id);
    if (!result) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice not found');
    const row = result.invoice;
    return {
      id: row.id, invoiceNumber: row.invoice_number, period: row.period, subscriberId: row.subscriber_id,
      subscriberAccountNumber: row.subscriber_account_number, subscriberName: row.subscriber_name,
      serviceAccountId: row.service_account_id, serviceAccountNumber: row.service_account_number,
      invoiceDate: row.invoice_date, dueDate: row.due_date, status: row.status,
      totalCentavos: row.total, balanceCentavos: row.balance, finalizedAt: row.finalized_at.toISOString(),
      items: result.items.map((item) => ({ id: item.id, type: item.type, description: item.description, amountCentavos: item.amount })),
      ledgerEntry: result.ledger ? { id: result.ledger.id, referenceNumber: result.ledger.reference_number } : null,
      adjustments: result.adjustments.map((adjustment) => ({ id: adjustment.id, amountCentavos: adjustment.amount, reason: adjustment.reason, status: adjustment.status, createdAt: adjustment.created_at.toISOString() })),
      voidedAt: row.voided_at?.toISOString() ?? null, voidReason: row.void_reason,
    };
  }

  async adjust(invoiceId: string, input: PostInvoiceAdjustment, actorUserId: string, requestId: string): Promise<InvoiceMutationResult> {
    try {
      const result = await this.repository.postAdjustment(invoiceId, BigInt(input.amountCentavos), input.lineType, input.reason, actorUserId, requestId);
      if (!result) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice not found');
      return { invoiceId: result.invoiceId, status: result.status, balanceCentavos: result.balanceCentavos.toString() };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.message === 'INVOICE_NOT_ADJUSTABLE') throw new AppError(409, 'INVOICE_NOT_ADJUSTABLE', 'Invoice cannot be adjusted in its current state');
      if (error instanceof Error && error.message === 'ADJUSTMENT_EXCEEDS_BALANCE') throw new AppError(409, 'ADJUSTMENT_EXCEEDS_BALANCE', 'Credit adjustment exceeds the invoice balance');
      throw error;
    }
  }

  async void(invoiceId: string, reason: string, actorUserId: string, requestId: string): Promise<InvoiceMutationResult> {
    try {
      const result = await this.repository.voidInvoice(invoiceId, reason, actorUserId, requestId);
      if (!result) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice not found');
      return { invoiceId: result.invoiceId, status: result.status, balanceCentavos: result.balanceCentavos.toString() };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error instanceof Error && error.message === 'INVOICE_ALREADY_VOID') throw new AppError(409, 'INVOICE_ALREADY_VOID', 'Invoice is already void');
      if (error instanceof Error && error.message === 'INVOICE_HAS_FINANCIAL_ACTIVITY') throw new AppError(409, 'INVOICE_HAS_FINANCIAL_ACTIVITY', 'Reverse payments and adjustments before voiding this invoice');
      throw error;
    }
  }

  async processOverdue(asOf: string, actorUserId: string, requestId: string): Promise<OverdueResult> {
    return { asOf, invoicesMarkedOverdue: await this.repository.processOverdue(asOf, actorUserId, requestId) };
  }

  async cycle(id: string): Promise<BillingCycleDetail> {
    const result = await this.repository.findCycle(id);
    if (!result) throw new AppError(404, 'BILLING_CYCLE_NOT_FOUND', 'Billing cycle not found');
    const itemsByInvoice = new Map<string, typeof result.items>();
    for (const item of result.items) {
      const items = itemsByInvoice.get(item.invoiceId) ?? [];
      items.push(item);
      itemsByInvoice.set(item.invoiceId, items);
    }
    return {
      id: result.cycle.id,
      period: result.cycle.periodStart.slice(0, 7),
      periodStart: result.cycle.periodStart,
      periodEnd: result.cycle.periodEnd,
      status: result.cycle.status,
      finalizedAt: result.cycle.finalizedAt?.toISOString() ?? null,
      invoices: result.invoices.map((invoice) => {
        if (!invoice.finalizedAt) throw new Error('FINALIZED_INVOICE_TIMESTAMP_MISSING');
        return {
          ...invoice,
          totalCentavos: invoice.totalCentavos.toString(),
          balanceCentavos: invoice.balanceCentavos.toString(),
          finalizedAt: invoice.finalizedAt.toISOString(),
          items: (itemsByInvoice.get(invoice.id) ?? []).map((item) => ({
            id: item.id, type: item.type, description: item.description, amountCentavos: item.amountCentavos.toString(),
          })),
        };
      }),
    };
  }

  async ledger(subscriberId: string, query: SubscriberLedgerQuery = {}): Promise<SubscriberLedger> {
    const rows = await this.repository.ledger(subscriberId, query.to);
    if (!rows) throw new AppError(404, 'SUBSCRIBER_NOT_FOUND', 'Subscriber not found');
    let balance = 0n;
    let openingBalance = 0n;
    const allEntries = rows.map((entry) => {
      balance += entry.debitCentavos - entry.creditCentavos;
      return {
        id: entry.id,
        occurredAt: entry.occurredAt.toISOString(),
        referenceType: entry.referenceType,
        referenceId: entry.referenceId,
        referenceNumber: entry.referenceNumber,
        description: entry.description,
        debitCentavos: entry.debitCentavos.toString(),
        creditCentavos: entry.creditCentavos.toString(),
        runningBalanceCentavos: balance.toString(),
      };
    });
    const fromDate = query.from;
    const entries = fromDate ? allEntries.filter((entry) => entry.occurredAt.slice(0, 10) >= fromDate) : allEntries;
    const beforeRange = fromDate ? allEntries.filter((entry) => entry.occurredAt.slice(0, 10) < fromDate) : [];
    const priorBalance = beforeRange.at(-1)?.runningBalanceCentavos;
    openingBalance = priorBalance ? BigInt(priorBalance) : 0n;
    return {
      subscriberId, from: query.from ?? null, to: query.to ?? null, openingBalanceCentavos: openingBalance.toString(),
      entries, closingBalanceCentavos: balance.toString(),
    };
  }
}

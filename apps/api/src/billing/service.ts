import type { BillingCycleDetail, BillingGenerationResult, SubscriberLedger } from '@bcis/shared';
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

  async ledger(subscriberId: string): Promise<SubscriberLedger> {
    const rows = await this.repository.ledger(subscriberId);
    if (!rows) throw new AppError(404, 'SUBSCRIBER_NOT_FOUND', 'Subscriber not found');
    let balance = 0n;
    const entries = rows.map((entry) => {
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
    return { subscriberId, entries, closingBalanceCentavos: balance.toString() };
  }
}

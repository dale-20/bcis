import { and, asc, eq, lte, sql } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  auditLogs,
  billingCycles,
  invoiceItems,
  invoices,
  ledgerEntries,
  serviceAccounts,
  servicePlans,
  subscribers,
} from '../db/schema.js';
import { invoiceDates, periodBounds } from './dates.js';

interface GenerationContext { period: string; actorUserId: string; requestId: string }

export class BillingRepository {
  constructor(private readonly database: Database) {}

  async generate({ period, actorUserId, requestId }: GenerationContext) {
    const { periodStart, periodEnd } = periodBounds(period);
    return this.database.db.transaction(async (transaction) => {
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`billing:${period}`}))`);
      await transaction.insert(billingCycles).values({ periodStart, periodEnd, status: 'OPEN' })
        .onConflictDoNothing({ target: [billingCycles.periodStart, billingCycles.periodEnd] });
      const [cycle] = await transaction.select().from(billingCycles)
        .where(and(eq(billingCycles.periodStart, periodStart), eq(billingCycles.periodEnd, periodEnd))).limit(1);
      if (!cycle) throw new Error('BILLING_CYCLE_NOT_FOUND');

      if (cycle.status === 'FINALIZED' || cycle.status === 'CLOSED') {
        const [summary] = await transaction.select({
          count: sql<number>`count(*)::int`,
          total: sql<bigint>`coalesce(sum(${invoices.totalCentavos}), 0)::bigint`,
        }).from(invoices).where(eq(invoices.billingCycleId, cycle.id));
        return {
          cycleId: cycle.id, period, periodStart, periodEnd, status: 'FINALIZED' as const,
          invoicesCreated: 0, duplicatesSkipped: summary?.count ?? 0,
          totalInvoicedCentavos: summary?.total ?? 0n,
        };
      }

      await transaction.update(billingCycles).set({ status: 'GENERATING' }).where(eq(billingCycles.id, cycle.id));
      const billableServices = await transaction.select({
        id: serviceAccounts.id,
        serviceAccountNumber: serviceAccounts.serviceAccountNumber,
        subscriberId: serviceAccounts.subscriberId,
        billingStartDate: serviceAccounts.billingStartDate,
        billingDay: serviceAccounts.billingDay,
        dueDay: serviceAccounts.dueDay,
        rate: serviceAccounts.currentRateCentavos,
        planName: servicePlans.name,
      }).from(serviceAccounts)
        .innerJoin(servicePlans, eq(serviceAccounts.planId, servicePlans.id))
        .where(and(eq(serviceAccounts.status, 'ACTIVE'), lte(serviceAccounts.billingStartDate, periodEnd)))
        .orderBy(asc(serviceAccounts.serviceAccountNumber));

      let invoicesCreated = 0;
      let duplicatesSkipped = 0;
      let totalInvoicedCentavos = 0n;
      const finalizedAt = new Date();
      for (const service of billableServices) {
        const dates = invoiceDates(period, service.billingStartDate, service.billingDay, service.dueDay);
        const sequenceResult = await transaction.execute<{ value: string }>(sql`SELECT nextval('invoice_number_seq')::text AS value`);
        const sequenceValue = sequenceResult.rows[0]?.value;
        if (!sequenceValue) throw new Error('INVOICE_NUMBER_FAILED');
        const invoiceNumber = `INV-${period.replace('-', '')}-${sequenceValue.padStart(8, '0')}`;
        const [invoice] = await transaction.insert(invoices).values({
          invoiceNumber,
          subscriberId: service.subscriberId,
          serviceAccountId: service.id,
          billingCycleId: cycle.id,
          invoiceDate: dates.invoiceDate,
          dueDate: dates.dueDate,
          status: 'DRAFT',
          totalCentavos: service.rate,
          balanceCentavos: service.rate,
        }).onConflictDoNothing({ target: [invoices.serviceAccountId, invoices.billingCycleId] })
          .returning({ id: invoices.id });
        if (!invoice) { duplicatesSkipped += 1; continue; }

        await transaction.insert(invoiceItems).values({
          invoiceId: invoice.id,
          type: 'SUBSCRIPTION',
          description: `${service.planName} monthly subscription - ${period}`,
          amountCentavos: service.rate,
          sourceType: 'SERVICE_ACCOUNT',
          sourceId: service.id,
        });
        if (service.rate > 0n) {
          await transaction.insert(ledgerEntries).values({
            subscriberId: service.subscriberId,
            occurredAt: new Date(`${dates.invoiceDate}T00:00:00.000Z`),
            referenceType: 'INVOICE',
            referenceId: invoice.id,
            referenceNumber: invoiceNumber,
            description: `Monthly subscription - ${service.serviceAccountNumber} - ${period}`,
            debitCentavos: service.rate,
            creditCentavos: 0n,
            metadata: { billingCycleId: cycle.id, serviceAccountId: service.id, period },
          });
        }
        await transaction.update(invoices).set({
          status: service.rate === 0n ? 'PAID' : 'UNPAID',
          finalizedAt,
          finalizedByUserId: actorUserId,
        }).where(eq(invoices.id, invoice.id));
        invoicesCreated += 1;
        totalInvoicedCentavos += service.rate;
      }

      await transaction.update(billingCycles).set({
        status: 'FINALIZED', finalizedAt, finalizedByUserId: actorUserId,
      }).where(eq(billingCycles.id, cycle.id));
      await transaction.insert(auditLogs).values({
        actorUserId,
        action: 'billing.cycle.generated',
        entityType: 'billing_cycle',
        entityId: cycle.id,
        reason: 'MONTHLY_BILLING',
        newValues: { period, invoicesCreated, duplicatesSkipped, totalInvoicedCentavos: totalInvoicedCentavos.toString() },
        requestId,
      });
      return { cycleId: cycle.id, period, periodStart, periodEnd, status: 'FINALIZED' as const, invoicesCreated, duplicatesSkipped, totalInvoicedCentavos };
    });
  }

  async findCycle(id: string) {
    const [cycle] = await this.database.db.select().from(billingCycles).where(eq(billingCycles.id, id)).limit(1);
    if (!cycle) return null;
    const invoiceRows = await this.database.db.select({
      id: invoices.id,
      invoiceNumber: invoices.invoiceNumber,
      subscriberId: invoices.subscriberId,
      serviceAccountId: invoices.serviceAccountId,
      serviceAccountNumber: serviceAccounts.serviceAccountNumber,
      invoiceDate: invoices.invoiceDate,
      dueDate: invoices.dueDate,
      status: invoices.status,
      totalCentavos: invoices.totalCentavos,
      balanceCentavos: invoices.balanceCentavos,
      finalizedAt: invoices.finalizedAt,
    }).from(invoices).innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id))
      .where(eq(invoices.billingCycleId, id)).orderBy(asc(invoices.invoiceNumber));
    const itemRows = await this.database.db.select({
      id: invoiceItems.id, invoiceId: invoiceItems.invoiceId, type: invoiceItems.type,
      description: invoiceItems.description, amountCentavos: invoiceItems.amountCentavos,
    }).from(invoiceItems).innerJoin(invoices, eq(invoiceItems.invoiceId, invoices.id))
      .where(eq(invoices.billingCycleId, id)).orderBy(asc(invoiceItems.createdAt), asc(invoiceItems.id));
    return { cycle, invoices: invoiceRows, items: itemRows };
  }

  async ledger(subscriberId: string) {
    const [subscriber] = await this.database.db.select({ id: subscribers.id }).from(subscribers).where(eq(subscribers.id, subscriberId)).limit(1);
    if (!subscriber) return null;
    return this.database.db.select().from(ledgerEntries).where(eq(ledgerEntries.subscriberId, subscriberId))
      .orderBy(asc(ledgerEntries.occurredAt), asc(ledgerEntries.referenceType), asc(ledgerEntries.referenceNumber), asc(ledgerEntries.id));
  }
}

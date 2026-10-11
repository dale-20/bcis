import { and, asc, eq, inArray, lt, lte, sql } from 'drizzle-orm';
import type { InvoiceListQuery } from '@bcis/shared';
import type { Database } from '../db/client.js';
import {
  auditLogs,
  adjustments,
  billingCycles,
  invoiceItems,
  invoices,
  ledgerEntries,
  paymentAllocations,
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

  async preview(period: string) {
    const { periodStart, periodEnd } = periodBounds(period);
    const result = await this.database.pool.query<{
      eligible_services: number; already_invoiced_services: number; invoices_to_create: number;
      projected_total: string; cycle_id: string | null; cycle_status: 'OPEN' | 'GENERATING' | 'FINALIZED' | 'CLOSED' | null;
      finalized_at: Date | null; invoice_count: number; cycle_total: string;
    }>(`select
      count(sa.id)::int eligible_services,
      count(i.id)::int already_invoiced_services,
      count(sa.id) filter (where i.id is null)::int invoices_to_create,
      coalesce(sum(sa.current_rate_centavos) filter (where i.id is null),0)::text projected_total,
      bc.id cycle_id,bc.status::text cycle_status,bc.finalized_at,
      count(i.id)::int invoice_count,coalesce(sum(i.total_centavos),0)::text cycle_total
    from service_accounts sa
    left join billing_cycles bc on bc.period_start=$1::date and bc.period_end=$2::date
    left join invoices i on i.service_account_id=sa.id and i.billing_cycle_id=bc.id
    where sa.status='ACTIVE' and sa.billing_start_date <= $2::date
    group by bc.id,bc.status,bc.finalized_at`, [periodStart, periodEnd]);
    return { period, periodStart, periodEnd, row: result.rows[0] };
  }

  async listCycles() {
    return this.database.pool.query<{ id: string; period_start: string; period_end: string; status: 'OPEN' | 'GENERATING' | 'FINALIZED' | 'CLOSED'; finalized_at: Date | null; invoice_count: number; total: string }>(
      `select bc.id,bc.period_start::text,bc.period_end::text,bc.status::text,bc.finalized_at,count(i.id)::int invoice_count,coalesce(sum(i.total_centavos),0)::text total
       from billing_cycles bc left join invoices i on i.billing_cycle_id=bc.id
       group by bc.id order by bc.period_start desc limit 36`,
    );
  }

  async listInvoices(query: InvoiceListQuery) {
    const values: unknown[] = [];
    const filters: string[] = [];
    const add = (value: unknown): string => { values.push(value); return `$${values.length}`; };
    if (query.query) {
      const term = add(`%${query.query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`);
      filters.push(`(i.invoice_number ilike ${term} escape '\\' or s.account_number ilike ${term} escape '\\' or sa.service_account_number ilike ${term} escape '\\' or concat_ws(' ',s.first_name,s.middle_name,s.last_name) ilike ${term} escape '\\')`);
    }
    if (query.period !== 'ALL') filters.push(`bc.period_start=${add(`${query.period}-01`)}::date`);
    if (query.status !== 'ALL') filters.push(`i.status=${add(query.status)}::invoice_status`);
    if (query.dueFrom) filters.push(`i.due_date>=${add(query.dueFrom)}::date`);
    if (query.dueTo) filters.push(`i.due_date<=${add(query.dueTo)}::date`);
    if (query.minAmountCentavos) filters.push(`i.total_centavos>=${add(query.minAmountCentavos)}::bigint`);
    if (query.maxAmountCentavos) filters.push(`i.total_centavos<=${add(query.maxAmountCentavos)}::bigint`);
    const where = filters.length ? `where ${filters.join(' and ')}` : '';
    const countValues = [...values];
    const sortColumn = {
      invoiceDate: 'i.invoice_date', invoice: 'i.invoice_number', subscriber: 's.account_number', service: 'sa.service_account_number',
      dueDate: 'i.due_date', status: 'i.status', total: 'i.total_centavos', balance: 'i.balance_centavos',
    }[query.sort];
    const direction = query.direction === 'asc' ? 'asc' : 'desc';
    const limit = add(query.pageSize);
    const offset = add((query.page - 1) * query.pageSize);
    const base = `from invoices i join billing_cycles bc on bc.id=i.billing_cycle_id join subscribers s on s.id=i.subscriber_id join service_accounts sa on sa.id=i.service_account_id ${where}`;
    const [countResult, rows] = await Promise.all([
      this.database.pool.query<{ total: number }>(`select count(*)::int total ${base}`, countValues),
      this.database.pool.query<{ id: string; invoice_number: string; period: string; subscriber_id: string; subscriber_account_number: string; subscriber_name: string; service_account_id: string; service_account_number: string; invoice_date: string; due_date: string; status: 'DRAFT' | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID' | 'CREDITED'; total: string; balance: string }>(
        `select i.id,i.invoice_number,to_char(bc.period_start,'YYYY-MM') period,i.subscriber_id,s.account_number subscriber_account_number,trim(concat_ws(' ',s.first_name,s.middle_name,s.last_name)) subscriber_name,i.service_account_id,sa.service_account_number,i.invoice_date::text,i.due_date::text,i.status::text,i.total_centavos::text total,i.balance_centavos::text balance ${base} order by ${sortColumn} ${direction},i.id ${direction} limit ${limit} offset ${offset}`,
        values,
      ),
    ]);
    return { rows: rows.rows, total: countResult.rows[0]?.total ?? 0 };
  }

  async findInvoice(id: string) {
    const invoice = await this.database.pool.query<{ id: string; invoice_number: string; period: string; subscriber_id: string; subscriber_account_number: string; subscriber_name: string; service_account_id: string; service_account_number: string; invoice_date: string; due_date: string; status: 'DRAFT' | 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID' | 'CREDITED'; total: string; balance: string; finalized_at: Date; voided_at: Date | null; void_reason: string | null }>(
      `select i.id,i.invoice_number,to_char(bc.period_start,'YYYY-MM') period,i.subscriber_id,s.account_number subscriber_account_number,trim(concat_ws(' ',s.first_name,s.middle_name,s.last_name)) subscriber_name,i.service_account_id,sa.service_account_number,i.invoice_date::text,i.due_date::text,i.status::text,i.total_centavos::text total,i.balance_centavos::text balance,i.finalized_at,i.voided_at,i.void_reason
       from invoices i join billing_cycles bc on bc.id=i.billing_cycle_id join subscribers s on s.id=i.subscriber_id join service_accounts sa on sa.id=i.service_account_id where i.id=$1`, [id]);
    if (!invoice.rows[0]) return null;
    const [items, ledger, adjustmentRows] = await Promise.all([
      this.database.pool.query<{ id: string; type: 'SUBSCRIPTION' | 'INSTALLATION' | 'RECONNECTION' | 'DISCOUNT' | 'PENALTY' | 'ADJUSTMENT'; description: string; amount: string }>(`select id,type::text,description,amount_centavos::text amount from invoice_items where invoice_id=$1 order by created_at,id`, [id]),
      this.database.pool.query<{ id: string; reference_number: string }>(`select id,reference_number from ledger_entries where reference_type='INVOICE' and reference_id=$1 limit 1`, [id]),
      this.database.pool.query<{ id: string; amount: string; reason: string; status: 'PENDING' | 'APPROVED' | 'POSTED' | 'REJECTED' | 'REVERSED'; created_at: Date }>(`select id,amount_centavos::text amount,reason,status::text,created_at from adjustments where invoice_id=$1 order by created_at,id`, [id]),
    ]);
    return { invoice: invoice.rows[0], items: items.rows, ledger: ledger.rows[0] ?? null, adjustments: adjustmentRows.rows };
  }

  async postAdjustment(invoiceId: string, amountCentavos: bigint, lineType: 'INSTALLATION' | 'RECONNECTION' | 'DISCOUNT' | 'PENALTY' | 'ADJUSTMENT', reason: string, actorUserId: string, requestId: string) {
    return this.database.db.transaction(async (transaction) => {
      const [initial] = await transaction.select({ subscriberId: invoices.subscriberId }).from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
      if (!initial) return null;
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`subscriber:${initial.subscriberId}`}))`);
      const [invoice] = await transaction.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1).for('update');
      if (!invoice) return null;
      if (!['UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CREDITED'].includes(invoice.status)) throw new Error('INVOICE_NOT_ADJUSTABLE');
      const newBalance = invoice.balanceCentavos + amountCentavos;
      if (newBalance < 0n) throw new Error('ADJUSTMENT_EXCEEDS_BALANCE');
      const now = new Date();
      const [adjustment] = await transaction.insert(adjustments).values({
        invoiceId, amountCentavos, lineType, reason, status: 'POSTED', requestedByUserId: actorUserId,
        approvedByUserId: actorUserId, approvedAt: now,
      }).returning({ id: adjustments.id });
      if (!adjustment) throw new Error('ADJUSTMENT_INSERT_FAILED');
      const isPastDue = invoice.dueDate < now.toISOString().slice(0, 10);
      const status: 'CREDITED' | 'PARTIALLY_PAID' | 'UNPAID' | 'OVERDUE' = newBalance === 0n ? 'CREDITED'
        : isPastDue ? 'OVERDUE'
        : newBalance < invoice.totalCentavos ? 'PARTIALLY_PAID' : 'UNPAID';
      await transaction.update(invoices).set({ balanceCentavos: newBalance, status }).where(eq(invoices.id, invoiceId));
      const referenceNumber = `${invoice.invoiceNumber}-ADJ-${adjustment.id.slice(0, 8).toUpperCase()}`;
      await transaction.insert(ledgerEntries).values({
        subscriberId: invoice.subscriberId, occurredAt: now, referenceType: 'INVOICE_ADJUSTMENT', referenceId: adjustment.id,
        referenceNumber, description: `${lineType.replaceAll('_', ' ')} - ${reason}`,
        debitCentavos: amountCentavos > 0n ? amountCentavos : 0n,
        creditCentavos: amountCentavos < 0n ? -amountCentavos : 0n,
        metadata: { invoiceId, lineType },
      });
      await transaction.insert(auditLogs).values({
        actorUserId, action: 'invoice.adjustment.posted', entityType: 'invoice', entityId: invoiceId, reason,
        oldValues: { status: invoice.status, balanceCentavos: invoice.balanceCentavos.toString() },
        newValues: { status, balanceCentavos: newBalance.toString(), amountCentavos: amountCentavos.toString(), lineType, adjustmentId: adjustment.id }, requestId,
      });
      return { invoiceId, status, balanceCentavos: newBalance };
    });
  }

  async voidInvoice(invoiceId: string, reason: string, actorUserId: string, requestId: string) {
    return this.database.db.transaction(async (transaction) => {
      const [initial] = await transaction.select({ subscriberId: invoices.subscriberId }).from(invoices).where(eq(invoices.id, invoiceId)).limit(1);
      if (!initial) return null;
      await transaction.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`subscriber:${initial.subscriberId}`}))`);
      const [invoice] = await transaction.select().from(invoices).where(eq(invoices.id, invoiceId)).limit(1).for('update');
      if (!invoice) return null;
      if (invoice.status === 'VOID') throw new Error('INVOICE_ALREADY_VOID');
      const [allocation, adjustment] = await Promise.all([
        transaction.select({ paymentId: paymentAllocations.paymentId }).from(paymentAllocations).where(eq(paymentAllocations.invoiceId, invoiceId)).limit(1),
        transaction.select({ id: adjustments.id }).from(adjustments).where(eq(adjustments.invoiceId, invoiceId)).limit(1),
      ]);
      if (allocation.length > 0 || adjustment.length > 0 || invoice.balanceCentavos !== invoice.totalCentavos) throw new Error('INVOICE_HAS_FINANCIAL_ACTIVITY');
      const now = new Date();
      await transaction.update(invoices).set({ status: 'VOID', balanceCentavos: 0n, voidedAt: now, voidedByUserId: actorUserId, voidReason: reason }).where(eq(invoices.id, invoiceId));
      if (invoice.totalCentavos > 0n) await transaction.insert(ledgerEntries).values({
        subscriberId: invoice.subscriberId, occurredAt: now, referenceType: 'INVOICE_VOID', referenceId: invoiceId,
        referenceNumber: invoice.invoiceNumber, description: `Invoice void - ${reason}`,
        debitCentavos: 0n, creditCentavos: invoice.totalCentavos, metadata: { invoiceId },
      });
      await transaction.insert(auditLogs).values({
        actorUserId, action: 'invoice.voided', entityType: 'invoice', entityId: invoiceId, reason,
        oldValues: { status: invoice.status, balanceCentavos: invoice.balanceCentavos.toString() },
        newValues: { status: 'VOID', balanceCentavos: '0' }, requestId,
      });
      return { invoiceId, status: 'VOID' as const, balanceCentavos: 0n };
    });
  }

  async processOverdue(asOf: string, actorUserId: string, requestId: string) {
    return this.database.db.transaction(async (transaction) => {
      const changed = await transaction.update(invoices).set({ status: 'OVERDUE' })
        .where(and(inArray(invoices.status, ['UNPAID', 'PARTIALLY_PAID']), lt(invoices.dueDate, asOf), sql`${invoices.balanceCentavos} > 0`))
        .returning({ id: invoices.id, oldStatus: invoices.status });
      for (const row of changed) await transaction.insert(auditLogs).values({
        actorUserId, action: 'invoice.marked_overdue', entityType: 'invoice', entityId: row.id, reason: `AS_OF_${asOf}`,
        newValues: { status: 'OVERDUE', asOf }, requestId,
      });
      return changed.length;
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

  async ledger(subscriberId: string, to?: string) {
    const [subscriber] = await this.database.db.select({ id: subscribers.id }).from(subscribers).where(eq(subscribers.id, subscriberId)).limit(1);
    if (!subscriber) return null;
    const entries = await this.database.db.select().from(ledgerEntries).where(and(
      eq(ledgerEntries.subscriberId, subscriberId),
      ...(to ? [sql`${ledgerEntries.occurredAt} < (${to}::date + interval '1 day')`] : []),
    )).orderBy(asc(ledgerEntries.occurredAt), asc(ledgerEntries.referenceType), asc(ledgerEntries.referenceNumber), asc(ledgerEntries.id));
    return entries;
  }
}

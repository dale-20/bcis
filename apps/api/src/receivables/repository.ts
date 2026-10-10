import { and, asc, count, eq, gt, inArray, sql, type SQL } from 'drizzle-orm';
import type { ReceivableAgingQuery } from '@bcis/shared';
import type { Database } from '../db/client.js';
import { collectionAreas, collectors, invoices, serviceAccounts, subscribers } from '../db/schema.js';

export class ReceivableRepository {
  constructor(private readonly database: Database) {}

  async aging(query: ReceivableAgingQuery) {
    const conditions: SQL[] = [
      gt(invoices.balanceCentavos, 0n),
      inArray(invoices.status, ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE']),
    ];
    if (query.overdueOnly) conditions.push(sql`${invoices.dueDate} < CAST(${query.asOf} AS date)`);
    if (query.collectorId) conditions.push(eq(serviceAccounts.assignedCollectorId, query.collectorId));
    if (query.collectionAreaId) conditions.push(eq(serviceAccounts.collectionAreaId, query.collectionAreaId));
    const where = and(...conditions);
    const daysOverdue = sql<number>`greatest(0, CAST(${query.asOf} AS date) - ${invoices.dueDate})::int`;
    const bucket = sql<'CURRENT' | '1_30' | '31_60' | '61_90' | '90_PLUS'>`CASE
      WHEN ${invoices.dueDate} >= CAST(${query.asOf} AS date) THEN 'CURRENT'
      WHEN CAST(${query.asOf} AS date) - ${invoices.dueDate} BETWEEN 1 AND 30 THEN '1_30'
      WHEN CAST(${query.asOf} AS date) - ${invoices.dueDate} BETWEEN 31 AND 60 THEN '31_60'
      WHEN CAST(${query.asOf} AS date) - ${invoices.dueDate} BETWEEN 61 AND 90 THEN '61_90'
      ELSE '90_PLUS' END`;
    const base = this.database.db.select({
      invoiceId: invoices.id, invoiceNumber: invoices.invoiceNumber, subscriberId: subscribers.id, accountNumber: subscribers.accountNumber,
      firstName: subscribers.firstName, lastName: subscribers.lastName, organizationName: subscribers.organizationName,
      serviceAccountNumber: serviceAccounts.serviceAccountNumber, dueDate: invoices.dueDate, daysOverdue, bucket,
      balanceCentavos: invoices.balanceCentavos, collectorId: collectors.id, collectorName: collectors.name,
      collectionAreaId: collectionAreas.id, collectionAreaName: collectionAreas.name,
    }).from(invoices).innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id))
      .innerJoin(subscribers, eq(invoices.subscriberId, subscribers.id))
      .leftJoin(collectors, eq(serviceAccounts.assignedCollectorId, collectors.id))
      .leftJoin(collectionAreas, eq(serviceAccounts.collectionAreaId, collectionAreas.id));
    const rows = await base.where(where).orderBy(asc(invoices.dueDate), asc(invoices.invoiceNumber))
      .limit(query.pageSize).offset((query.page - 1) * query.pageSize);
    const [totalRow] = await this.database.db.select({ total: count() }).from(invoices)
      .innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id)).where(where);
    const [totals] = await this.database.db.select({
      CURRENT: sql<bigint>`coalesce(sum(CASE WHEN ${invoices.dueDate} >= CAST(${query.asOf} AS date) THEN ${invoices.balanceCentavos} ELSE 0 END), 0)::bigint`.mapWith(invoices.balanceCentavos),
      '1_30': sql<bigint>`coalesce(sum(CASE WHEN CAST(${query.asOf} AS date) - ${invoices.dueDate} BETWEEN 1 AND 30 THEN ${invoices.balanceCentavos} ELSE 0 END), 0)::bigint`.mapWith(invoices.balanceCentavos),
      '31_60': sql<bigint>`coalesce(sum(CASE WHEN CAST(${query.asOf} AS date) - ${invoices.dueDate} BETWEEN 31 AND 60 THEN ${invoices.balanceCentavos} ELSE 0 END), 0)::bigint`.mapWith(invoices.balanceCentavos),
      '61_90': sql<bigint>`coalesce(sum(CASE WHEN CAST(${query.asOf} AS date) - ${invoices.dueDate} BETWEEN 61 AND 90 THEN ${invoices.balanceCentavos} ELSE 0 END), 0)::bigint`.mapWith(invoices.balanceCentavos),
      '90_PLUS': sql<bigint>`coalesce(sum(CASE WHEN CAST(${query.asOf} AS date) - ${invoices.dueDate} > 90 THEN ${invoices.balanceCentavos} ELSE 0 END), 0)::bigint`.mapWith(invoices.balanceCentavos),
    }).from(invoices).innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id)).where(where);
    return { rows, total: totalRow?.total ?? 0, totals: totals ?? { CURRENT: 0n, '1_30': 0n, '31_60': 0n, '61_90': 0n, '90_PLUS': 0n } };
  }
}

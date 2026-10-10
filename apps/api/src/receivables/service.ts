import type { ReceivableAgingQuery, ReceivableAgingResponse } from '@bcis/shared';
import type { Database } from '../db/client.js';
import { ReceivableRepository } from './repository.js';

export class ReceivableService {
  private readonly repository: ReceivableRepository;
  constructor(database: Database) { this.repository = new ReceivableRepository(database); }

  async aging(query: ReceivableAgingQuery): Promise<ReceivableAgingResponse> {
    const result = await this.repository.aging(query);
    const totals = result.totals;
    const total = Object.values(totals).reduce((sum, amount) => sum + amount, 0n);
    return {
      asOf: query.asOf, overdueOnly: query.overdueOnly, page: query.page, pageSize: query.pageSize, total: result.total,
      totals: { CURRENT: totals.CURRENT.toString(), '1_30': totals['1_30'].toString(), '31_60': totals['31_60'].toString(), '61_90': totals['61_90'].toString(), '90_PLUS': totals['90_PLUS'].toString(), total: total.toString() },
      rows: result.rows.map((row) => ({
        invoiceId: row.invoiceId, invoiceNumber: row.invoiceNumber, subscriberId: row.subscriberId, accountNumber: row.accountNumber,
        subscriberName: row.organizationName ?? `${row.firstName} ${row.lastName}`, serviceAccountNumber: row.serviceAccountNumber,
        dueDate: row.dueDate, daysOverdue: row.daysOverdue, bucket: row.bucket, balanceCentavos: row.balanceCentavos.toString(),
        collectorId: row.collectorId, collectorName: row.collectorName, collectionAreaId: row.collectionAreaId, collectionAreaName: row.collectionAreaName,
      })),
    };
  }
}

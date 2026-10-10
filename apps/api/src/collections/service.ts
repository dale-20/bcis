import type { CollectionBatch, CollectionBatchList, CollectionBatchListQuery, CreateCollectionBatchInput } from '@bcis/shared';
import type { Database } from '../db/client.js';
import { AppError } from '../errors.js';
import { CollectionRepository } from './repository.js';

export class CollectionService {
  private readonly repository: CollectionRepository;
  constructor(database: Database) { this.repository = new CollectionRepository(database); }

  references() { return this.repository.references(); }
  async eligiblePayments(batchId: string, batchAccountId: string) {
    const rows = await this.repository.eligiblePayments(batchId, batchAccountId);
    return rows.map((row) => ({ ...row, amountCentavos: row.amountCentavos.toString(), paymentDate: row.paymentDate.toISOString() }));
  }
  async list(query: CollectionBatchListQuery): Promise<CollectionBatchList> {
    const result = await this.repository.list(query);
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        expectedReceivableCentavos: item.expectedReceivableCentavos.toString(),
        remittance: item.remittance ? {
          ...item.remittance,
          expectedCashCentavos: item.remittance.expectedCashCentavos.toString(),
          remittedCashCentavos: item.remittance.remittedCashCentavos.toString(),
          differenceCentavos: item.remittance.differenceCentavos.toString(),
          nonCashCentavos: item.remittance.nonCashCentavos.toString(),
          remittedAt: item.remittance.remittedAt.toISOString(),
        } : null,
      })),
    };
  }
  async create(input: CreateCollectionBatchInput, actorUserId: string, requestId: string) { return this.map(await this.repository.create(input, { actorUserId, requestId })); }
  async detail(id: string) { return this.map(await this.repository.detail(id)); }
  async record(id: string, input: { batchAccountId: string; paymentId: string; notes?: string | undefined }, actorUserId: string, requestId: string) { return this.map(await this.repository.record(id, input.batchAccountId, input.paymentId, input.notes, { actorUserId, requestId })); }
  async submit(id: string, actorUserId: string, requestId: string) { return this.map(await this.repository.submit(id, { actorUserId, requestId })); }
  async remit(id: string, input: { remittedCashCentavos: string; notes?: string | undefined }, actorUserId: string, requestId: string) { return this.map(await this.repository.remit(id, BigInt(input.remittedCashCentavos), input.notes, { actorUserId, requestId })); }
  async reconcile(id: string, notes: string, actorUserId: string, requestId: string) { return this.map(await this.repository.reconcile(id, notes, { actorUserId, requestId })); }
  async close(id: string, notes: string | undefined, actorUserId: string, requestId: string) { return this.map(await this.repository.close(id, notes, { actorUserId, requestId })); }

  private map(result: Awaited<ReturnType<CollectionRepository['detail']>>): CollectionBatch {
    if (!result) throw new AppError(404, 'COLLECTION_BATCH_NOT_FOUND', 'Collection batch not found');
    const { batch } = result;
    return {
      ...batch,
      expectedReceivableCentavos: batch.expectedReceivableCentavos.toString(),
      submittedAt: batch.submittedAt?.toISOString() ?? null,
      reconciledAt: batch.reconciledAt?.toISOString() ?? null,
      closedAt: batch.closedAt?.toISOString() ?? null,
      accounts: result.accounts.map((account) => ({
        id: account.id, subscriberId: account.subscriberId, accountNumber: account.accountNumber,
        subscriberName: account.organizationName ?? `${account.firstName} ${account.lastName}`,
        serviceAccountId: account.serviceAccountId, serviceAccountNumber: account.serviceAccountNumber,
        address: [account.line1, account.barangay, account.municipality, account.province].join(', '),
        currentBillCentavos: account.currentBillCentavos.toString(), arrearsCentavos: account.arrearsCentavos.toString(), amountDueCentavos: account.amountDueCentavos.toString(),
        paymentId: account.paymentId, paymentMethod: account.paymentMethod, paymentAmountCentavos: account.paymentAmountCentavos?.toString() ?? null,
        outcome: account.outcome, notes: account.notes,
      })),
      remittance: result.remittance ? {
        id: result.remittance.id, expectedCashCentavos: result.remittance.expectedCashCentavos.toString(), remittedCashCentavos: result.remittance.remittedCashCentavos.toString(),
        differenceCentavos: result.remittance.differenceCentavos.toString(), nonCashCentavos: result.remittance.nonCashCentavos.toString(),
        remittedAt: result.remittance.remittedAt.toISOString(), notes: result.remittance.notes,
      } : null,
    };
  }
}

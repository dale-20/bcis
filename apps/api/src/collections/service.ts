import type { CollectionBatch, CreateCollectionBatchInput } from '@bcis/shared';
import type { Database } from '../db/client.js';
import { AppError } from '../errors.js';
import { CollectionRepository } from './repository.js';

export class CollectionService {
  private readonly repository: CollectionRepository;
  constructor(database: Database) { this.repository = new CollectionRepository(database); }

  references() { return this.repository.references(); }
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

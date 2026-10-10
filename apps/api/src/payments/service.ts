import type { GcashProofUploadInput, PaymentListQuery, PaymentPreviewQuery, PaymentResult, PostPaymentInput, ReversePaymentInput, VerifyGcashInput } from '@bcis/shared';
import type { Database } from '../db/client.js';
import { AppError } from '../errors.js';
import { PaymentRepository } from './repository.js';
import { GcashProofStorage } from './proof-storage.js';

function databaseError(error: unknown): { code?: string; constraint?: string } {
  let current: unknown = error;
  while (typeof current === 'object' && current !== null) {
    const candidate = current as { code?: string; constraint?: string; cause?: unknown };
    if (candidate.code) return candidate;
    current = candidate.cause;
  }
  return {};
}

export class PaymentService {
  private readonly repository: PaymentRepository;
  constructor(database: Database, proofStorage: GcashProofStorage) { this.repository = new PaymentRepository(database, proofStorage); }

  async uploadProof(input: GcashProofUploadInput, actorUserId: string) {
    return this.repository.uploadProof(input, actorUserId);
  }

  async pendingGcash(page: number, pageSize: number) {
    const result = await this.repository.pendingGcash(page, pageSize);
    return { items: result.rows, page, pageSize, total: result.total, pageCount: result.total === 0 ? 0 : Math.ceil(result.total / pageSize) };
  }

  async readProof(paymentId: string) { return this.repository.readProof(paymentId); }

  async preview(input: PaymentPreviewQuery) { return this.repository.preview(input); }

  async list(query: PaymentListQuery) {
    const result = await this.repository.list(query);
    return {
      items: result.rows,
      page: query.page,
      pageSize: query.pageSize,
      total: result.total,
      pageCount: result.total === 0 ? 0 : Math.ceil(result.total / query.pageSize),
    };
  }

  async detail(paymentId: string) {
    const result = await this.repository.detail(paymentId);
    if (!result) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Payment not found');
    return result;
  }

  async create(input: PostPaymentInput, actorUserId: string, requestId: string): Promise<PaymentResult> {
    try { return this.toResult(await this.repository.create(input, { actorUserId, requestId })); }
    catch (error) { throw this.mapDatabaseError(error); }
  }

  async verify(paymentId: string, input: VerifyGcashInput, actorUserId: string, requestId: string): Promise<PaymentResult> {
    try { return this.toResult(await this.repository.verify(paymentId, input, { actorUserId, requestId })); }
    catch (error) { throw this.mapDatabaseError(error); }
  }

  async reverse(paymentId: string, input: ReversePaymentInput, actorUserId: string, requestId: string): Promise<PaymentResult> {
    try { return this.toResult(await this.repository.reverse(paymentId, input.reason, { actorUserId, requestId })); }
    catch (error) { throw this.mapDatabaseError(error); }
  }

  private toResult(result: Awaited<ReturnType<PaymentRepository['create']>>): PaymentResult {
    return {
      paymentId: result.payment.id, subscriberId: result.payment.subscriberId,
      method: result.payment.method, status: result.payment.status,
      amountCentavos: result.payment.amountCentavos.toString(), receiptNumber: result.receiptNumber,
      allocatedCentavos: result.allocated.toString(), unappliedCreditCentavos: result.unapplied.toString(),
      allocations: result.allocations.map((allocation) => ({ ...allocation, amountCentavos: allocation.amountCentavos.toString() })),
    };
  }

  private mapDatabaseError(error: unknown): unknown {
    if (error instanceof AppError) return error;
    const database = databaseError(error);
    if (database.code === '23505' && database.constraint === 'payments_gcash_reference_uq') {
      return new AppError(409, 'GCASH_REFERENCE_DUPLICATE', 'GCash reference number already exists');
    }
    if (database.code === '23505' && database.constraint === 'payments_idempotency_key_uq') {
      return new AppError(409, 'IDEMPOTENCY_KEY_CONFLICT', 'Payment request was already processed');
    }
    return error;
  }
}

import type { PaymentResult, PostPaymentInput, ReversePaymentInput, VerifyGcashInput } from '@bcis/shared';
import type { Database } from '../db/client.js';
import { AppError } from '../errors.js';
import { PaymentRepository } from './repository.js';

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
  constructor(database: Database) { this.repository = new PaymentRepository(database); }

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
      method: result.payment.method as 'CASH' | 'GCASH', status: result.payment.status,
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

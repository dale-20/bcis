import type {
  CollectionAreaCreate,
  CollectorCreate,
  ServicePlanCreate,
  SubscriberCreate,
  SubscriberDetail,
  SubscriberListQuery,
  SubscriberListResponse,
} from './types.js';
import type { Database } from '../db/client.js';
import { AppError } from '../errors.js';
import { SubscriberRepository } from './repository.js';
import { auditLogs, collectionAreas, collectors, servicePlans, serviceTypes } from '../db/schema.js';
import { eq } from 'drizzle-orm';

function databaseCode(error: unknown): string | undefined {
  const cause = error instanceof Error && 'cause' in error ? error.cause : error;
  return typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string' ? cause.code : undefined;
}

export class SubscriberService {
  private readonly repository: SubscriberRepository;

  constructor(private readonly database: Database) {
    this.repository = new SubscriberRepository(database);
  }

  async list(query: SubscriberListQuery): Promise<SubscriberListResponse> {
    const { rows, total } = await this.repository.list(query);
    return {
      items: rows.map((row) => ({ ...row, updatedAt: row.updatedAt.toISOString() })),
      page: query.page,
      pageSize: query.pageSize,
      total,
      pageCount: total === 0 ? 0 : Math.ceil(total / query.pageSize),
    };
  }

  async get(id: string): Promise<SubscriberDetail> {
    const result = await this.repository.findById(id);
    if (!result) throw new AppError(404, 'SUBSCRIBER_NOT_FOUND', 'Subscriber not found');
    const { subscriber, contacts, addresses, services } = result;
    const displayName = [subscriber.firstName, subscriber.middleName, subscriber.lastName].filter(Boolean).join(' ');
    return {
      ...subscriber,
      displayName,
      createdAt: subscriber.createdAt.toISOString(),
      updatedAt: subscriber.updatedAt.toISOString(),
      contacts: contacts.map((contact) => ({ id: contact.id, type: contact.type, value: contact.value, isPrimary: contact.isPrimary })),
      addresses: addresses.map((address) => ({
        id: address.id, type: address.type, line1: address.line1, line2: address.line2,
        barangay: address.barangay, municipality: address.municipality, province: address.province,
        postalCode: address.postalCode, isPrimary: address.isPrimary,
      })),
      services: services.map((service) => ({ ...service, currentRateCentavos: service.currentRateCentavos.toString() })),
    };
  }

  async references() {
    const result = await this.repository.referenceData();
    return {
      servicePlans: result.plans.map((plan) => ({
        ...plan,
        priceCentavos: plan.priceCentavos.toString(),
        installationFeeCentavos: plan.installationFeeCentavos.toString(),
        reconnectionFeeCentavos: plan.reconnectionFeeCentavos.toString(),
      })),
      collectionAreas: result.areas,
      collectors: result.collectors,
    };
  }

  async create(input: SubscriberCreate, actorUserId: string, requestId: string): Promise<SubscriberDetail> {
    try {
      const id = await this.repository.create(input, actorUserId, requestId);
      return await this.get(id);
    } catch (error) {
      if (error instanceof Error && error.message === 'REFERENCE_NOT_FOUND') {
        throw new AppError(400, 'REFERENCE_NOT_FOUND', 'A selected plan, area, or collector is unavailable');
      }
      if (databaseCode(error) === '23505') {
        throw new AppError(409, 'DUPLICATE_IDENTIFIER', 'The account or service number is already in use');
      }
      throw error;
    }
  }

  async createServicePlan(input: ServicePlanCreate, actorUserId: string, requestId: string) {
    const [type] = await this.database.db.select({ id: serviceTypes.id }).from(serviceTypes)
      .where(eq(serviceTypes.id, input.serviceTypeId)).limit(1);
    if (!type) throw new AppError(400, 'SERVICE_TYPE_NOT_FOUND', 'Service type not found');
    try {
      const [plan] = await this.database.db.transaction(async (transaction) => {
        const created = await transaction.insert(servicePlans).values({
          ...input,
          priceCentavos: BigInt(input.priceCentavos),
          installationFeeCentavos: BigInt(input.installationFeeCentavos),
          reconnectionFeeCentavos: BigInt(input.reconnectionFeeCentavos),
        }).returning({ id: servicePlans.id, code: servicePlans.code, name: servicePlans.name });
        const row = created[0];
        if (!row) throw new Error('PLAN_INSERT_FAILED');
        await transaction.insert(auditLogs).values({ actorUserId, action: 'service_plan.created', entityType: 'service_plan', entityId: row.id, newValues: { code: row.code }, requestId });
        return created;
      });
      return plan;
    } catch (error) {
      if (databaseCode(error) === '23505') throw new AppError(409, 'DUPLICATE_PLAN_CODE', 'Plan code is already in use');
      throw error;
    }
  }

  async createCollectionArea(input: CollectionAreaCreate, actorUserId: string, requestId: string) {
    return this.createSimpleReference(collectionAreas, input, actorUserId, requestId, 'collection_area.created');
  }

  async createCollector(input: CollectorCreate, actorUserId: string, requestId: string) {
    return this.createSimpleReference(collectors, input, actorUserId, requestId, 'collector.created');
  }

  private async createSimpleReference(table: typeof collectionAreas | typeof collectors, input: CollectionAreaCreate | CollectorCreate, actorUserId: string, requestId: string, action: string) {
    try {
      return await this.database.db.transaction(async (transaction) => {
        const created = table === collectionAreas
          ? await transaction.insert(collectionAreas).values(input as CollectionAreaCreate).returning({ id: collectionAreas.id })
          : await transaction.insert(collectors).values(input as CollectorCreate).returning({ id: collectors.id });
        const row = created[0];
        if (!row) throw new Error('REFERENCE_INSERT_FAILED');
        await transaction.insert(auditLogs).values({ actorUserId, action, entityType: action.split('.')[0] ?? 'reference', entityId: row.id, newValues: input, requestId });
        return row;
      });
    } catch (error) {
      if (databaseCode(error) === '23505') throw new AppError(409, 'DUPLICATE_REFERENCE', 'Code or number is already in use');
      throw error;
    }
  }
}


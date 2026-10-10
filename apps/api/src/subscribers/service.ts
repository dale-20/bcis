import type {
  CollectionAreaCreate,
  CollectionAreaUpdate,
  CollectorCreate,
  CollectorUpdate,
  ReferenceStatusChange,
  ServiceAccountMaintenance,
  ServiceAccountStatusChange,
  ServicePlanCreate,
  ServicePlanStatusChange,
  ServicePlanUpdate,
  SubscriberCreate,
  SubscriberAudit,
  SubscriberDetail,
  SubscriberFinancialProfile,
  SubscriberListQuery,
  SubscriberListResponse,
  SubscriberStatusChange,
  SubscriberUpdate,
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

function assertPlanAttributes(category: 'INTERNET' | 'CABLE' | 'COMBO', input: ServicePlanCreate | ServicePlanUpdate): void {
  if ((category === 'INTERNET' || category === 'COMBO') && input.speedMbps === undefined) throw new AppError(400, 'PLAN_SPEED_REQUIRED', 'Internet and Combo plans require a speed');
  if ((category === 'CABLE' || category === 'COMBO') && input.channelCount === undefined) throw new AppError(400, 'PLAN_CHANNELS_REQUIRED', 'Cable and Combo plans require a channel count');
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

  async financialProfile(id: string): Promise<SubscriberFinancialProfile> {
    await this.get(id);
    const result = await this.repository.financialProfile(id);
    return {
      subscriberId: id,
      outstandingCentavos: result.summary?.outstanding ?? '0',
      availableCreditCentavos: result.summary?.credit ?? '0',
      invoices: result.invoices.map((row) => ({ id: row.id, invoiceNumber: row.invoice_number, serviceAccountNumber: row.service_account_number, invoiceDate: row.invoice_date, dueDate: row.due_date, status: row.status, totalCentavos: row.total, balanceCentavos: row.balance })),
      payments: result.payments.map((row) => ({ id: row.id, receiptNumber: row.receipt_number, paymentDate: row.payment_date.toISOString(), method: row.method, status: row.status, referenceNumber: row.reference_number, amountCentavos: row.amount })),
      ledger: result.ledger.map((row) => ({ id: row.id, occurredAt: row.occurred_at.toISOString(), referenceNumber: row.reference_number, description: row.description, debitCentavos: row.debit, creditCentavos: row.credit, runningBalanceCentavos: row.running_balance })),
      documents: result.documents.map((row) => ({ id: row.id, paymentId: row.payment_id, originalFilename: row.original_filename, mimeType: row.mime_type, sizeBytes: row.size_bytes, status: row.status, createdAt: row.created_at.toISOString() })),
    };
  }

  async auditHistory(id: string): Promise<SubscriberAudit> {
    await this.get(id);
    const result = await this.repository.auditHistory(id);
    return { subscriberId: id, entries: result.rows.map((row) => ({ id: row.id, action: row.action, entityType: row.entity_type, entityId: row.entity_id, reason: row.reason, actorName: row.actor_name, oldValues: row.old_values, newValues: row.new_values, createdAt: row.created_at.toISOString() })) };
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

  async update(id: string, input: SubscriberUpdate, actorUserId: string, requestId: string): Promise<SubscriberDetail> {
    try {
      await this.repository.update(id, input, actorUserId, requestId);
      return await this.get(id);
    } catch (error) {
      if (error instanceof Error && error.message === 'SUBSCRIBER_NOT_FOUND') throw new AppError(404, 'SUBSCRIBER_NOT_FOUND', 'Subscriber not found');
      if (error instanceof Error && (error.message === 'CHILD_NOT_OWNED' || error.message === 'DUPLICATE_CHILD_ID')) {
        throw new AppError(400, 'SUBSCRIBER_CHILD_INVALID', 'A contact or address does not belong to this subscriber');
      }
      if (error instanceof Error && error.message === 'ADDRESS_IN_USE') {
        throw new AppError(409, 'ADDRESS_IN_USE', 'An address assigned to a service account cannot be removed');
      }
      if (databaseCode(error) === '23505') throw new AppError(409, 'DUPLICATE_IDENTIFIER', 'The account number or contact value is already in use');
      throw error;
    }
  }

  async changeStatus(id: string, input: SubscriberStatusChange, actorUserId: string, requestId: string): Promise<SubscriberDetail> {
    try {
      await this.repository.changeStatus(id, input, actorUserId, requestId);
      return await this.get(id);
    } catch (error) {
      if (error instanceof Error && error.message === 'SUBSCRIBER_NOT_FOUND') throw new AppError(404, 'SUBSCRIBER_NOT_FOUND', 'Subscriber not found');
      if (error instanceof Error && error.message === 'STATUS_TRANSITION_INVALID') throw new AppError(409, 'STATUS_TRANSITION_INVALID', 'This subscriber status change is not allowed');
      if (error instanceof Error && error.message === 'ACTIVE_SERVICES_EXIST') throw new AppError(409, 'ACTIVE_SERVICES_EXIST', 'Disconnect or terminate every service account before making the subscriber inactive or archived');
      throw error;
    }
  }

  async createServicePlan(input: ServicePlanCreate, actorUserId: string, requestId: string) {
    const [type] = await this.database.db.select({ id: serviceTypes.id, category: serviceTypes.category }).from(serviceTypes)
      .where(eq(serviceTypes.id, input.serviceTypeId)).limit(1);
    if (!type) throw new AppError(400, 'SERVICE_TYPE_NOT_FOUND', 'Service type not found');
    assertPlanAttributes(type.category, input);
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

  async planCatalog() {
    const catalog = await this.repository.planCatalog();
    return {
      serviceTypes: catalog.types,
      plans: catalog.plans.map((plan) => ({ ...plan, priceCentavos: plan.priceCentavos.toString(), installationFeeCentavos: plan.installationFeeCentavos.toString(), reconnectionFeeCentavos: plan.reconnectionFeeCentavos.toString() })),
    };
  }

  async updateServicePlan(id: string, input: ServicePlanUpdate, actorUserId: string, requestId: string) {
    const [type] = await this.database.db.select({ category: serviceTypes.category }).from(serviceTypes).where(eq(serviceTypes.id, input.serviceTypeId)).limit(1);
    if (!type) throw new AppError(400, 'SERVICE_TYPE_NOT_FOUND', 'Service type not found');
    assertPlanAttributes(type.category, input);
    try {
      await this.repository.updatePlan(id, input, actorUserId, requestId);
      return await this.planCatalog();
    } catch (error) {
      if (error instanceof Error && error.message === 'PLAN_NOT_FOUND') throw new AppError(404, 'PLAN_NOT_FOUND', 'Service plan not found');
      if (databaseCode(error) === '23505') throw new AppError(409, 'DUPLICATE_PLAN_CODE', 'Plan code is already in use');
      throw error;
    }
  }

  async changeServicePlanStatus(id: string, input: ServicePlanStatusChange, actorUserId: string, requestId: string) {
    try {
      await this.repository.changePlanStatus(id, input, actorUserId, requestId);
      return await this.planCatalog();
    } catch (error) {
      if (error instanceof Error && error.message === 'PLAN_NOT_FOUND') throw new AppError(404, 'PLAN_NOT_FOUND', 'Service plan not found');
      if (error instanceof Error && error.message === 'PLAN_STATUS_UNCHANGED') throw new AppError(409, 'PLAN_STATUS_UNCHANGED', 'The service plan already has this status');
      throw error;
    }
  }

  async createServiceAccount(subscriberId: string, input: ServiceAccountMaintenance, actorUserId: string, requestId: string): Promise<SubscriberDetail> {
    try {
      await this.repository.createService(subscriberId, input, actorUserId, requestId);
      return await this.get(subscriberId);
    } catch (error) {
      if (error instanceof Error && error.message === 'SUBSCRIBER_NOT_FOUND') throw new AppError(404, 'SUBSCRIBER_NOT_FOUND', 'Subscriber not found');
      if (error instanceof Error && error.message === 'REFERENCE_NOT_FOUND') throw new AppError(400, 'REFERENCE_NOT_FOUND', 'A selected plan, address, area, or collector is unavailable');
      if (error instanceof Error && error.message === 'ASSIGNMENT_DATE_BEFORE_CURRENT') throw new AppError(409, 'ASSIGNMENT_DATE_BEFORE_CURRENT', 'Assignment effective date cannot precede the current assignment');
      if (error instanceof Error && error.message === 'ASSIGNMENT_EFFECTIVE_DATE_MUST_ADVANCE') throw new AppError(409, 'ASSIGNMENT_EFFECTIVE_DATE_MUST_ADVANCE', 'Choose an effective date after the current assignment start');
      if (databaseCode(error) === '23505') throw new AppError(409, 'DUPLICATE_SERVICE_NUMBER', 'Service account number is already in use');
      throw error;
    }
  }

  async updateServiceAccount(subscriberId: string, serviceId: string, input: ServiceAccountMaintenance, actorUserId: string, requestId: string): Promise<SubscriberDetail> {
    try {
      await this.repository.updateService(subscriberId, serviceId, input, actorUserId, requestId);
      return await this.get(subscriberId);
    } catch (error) {
      if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND') throw new AppError(404, 'SERVICE_NOT_FOUND', 'Service account not found');
      if (error instanceof Error && error.message === 'SERVICE_TERMINATED') throw new AppError(409, 'SERVICE_TERMINATED', 'A terminated service account cannot be edited');
      if (error instanceof Error && error.message === 'REFERENCE_NOT_FOUND') throw new AppError(400, 'REFERENCE_NOT_FOUND', 'A selected plan, address, area, or collector is unavailable');
      if (error instanceof Error && error.message === 'ASSIGNMENT_DATE_BEFORE_CURRENT') throw new AppError(409, 'ASSIGNMENT_DATE_BEFORE_CURRENT', 'Assignment effective date cannot precede the current assignment');
      if (error instanceof Error && error.message === 'ASSIGNMENT_EFFECTIVE_DATE_MUST_ADVANCE') throw new AppError(409, 'ASSIGNMENT_EFFECTIVE_DATE_MUST_ADVANCE', 'Choose an effective date after the current assignment start');
      if (databaseCode(error) === '23505') throw new AppError(409, 'DUPLICATE_SERVICE_NUMBER', 'Service account number is already in use');
      throw error;
    }
  }

  async changeServiceAccountStatus(subscriberId: string, serviceId: string, input: ServiceAccountStatusChange, actorUserId: string, requestId: string): Promise<SubscriberDetail> {
    try {
      await this.repository.changeServiceStatus(subscriberId, serviceId, input, actorUserId, requestId);
      return await this.get(subscriberId);
    } catch (error) {
      if (error instanceof Error && error.message === 'SERVICE_NOT_FOUND') throw new AppError(404, 'SERVICE_NOT_FOUND', 'Service account not found');
      if (error instanceof Error && error.message === 'SERVICE_STATUS_INVALID') throw new AppError(409, 'SERVICE_STATUS_INVALID', 'This service status change is not allowed');
      if (error instanceof Error && error.message === 'SERVICE_CONTROL_WORKFLOW_REQUIRED') throw new AppError(409, 'SERVICE_CONTROL_WORKFLOW_REQUIRED', 'Suspension and reconnection must use their approval workflow');
      throw error;
    }
  }

  async createCollectionArea(input: CollectionAreaCreate, actorUserId: string, requestId: string) {
    return this.createSimpleReference(collectionAreas, input, actorUserId, requestId, 'collection_area.created');
  }

  async createCollector(input: CollectorCreate, actorUserId: string, requestId: string) {
    return this.createSimpleReference(collectors, input, actorUserId, requestId, 'collector.created');
  }

  async collectionReferenceCatalog() {
    const catalog = await this.repository.collectionReferenceCatalog();
    return {
      areas: catalog.areas.map((area) => ({ id: area.id, code: area.code, name: area.name, description: area.description, status: area.status, createdAt: area.createdAt.toISOString() })),
      collectors: catalog.collectors.map((collector) => ({ ...collector, createdAt: collector.createdAt.toISOString() })),
    };
  }

  async updateCollectionArea(id: string, input: CollectionAreaUpdate, actorUserId: string, requestId: string) {
    try { await this.repository.updateCollectionArea(id, input, actorUserId, requestId); return await this.collectionReferenceCatalog(); }
    catch (error) {
      if (error instanceof Error && error.message === 'AREA_NOT_FOUND') throw new AppError(404, 'AREA_NOT_FOUND', 'Collection area not found');
      if (databaseCode(error) === '23505') throw new AppError(409, 'DUPLICATE_REFERENCE', 'Area code is already in use');
      throw error;
    }
  }

  async updateCollector(id: string, input: CollectorUpdate, actorUserId: string, requestId: string) {
    try { await this.repository.updateCollector(id, input, actorUserId, requestId); return await this.collectionReferenceCatalog(); }
    catch (error) {
      if (error instanceof Error && error.message === 'COLLECTOR_NOT_FOUND') throw new AppError(404, 'COLLECTOR_NOT_FOUND', 'Collector not found');
      if (databaseCode(error) === '23505') throw new AppError(409, 'DUPLICATE_REFERENCE', 'Collector number is already in use');
      throw error;
    }
  }

  async changeCollectionAreaStatus(id: string, input: ReferenceStatusChange, actorUserId: string, requestId: string) {
    try { await this.repository.changeCollectionAreaStatus(id, input, actorUserId, requestId); return await this.collectionReferenceCatalog(); }
    catch (error) {
      if (error instanceof Error && error.message === 'AREA_NOT_FOUND') throw new AppError(404, 'AREA_NOT_FOUND', 'Collection area not found');
      if (error instanceof Error && error.message === 'REFERENCE_STATUS_UNCHANGED') throw new AppError(409, 'REFERENCE_STATUS_UNCHANGED', 'The area already has this status');
      throw error;
    }
  }

  async changeCollectorStatus(id: string, input: ReferenceStatusChange, actorUserId: string, requestId: string) {
    try { await this.repository.changeCollectorStatus(id, input, actorUserId, requestId); return await this.collectionReferenceCatalog(); }
    catch (error) {
      if (error instanceof Error && error.message === 'COLLECTOR_NOT_FOUND') throw new AppError(404, 'COLLECTOR_NOT_FOUND', 'Collector not found');
      if (error instanceof Error && error.message === 'REFERENCE_STATUS_UNCHANGED') throw new AppError(409, 'REFERENCE_STATUS_UNCHANGED', 'The collector already has this status');
      throw error;
    }
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


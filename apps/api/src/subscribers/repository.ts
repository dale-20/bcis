import { and, asc, count, countDistinct, desc, eq, inArray, notInArray, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import {
  auditLogs,
  collectionAreas,
  collectors,
  serviceAccounts,
  serviceEvents,
  servicePlans,
  serviceTypes,
  subscriberAddresses,
  subscriberContacts,
  subscribers,
} from '../db/schema.js';
import type { SubscriberCreate, SubscriberListQuery, SubscriberStatusChange, SubscriberUpdate } from '@bcis/shared';

function normalizedContact(type: SubscriberUpdate['contacts'][number]['type'], value: string): string {
  return type === 'EMAIL' ? value.toLowerCase() : value.replace(/[^0-9+]/g, '');
}

function literalSearch(value: string): string {
  return `%${value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
}

function searchCondition(query: string): SQL | undefined {
  if (!query) return undefined;
  const pattern = literalSearch(query);
  return sql`(
    ${subscribers.accountNumber} ILIKE ${pattern} ESCAPE '\\'
    OR ${subscribers.firstName} ILIKE ${pattern} ESCAPE '\\'
    OR ${subscribers.lastName} ILIKE ${pattern} ESCAPE '\\'
    OR COALESCE(${subscribers.organizationName}, '') ILIKE ${pattern} ESCAPE '\\'
    OR EXISTS (SELECT 1 FROM subscriber_contacts contact WHERE contact.subscriber_id = ${subscribers.id} AND contact.value ILIKE ${pattern} ESCAPE '\\')
    OR EXISTS (SELECT 1 FROM subscriber_addresses address WHERE address.subscriber_id = ${subscribers.id} AND concat_ws(' ', address.line1, address.line2, address.barangay, address.municipality, address.province) ILIKE ${pattern} ESCAPE '\\')
    OR EXISTS (SELECT 1 FROM service_accounts service WHERE service.subscriber_id = ${subscribers.id} AND service.service_account_number ILIKE ${pattern} ESCAPE '\\')
  )`;
}

function displayNameExpression(): SQL<string> {
  return sql<string>`trim(concat_ws(' ', ${subscribers.firstName}, ${subscribers.middleName}, ${subscribers.lastName}))`;
}

export class SubscriberRepository {
  constructor(private readonly database: Database) {}

  async list(query: SubscriberListQuery) {
    const filters: SQL[] = [];
    const search = searchCondition(query.query);
    if (search) filters.push(search);
    if (query.status !== 'ALL') filters.push(eq(subscribers.status, query.status));
    const where = filters.length > 0 ? and(...filters) : undefined;
    const direction = query.direction === 'asc' ? asc : desc;
    const order = query.sort === 'account' ? direction(subscribers.accountNumber)
      : query.sort === 'updated' ? direction(subscribers.updatedAt)
      : direction(displayNameExpression());

    const [countRows, rows] = await Promise.all([
      this.database.db.select({ value: countDistinct(subscribers.id) }).from(subscribers).where(where),
      this.database.db.select({
        id: subscribers.id,
        accountNumber: subscribers.accountNumber,
        displayName: displayNameExpression(),
        primaryContact: subscriberContacts.value,
        primaryAddress: sql<string | null>`CASE WHEN ${subscriberAddresses.id} IS NULL THEN NULL ELSE concat_ws(', ', ${subscriberAddresses.line1}, ${subscriberAddresses.barangay}, ${subscriberAddresses.municipality}) END`,
        status: subscribers.status,
        serviceCount: sql<number>`count(DISTINCT ${serviceAccounts.id})::int`,
        activeServiceCount: sql<number>`count(DISTINCT ${serviceAccounts.id}) FILTER (WHERE ${serviceAccounts.status} = 'ACTIVE')::int`,
        updatedAt: subscribers.updatedAt,
      }).from(subscribers)
        .leftJoin(subscriberContacts, and(eq(subscriberContacts.subscriberId, subscribers.id), eq(subscriberContacts.isPrimary, true)))
        .leftJoin(subscriberAddresses, and(eq(subscriberAddresses.subscriberId, subscribers.id), eq(subscriberAddresses.isPrimary, true)))
        .leftJoin(serviceAccounts, eq(serviceAccounts.subscriberId, subscribers.id))
        .where(where)
        .groupBy(subscribers.id, subscriberContacts.value, subscriberAddresses.id)
        .orderBy(order, asc(subscribers.id))
        .limit(query.pageSize).offset((query.page - 1) * query.pageSize),
    ]);
    return { rows, total: countRows[0]?.value ?? 0 };
  }

  async findById(id: string) {
    const [subscriber] = await this.database.db.select().from(subscribers).where(eq(subscribers.id, id)).limit(1);
    if (!subscriber) return null;
    const [contacts, addresses, services] = await Promise.all([
      this.database.db.select().from(subscriberContacts).where(eq(subscriberContacts.subscriberId, id))
        .orderBy(desc(subscriberContacts.isPrimary), asc(subscriberContacts.createdAt)),
      this.database.db.select().from(subscriberAddresses).where(eq(subscriberAddresses.subscriberId, id))
        .orderBy(desc(subscriberAddresses.isPrimary), asc(subscriberAddresses.createdAt)),
      this.database.db.select({
        id: serviceAccounts.id,
        serviceAccountNumber: serviceAccounts.serviceAccountNumber,
        status: serviceAccounts.status,
        planId: servicePlans.id,
        planCode: servicePlans.code,
        planName: servicePlans.name,
        category: serviceTypes.category,
        currentRateCentavos: serviceAccounts.currentRateCentavos,
        activationDate: serviceAccounts.activationDate,
        billingStartDate: serviceAccounts.billingStartDate,
        billingDay: serviceAccounts.billingDay,
        dueDay: serviceAccounts.dueDay,
        installationAddressId: subscriberAddresses.id,
        installationAddress: sql<string>`concat_ws(', ', ${subscriberAddresses.line1}, ${subscriberAddresses.barangay}, ${subscriberAddresses.municipality})`,
        collectionAreaId: collectionAreas.id,
        collectionAreaName: collectionAreas.name,
        assignedCollectorId: collectors.id,
        assignedCollectorName: collectors.name,
      }).from(serviceAccounts)
        .innerJoin(servicePlans, eq(serviceAccounts.planId, servicePlans.id))
        .innerJoin(serviceTypes, eq(servicePlans.serviceTypeId, serviceTypes.id))
        .innerJoin(subscriberAddresses, eq(serviceAccounts.installationAddressId, subscriberAddresses.id))
        .leftJoin(collectionAreas, eq(serviceAccounts.collectionAreaId, collectionAreas.id))
        .leftJoin(collectors, eq(serviceAccounts.assignedCollectorId, collectors.id))
        .where(eq(serviceAccounts.subscriberId, id)).orderBy(asc(serviceAccounts.serviceAccountNumber)),
    ]);
    return { subscriber, contacts, addresses, services };
  }

  async referenceData() {
    const [plans, areas, collectorRows] = await Promise.all([
      this.database.db.select({
        id: servicePlans.id, serviceTypeId: serviceTypes.id, serviceTypeName: serviceTypes.name,
        category: serviceTypes.category, code: servicePlans.code, name: servicePlans.name,
        priceCentavos: servicePlans.priceCentavos, installationFeeCentavos: servicePlans.installationFeeCentavos,
        reconnectionFeeCentavos: servicePlans.reconnectionFeeCentavos, speedMbps: servicePlans.speedMbps,
        channelCount: servicePlans.channelCount, description: servicePlans.description, isActive: servicePlans.isActive,
      }).from(servicePlans).innerJoin(serviceTypes, eq(servicePlans.serviceTypeId, serviceTypes.id))
        .where(eq(servicePlans.isActive, true)).orderBy(asc(serviceTypes.category), asc(servicePlans.priceCentavos)),
      this.database.db.select({ id: collectionAreas.id, code: collectionAreas.code, name: collectionAreas.name, description: collectionAreas.description })
        .from(collectionAreas).where(eq(collectionAreas.status, 'ACTIVE')).orderBy(asc(collectionAreas.name)),
      this.database.db.select({ id: collectors.id, collectorNumber: collectors.collectorNumber, name: collectors.name })
        .from(collectors).where(eq(collectors.status, 'ACTIVE')).orderBy(asc(collectors.name)),
    ]);
    return { plans, areas, collectors: collectorRows };
  }

  async create(input: SubscriberCreate, actorUserId: string, requestId: string) {
    return this.database.db.transaction(async (transaction) => {
      const planIds = [...new Set(input.services.map((service) => service.planId))];
      const areaIds = [...new Set(input.services.map((service) => service.collectionAreaId))];
      const collectorIds = [...new Set(input.services.map((service) => service.assignedCollectorId))];
      // A PostgreSQL transaction owns one connection; keep its queries sequential.
      const plans = await transaction.select({ id: servicePlans.id, price: servicePlans.priceCentavos }).from(servicePlans)
        .where(and(inArray(servicePlans.id, planIds), eq(servicePlans.isActive, true)));
      const areas = await transaction.select({ id: collectionAreas.id }).from(collectionAreas)
        .where(and(inArray(collectionAreas.id, areaIds), eq(collectionAreas.status, 'ACTIVE')));
      const collectorRows = await transaction.select({ id: collectors.id }).from(collectors)
        .where(and(inArray(collectors.id, collectorIds), eq(collectors.status, 'ACTIVE')));
      if (plans.length !== planIds.length || areas.length !== areaIds.length || collectorRows.length !== collectorIds.length) {
        throw new Error('REFERENCE_NOT_FOUND');
      }
      const planPrice = new Map(plans.map((plan) => [plan.id, plan.price]));
      const [subscriber] = await transaction.insert(subscribers).values({
        accountNumber: input.accountNumber,
        firstName: input.firstName,
        middleName: input.middleName || undefined,
        lastName: input.lastName,
        organizationName: input.organizationName || undefined,
        billingDay: input.billingDay,
        dueDay: input.dueDay,
        status: input.status,
        notes: input.notes || undefined,
      }).returning({ id: subscribers.id });
      if (!subscriber) throw new Error('SUBSCRIBER_INSERT_FAILED');

      await transaction.insert(subscriberContacts).values(input.contacts.map((contact) => ({
        subscriberId: subscriber.id,
        type: contact.type,
        value: contact.value,
        normalizedValue: contact.type === 'EMAIL' ? contact.value.toLowerCase() : contact.value.replace(/[^0-9+]/g, ''),
        isPrimary: contact.isPrimary,
      })));
      const addressIds: string[] = [];
      for (const address of input.addresses) {
        const [created] = await transaction.insert(subscriberAddresses).values({
          subscriberId: subscriber.id,
          type: address.type,
          line1: address.line1,
          line2: address.line2 || undefined,
          barangay: address.barangay,
          municipality: address.municipality,
          province: address.province,
          postalCode: address.postalCode || undefined,
          isPrimary: address.isPrimary,
        })
          .returning({ id: subscriberAddresses.id });
        if (!created) throw new Error('ADDRESS_INSERT_FAILED');
        addressIds.push(created.id);
      }
      for (const service of input.services) {
        const addressId = addressIds[service.installationAddressIndex];
        const currentRateCentavos = planPrice.get(service.planId);
        if (!addressId || currentRateCentavos === undefined) throw new Error('REFERENCE_NOT_FOUND');
        const [created] = await transaction.insert(serviceAccounts).values({
          serviceAccountNumber: service.serviceAccountNumber,
          subscriberId: subscriber.id,
          planId: service.planId,
          installationAddressId: addressId,
          collectionAreaId: service.collectionAreaId,
          assignedCollectorId: service.assignedCollectorId,
          activationDate: service.activationDate,
          billingStartDate: service.billingStartDate,
          billingDay: service.billingDay,
          dueDay: service.dueDay,
          currentRateCentavos,
          status: service.status,
        }).returning({ id: serviceAccounts.id });
        if (!created) throw new Error('SERVICE_INSERT_FAILED');
        await transaction.insert(serviceEvents).values({
          serviceAccountId: created.id,
          eventType: 'SERVICE_ACCOUNT_CREATED',
          actorUserId,
          details: { status: service.status, planId: service.planId },
        });
      }
      await transaction.insert(auditLogs).values({
        actorUserId,
        action: 'subscriber.created',
        entityType: 'subscriber',
        entityId: subscriber.id,
        newValues: { accountNumber: input.accountNumber, serviceCount: input.services.length },
        requestId,
      });
      return subscriber.id;
    });
  }

  async update(id: string, input: SubscriberUpdate, actorUserId: string, requestId: string) {
    return this.database.db.transaction(async (transaction) => {
      const [current] = await transaction.select().from(subscribers).where(eq(subscribers.id, id)).limit(1).for('update');
      if (!current) throw new Error('SUBSCRIBER_NOT_FOUND');

      const existingContacts = await transaction.select().from(subscriberContacts).where(eq(subscriberContacts.subscriberId, id));
      const existingAddresses = await transaction.select().from(subscriberAddresses).where(eq(subscriberAddresses.subscriberId, id));
      const contactIds = input.contacts.flatMap((contact) => contact.id ? [contact.id] : []);
      const addressIds = input.addresses.flatMap((address) => address.id ? [address.id] : []);
      if (new Set(contactIds).size !== contactIds.length || new Set(addressIds).size !== addressIds.length) throw new Error('DUPLICATE_CHILD_ID');
      const existingContactIds = new Set(existingContacts.map((contact) => contact.id));
      const existingAddressIds = new Set(existingAddresses.map((address) => address.id));
      if (contactIds.some((contactId) => !existingContactIds.has(contactId)) || addressIds.some((addressId) => !existingAddressIds.has(addressId))) {
        throw new Error('CHILD_NOT_OWNED');
      }

      const removedContactIds = existingContacts.map((contact) => contact.id).filter((contactId) => !contactIds.includes(contactId));
      const removedAddressIds = existingAddresses.map((address) => address.id).filter((addressId) => !addressIds.includes(addressId));
      if (removedAddressIds.length > 0) {
        const [usage] = await transaction.select({ value: count() }).from(serviceAccounts)
          .where(inArray(serviceAccounts.installationAddressId, removedAddressIds));
        if ((usage?.value ?? 0) > 0) throw new Error('ADDRESS_IN_USE');
      }

      await transaction.update(subscribers).set({
        accountNumber: input.accountNumber,
        firstName: input.firstName,
        middleName: input.middleName || null,
        lastName: input.lastName,
        organizationName: input.organizationName || null,
        billingDay: input.billingDay,
        dueDay: input.dueDay,
        notes: input.notes || null,
        updatedAt: new Date(),
      }).where(eq(subscribers.id, id));

      for (const contact of input.contacts) {
        const values = { type: contact.type, value: contact.value, normalizedValue: normalizedContact(contact.type, contact.value), isPrimary: contact.isPrimary };
        if (contact.id) await transaction.update(subscriberContacts).set(values).where(and(eq(subscriberContacts.id, contact.id), eq(subscriberContacts.subscriberId, id)));
        else await transaction.insert(subscriberContacts).values({ subscriberId: id, ...values });
      }
      if (removedContactIds.length > 0) await transaction.delete(subscriberContacts).where(inArray(subscriberContacts.id, removedContactIds));

      for (const address of input.addresses) {
        const values = {
          type: address.type, line1: address.line1, line2: address.line2 || null,
          barangay: address.barangay, municipality: address.municipality, province: address.province,
          postalCode: address.postalCode || null, isPrimary: address.isPrimary,
        };
        if (address.id) await transaction.update(subscriberAddresses).set(values).where(and(eq(subscriberAddresses.id, address.id), eq(subscriberAddresses.subscriberId, id)));
        else await transaction.insert(subscriberAddresses).values({ subscriberId: id, ...values });
      }
      if (removedAddressIds.length > 0) await transaction.delete(subscriberAddresses).where(inArray(subscriberAddresses.id, removedAddressIds));

      await transaction.insert(auditLogs).values({
        actorUserId,
        action: 'subscriber.updated',
        entityType: 'subscriber',
        entityId: id,
        oldValues: {
          accountNumber: current.accountNumber,
          firstName: current.firstName,
          middleName: current.middleName,
          lastName: current.lastName,
          organizationName: current.organizationName,
          billingDay: current.billingDay,
          dueDay: current.dueDay,
          notes: current.notes,
          contacts: existingContacts.map(({ id: contactId, type, value, isPrimary }) => ({ id: contactId, type, value, isPrimary })),
          addresses: existingAddresses.map(({ id: addressId, type, line1, line2, barangay, municipality, province, postalCode, isPrimary }) => ({ id: addressId, type, line1, line2, barangay, municipality, province, postalCode, isPrimary })),
        },
        newValues: input,
        requestId,
      });
      return id;
    });
  }

  async changeStatus(id: string, input: SubscriberStatusChange, actorUserId: string, requestId: string) {
    return this.database.db.transaction(async (transaction) => {
      const [current] = await transaction.select({ status: subscribers.status }).from(subscribers)
        .where(eq(subscribers.id, id)).limit(1).for('update');
      if (!current) throw new Error('SUBSCRIBER_NOT_FOUND');
      const allowed = current.status === 'ACTIVE' && (input.status === 'INACTIVE' || input.status === 'ARCHIVED')
        || current.status === 'INACTIVE' && (input.status === 'ACTIVE' || input.status === 'ARCHIVED')
        || current.status === 'ARCHIVED' && input.status === 'ACTIVE';
      if (!allowed) throw new Error('STATUS_TRANSITION_INVALID');
      if (input.status === 'INACTIVE' || input.status === 'ARCHIVED') {
        const [billable] = await transaction.select({ value: count() }).from(serviceAccounts)
          .where(and(eq(serviceAccounts.subscriberId, id), notInArray(serviceAccounts.status, ['DISCONNECTED', 'TERMINATED'])));
        if ((billable?.value ?? 0) > 0) throw new Error('ACTIVE_SERVICES_EXIST');
      }
      await transaction.update(subscribers).set({ status: input.status, updatedAt: new Date() }).where(eq(subscribers.id, id));
      await transaction.insert(auditLogs).values({
        actorUserId, action: 'subscriber.status_changed', entityType: 'subscriber', entityId: id,
        reason: input.reason, oldValues: { status: current.status }, newValues: { status: input.status }, requestId,
      });
      return id;
    });
  }
}


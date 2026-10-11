import { and, asc, count, countDistinct, desc, eq, gt, gte, inArray, sql, type SQL } from 'drizzle-orm';
import { defaultServiceControlPolicy, serviceControlPolicySchema, type CreateSuspensionInput, type ReceivableAccountQuery, type ReconnectionAssignment, type ServiceControlPolicy } from '@bcis/shared';
import type { Database } from '../db/client.js';
import { applicationSettings, auditLogs, billingCycles, collectionAreas, collectors, invoices, reconnectionRecords, roles, serviceAccounts, serviceEvents, servicePlans, serviceTypes, subscribers, suspensionRecords, userRoles, users } from '../db/schema.js';
import { AppError } from '../errors.js';

const POLICY_KEY = 'service_control_policy';

export class ServiceControlRepository {
  constructor(private readonly database: Database) {}

  async policy(): Promise<ServiceControlPolicy> {
    const [stored] = await this.database.db.select({ value: applicationSettings.value }).from(applicationSettings).where(eq(applicationSettings.key, POLICY_KEY)).limit(1);
    if (!stored) return defaultServiceControlPolicy;
    const parsed = serviceControlPolicySchema.safeParse(stored.value);
    return parsed.success ? parsed.data : defaultServiceControlPolicy;
  }

  async savePolicy(policy: ServiceControlPolicy, actorUserId: string, requestId: string): Promise<ServiceControlPolicy> {
    await this.database.db.transaction(async (transaction) => {
      const [previous] = await transaction.select({ value: applicationSettings.value }).from(applicationSettings).where(eq(applicationSettings.key, POLICY_KEY)).limit(1).for('update');
      await transaction.insert(applicationSettings).values({
        key: POLICY_KEY, value: policy, description: 'Grace period, suspension delinquency threshold, and reconnection fee', updatedByUserId: actorUserId,
      }).onConflictDoUpdate({ target: applicationSettings.key, set: { value: policy, updatedByUserId: actorUserId, updatedAt: new Date() } });
      const previousPolicy = previous ? serviceControlPolicySchema.safeParse(previous.value) : null;
      await transaction.insert(auditLogs).values({
        actorUserId, action: 'service_control.policy_updated', entityType: 'application_setting', entityId: POLICY_KEY,
        oldValues: previousPolicy?.success ? previousPolicy.data : defaultServiceControlPolicy, newValues: policy, requestId,
      });
    });
    return policy;
  }

  async receivableAccounts(query: ReceivableAccountQuery, policy: ServiceControlPolicy) {
    const where: SQL[] = [gt(invoices.balanceCentavos, 0n), inArray(invoices.status, ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'])];
    if (query.collectorId) where.push(eq(serviceAccounts.assignedCollectorId, query.collectorId));
    if (query.collectionAreaId) where.push(eq(serviceAccounts.collectionAreaId, query.collectionAreaId));
    if (query.planId) where.push(eq(servicePlans.id, query.planId));
    if (query.serviceTypeId) where.push(eq(serviceTypes.id, query.serviceTypeId));
    if (query.query) {
      const pattern = `%${query.query.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}%`;
      where.push(sql`(${subscribers.accountNumber} ILIKE ${pattern} ESCAPE '\\' OR ${serviceAccounts.serviceAccountNumber} ILIKE ${pattern} ESCAPE '\\' OR concat_ws(' ', ${subscribers.firstName}, ${subscribers.lastName}) ILIKE ${pattern} ESCAPE '\\' OR COALESCE(${subscribers.organizationName}, '') ILIKE ${pattern} ESCAPE '\\')`);
    }
    const whereClause = and(...where);
    const oldestDueDate = sql<string>`min(${invoices.dueDate})`.as('oldest_due_date');
    const ageDays = sql<number>`greatest(0, CAST(${query.asOf} AS date) - min(${invoices.dueDate}))::int`.as('days_overdue');
    const bucket = sql<'CURRENT' | '1_30' | '31_60' | '61_90' | '90_PLUS'>`CASE
      WHEN min(${invoices.dueDate}) >= CAST(${query.asOf} AS date) THEN 'CURRENT'
      WHEN CAST(${query.asOf} AS date) - min(${invoices.dueDate}) BETWEEN 1 AND 30 THEN '1_30'
      WHEN CAST(${query.asOf} AS date) - min(${invoices.dueDate}) BETWEEN 31 AND 60 THEN '31_60'
      WHEN CAST(${query.asOf} AS date) - min(${invoices.dueDate}) BETWEEN 61 AND 90 THEN '61_90'
      ELSE '90_PLUS' END`.as('bucket');
    const grouped = this.database.db.select({
      serviceAccountId: sql<string>`${serviceAccounts.id}`.as('service_account_id'), subscriberId: sql<string>`${subscribers.id}`.as('subscriber_id'),
      subscriberName: sql<string>`COALESCE(NULLIF(trim(${subscribers.organizationName}), ''), trim(concat_ws(' ', ${subscribers.firstName}, ${subscribers.lastName})))`.as('subscriber_name'),
      subscriberAccountNumber: subscribers.accountNumber, serviceAccountNumber: serviceAccounts.serviceAccountNumber,
      serviceTypeId: sql<string>`${serviceTypes.id}`.as('service_type_id'), serviceTypeName: sql<string>`${serviceTypes.name}`.as('service_type_name'),
      planId: sql<string>`${servicePlans.id}`.as('plan_id'), planName: sql<string>`${servicePlans.name}`.as('plan_name'),
      serviceStatus: sql<'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DISCONNECTED' | 'TERMINATED'>`${serviceAccounts.status}`.as('service_status'),
      collectionAreaId: sql<string | null>`${collectionAreas.id}`.as('collection_area_id'),
      collectionAreaName: sql<string | null>`${collectionAreas.name}`.as('collection_area_name'),
      collectorId: sql<string | null>`${collectors.id}`.as('collector_id'),
      collectorName: sql<string | null>`${collectors.name}`.as('collector_name'),
      monthsUnpaid: countDistinct(billingCycles.periodStart).mapWith(Number).as('months_unpaid'), oldestDueDate, daysOverdue: ageDays, bucket,
      lastPaymentDate: sql<string | null>`(SELECT to_char(max(payment.payment_date) AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        FROM payment_allocations allocation JOIN payments payment ON payment.id = allocation.payment_id
        JOIN invoices paid_invoice ON paid_invoice.id = allocation.invoice_id
        WHERE paid_invoice.service_account_id = ${serviceAccounts.id} AND payment.status = 'POSTED')`.as('last_payment_date'),
      arrearsCentavos: sql<bigint>`sum(${invoices.balanceCentavos})::bigint`.mapWith(invoices.balanceCentavos).as('arrears_centavos'),
    }).from(invoices).innerJoin(serviceAccounts, eq(invoices.serviceAccountId, serviceAccounts.id))
      .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id)).innerJoin(servicePlans, eq(serviceAccounts.planId, servicePlans.id))
      .innerJoin(serviceTypes, eq(servicePlans.serviceTypeId, serviceTypes.id)).innerJoin(billingCycles, eq(invoices.billingCycleId, billingCycles.id))
      .leftJoin(collectionAreas, eq(serviceAccounts.collectionAreaId, collectionAreas.id)).leftJoin(collectors, eq(serviceAccounts.assignedCollectorId, collectors.id))
      .where(whereClause).groupBy(serviceAccounts.id, subscribers.id, serviceTypes.id, servicePlans.id, collectionAreas.id, collectors.id);

    const accounts = grouped.as('receivable_accounts');
    const accountConditions: SQL[] = [];
    if (query.overdueOnly || query.suspensionCandidates) accountConditions.push(gt(accounts.daysOverdue, 0));
    if (query.suspensionCandidates) {
      accountConditions.push(gte(accounts.daysOverdue, policy.suspensionThresholdDays));
      accountConditions.push(eq(accounts.serviceStatus, 'ACTIVE'));
      accountConditions.push(sql`NOT EXISTS (SELECT 1 FROM suspension_records s WHERE s.service_account_id = ${accounts.serviceAccountId} AND s.status IN ('PENDING', 'ACTIVE'))`);
    }
    if (query.bucket) accountConditions.push(eq(accounts.bucket, query.bucket));
    const filtered = accountConditions.length ? and(...accountConditions) : undefined;
    const base = this.database.db.select().from(accounts).where(filtered);
    const sortColumns = {
      subscriber: accounts.subscriberName, account: accounts.serviceAccountNumber, oldestDueDate: accounts.oldestDueDate,
      daysOverdue: accounts.daysOverdue, monthsUnpaid: accounts.monthsUnpaid, arrears: accounts.arrearsCentavos,
    };
    const order = query.sort === 'priority'
      ? [desc(accounts.daysOverdue), asc(accounts.oldestDueDate), asc(accounts.serviceAccountNumber), asc(accounts.serviceAccountId)]
      : query.direction === 'asc'
        ? [asc(sortColumns[query.sort]), asc(accounts.serviceAccountNumber), asc(accounts.serviceAccountId)]
        : [desc(sortColumns[query.sort]), asc(accounts.serviceAccountNumber), asc(accounts.serviceAccountId)];
    const rows = await base.orderBy(...order).limit(query.pageSize).offset((query.page - 1) * query.pageSize);
    const [totals] = await this.database.db.select({
      total: count(), overdueSubscriberCount: sql<number>`count(distinct ${accounts.subscriberId})::int`,
      arrearsCentavos: sql<bigint>`coalesce(sum(${accounts.arrearsCentavos}), 0)::bigint`.mapWith(invoices.balanceCentavos),
    }).from(accounts).where(filtered);
    return {
      asOf: query.asOf, page: query.page, pageSize: query.pageSize, total: totals?.total ?? 0,
      overdueSubscriberCount: totals?.overdueSubscriberCount ?? 0,
      arrearsCentavos: (totals?.arrearsCentavos ?? 0n).toString(),
      rows: rows.map((row) => ({ ...row, monthsUnpaid: Number(row.monthsUnpaid), arrearsCentavos: String(row.arrearsCentavos) })),
    };
  }

  async createSuspension(input: CreateSuspensionInput, actorUserId: string, requestId: string) {
    const policy = await this.policy();
    return this.database.db.transaction(async (transaction) => {
      const [service] = await transaction.select({ status: serviceAccounts.status, subscriberId: serviceAccounts.subscriberId, serviceAccountNumber: serviceAccounts.serviceAccountNumber })
        .from(serviceAccounts).where(eq(serviceAccounts.id, input.serviceAccountId)).limit(1).for('update');
      if (!service) throw new AppError(404, 'SERVICE_NOT_FOUND', 'Service account not found');
      if (service.status !== 'ACTIVE') throw new AppError(409, 'SERVICE_NOT_ELIGIBLE', 'Only active service accounts can be suspended');
      const [arrears] = await transaction.select({ oldestDueDate: sql<string>`min(${invoices.dueDate})`, balance: sql<bigint>`coalesce(sum(${invoices.balanceCentavos}), 0)::bigint`.mapWith(invoices.balanceCentavos) })
        .from(invoices).where(and(eq(invoices.serviceAccountId, input.serviceAccountId), gt(invoices.balanceCentavos, 0n), inArray(invoices.status, ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'])));
      const days = arrears?.oldestDueDate ? Math.floor((Date.parse(`${input.effectiveDate}T00:00:00Z`) - Date.parse(`${arrears.oldestDueDate}T00:00:00Z`)) / 86_400_000) : 0;
      if (!arrears?.oldestDueDate || arrears.balance <= 0n || days < policy.suspensionThresholdDays) throw new AppError(409, 'SUSPENSION_THRESHOLD_NOT_MET', 'Service does not meet the configured delinquency threshold');
      const [open] = await transaction.select({ id: suspensionRecords.id }).from(suspensionRecords).where(and(eq(suspensionRecords.serviceAccountId, input.serviceAccountId), inArray(suspensionRecords.status, ['PENDING', 'ACTIVE']))).limit(1);
      if (open) throw new AppError(409, 'SUSPENSION_ALREADY_OPEN', 'Service already has a pending or active suspension');
      const [record] = await transaction.insert(suspensionRecords).values({
        serviceAccountId: input.serviceAccountId, status: 'PENDING', reason: input.reason, effectiveDate: input.effectiveDate,
        requestedByUserId: actorUserId, notes: input.notes ?? null,
      }).returning({ id: suspensionRecords.id });
      if (!record) throw new Error('SUSPENSION_REQUEST_FAILED');
      const values = { serviceAccountId: input.serviceAccountId, serviceAccountNumber: service.serviceAccountNumber, status: 'PENDING', reason: input.reason, effectiveDate: input.effectiveDate };
      await transaction.insert(serviceEvents).values({ serviceAccountId: input.serviceAccountId, eventType: 'SUSPENSION_REQUESTED', actorUserId, reason: input.reason, details: values });
      await transaction.insert(auditLogs).values({ actorUserId, action: 'service.suspension.requested', entityType: 'suspension', entityId: record.id, reason: input.reason, newValues: values, requestId });
      return record.id;
    });
  }

  async approveSuspension(id: string, actorUserId: string, requestId: string) {
    const policy = await this.policy();
    return this.database.db.transaction(async (transaction) => {
      const [record] = await transaction.select().from(suspensionRecords).where(eq(suspensionRecords.id, id)).limit(1).for('update');
      if (!record) throw new AppError(404, 'SUSPENSION_NOT_FOUND', 'Suspension request not found');
      if (record.status !== 'PENDING') throw new AppError(409, 'SUSPENSION_NOT_PENDING', 'Suspension request is no longer pending');
      const today = new Date().toISOString().slice(0, 10);
      if (record.effectiveDate > today) throw new AppError(409, 'SUSPENSION_DATE_NOT_REACHED', 'A suspension cannot be approved before its effective date');
      const [service] = await transaction.select({ status: serviceAccounts.status }).from(serviceAccounts).where(eq(serviceAccounts.id, record.serviceAccountId)).limit(1).for('update');
      if (!service || service.status !== 'ACTIVE') throw new AppError(409, 'SERVICE_NOT_ELIGIBLE', 'Service is no longer active');
      const [arrears] = await transaction.select({ oldestDueDate: sql<string>`min(${invoices.dueDate})`, balance: sql<bigint>`coalesce(sum(${invoices.balanceCentavos}), 0)::bigint`.mapWith(invoices.balanceCentavos) })
        .from(invoices).where(and(eq(invoices.serviceAccountId, record.serviceAccountId), gt(invoices.balanceCentavos, 0n), inArray(invoices.status, ['UNPAID', 'PARTIALLY_PAID', 'OVERDUE'])));
      const overdueDays = arrears?.oldestDueDate ? Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${arrears.oldestDueDate}T00:00:00Z`)) / 86_400_000) : 0;
      if (!arrears?.oldestDueDate || arrears.balance <= 0n || overdueDays < policy.suspensionThresholdDays) {
        throw new AppError(409, 'SUSPENSION_THRESHOLD_NOT_MET', 'Outstanding arrears no longer meet the configured suspension threshold');
      }
      const approvedAt = new Date();
      await transaction.update(suspensionRecords).set({ status: 'ACTIVE', approvedByUserId: actorUserId, approvedAt }).where(eq(suspensionRecords.id, id));
      await transaction.update(serviceAccounts).set({ status: 'SUSPENDED', updatedAt: approvedAt }).where(eq(serviceAccounts.id, record.serviceAccountId));
      await transaction.insert(serviceEvents).values({ serviceAccountId: record.serviceAccountId, eventType: 'SERVICE_SUSPENDED', actorUserId, reason: record.reason, details: { suspensionId: id, effectiveDate: record.effectiveDate, notes: record.notes } });
      await transaction.insert(auditLogs).values({ actorUserId, action: 'service.suspension.approved', entityType: 'suspension', entityId: id, reason: record.reason, oldValues: { status: 'PENDING', serviceStatus: 'ACTIVE' }, newValues: { status: 'ACTIVE', serviceStatus: 'SUSPENDED', effectiveDate: record.effectiveDate, notes: record.notes }, requestId });
    });
  }

  async assignReconnection(id: string, input: ReconnectionAssignment, actorUserId: string, requestId: string) {
    await this.database.db.transaction(async (transaction) => {
      const [record] = await transaction.select().from(reconnectionRecords).where(eq(reconnectionRecords.id, id)).limit(1).for('update');
      if (!record) throw new AppError(404, 'RECONNECTION_NOT_FOUND', 'Reconnection request not found');
      if (!['REQUESTED', 'SCHEDULED'].includes(record.status)) throw new AppError(409, 'RECONNECTION_NOT_OPEN', 'Reconnection request is no longer open');
      const [technician] = await transaction.select({ id: users.id }).from(users).innerJoin(userRoles, eq(userRoles.userId, users.id)).innerJoin(roles, eq(userRoles.roleId, roles.id))
        .where(and(eq(users.id, input.technicianUserId), eq(users.isActive, true), eq(roles.code, 'TECHNICIAN'))).limit(1);
      if (!technician) throw new AppError(400, 'TECHNICIAN_UNAVAILABLE', 'Choose an active Technician account');
      const notes = input.notes ?? record.notes;
      await transaction.update(reconnectionRecords).set({ status: 'SCHEDULED', technicianUserId: input.technicianUserId, scheduledDate: input.scheduledDate, notes }).where(eq(reconnectionRecords.id, id));
      await transaction.insert(auditLogs).values({ actorUserId, action: 'service.reconnection.assigned', entityType: 'reconnection', entityId: id, reason: 'TECHNICIAN_ASSIGNMENT', oldValues: { technicianUserId: record.technicianUserId, scheduledDate: record.scheduledDate }, newValues: { technicianUserId: input.technicianUserId, scheduledDate: input.scheduledDate, notes }, requestId });
    });
  }

  async reconnections(actorUserId: string, canAssign: boolean, page: number, pageSize: number) {
    const where = canAssign ? undefined : and(eq(reconnectionRecords.technicianUserId, actorUserId), inArray(reconnectionRecords.status, ['REQUESTED', 'SCHEDULED']));
    const rows = await this.database.db.select({
      id: reconnectionRecords.id, serviceAccountId: serviceAccounts.id, serviceAccountNumber: serviceAccounts.serviceAccountNumber,
      subscriberId: subscribers.id, subscriberName: sql<string>`COALESCE(NULLIF(trim(${subscribers.organizationName}), ''), trim(concat_ws(' ', ${subscribers.firstName}, ${subscribers.lastName})))`,
      suspensionId: reconnectionRecords.suspensionId, status: reconnectionRecords.status, feeCentavos: reconnectionRecords.feeCentavos,
      technicianUserId: reconnectionRecords.technicianUserId, technicianName: users.displayName, requestedAt: reconnectionRecords.requestedAt,
      scheduledDate: reconnectionRecords.scheduledDate, completedAt: reconnectionRecords.completedAt, notes: reconnectionRecords.notes,
    }).from(reconnectionRecords).innerJoin(serviceAccounts, eq(reconnectionRecords.serviceAccountId, serviceAccounts.id))
      .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id)).leftJoin(users, eq(reconnectionRecords.technicianUserId, users.id))
      .where(where).orderBy(desc(reconnectionRecords.requestedAt)).limit(pageSize).offset((page - 1) * pageSize);
    const [result] = await this.database.db.select({ total: count() }).from(reconnectionRecords).where(where);
    return { items: rows.map((row) => ({ ...row, feeCentavos: row.feeCentavos.toString(), requestedAt: row.requestedAt.toISOString(), completedAt: row.completedAt?.toISOString() ?? null })), page, pageSize, total: result?.total ?? 0 };
  }

  async technicians() {
    return this.database.db.select({ id: users.id, displayName: users.displayName }).from(users)
      .innerJoin(userRoles, eq(userRoles.userId, users.id)).innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(and(eq(users.isActive, true), eq(roles.code, 'TECHNICIAN'))).orderBy(asc(users.displayName));
  }

  async suspensions(page: number, pageSize: number) {
    const rows = await this.database.db.select({
      id: suspensionRecords.id, serviceAccountId: serviceAccounts.id, serviceAccountNumber: serviceAccounts.serviceAccountNumber,
      subscriberName: sql<string>`COALESCE(NULLIF(trim(${subscribers.organizationName}), ''), trim(concat_ws(' ', ${subscribers.firstName}, ${subscribers.lastName})))`,
      status: suspensionRecords.status, reason: suspensionRecords.reason, effectiveDate: suspensionRecords.effectiveDate,
      requestedByUserId: suspensionRecords.requestedByUserId, approvedByUserId: suspensionRecords.approvedByUserId,
      approvedAt: suspensionRecords.approvedAt, notes: suspensionRecords.notes,
    }).from(suspensionRecords).innerJoin(serviceAccounts, eq(suspensionRecords.serviceAccountId, serviceAccounts.id))
      .innerJoin(subscribers, eq(serviceAccounts.subscriberId, subscribers.id)).orderBy(desc(suspensionRecords.createdAt))
      .limit(pageSize).offset((page - 1) * pageSize);
    const [result] = await this.database.db.select({ total: count() }).from(suspensionRecords);
    return { items: rows, page, pageSize, total: result?.total ?? 0 };
  }

  async completeReconnection(id: string, actorUserId: string, requestId: string) {
    await this.database.db.transaction(async (transaction) => {
      const [record] = await transaction.select().from(reconnectionRecords).where(eq(reconnectionRecords.id, id)).limit(1).for('update');
      if (!record) throw new AppError(404, 'RECONNECTION_NOT_FOUND', 'Reconnection request not found');
      if (record.technicianUserId !== actorUserId) throw new AppError(403, 'RECONNECTION_NOT_ASSIGNED', 'This reconnection is assigned to another Technician');
      if (!['REQUESTED', 'SCHEDULED'].includes(record.status)) throw new AppError(409, 'RECONNECTION_NOT_OPEN', 'Reconnection request is no longer open');
      const [service] = await transaction.select({ status: serviceAccounts.status }).from(serviceAccounts).where(eq(serviceAccounts.id, record.serviceAccountId)).limit(1).for('update');
      if (!service || service.status !== 'SUSPENDED') throw new AppError(409, 'SERVICE_NOT_SUSPENDED', 'Service is no longer suspended');
      const now = new Date();
      await transaction.update(reconnectionRecords).set({ status: 'COMPLETED', completedAt: now, completedByUserId: actorUserId }).where(eq(reconnectionRecords.id, id));
      await transaction.update(serviceAccounts).set({ status: 'ACTIVE', updatedAt: now }).where(eq(serviceAccounts.id, record.serviceAccountId));
      if (record.suspensionId) await transaction.update(suspensionRecords).set({ status: 'LIFTED', liftedAt: now }).where(eq(suspensionRecords.id, record.suspensionId));
      await transaction.insert(serviceEvents).values({ serviceAccountId: record.serviceAccountId, eventType: 'SERVICE_RECONNECTED', actorUserId, details: { reconnectionId: id, feeCentavos: record.feeCentavos.toString() } });
      await transaction.insert(auditLogs).values({ actorUserId, action: 'service.reconnection.completed', entityType: 'reconnection', entityId: id, reason: 'TECHNICIAN_COMPLETION', oldValues: { status: record.status, serviceStatus: 'SUSPENDED' }, newValues: { status: 'COMPLETED', serviceStatus: 'ACTIVE', completedAt: now.toISOString(), feeCentavos: record.feeCentavos.toString() }, requestId });
    });
  }
}

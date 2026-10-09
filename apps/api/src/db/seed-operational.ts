import { eq } from 'drizzle-orm';
import type { Database } from './client.js';
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
  users,
} from './schema.js';

const areaSeed = [
  { code: 'MALAYBALAY-CENTRAL', name: 'Malaybalay Central', description: 'Central business and residential route' },
  { code: 'MALAYBALAY-NORTH', name: 'Malaybalay North', description: 'Northern barangay collection route' },
  { code: 'VALENCIA', name: 'Valencia', description: 'Valencia service and collection route' },
] as const;

const planSeed = [
  { typeCode: 'INTERNET', typeName: 'Internet', category: 'INTERNET' as const, code: 'FIBER-50', name: 'Fiber 50', price: 99900n, installation: 150000n, reconnection: 30000n, speed: 50, channels: null },
  { typeCode: 'INTERNET', typeName: 'Internet', category: 'INTERNET' as const, code: 'FIBER-100', name: 'Fiber 100', price: 149900n, installation: 150000n, reconnection: 30000n, speed: 100, channels: null },
  { typeCode: 'INTERNET', typeName: 'Internet', category: 'INTERNET' as const, code: 'FIBER-200', name: 'Fiber 200', price: 199900n, installation: 150000n, reconnection: 30000n, speed: 200, channels: null },
  { typeCode: 'CABLE', typeName: 'Cable TV', category: 'CABLE' as const, code: 'CABLE-BASIC', name: 'Cable Basic', price: 54900n, installation: 100000n, reconnection: 25000n, speed: null, channels: 65 },
  { typeCode: 'CABLE', typeName: 'Cable TV', category: 'CABLE' as const, code: 'CABLE-PREMIUM', name: 'Cable Premium', price: 79900n, installation: 100000n, reconnection: 25000n, speed: null, channels: 110 },
  { typeCode: 'COMBO', typeName: 'Internet + Cable', category: 'COMBO' as const, code: 'COMBO-ESSENTIAL', name: 'Combo Essential', price: 139900n, installation: 175000n, reconnection: 35000n, speed: 50, channels: 65 },
  { typeCode: 'COMBO', typeName: 'Internet + Cable', category: 'COMBO' as const, code: 'COMBO-PLUS', name: 'Combo Plus', price: 199900n, installation: 175000n, reconnection: 35000n, speed: 100, channels: 110 },
] as const;

const firstNames = ['Amihan', 'Bayani', 'Cielo', 'Dalisay', 'Elio', 'Farrah', 'Gino', 'Hiraya', 'Isa', 'Joaquin'];
const lastNames = ['Abad', 'Bautista', 'Cruz', 'Domingo', 'Evangelista'];
const barangays = ['Casisang', 'Sumpong', 'Kalilangan', 'Poblacion', 'San Jose'];

export async function seedOperationalDemoData(database: Database): Promise<void> {
  await database.db.transaction(async (transaction) => {
    const typeIds = new Map<string, string>();
    for (const seed of planSeed) {
      if (typeIds.has(seed.typeCode)) continue;
      const [row] = await transaction.insert(serviceTypes).values({ code: seed.typeCode, name: seed.typeName, category: seed.category })
        .onConflictDoUpdate({ target: serviceTypes.code, set: { name: seed.typeName, category: seed.category, isActive: true } })
        .returning({ id: serviceTypes.id });
      if (!row) throw new Error(`Failed to seed service type ${seed.typeCode}`);
      typeIds.set(seed.typeCode, row.id);
    }

    const plans = new Map<string, { id: string; price: bigint }>();
    for (const seed of planSeed) {
      const serviceTypeId = typeIds.get(seed.typeCode);
      if (!serviceTypeId) throw new Error(`Service type missing for ${seed.code}`);
      const [row] = await transaction.insert(servicePlans).values({
        serviceTypeId,
        code: seed.code,
        name: seed.name,
        priceCentavos: seed.price,
        installationFeeCentavos: seed.installation,
        reconnectionFeeCentavos: seed.reconnection,
        speedMbps: seed.speed,
        channelCount: seed.channels,
        description: `${seed.name} synthetic demonstration plan`,
      }).onConflictDoUpdate({ target: servicePlans.code, set: {
        serviceTypeId, name: seed.name, priceCentavos: seed.price, installationFeeCentavos: seed.installation,
        reconnectionFeeCentavos: seed.reconnection, speedMbps: seed.speed, channelCount: seed.channels, isActive: true,
      } }).returning({ id: servicePlans.id, price: servicePlans.priceCentavos });
      if (!row) throw new Error(`Failed to seed plan ${seed.code}`);
      plans.set(seed.code, row);
    }

    const areas: { id: string; code: string }[] = [];
    for (const seed of areaSeed) {
      const [row] = await transaction.insert(collectionAreas).values(seed)
        .onConflictDoUpdate({ target: collectionAreas.code, set: { name: seed.name, description: seed.description, status: 'ACTIVE' } })
        .returning({ id: collectionAreas.id, code: collectionAreas.code });
      if (!row) throw new Error(`Failed to seed area ${seed.code}`);
      areas.push(row);
    }

    const [collectionUser] = await transaction.select({ id: users.id }).from(users)
      .where(eq(users.normalizedUsername, 'collections.demo')).limit(1);
    const collectorSeed = [
      { collectorNumber: 'COL-001', name: 'Lira Santos', userId: collectionUser?.id },
      { collectorNumber: 'COL-002', name: 'Noel Villanueva', userId: undefined },
    ];
    const collectorRows: { id: string; collectorNumber: string }[] = [];
    for (const seed of collectorSeed) {
      const [row] = await transaction.insert(collectors).values(seed)
        .onConflictDoUpdate({ target: collectors.collectorNumber, set: { name: seed.name, userId: seed.userId, status: 'ACTIVE' } })
        .returning({ id: collectors.id, collectorNumber: collectors.collectorNumber });
      if (!row) throw new Error(`Failed to seed collector ${seed.collectorNumber}`);
      collectorRows.push(row);
    }

    let subscribersCreated = 0;
    let servicesCreated = 0;
    const planValues = [...plans.values()];
    for (let index = 0; index < 50; index += 1) {
      const sequence = index + 1;
      const firstName = firstNames[index % firstNames.length] ?? `Subscriber${sequence}`;
      const lastName = lastNames[Math.floor(index / firstNames.length)] ?? 'Synthetic';
      const accountNumber = `BCIS-${sequence.toString().padStart(5, '0')}`;
      const [subscriber] = await transaction.insert(subscribers).values({
        accountNumber,
        firstName,
        lastName,
        organizationName: sequence % 10 === 0 ? `${lastName} Synthetic Store` : undefined,
        billingDay: ((index * 3) % 28) + 1,
        dueDay: ((index * 3 + 10) % 28) + 1,
        status: sequence % 17 === 0 ? 'SUSPENDED' : 'ACTIVE',
        notes: 'Synthetic demonstration record.',
      }).onConflictDoNothing({ target: subscribers.accountNumber }).returning({ id: subscribers.id, billingDay: subscribers.billingDay, dueDay: subscribers.dueDay });
      if (!subscriber) continue;
      subscribersCreated += 1;
      await transaction.insert(subscriberContacts).values([
        { subscriberId: subscriber.id, type: 'MOBILE', value: `0917 555 ${sequence.toString().padStart(4, '0')}`, normalizedValue: `+63917555${sequence.toString().padStart(4, '0')}`, isPrimary: true },
        { subscriberId: subscriber.id, type: 'EMAIL', value: `subscriber${sequence}@example.test`, normalizedValue: `subscriber${sequence}@example.test`, isPrimary: false },
      ]);
      const area = areas[index % areas.length];
      const collector = collectorRows[index % collectorRows.length];
      if (!area || !collector) throw new Error('Synthetic route references missing');
      const [primaryAddress] = await transaction.insert(subscriberAddresses).values({
        subscriberId: subscriber.id,
        type: 'SERVICE',
        line1: `${100 + sequence} ${sequence % 2 === 0 ? 'Pine' : 'Mahogany'} Street`,
        barangay: barangays[index % barangays.length] ?? 'Poblacion',
        municipality: area.code === 'VALENCIA' ? 'Valencia City' : 'Malaybalay City',
        province: 'Bukidnon',
        postalCode: area.code === 'VALENCIA' ? '8709' : '8700',
        isPrimary: true,
      }).returning({ id: subscriberAddresses.id });
      if (!primaryAddress) throw new Error('Synthetic address insert failed');
      let secondaryAddressId = primaryAddress.id;
      if (index < 15) {
        const [secondaryAddress] = await transaction.insert(subscriberAddresses).values({
          subscriberId: subscriber.id,
          type: 'SERVICE',
          line1: `${20 + sequence} Market Road`,
          barangay: barangays[(index + 2) % barangays.length] ?? 'Poblacion',
          municipality: 'Malaybalay City',
          province: 'Bukidnon',
          postalCode: '8700',
          isPrimary: false,
        }).returning({ id: subscriberAddresses.id });
        if (!secondaryAddress) throw new Error('Synthetic secondary address insert failed');
        secondaryAddressId = secondaryAddress.id;
      }
      const serviceTotal = index < 15 ? 2 : 1;
      for (let serviceIndex = 0; serviceIndex < serviceTotal; serviceIndex += 1) {
        const plan = planValues[(index + serviceIndex * 3) % planValues.length];
        if (!plan) throw new Error('Synthetic plan missing');
        const [service] = await transaction.insert(serviceAccounts).values({
          serviceAccountNumber: `SVC-${sequence.toString().padStart(5, '0')}-${serviceIndex + 1}`,
          subscriberId: subscriber.id,
          planId: plan.id,
          installationAddressId: serviceIndex === 0 ? primaryAddress.id : secondaryAddressId,
          collectionAreaId: area.id,
          assignedCollectorId: collector.id,
          activationDate: '2026-07-01',
          billingStartDate: '2026-07-01',
          billingDay: subscriber.billingDay,
          dueDay: subscriber.dueDay,
          currentRateCentavos: plan.price,
          status: sequence % 17 === 0 ? 'SUSPENDED' : 'ACTIVE',
        }).returning({ id: serviceAccounts.id });
        if (!service) throw new Error('Synthetic service insert failed');
        servicesCreated += 1;
        await transaction.insert(serviceEvents).values({ serviceAccountId: service.id, eventType: 'SYNTHETIC_SERVICE_CREATED', details: { seed: true } });
      }
    }

    await transaction.insert(auditLogs).values({
      actorUserId: collectionUser?.id,
      action: 'demo.operational_seed.applied',
      entityType: 'synthetic_dataset',
      reason: 'SYNTHETIC_DEMO_DATA',
      newValues: { subscribersCreated, servicesCreated, planCount: planSeed.length, areaCount: areaSeed.length, collectorCount: collectorRows.length },
      requestId: 'seed:operational-demo',
    });
  });
}


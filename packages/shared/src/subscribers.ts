import { z } from 'zod';
import { centavosSchema } from './money.js';

export const subscriberStatusSchema = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'TERMINATED', 'ARCHIVED']);
export const serviceCategorySchema = z.enum(['INTERNET', 'CABLE', 'COMBO']);
export const serviceAccountStatusSchema = z.enum(['PENDING', 'ACTIVE', 'SUSPENDED', 'DISCONNECTED', 'TERMINATED']);
export const contactTypeSchema = z.enum(['MOBILE', 'PHONE', 'EMAIL', 'OTHER']);
export const addressTypeSchema = z.enum(['BILLING', 'SERVICE', 'MAILING', 'OTHER']);

const identifierSchema = z.string().trim().min(3).max(40).regex(/^[A-Z0-9][A-Z0-9-]*$/, 'Use uppercase letters, numbers, and hyphens');
const optionalText = (maximum: number) => z.string().trim().max(maximum).optional();

export const subscriberListQuerySchema = z.object({
  query: z.string().trim().max(100).default(''),
  status: z.union([subscriberStatusSchema, z.literal('ALL')]).default('ALL'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(20),
  sort: z.enum(['name', 'account', 'updated']).default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
});
export type SubscriberListQuery = z.infer<typeof subscriberListQuerySchema>;

export const subscriberListItemSchema = z.object({
  id: z.uuid(),
  accountNumber: z.string(),
  displayName: z.string(),
  primaryContact: z.string().nullable(),
  primaryAddress: z.string().nullable(),
  status: subscriberStatusSchema,
  serviceCount: z.number().int().nonnegative(),
  activeServiceCount: z.number().int().nonnegative(),
  updatedAt: z.iso.datetime(),
});

export const subscriberListResponseSchema = z.object({
  items: z.array(subscriberListItemSchema),
  page: z.number().int().positive(),
  pageSize: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative(),
});
export type SubscriberListResponse = z.infer<typeof subscriberListResponseSchema>;

export const subscriberContactInputSchema = z.object({
  type: contactTypeSchema,
  value: z.string().trim().min(3).max(160),
  isPrimary: z.boolean(),
}).superRefine((value, context) => {
  if (value.type === 'EMAIL' && !z.email().safeParse(value.value).success) {
    context.addIssue({ code: 'custom', path: ['value'], message: 'Enter a valid email address' });
  }
});

export const subscriberAddressInputSchema = z.object({
  type: addressTypeSchema,
  line1: z.string().trim().min(3).max(160),
  line2: optionalText(160),
  barangay: z.string().trim().min(2).max(100),
  municipality: z.string().trim().min(2).max(100),
  province: z.string().trim().min(2).max(100),
  postalCode: optionalText(12),
  isPrimary: z.boolean(),
});

export const serviceAccountInputSchema = z.object({
  serviceAccountNumber: identifierSchema,
  planId: z.uuid(),
  installationAddressIndex: z.number().int().nonnegative(),
  collectionAreaId: z.uuid(),
  assignedCollectorId: z.uuid(),
  activationDate: z.iso.date().optional(),
  billingStartDate: z.iso.date(),
  billingDay: z.number().int().min(1).max(28),
  dueDay: z.number().int().min(1).max(31),
  status: serviceAccountStatusSchema.default('PENDING'),
});

export const subscriberCreateSchema = z.object({
  accountNumber: identifierSchema,
  firstName: z.string().trim().min(1).max(80),
  middleName: optionalText(80),
  lastName: z.string().trim().min(1).max(80),
  organizationName: optionalText(160),
  billingDay: z.number().int().min(1).max(28),
  dueDay: z.number().int().min(1).max(31),
  status: subscriberStatusSchema.default('ACTIVE'),
  notes: optionalText(2000),
  contacts: z.array(subscriberContactInputSchema).min(1).max(10),
  addresses: z.array(subscriberAddressInputSchema).min(1).max(10),
  services: z.array(serviceAccountInputSchema).min(1).max(10),
}).superRefine((value, context) => {
  if (value.contacts.filter((contact) => contact.isPrimary).length !== 1) {
    context.addIssue({ code: 'custom', path: ['contacts'], message: 'Select exactly one primary contact' });
  }
  if (value.addresses.filter((address) => address.isPrimary).length !== 1) {
    context.addIssue({ code: 'custom', path: ['addresses'], message: 'Select exactly one primary address' });
  }
  value.services.forEach((service, index) => {
    if (service.installationAddressIndex >= value.addresses.length) {
      context.addIssue({ code: 'custom', path: ['services', index, 'installationAddressIndex'], message: 'Select an existing service address' });
    }
  });
});
export type SubscriberCreate = z.infer<typeof subscriberCreateSchema>;

export const subscriberDetailSchema = z.object({
  id: z.uuid(),
  accountNumber: z.string(),
  firstName: z.string(),
  middleName: z.string().nullable(),
  lastName: z.string(),
  organizationName: z.string().nullable(),
  displayName: z.string(),
  billingDay: z.number().int(),
  dueDay: z.number().int(),
  status: subscriberStatusSchema,
  notes: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  contacts: z.array(z.object({
    id: z.uuid(), type: contactTypeSchema, value: z.string(), isPrimary: z.boolean(),
  })),
  addresses: z.array(z.object({
    id: z.uuid(), type: addressTypeSchema, line1: z.string(), line2: z.string().nullable(),
    barangay: z.string(), municipality: z.string(), province: z.string(), postalCode: z.string().nullable(), isPrimary: z.boolean(),
  })),
  services: z.array(z.object({
    id: z.uuid(), serviceAccountNumber: z.string(), status: serviceAccountStatusSchema,
    planId: z.uuid(), planCode: z.string(), planName: z.string(), category: serviceCategorySchema,
    currentRateCentavos: centavosSchema, activationDate: z.string().nullable(), billingStartDate: z.string(),
    billingDay: z.number().int(), dueDay: z.number().int(), installationAddressId: z.uuid(),
    installationAddress: z.string(), collectionAreaId: z.uuid().nullable(), collectionAreaName: z.string().nullable(),
    assignedCollectorId: z.uuid().nullable(), assignedCollectorName: z.string().nullable(),
  })),
});
export type SubscriberDetail = z.infer<typeof subscriberDetailSchema>;

export const servicePlanSchema = z.object({
  id: z.uuid(), serviceTypeId: z.uuid(), serviceTypeName: z.string(), category: serviceCategorySchema,
  code: z.string(), name: z.string(), priceCentavos: centavosSchema,
  installationFeeCentavos: centavosSchema, reconnectionFeeCentavos: centavosSchema,
  speedMbps: z.number().int().positive().nullable(), channelCount: z.number().int().positive().nullable(),
  description: z.string().nullable(), isActive: z.boolean(),
});

export const referenceDataSchema = z.object({
  servicePlans: z.array(servicePlanSchema),
  collectionAreas: z.array(z.object({ id: z.uuid(), code: z.string(), name: z.string(), description: z.string().nullable() })),
  collectors: z.array(z.object({ id: z.uuid(), collectorNumber: z.string(), name: z.string() })),
});
export type ReferenceData = z.infer<typeof referenceDataSchema>;

export const servicePlanCreateSchema = z.object({
  serviceTypeId: z.uuid(), code: identifierSchema, name: z.string().trim().min(2).max(120),
  priceCentavos: centavosSchema, installationFeeCentavos: centavosSchema.default('0'),
  reconnectionFeeCentavos: centavosSchema.default('0'), speedMbps: z.number().int().positive().optional(),
  channelCount: z.number().int().positive().optional(), description: optionalText(2000),
});

export const collectionAreaCreateSchema = z.object({
  code: identifierSchema, name: z.string().trim().min(2).max(120), description: optionalText(255),
});

export const collectorCreateSchema = z.object({
  collectorNumber: identifierSchema, name: z.string().trim().min(2).max(120),
});


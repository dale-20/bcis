import type { z } from 'zod';
import {
  collectionAreaCreateSchema,
  collectionAreaUpdateSchema,
  collectorCreateSchema,
  collectorUpdateSchema,
  referenceStatusChangeSchema,
  serviceAccountMaintenanceSchema,
  serviceAccountStatusChangeSchema,
  servicePlanCreateSchema,
  servicePlanStatusChangeSchema,
  servicePlanUpdateSchema,
  subscriberCreateSchema,
  subscriberDetailSchema,
  subscriberListQuerySchema,
  subscriberListResponseSchema,
  subscriberStatusChangeSchema,
  subscriberUpdateSchema,
} from '@bcis/shared';

export type SubscriberCreate = z.infer<typeof subscriberCreateSchema>;
export type SubscriberDetail = z.infer<typeof subscriberDetailSchema>;
export type SubscriberListQuery = z.infer<typeof subscriberListQuerySchema>;
export type SubscriberListResponse = z.infer<typeof subscriberListResponseSchema>;
export type SubscriberUpdate = z.infer<typeof subscriberUpdateSchema>;
export type SubscriberStatusChange = z.infer<typeof subscriberStatusChangeSchema>;
export type ServicePlanCreate = z.infer<typeof servicePlanCreateSchema>;
export type ServicePlanUpdate = z.infer<typeof servicePlanUpdateSchema>;
export type ServicePlanStatusChange = z.infer<typeof servicePlanStatusChangeSchema>;
export type ServiceAccountMaintenance = z.infer<typeof serviceAccountMaintenanceSchema>;
export type ServiceAccountStatusChange = z.infer<typeof serviceAccountStatusChangeSchema>;
export type CollectionAreaCreate = z.infer<typeof collectionAreaCreateSchema>;
export type CollectorCreate = z.infer<typeof collectorCreateSchema>;
export type CollectionAreaUpdate = z.infer<typeof collectionAreaUpdateSchema>;
export type CollectorUpdate = z.infer<typeof collectorUpdateSchema>;
export type ReferenceStatusChange = z.infer<typeof referenceStatusChangeSchema>;


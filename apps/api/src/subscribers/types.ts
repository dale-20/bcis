import type { z } from 'zod';
import {
  collectionAreaCreateSchema,
  collectorCreateSchema,
  servicePlanCreateSchema,
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
export type CollectionAreaCreate = z.infer<typeof collectionAreaCreateSchema>;
export type CollectorCreate = z.infer<typeof collectorCreateSchema>;


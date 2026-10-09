import type { z } from 'zod';
import {
  collectionAreaCreateSchema,
  collectorCreateSchema,
  servicePlanCreateSchema,
  subscriberCreateSchema,
  subscriberDetailSchema,
  subscriberListQuerySchema,
  subscriberListResponseSchema,
} from '@bcis/shared';

export type SubscriberCreate = z.infer<typeof subscriberCreateSchema>;
export type SubscriberDetail = z.infer<typeof subscriberDetailSchema>;
export type SubscriberListQuery = z.infer<typeof subscriberListQuerySchema>;
export type SubscriberListResponse = z.infer<typeof subscriberListResponseSchema>;
export type ServicePlanCreate = z.infer<typeof servicePlanCreateSchema>;
export type CollectionAreaCreate = z.infer<typeof collectionAreaCreateSchema>;
export type CollectorCreate = z.infer<typeof collectorCreateSchema>;


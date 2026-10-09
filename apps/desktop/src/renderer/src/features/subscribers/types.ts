import type { z } from 'zod';
import { subscriberListItemSchema, subscriberListResponseSchema } from '@bcis/shared';

export type SubscriberListItem = z.infer<typeof subscriberListItemSchema>;
export type SubscriberListResponse = z.infer<typeof subscriberListResponseSchema>;


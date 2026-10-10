ALTER TABLE "suspension_records" ALTER COLUMN "approved_by_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "suspension_records" ADD COLUMN "requested_by_user_id" uuid;--> statement-breakpoint
UPDATE "suspension_records" SET "requested_by_user_id" = "approved_by_user_id";--> statement-breakpoint
ALTER TABLE "suspension_records" ALTER COLUMN "requested_by_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "suspension_records" ADD COLUMN "approved_at" timestamp with time zone;--> statement-breakpoint
UPDATE "suspension_records" SET "approved_at" = "created_at" WHERE "approved_by_user_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "suspension_records" ADD CONSTRAINT "suspension_records_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reconnection_records_technician_status_idx" ON "reconnection_records" USING btree ("technician_user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "reconnection_records_one_open_account_uq" ON "reconnection_records" USING btree ("service_account_id") WHERE "reconnection_records"."status" IN ('REQUESTED', 'SCHEDULED');--> statement-breakpoint
CREATE INDEX "suspension_records_status_effective_idx" ON "suspension_records" USING btree ("status","effective_date");

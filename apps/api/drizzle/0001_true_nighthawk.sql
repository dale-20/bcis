CREATE TYPE "public"."address_type" AS ENUM('BILLING', 'SERVICE', 'MAILING', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."contact_type" AS ENUM('MOBILE', 'PHONE', 'EMAIL', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."subscriber_status" AS ENUM('ACTIVE', 'INACTIVE', 'SUSPENDED', 'TERMINATED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."service_account_status" AS ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'DISCONNECTED', 'TERMINATED');--> statement-breakpoint
CREATE TYPE "public"."service_category" AS ENUM('INTERNET', 'CABLE', 'COMBO');--> statement-breakpoint
CREATE TYPE "public"."adjustment_status" AS ENUM('PENDING', 'APPROVED', 'POSTED', 'REJECTED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."billing_cycle_status" AS ENUM('OPEN', 'GENERATING', 'FINALIZED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."invoice_item_type" AS ENUM('SUBSCRIPTION', 'INSTALLATION', 'RECONNECTION', 'DISCOUNT', 'PENALTY', 'ADJUSTMENT');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('DRAFT', 'UNPAID', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID', 'CREDITED');--> statement-breakpoint
CREATE TYPE "public"."credit_status" AS ENUM('AVAILABLE', 'PARTIALLY_USED', 'USED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('CASH', 'GCASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('PENDING_VERIFICATION', 'POSTED', 'REJECTED', 'REVERSED');--> statement-breakpoint
CREATE TYPE "public"."proof_status" AS ENUM('PENDING', 'VERIFIED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('ISSUED', 'VOID');--> statement-breakpoint
CREATE TYPE "public"."collection_batch_status" AS ENUM('OPEN', 'IN_PROGRESS', 'SUBMITTED', 'REMITTED', 'RECONCILED', 'CLOSED');--> statement-breakpoint
CREATE TYPE "public"."reconnection_status" AS ENUM('REQUESTED', 'SCHEDULED', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."suspension_status" AS ENUM('PENDING', 'ACTIVE', 'LIFTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."backup_status" AS ENUM('STARTED', 'COMPLETED', 'VERIFIED', 'FAILED', 'RESTORED');--> statement-breakpoint
CREATE TABLE "permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(100) NOT NULL,
	"description" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_permissions" (
	"role_id" uuid NOT NULL,
	"permission_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_permissions_pk" PRIMARY KEY("role_id","permission_id")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255) NOT NULL,
	"is_system" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_roles" (
	"user_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_roles_pk" PRIMARY KEY("user_id","role_id")
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"idle_expires_at" timestamp with time zone NOT NULL,
	"absolute_expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_reason" varchar(120),
	"ip_address" varchar(64),
	"user_agent" varchar(255),
	CONSTRAINT "user_sessions_expiry_order" CHECK ("user_sessions"."idle_expires_at" <= "user_sessions"."absolute_expires_at")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(64) NOT NULL,
	"normalized_username" varchar(64) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"failed_login_count" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_failed_login_count_nonnegative" CHECK ("users"."failed_login_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "collection_areas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" varchar(255),
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "collectors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collector_number" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"user_id" uuid,
	"status" varchar(20) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriber_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"type" "address_type" NOT NULL,
	"line1" varchar(160) NOT NULL,
	"line2" varchar(160),
	"barangay" varchar(100) NOT NULL,
	"municipality" varchar(100) NOT NULL,
	"province" varchar(100) NOT NULL,
	"postal_code" varchar(12),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriber_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"type" "contact_type" NOT NULL,
	"value" varchar(160) NOT NULL,
	"normalized_value" varchar(160) NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscribers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_number" varchar(40) NOT NULL,
	"first_name" varchar(80) NOT NULL,
	"middle_name" varchar(80),
	"last_name" varchar(80) NOT NULL,
	"organization_name" varchar(160),
	"billing_day" smallint NOT NULL,
	"due_day" smallint NOT NULL,
	"status" "subscriber_status" DEFAULT 'ACTIVE' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscribers_billing_day_range" CHECK ("subscribers"."billing_day" BETWEEN 1 AND 28),
	CONSTRAINT "subscribers_due_day_range" CHECK ("subscribers"."due_day" BETWEEN 1 AND 31)
);
--> statement-breakpoint
CREATE TABLE "service_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_account_number" varchar(40) NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"installation_address_id" uuid NOT NULL,
	"collection_area_id" uuid,
	"assigned_collector_id" uuid,
	"activation_date" date,
	"billing_start_date" date NOT NULL,
	"billing_day" smallint NOT NULL,
	"due_day" smallint NOT NULL,
	"current_rate_centavos" bigint NOT NULL,
	"status" "service_account_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_accounts_rate_nonnegative" CHECK ("service_accounts"."current_rate_centavos" >= 0),
	CONSTRAINT "service_accounts_billing_day_range" CHECK ("service_accounts"."billing_day" BETWEEN 1 AND 28),
	CONSTRAINT "service_accounts_due_day_range" CHECK ("service_accounts"."due_day" BETWEEN 1 AND 31)
);
--> statement-breakpoint
CREATE TABLE "service_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_account_id" uuid NOT NULL,
	"event_type" varchar(60) NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_user_id" uuid,
	"reason" varchar(255),
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_type_id" uuid NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(120) NOT NULL,
	"price_centavos" bigint NOT NULL,
	"installation_fee_centavos" bigint DEFAULT 0 NOT NULL,
	"reconnection_fee_centavos" bigint DEFAULT 0 NOT NULL,
	"speed_mbps" integer,
	"channel_count" integer,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_plans_amounts_nonnegative" CHECK ("service_plans"."price_centavos" >= 0 AND "service_plans"."installation_fee_centavos" >= 0 AND "service_plans"."reconnection_fee_centavos" >= 0),
	CONSTRAINT "service_plans_speed_positive" CHECK ("service_plans"."speed_mbps" IS NULL OR "service_plans"."speed_mbps" > 0),
	CONSTRAINT "service_plans_channels_positive" CHECK ("service_plans"."channel_count" IS NULL OR "service_plans"."channel_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "service_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(40) NOT NULL,
	"name" varchar(100) NOT NULL,
	"category" "service_category" NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"reason" varchar(255) NOT NULL,
	"status" "adjustment_status" DEFAULT 'PENDING' NOT NULL,
	"requested_by_user_id" uuid NOT NULL,
	"approved_by_user_id" uuid,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adjustments_nonzero" CHECK ("adjustments"."amount_centavos" <> 0)
);
--> statement-breakpoint
CREATE TABLE "billing_cycles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"status" "billing_cycle_status" DEFAULT 'OPEN' NOT NULL,
	"finalized_at" timestamp with time zone,
	"finalized_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_cycles_date_order" CHECK ("billing_cycles"."period_start" <= "billing_cycles"."period_end")
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"type" "invoice_item_type" NOT NULL,
	"description" varchar(255) NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"source_type" varchar(50),
	"source_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"service_account_id" uuid NOT NULL,
	"billing_cycle_id" uuid NOT NULL,
	"invoice_date" date NOT NULL,
	"due_date" date NOT NULL,
	"status" "invoice_status" DEFAULT 'DRAFT' NOT NULL,
	"total_centavos" bigint NOT NULL,
	"balance_centavos" bigint NOT NULL,
	"finalized_at" timestamp with time zone,
	"finalized_by_user_id" uuid,
	"voided_at" timestamp with time zone,
	"voided_by_user_id" uuid,
	"void_reason" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_amounts_valid" CHECK ("invoices"."total_centavos" >= 0 AND "invoices"."balance_centavos" >= 0 AND "invoices"."balance_centavos" <= "invoices"."total_centavos")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reference_type" varchar(40) NOT NULL,
	"reference_id" uuid NOT NULL,
	"reference_number" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"debit_centavos" bigint DEFAULT 0 NOT NULL,
	"credit_centavos" bigint DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "ledger_entries_one_side" CHECK (("ledger_entries"."debit_centavos" > 0 AND "ledger_entries"."credit_centavos" = 0) OR ("ledger_entries"."credit_centavos" > 0 AND "ledger_entries"."debit_centavos" = 0))
);
--> statement-breakpoint
CREATE TABLE "credit_applications" (
	"credit_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_applications_pk" PRIMARY KEY("credit_id","invoice_id"),
	CONSTRAINT "credit_applications_amount_positive" CHECK ("credit_applications"."amount_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_allocations" (
	"payment_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"allocation_order" integer NOT NULL,
	"allocated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_allocations_pk" PRIMARY KEY("payment_id","invoice_id"),
	CONSTRAINT "payment_allocations_amount_positive" CHECK ("payment_allocations"."amount_centavos" > 0),
	CONSTRAINT "payment_allocations_order_positive" CHECK ("payment_allocations"."allocation_order" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_proofs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"storage_key" varchar(255) NOT NULL,
	"original_filename" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"status" "proof_status" DEFAULT 'PENDING' NOT NULL,
	"verified_by_user_id" uuid,
	"verified_at" timestamp with time zone,
	"rejection_reason" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_proofs_size_positive" CHECK ("payment_proofs"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_reversals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_id" uuid NOT NULL,
	"reason" varchar(255) NOT NULL,
	"reversed_by_user_id" uuid NOT NULL,
	"reversed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"payment_date" timestamp with time zone NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" NOT NULL,
	"reference_number" varchar(100),
	"sender_details" varchar(255),
	"notes" text,
	"posted_by_user_id" uuid,
	"posted_at" timestamp with time zone,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payments_amount_positive" CHECK ("payments"."amount_centavos" > 0),
	CONSTRAINT "payments_gcash_reference_required" CHECK ("payments"."method" <> 'GCASH' OR "payments"."reference_number" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_number" varchar(50) NOT NULL,
	"payment_id" uuid NOT NULL,
	"status" "receipt_status" DEFAULT 'ISSUED' NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"issued_by_user_id" uuid NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by_user_id" uuid,
	"void_reason" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "subscriber_credits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"source_payment_id" uuid NOT NULL,
	"original_amount_centavos" bigint NOT NULL,
	"remaining_amount_centavos" bigint NOT NULL,
	"status" "credit_status" DEFAULT 'AVAILABLE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscriber_credits_amounts_valid" CHECK ("subscriber_credits"."original_amount_centavos" > 0 AND "subscriber_credits"."remaining_amount_centavos" >= 0 AND "subscriber_credits"."remaining_amount_centavos" <= "subscriber_credits"."original_amount_centavos")
);
--> statement-breakpoint
CREATE TABLE "collection_batch_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"subscriber_id" uuid NOT NULL,
	"service_account_id" uuid NOT NULL,
	"amount_due_centavos" bigint NOT NULL,
	"payment_id" uuid,
	"outcome" varchar(40),
	"notes" varchar(255),
	CONSTRAINT "collection_batch_accounts_due_nonnegative" CHECK ("collection_batch_accounts"."amount_due_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "collection_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_number" varchar(50) NOT NULL,
	"collector_id" uuid NOT NULL,
	"collection_area_id" uuid NOT NULL,
	"collection_date" date NOT NULL,
	"status" "collection_batch_status" DEFAULT 'OPEN' NOT NULL,
	"expected_receivable_centavos" bigint DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"submitted_at" timestamp with time zone,
	"reconciled_at" timestamp with time zone,
	"reconciled_by_user_id" uuid,
	"closed_at" timestamp with time zone,
	"closed_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_batches_expected_nonnegative" CHECK ("collection_batches"."expected_receivable_centavos" >= 0)
);
--> statement-breakpoint
CREATE TABLE "collector_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"collector_id" uuid NOT NULL,
	"service_account_id" uuid NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"assigned_by_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collector_assignments_date_order" CHECK ("collector_assignments"."effective_to" IS NULL OR "collector_assignments"."effective_to" >= "collector_assignments"."effective_from")
);
--> statement-breakpoint
CREATE TABLE "collector_remittances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"expected_cash_centavos" bigint NOT NULL,
	"remitted_cash_centavos" bigint NOT NULL,
	"difference_centavos" bigint NOT NULL,
	"non_cash_centavos" bigint DEFAULT 0 NOT NULL,
	"remitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_by_user_id" uuid NOT NULL,
	"notes" varchar(255),
	CONSTRAINT "collector_remittances_amounts_nonnegative" CHECK ("collector_remittances"."expected_cash_centavos" >= 0 AND "collector_remittances"."remitted_cash_centavos" >= 0 AND "collector_remittances"."non_cash_centavos" >= 0),
	CONSTRAINT "collector_remittances_difference_exact" CHECK ("collector_remittances"."difference_centavos" = "collector_remittances"."remitted_cash_centavos" - "collector_remittances"."expected_cash_centavos")
);
--> statement-breakpoint
CREATE TABLE "reconnection_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_account_id" uuid NOT NULL,
	"suspension_id" uuid,
	"status" "reconnection_status" DEFAULT 'REQUESTED' NOT NULL,
	"fee_centavos" bigint DEFAULT 0 NOT NULL,
	"technician_user_id" uuid,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"scheduled_date" date,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" uuid,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "suspension_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"service_account_id" uuid NOT NULL,
	"status" "suspension_status" DEFAULT 'PENDING' NOT NULL,
	"reason" varchar(255) NOT NULL,
	"effective_date" date NOT NULL,
	"approved_by_user_id" uuid NOT NULL,
	"notes" text,
	"lifted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"description" varchar(255) NOT NULL,
	"updated_by_user_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"session_id" uuid,
	"action" varchar(100) NOT NULL,
	"entity_type" varchar(80) NOT NULL,
	"entity_id" varchar(100),
	"reason" varchar(255),
	"old_values" jsonb,
	"new_values" jsonb,
	"request_id" varchar(100) NOT NULL,
	"ip_address" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "backup_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "backup_status" DEFAULT 'STARTED' NOT NULL,
	"storage_path" varchar(255) NOT NULL,
	"sha256" varchar(64),
	"size_bytes" bigint,
	"initiated_by_user_id" uuid NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"verified_at" timestamp with time zone,
	"restored_at" timestamp with time zone,
	"error_code" varchar(80)
);
--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permission_id_permissions_id_fk" FOREIGN KEY ("permission_id") REFERENCES "public"."permissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_roles" ADD CONSTRAINT "user_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collectors" ADD CONSTRAINT "collectors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_addresses" ADD CONSTRAINT "subscriber_addresses_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_contacts" ADD CONSTRAINT "subscriber_contacts_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_plan_id_service_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."service_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_installation_address_id_subscriber_addresses_id_fk" FOREIGN KEY ("installation_address_id") REFERENCES "public"."subscriber_addresses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_collection_area_id_collection_areas_id_fk" FOREIGN KEY ("collection_area_id") REFERENCES "public"."collection_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_accounts" ADD CONSTRAINT "service_accounts_assigned_collector_id_collectors_id_fk" FOREIGN KEY ("assigned_collector_id") REFERENCES "public"."collectors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_events" ADD CONSTRAINT "service_events_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_events" ADD CONSTRAINT "service_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_plans" ADD CONSTRAINT "service_plans_service_type_id_service_types_id_fk" FOREIGN KEY ("service_type_id") REFERENCES "public"."service_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_finalized_by_user_id_users_id_fk" FOREIGN KEY ("finalized_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_billing_cycle_id_billing_cycles_id_fk" FOREIGN KEY ("billing_cycle_id") REFERENCES "public"."billing_cycles"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_finalized_by_user_id_users_id_fk" FOREIGN KEY ("finalized_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_credit_id_subscriber_credits_id_fk" FOREIGN KEY ("credit_id") REFERENCES "public"."subscriber_credits"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_applications" ADD CONSTRAINT "credit_applications_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_verified_by_user_id_users_id_fk" FOREIGN KEY ("verified_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_reversals" ADD CONSTRAINT "payment_reversals_reversed_by_user_id_users_id_fk" FOREIGN KEY ("reversed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_posted_by_user_id_users_id_fk" FOREIGN KEY ("posted_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_issued_by_user_id_users_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_voided_by_user_id_users_id_fk" FOREIGN KEY ("voided_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_credits" ADD CONSTRAINT "subscriber_credits_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriber_credits" ADD CONSTRAINT "subscriber_credits_source_payment_id_payments_id_fk" FOREIGN KEY ("source_payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batch_accounts" ADD CONSTRAINT "collection_batch_accounts_batch_id_collection_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."collection_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batch_accounts" ADD CONSTRAINT "collection_batch_accounts_subscriber_id_subscribers_id_fk" FOREIGN KEY ("subscriber_id") REFERENCES "public"."subscribers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batch_accounts" ADD CONSTRAINT "collection_batch_accounts_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batch_accounts" ADD CONSTRAINT "collection_batch_accounts_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_collection_area_id_collection_areas_id_fk" FOREIGN KEY ("collection_area_id") REFERENCES "public"."collection_areas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_reconciled_by_user_id_users_id_fk" FOREIGN KEY ("reconciled_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD CONSTRAINT "collection_batches_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_assignments" ADD CONSTRAINT "collector_assignments_collector_id_collectors_id_fk" FOREIGN KEY ("collector_id") REFERENCES "public"."collectors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_assignments" ADD CONSTRAINT "collector_assignments_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_assignments" ADD CONSTRAINT "collector_assignments_assigned_by_user_id_users_id_fk" FOREIGN KEY ("assigned_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_remittances" ADD CONSTRAINT "collector_remittances_batch_id_collection_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."collection_batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collector_remittances" ADD CONSTRAINT "collector_remittances_received_by_user_id_users_id_fk" FOREIGN KEY ("received_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_suspension_id_suspension_records_id_fk" FOREIGN KEY ("suspension_id") REFERENCES "public"."suspension_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_technician_user_id_users_id_fk" FOREIGN KEY ("technician_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconnection_records" ADD CONSTRAINT "reconnection_records_completed_by_user_id_users_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspension_records" ADD CONSTRAINT "suspension_records_service_account_id_service_accounts_id_fk" FOREIGN KEY ("service_account_id") REFERENCES "public"."service_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suspension_records" ADD CONSTRAINT "suspension_records_approved_by_user_id_users_id_fk" FOREIGN KEY ("approved_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_updated_by_user_id_users_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_session_id_user_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."user_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "backup_history" ADD CONSTRAINT "backup_history_initiated_by_user_id_users_id_fk" FOREIGN KEY ("initiated_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "permissions_code_uq" ON "permissions" USING btree ("code");--> statement-breakpoint
CREATE INDEX "role_permissions_permission_idx" ON "role_permissions" USING btree ("permission_id");--> statement-breakpoint
CREATE UNIQUE INDEX "roles_code_uq" ON "roles" USING btree ("code");--> statement-breakpoint
CREATE INDEX "user_roles_role_idx" ON "user_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_sessions_token_hash_uq" ON "user_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "user_sessions_user_active_idx" ON "user_sessions" USING btree ("user_id","revoked_at","absolute_expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "users_normalized_username_uq" ON "users" USING btree ("normalized_username");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_areas_code_uq" ON "collection_areas" USING btree ("code");--> statement-breakpoint
CREATE INDEX "collection_areas_status_idx" ON "collection_areas" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "collectors_number_uq" ON "collectors" USING btree ("collector_number");--> statement-breakpoint
CREATE UNIQUE INDEX "collectors_user_uq" ON "collectors" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "collectors_status_idx" ON "collectors" USING btree ("status");--> statement-breakpoint
CREATE INDEX "subscriber_addresses_subscriber_idx" ON "subscriber_addresses" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "subscriber_addresses_location_idx" ON "subscriber_addresses" USING btree ("municipality","barangay");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriber_contacts_owner_value_uq" ON "subscriber_contacts" USING btree ("subscriber_id","type","normalized_value");--> statement-breakpoint
CREATE INDEX "subscriber_contacts_lookup_idx" ON "subscriber_contacts" USING btree ("normalized_value");--> statement-breakpoint
CREATE UNIQUE INDEX "subscribers_account_number_uq" ON "subscribers" USING btree ("account_number");--> statement-breakpoint
CREATE INDEX "subscribers_name_idx" ON "subscribers" USING btree ("last_name","first_name");--> statement-breakpoint
CREATE INDEX "subscribers_status_idx" ON "subscribers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "service_accounts_number_uq" ON "service_accounts" USING btree ("service_account_number");--> statement-breakpoint
CREATE INDEX "service_accounts_subscriber_idx" ON "service_accounts" USING btree ("subscriber_id");--> statement-breakpoint
CREATE INDEX "service_accounts_status_area_idx" ON "service_accounts" USING btree ("status","collection_area_id");--> statement-breakpoint
CREATE INDEX "service_accounts_collector_idx" ON "service_accounts" USING btree ("assigned_collector_id");--> statement-breakpoint
CREATE INDEX "service_events_account_date_idx" ON "service_events" USING btree ("service_account_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "service_plans_code_uq" ON "service_plans" USING btree ("code");--> statement-breakpoint
CREATE INDEX "service_plans_type_active_idx" ON "service_plans" USING btree ("service_type_id","is_active");--> statement-breakpoint
CREATE UNIQUE INDEX "service_types_code_uq" ON "service_types" USING btree ("code");--> statement-breakpoint
CREATE INDEX "adjustments_invoice_status_idx" ON "adjustments" USING btree ("invoice_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_cycles_period_uq" ON "billing_cycles" USING btree ("period_start","period_end");--> statement-breakpoint
CREATE INDEX "invoice_items_invoice_idx" ON "invoice_items" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_number_uq" ON "invoices" USING btree ("invoice_number");--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_service_cycle_uq" ON "invoices" USING btree ("service_account_id","billing_cycle_id");--> statement-breakpoint
CREATE INDEX "invoices_subscriber_status_idx" ON "invoices" USING btree ("subscriber_id","status");--> statement-breakpoint
CREATE INDEX "invoices_due_status_idx" ON "invoices" USING btree ("due_date","status");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_entries_reference_uq" ON "ledger_entries" USING btree ("reference_type","reference_id");--> statement-breakpoint
CREATE INDEX "ledger_entries_subscriber_date_idx" ON "ledger_entries" USING btree ("subscriber_id","occurred_at");--> statement-breakpoint
CREATE INDEX "credit_applications_invoice_idx" ON "credit_applications" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "payment_allocations_invoice_idx" ON "payment_allocations" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_proofs_storage_key_uq" ON "payment_proofs" USING btree ("storage_key");--> statement-breakpoint
CREATE INDEX "payment_proofs_payment_status_idx" ON "payment_proofs" USING btree ("payment_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_reversals_payment_uq" ON "payment_reversals" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payments_subscriber_date_idx" ON "payments" USING btree ("subscriber_id","payment_date");--> statement-breakpoint
CREATE INDEX "payments_date_method_idx" ON "payments" USING btree ("payment_date","method");--> statement-breakpoint
CREATE INDEX "payments_reference_idx" ON "payments" USING btree ("reference_number");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_gcash_reference_uq" ON "payments" USING btree (lower("reference_number")) WHERE "payments"."method" = 'GCASH' AND "payments"."reference_number" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_number_uq" ON "receipts" USING btree ("receipt_number");--> statement-breakpoint
CREATE UNIQUE INDEX "receipts_payment_uq" ON "receipts" USING btree ("payment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriber_credits_source_payment_uq" ON "subscriber_credits" USING btree ("source_payment_id");--> statement-breakpoint
CREATE INDEX "subscriber_credits_subscriber_status_idx" ON "subscriber_credits" USING btree ("subscriber_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_batch_accounts_service_uq" ON "collection_batch_accounts" USING btree ("batch_id","service_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_batch_accounts_payment_uq" ON "collection_batch_accounts" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "collection_batch_accounts_subscriber_idx" ON "collection_batch_accounts" USING btree ("subscriber_id");--> statement-breakpoint
CREATE UNIQUE INDEX "collection_batches_number_uq" ON "collection_batches" USING btree ("batch_number");--> statement-breakpoint
CREATE INDEX "collection_batches_collector_date_idx" ON "collection_batches" USING btree ("collector_id","collection_date");--> statement-breakpoint
CREATE INDEX "collection_batches_area_status_idx" ON "collection_batches" USING btree ("collection_area_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "collector_assignments_start_uq" ON "collector_assignments" USING btree ("service_account_id","effective_from");--> statement-breakpoint
CREATE INDEX "collector_assignments_collector_dates_idx" ON "collector_assignments" USING btree ("collector_id","effective_from","effective_to");--> statement-breakpoint
CREATE UNIQUE INDEX "collector_remittances_batch_uq" ON "collector_remittances" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "reconnection_records_account_status_idx" ON "reconnection_records" USING btree ("service_account_id","status");--> statement-breakpoint
CREATE INDEX "suspension_records_account_status_idx" ON "suspension_records" USING btree ("service_account_id","status");--> statement-breakpoint
CREATE INDEX "audit_logs_actor_date_idx" ON "audit_logs" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_entity_idx" ON "audit_logs" USING btree ("entity_type","entity_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_action_date_idx" ON "audit_logs" USING btree ("action","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "backup_history_storage_path_uq" ON "backup_history" USING btree ("storage_path");--> statement-breakpoint
CREATE INDEX "backup_history_status_started_idx" ON "backup_history" USING btree ("status","started_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'audit_logs are append-only' USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();--> statement-breakpoint
UPDATE "application_metadata" SET "schema_version" = 2 WHERE "singleton" = true;

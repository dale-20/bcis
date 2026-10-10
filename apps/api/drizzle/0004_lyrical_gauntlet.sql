CREATE SEQUENCE "public"."collection_batch_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "collection_batch_accounts" ADD COLUMN "current_bill_centavos" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "collection_batch_accounts" ADD COLUMN "arrears_centavos" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "collection_batch_accounts" SET "current_bill_centavos" = "amount_due_centavos", "arrears_centavos" = 0;--> statement-breakpoint
ALTER TABLE "collection_batches" ADD COLUMN "reconciliation_notes" varchar(255);--> statement-breakpoint
ALTER TABLE "collection_batches" ADD COLUMN "close_notes" varchar(255);--> statement-breakpoint
CREATE UNIQUE INDEX "collection_batches_route_date_uq" ON "collection_batches" USING btree ("collector_id","collection_area_id","collection_date");--> statement-breakpoint
ALTER TABLE "collection_batch_accounts" ADD CONSTRAINT "collection_batch_accounts_breakdown_exact" CHECK ("collection_batch_accounts"."current_bill_centavos" >= 0 AND "collection_batch_accounts"."arrears_centavos" >= 0 AND "collection_batch_accounts"."amount_due_centavos" = "collection_batch_accounts"."current_bill_centavos" + "collection_batch_accounts"."arrears_centavos");--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_collection_batch_history() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'collection batches are immutable history' USING ERRCODE = '55000'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.batch_number IS DISTINCT FROM OLD.batch_number OR NEW.collector_id IS DISTINCT FROM OLD.collector_id OR
     NEW.collection_area_id IS DISTINCT FROM OLD.collection_area_id OR NEW.collection_date IS DISTINCT FROM OLD.collection_date OR
     NEW.expected_receivable_centavos IS DISTINCT FROM OLD.expected_receivable_centavos OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id OR
     NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'collection batch snapshot is immutable' USING ERRCODE = '55000'; END IF;
  IF OLD.status = 'OPEN' AND NEW.status NOT IN ('OPEN', 'IN_PROGRESS', 'SUBMITTED') THEN RAISE EXCEPTION 'invalid collection batch transition' USING ERRCODE = '55000'; END IF;
  IF OLD.status = 'IN_PROGRESS' AND NEW.status NOT IN ('IN_PROGRESS', 'SUBMITTED') THEN RAISE EXCEPTION 'invalid collection batch transition' USING ERRCODE = '55000'; END IF;
  IF OLD.status = 'SUBMITTED' AND NEW.status NOT IN ('SUBMITTED', 'REMITTED') THEN RAISE EXCEPTION 'invalid collection batch transition' USING ERRCODE = '55000'; END IF;
  IF OLD.status = 'REMITTED' AND NEW.status NOT IN ('REMITTED', 'RECONCILED') THEN RAISE EXCEPTION 'invalid collection batch transition' USING ERRCODE = '55000'; END IF;
  IF OLD.status = 'RECONCILED' AND NEW.status NOT IN ('RECONCILED', 'CLOSED') THEN RAISE EXCEPTION 'invalid collection batch transition' USING ERRCODE = '55000'; END IF;
  IF OLD.status = 'CLOSED' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'closed collection batch is immutable' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER collection_batches_immutable_history BEFORE UPDATE OR DELETE ON collection_batches FOR EACH ROW EXECUTE FUNCTION protect_collection_batch_history();--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_collection_batch_account_history() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'route sheet accounts are immutable history' USING ERRCODE = '55000'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.batch_id IS DISTINCT FROM OLD.batch_id OR NEW.subscriber_id IS DISTINCT FROM OLD.subscriber_id OR
     NEW.service_account_id IS DISTINCT FROM OLD.service_account_id OR NEW.amount_due_centavos IS DISTINCT FROM OLD.amount_due_centavos OR
     NEW.current_bill_centavos IS DISTINCT FROM OLD.current_bill_centavos OR NEW.arrears_centavos IS DISTINCT FROM OLD.arrears_centavos THEN
    RAISE EXCEPTION 'route sheet snapshot is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.payment_id IS NOT NULL AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'recorded collection is immutable' USING ERRCODE = '55000'; END IF;
  IF OLD.payment_id IS NULL AND NEW.payment_id IS NULL AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'collection outcome requires payment' USING ERRCODE = '55000'; END IF;
  IF NEW.payment_id IS NOT NULL AND NEW.outcome IS NULL THEN RAISE EXCEPTION 'recorded collection requires outcome' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER collection_batch_accounts_immutable_history BEFORE UPDATE OR DELETE ON collection_batch_accounts FOR EACH ROW EXECUTE FUNCTION protect_collection_batch_account_history();--> statement-breakpoint
CREATE TRIGGER collector_remittances_append_only BEFORE UPDATE OR DELETE ON collector_remittances FOR EACH ROW EXECUTE FUNCTION reject_financial_history_mutation();

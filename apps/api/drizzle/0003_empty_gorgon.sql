CREATE SEQUENCE "public"."receipt_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "idempotency_key" varchar(100);--> statement-breakpoint
UPDATE "payments" SET "idempotency_key" = 'legacy-' || "id"::text WHERE "idempotency_key" IS NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "idempotency_key" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_idempotency_key_uq" ON "payments" USING btree ("idempotency_key");--> statement-breakpoint

CREATE OR REPLACE FUNCTION prevent_payment_history_changes() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'payments are immutable history' USING ERRCODE = '55000'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key OR
     NEW.subscriber_id IS DISTINCT FROM OLD.subscriber_id OR NEW.payment_date IS DISTINCT FROM OLD.payment_date OR
     NEW.amount_centavos IS DISTINCT FROM OLD.amount_centavos OR NEW.method IS DISTINCT FROM OLD.method OR
     NEW.reference_number IS DISTINCT FROM OLD.reference_number OR NEW.sender_details IS DISTINCT FROM OLD.sender_details OR
     NEW.notes IS DISTINCT FROM OLD.notes OR NEW.created_by_user_id IS DISTINCT FROM OLD.created_by_user_id OR
     NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'payment financial values are immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.status = 'PENDING_VERIFICATION' AND NEW.status NOT IN ('PENDING_VERIFICATION', 'POSTED', 'REJECTED') THEN RAISE EXCEPTION 'invalid pending payment transition' USING ERRCODE = '55000'; END IF;
  IF OLD.status = 'POSTED' AND NEW.status NOT IN ('POSTED', 'REVERSED') THEN RAISE EXCEPTION 'invalid posted payment transition' USING ERRCODE = '55000'; END IF;
  IF OLD.status IN ('REJECTED', 'REVERSED') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'terminal payment is immutable' USING ERRCODE = '55000'; END IF;
  IF OLD.posted_at IS NOT NULL AND (NEW.posted_at IS DISTINCT FROM OLD.posted_at OR NEW.posted_by_user_id IS DISTINCT FROM OLD.posted_by_user_id) THEN RAISE EXCEPTION 'payment posting identity is immutable' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER payments_immutable_history BEFORE UPDATE OR DELETE ON payments FOR EACH ROW EXECUTE FUNCTION prevent_payment_history_changes();--> statement-breakpoint

CREATE OR REPLACE FUNCTION validate_payment_allocation_insert() RETURNS trigger AS $$
DECLARE payment_amount bigint; payment_subscriber uuid; invoice_subscriber uuid; allocated bigint;
BEGIN
  SELECT amount_centavos, subscriber_id INTO payment_amount, payment_subscriber FROM payments WHERE id = NEW.payment_id FOR UPDATE;
  SELECT subscriber_id INTO invoice_subscriber FROM invoices WHERE id = NEW.invoice_id;
  SELECT COALESCE(sum(amount_centavos), 0) INTO allocated FROM payment_allocations WHERE payment_id = NEW.payment_id;
  IF payment_subscriber IS DISTINCT FROM invoice_subscriber THEN RAISE EXCEPTION 'payment and invoice subscribers differ' USING ERRCODE = '23514'; END IF;
  IF allocated + NEW.amount_centavos > payment_amount THEN RAISE EXCEPTION 'payment allocations exceed payment amount' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER payment_allocations_validate BEFORE INSERT ON payment_allocations FOR EACH ROW EXECUTE FUNCTION validate_payment_allocation_insert();--> statement-breakpoint

CREATE OR REPLACE FUNCTION reject_financial_history_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000'; END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER payment_allocations_append_only BEFORE UPDATE OR DELETE ON payment_allocations FOR EACH ROW EXECUTE FUNCTION reject_financial_history_mutation();--> statement-breakpoint
CREATE TRIGGER payment_reversals_append_only BEFORE UPDATE OR DELETE ON payment_reversals FOR EACH ROW EXECUTE FUNCTION reject_financial_history_mutation();--> statement-breakpoint
CREATE TRIGGER credit_applications_append_only BEFORE UPDATE OR DELETE ON credit_applications FOR EACH ROW EXECUTE FUNCTION reject_financial_history_mutation();--> statement-breakpoint
CREATE TRIGGER ledger_entries_append_only BEFORE UPDATE OR DELETE ON ledger_entries FOR EACH ROW EXECUTE FUNCTION reject_financial_history_mutation();--> statement-breakpoint

CREATE OR REPLACE FUNCTION prevent_payment_proof_history_changes() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'payment proofs are immutable history' USING ERRCODE = '55000'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.payment_id IS DISTINCT FROM OLD.payment_id OR NEW.storage_key IS DISTINCT FROM OLD.storage_key OR
     NEW.original_filename IS DISTINCT FROM OLD.original_filename OR NEW.mime_type IS DISTINCT FROM OLD.mime_type OR
     NEW.size_bytes IS DISTINCT FROM OLD.size_bytes OR NEW.sha256 IS DISTINCT FROM OLD.sha256 OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'payment proof evidence is immutable' USING ERRCODE = '55000'; END IF;
  IF OLD.status <> 'PENDING' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'reviewed payment proof is immutable' USING ERRCODE = '55000'; END IF;
  IF OLD.status = 'PENDING' AND NEW.status NOT IN ('PENDING', 'VERIFIED', 'REJECTED') THEN RAISE EXCEPTION 'invalid proof transition' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER payment_proofs_immutable_history BEFORE UPDATE OR DELETE ON payment_proofs FOR EACH ROW EXECUTE FUNCTION prevent_payment_proof_history_changes();--> statement-breakpoint

CREATE OR REPLACE FUNCTION prevent_receipt_history_changes() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'receipts are immutable history' USING ERRCODE = '55000'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.receipt_number IS DISTINCT FROM OLD.receipt_number OR NEW.payment_id IS DISTINCT FROM OLD.payment_id OR NEW.issued_at IS DISTINCT FROM OLD.issued_at OR NEW.issued_by_user_id IS DISTINCT FROM OLD.issued_by_user_id THEN RAISE EXCEPTION 'receipt identity is immutable' USING ERRCODE = '55000'; END IF;
  IF OLD.status = 'VOID' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'void receipt is immutable' USING ERRCODE = '55000'; END IF;
  IF OLD.status = 'ISSUED' AND NEW.status NOT IN ('ISSUED', 'VOID') THEN RAISE EXCEPTION 'invalid receipt transition' USING ERRCODE = '55000'; END IF;
  IF NEW.status = 'ISSUED' AND (NEW.voided_at IS NOT NULL OR NEW.voided_by_user_id IS NOT NULL OR NEW.void_reason IS NOT NULL) THEN RAISE EXCEPTION 'issued receipt cannot contain void metadata' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER receipts_immutable_history BEFORE UPDATE OR DELETE ON receipts FOR EACH ROW EXECUTE FUNCTION prevent_receipt_history_changes();--> statement-breakpoint

CREATE OR REPLACE FUNCTION prevent_credit_history_changes() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'subscriber credits are immutable history' USING ERRCODE = '55000'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.subscriber_id IS DISTINCT FROM OLD.subscriber_id OR NEW.source_payment_id IS DISTINCT FROM OLD.source_payment_id OR NEW.original_amount_centavos IS DISTINCT FROM OLD.original_amount_centavos OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'credit origin is immutable' USING ERRCODE = '55000'; END IF;
  IF OLD.status IN ('USED', 'REVERSED') AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'terminal credit is immutable' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER subscriber_credits_immutable_history BEFORE UPDATE OR DELETE ON subscriber_credits FOR EACH ROW EXECUTE FUNCTION prevent_credit_history_changes();--> statement-breakpoint
UPDATE "application_metadata" SET "schema_version" = 4 WHERE "singleton" = true;

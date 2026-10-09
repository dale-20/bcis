CREATE SEQUENCE "public"."invoice_number_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
ALTER TABLE "billing_cycles" ADD CONSTRAINT "billing_cycles_calendar_month" CHECK ("billing_cycles"."period_start" = date_trunc('month', "billing_cycles"."period_start"::timestamp)::date AND "billing_cycles"."period_end" = (date_trunc('month', "billing_cycles"."period_start"::timestamp) + interval '1 month - 1 day')::date);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_finalization_consistent" CHECK (("invoices"."status" = 'DRAFT' AND "invoices"."finalized_at" IS NULL AND "invoices"."finalized_by_user_id" IS NULL) OR ("invoices"."status" <> 'DRAFT' AND "invoices"."finalized_at" IS NOT NULL AND "invoices"."finalized_by_user_id" IS NOT NULL));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_finalized_invoice_snapshot_changes() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.finalized_at IS NOT NULL THEN RAISE EXCEPTION 'finalized invoice cannot be deleted'; END IF;
    RETURN OLD;
  END IF;
  IF OLD.finalized_at IS NOT NULL AND (
    NEW.invoice_number IS DISTINCT FROM OLD.invoice_number OR
    NEW.subscriber_id IS DISTINCT FROM OLD.subscriber_id OR
    NEW.service_account_id IS DISTINCT FROM OLD.service_account_id OR
    NEW.billing_cycle_id IS DISTINCT FROM OLD.billing_cycle_id OR
    NEW.invoice_date IS DISTINCT FROM OLD.invoice_date OR
    NEW.due_date IS DISTINCT FROM OLD.due_date OR
    NEW.total_centavos IS DISTINCT FROM OLD.total_centavos OR
    NEW.finalized_at IS DISTINCT FROM OLD.finalized_at OR
    NEW.finalized_by_user_id IS DISTINCT FROM OLD.finalized_by_user_id OR
    NEW.created_at IS DISTINCT FROM OLD.created_at
  ) THEN
    RAISE EXCEPTION 'finalized invoice snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER invoices_finalized_snapshot_immutable
BEFORE UPDATE OR DELETE ON invoices
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_invoice_snapshot_changes();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_finalized_invoice_item_changes() RETURNS trigger AS $$
DECLARE
  target_invoice_id uuid;
  target_finalized_at timestamptz;
BEGIN
  target_invoice_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.invoice_id ELSE NEW.invoice_id END;
  SELECT finalized_at INTO target_finalized_at FROM invoices WHERE id = target_invoice_id;
  IF target_finalized_at IS NOT NULL THEN RAISE EXCEPTION 'finalized invoice items are immutable'; END IF;
  IF TG_OP = 'UPDATE' AND NEW.invoice_id IS DISTINCT FROM OLD.invoice_id THEN
    SELECT finalized_at INTO target_finalized_at FROM invoices WHERE id = OLD.invoice_id;
    IF target_finalized_at IS NOT NULL THEN RAISE EXCEPTION 'finalized invoice items are immutable'; END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER invoice_items_finalized_immutable
BEFORE INSERT OR UPDATE OR DELETE ON invoice_items
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_invoice_item_changes();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_finalized_billing_cycle_changes() RETURNS trigger AS $$
BEGIN
  IF OLD.status IN ('FINALIZED', 'CLOSED') THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'finalized billing cycle cannot be deleted'; END IF;
    IF NEW.period_start IS DISTINCT FROM OLD.period_start OR NEW.period_end IS DISTINCT FROM OLD.period_end THEN
      RAISE EXCEPTION 'finalized billing cycle period is immutable';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER billing_cycles_finalized_period_immutable
BEFORE UPDATE OR DELETE ON billing_cycles
FOR EACH ROW EXECUTE FUNCTION prevent_finalized_billing_cycle_changes();
--> statement-breakpoint
UPDATE application_metadata SET schema_version = 3 WHERE singleton = true;

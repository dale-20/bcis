ALTER TABLE "invoices" DROP CONSTRAINT "invoices_amounts_valid";--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amounts_valid" CHECK ("invoices"."total_centavos" >= 0 AND "invoices"."balance_centavos" >= 0);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION protect_adjustment_history() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'adjustments are immutable history' USING ERRCODE = '55000'; END IF;
  IF OLD.status IN ('POSTED', 'REJECTED', 'REVERSED') AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'terminal adjustment is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.invoice_id IS DISTINCT FROM OLD.invoice_id OR
     NEW.amount_centavos IS DISTINCT FROM OLD.amount_centavos OR NEW.reason IS DISTINCT FROM OLD.reason OR
     NEW.requested_by_user_id IS DISTINCT FROM OLD.requested_by_user_id OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'adjustment origin is immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER adjustments_immutable_history BEFORE UPDATE OR DELETE ON adjustments FOR EACH ROW EXECUTE FUNCTION protect_adjustment_history();
--> statement-breakpoint
UPDATE "application_metadata" SET "schema_version" = 6 WHERE "singleton" = true;

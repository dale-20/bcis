ALTER TABLE "payment_proofs" ALTER COLUMN "payment_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD COLUMN "uploaded_by_user_id" uuid;--> statement-breakpoint
UPDATE "payment_proofs" pp SET "uploaded_by_user_id" = p."created_by_user_id" FROM "payments" p WHERE pp."payment_id" = p."id";--> statement-breakpoint
ALTER TABLE "payment_proofs" ALTER COLUMN "uploaded_by_user_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_proofs" ADD CONSTRAINT "payment_proofs_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_proofs_payment_uq" ON "payment_proofs" USING btree ("payment_id") WHERE "payment_proofs"."payment_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payment_proofs_uploader_created_idx" ON "payment_proofs" USING btree ("uploaded_by_user_id","created_at");--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_payment_proof_history_changes() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.payment_id IS NULL AND OLD.created_at < now() - interval '24 hours' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'payment proofs are immutable history' USING ERRCODE = '55000';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.storage_key IS DISTINCT FROM OLD.storage_key OR
     NEW.original_filename IS DISTINCT FROM OLD.original_filename OR NEW.mime_type IS DISTINCT FROM OLD.mime_type OR
     NEW.size_bytes IS DISTINCT FROM OLD.size_bytes OR NEW.sha256 IS DISTINCT FROM OLD.sha256 OR
     NEW.created_at IS DISTINCT FROM OLD.created_at OR NEW.uploaded_by_user_id IS DISTINCT FROM OLD.uploaded_by_user_id THEN
    RAISE EXCEPTION 'payment proof evidence is immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.payment_id IS NOT NULL AND NEW.payment_id IS DISTINCT FROM OLD.payment_id THEN
    RAISE EXCEPTION 'proof cannot be detached from payment history' USING ERRCODE = '55000';
  END IF;
  IF OLD.status <> 'PENDING' AND NEW IS DISTINCT FROM OLD THEN RAISE EXCEPTION 'reviewed payment proof is immutable' USING ERRCODE = '55000'; END IF;
  IF OLD.status = 'PENDING' AND NEW.status NOT IN ('PENDING', 'VERIFIED', 'REJECTED') THEN RAISE EXCEPTION 'invalid proof transition' USING ERRCODE = '55000'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
UPDATE "application_metadata" SET "schema_version" = 7 WHERE "singleton" = true;

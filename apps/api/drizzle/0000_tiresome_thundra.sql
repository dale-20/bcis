CREATE TABLE "application_metadata" (
	"singleton" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"schema_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "application_metadata_singleton" CHECK ("application_metadata"."singleton" = true),
	CONSTRAINT "application_metadata_version_positive" CHECK ("application_metadata"."schema_version" > 0)
);
--> statement-breakpoint
INSERT INTO "application_metadata" ("singleton", "schema_version") VALUES (true, 1);

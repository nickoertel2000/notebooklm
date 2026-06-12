CREATE TABLE "audio_overviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"notebook_id" uuid NOT NULL,
	"format" text NOT NULL,
	"title" text DEFAULT 'Audio-Übersicht' NOT NULL,
	"s3_key" text,
	"duration_seconds" integer,
	"length" text DEFAULT 'standard' NOT NULL,
	"language" text DEFAULT 'de' NOT NULL,
	"focus" text,
	"source_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audio_overviews" ADD CONSTRAINT "audio_overviews_notebook_id_notebooks_id_fk" FOREIGN KEY ("notebook_id") REFERENCES "public"."notebooks"("id") ON DELETE cascade ON UPDATE no action;
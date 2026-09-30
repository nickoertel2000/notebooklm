CREATE TABLE "usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "source_chunks_embedding_idx";--> statement-breakpoint
ALTER TABLE "usage_events" ADD CONSTRAINT "usage_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "usage_events_user_kind_idx" ON "usage_events" USING btree ("user_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audio_overviews_notebook_idx" ON "audio_overviews" USING btree ("notebook_id","created_at");--> statement-breakpoint
CREATE INDEX "messages_notebook_idx" ON "messages" USING btree ("notebook_id","created_at");--> statement-breakpoint
CREATE INDEX "notebooks_user_idx" ON "notebooks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reports_notebook_idx" ON "reports" USING btree ("notebook_id","created_at");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "source_chunks_source_idx" ON "source_chunks" USING btree ("source_id");--> statement-breakpoint
CREATE INDEX "sources_notebook_idx" ON "sources" USING btree ("notebook_id");--> statement-breakpoint
CREATE INDEX "video_overviews_notebook_idx" ON "video_overviews" USING btree ("notebook_id","created_at");
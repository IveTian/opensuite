ALTER TABLE "messages" ADD COLUMN "scheduled_at" timestamp with time zone;
ALTER TABLE "messages" ADD COLUMN "send_status" text;
ALTER TABLE "messages" ADD COLUMN "send_error" text;
ALTER TABLE "messages" ADD COLUMN "sent_by_user_id" text;
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_user_id_user_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
CREATE INDEX "messages_scheduled_idx" ON "messages" USING btree ("send_status","scheduled_at");

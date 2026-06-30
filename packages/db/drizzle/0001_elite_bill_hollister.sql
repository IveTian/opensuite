ALTER TABLE "messages" ADD COLUMN "body_text" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "body_html" text;--> statement-breakpoint
CREATE INDEX "messages_folder_idx" ON "messages" USING btree ("address_id","folder");
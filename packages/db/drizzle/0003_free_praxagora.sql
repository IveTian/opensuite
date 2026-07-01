CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"signature_html" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_addresses" ADD COLUMN "sender_name" text;--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "org_signature_html" text;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
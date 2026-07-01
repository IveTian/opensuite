CREATE TABLE "mailbox_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"can_send" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mailbox_members" ADD CONSTRAINT "mailbox_members_address_id_email_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."email_addresses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mailbox_members" ADD CONSTRAINT "mailbox_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mailbox_members_addr_user_uniq" ON "mailbox_members" USING btree ("address_id","user_id");--> statement-breakpoint
CREATE INDEX "mailbox_members_user_idx" ON "mailbox_members" USING btree ("user_id");
CREATE TABLE "department_mailbox_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"address_id" uuid NOT NULL,
	"default_can_send" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "email_addresses" ADD COLUMN "shared_signature_html" text;--> statement-breakpoint
ALTER TABLE "email_addresses" ADD COLUMN "shared_disable_personal_signature" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "department_mailbox_access" ADD CONSTRAINT "department_mailbox_access_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "department_mailbox_access" ADD CONSTRAINT "department_mailbox_access_address_id_email_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."email_addresses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "department_mailbox_access_dept_addr_uniq" ON "department_mailbox_access" USING btree ("department_id","address_id");--> statement-breakpoint
CREATE INDEX "department_mailbox_access_addr_idx" ON "department_mailbox_access" USING btree ("address_id");
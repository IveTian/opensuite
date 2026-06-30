CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp,
	"refreshTokenExpiresAt" timestamp,
	"scope" text,
	"password" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"token" text NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	"impersonatedBy" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	"role" text DEFAULT 'user',
	"banned" boolean DEFAULT false,
	"banReason" text,
	"banExpires" timestamp,
	"approvalStatus" text DEFAULT 'active' NOT NULL,
	"locale" text,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp NOT NULL,
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"filename" text,
	"content_type" text,
	"size_bytes" bigint,
	"r2_object_key" text NOT NULL,
	"content_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" text,
	"action" text NOT NULL,
	"target_type" text,
	"target_id" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"is_catch_all_enabled" boolean DEFAULT false NOT NULL,
	"catch_all_address_id" uuid,
	"dkim_selector" text,
	"dkim_verified" boolean DEFAULT false NOT NULL,
	"spf_verified" boolean DEFAULT false NOT NULL,
	"mx_verified" boolean DEFAULT false NOT NULL,
	"cf_zone_id" text,
	"cf_route_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "domains_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "email_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"domain_id" uuid NOT NULL,
	"user_id" text,
	"local_part" text NOT NULL,
	"address" text NOT NULL,
	"type" text DEFAULT 'mailbox' NOT NULL,
	"target_address_id" uuid,
	"is_primary" boolean DEFAULT false NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"storage_quota_bytes" bigint,
	"used_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_code_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invite_code_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"redeemed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invite_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"created_by_user_id" text,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp,
	"note" text,
	"default_plan_id" uuid,
	"allowed_domain_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invite_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"address_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"message_id" text,
	"in_reply_to" text,
	"references" text,
	"from_address" text,
	"to_addresses" jsonb,
	"cc_addresses" jsonb,
	"bcc_addresses" jsonb,
	"subject" text,
	"snippet" text,
	"size_bytes" bigint,
	"r2_object_key" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"is_starred" boolean DEFAULT false NOT NULL,
	"folder" text DEFAULT 'inbox' NOT NULL,
	"received_at" timestamp,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"storage_quota_bytes" bigint NOT NULL,
	"max_addresses" integer DEFAULT 1 NOT NULL,
	"daily_send_quota" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plans_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
	"registration_mode" text DEFAULT 'invite_only' NOT NULL,
	"require_admin_approval" boolean DEFAULT false NOT NULL,
	"default_plan_id" uuid,
	"default_storage_quota_bytes" bigint DEFAULT 1073741824 NOT NULL,
	"default_max_addresses" integer DEFAULT 1 NOT NULL,
	"signup_default_domain_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "user_quota" (
	"user_id" text PRIMARY KEY NOT NULL,
	"plan_id" uuid,
	"storage_quota_bytes" bigint NOT NULL,
	"used_bytes" bigint DEFAULT 0 NOT NULL,
	"max_addresses" integer DEFAULT 1 NOT NULL,
	"daily_send_quota" integer,
	"sent_today" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_addresses" ADD CONSTRAINT "email_addresses_domain_id_domains_id_fk" FOREIGN KEY ("domain_id") REFERENCES "public"."domains"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_addresses" ADD CONSTRAINT "email_addresses_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_code_redemptions" ADD CONSTRAINT "invite_code_redemptions_invite_code_id_invite_codes_id_fk" FOREIGN KEY ("invite_code_id") REFERENCES "public"."invite_codes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_code_redemptions" ADD CONSTRAINT "invite_code_redemptions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_default_plan_id_plans_id_fk" FOREIGN KEY ("default_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invite_codes" ADD CONSTRAINT "invite_codes_allowed_domain_id_domains_id_fk" FOREIGN KEY ("allowed_domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_address_id_email_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."email_addresses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_default_plan_id_plans_id_fk" FOREIGN KEY ("default_plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_settings" ADD CONSTRAINT "system_settings_signup_default_domain_id_domains_id_fk" FOREIGN KEY ("signup_default_domain_id") REFERENCES "public"."domains"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_quota" ADD CONSTRAINT "user_quota_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_quota" ADD CONSTRAINT "user_quota_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "email_addresses_domain_local_uniq" ON "email_addresses" USING btree ("domain_id","local_part");--> statement-breakpoint
CREATE UNIQUE INDEX "email_addresses_address_uniq" ON "email_addresses" USING btree ("address");--> statement-breakpoint
CREATE INDEX "email_addresses_user_idx" ON "email_addresses" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "email_addresses_domain_idx" ON "email_addresses" USING btree ("domain_id");--> statement-breakpoint
CREATE INDEX "invite_codes_status_idx" ON "invite_codes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "messages_address_idx" ON "messages" USING btree ("address_id");--> statement-breakpoint
CREATE INDEX "messages_message_id_idx" ON "messages" USING btree ("message_id");
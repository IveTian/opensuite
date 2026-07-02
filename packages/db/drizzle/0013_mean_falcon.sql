CREATE TABLE "drive_group_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drive_node_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"group_id" uuid,
	"department_id" uuid,
	"user_id" text,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drive_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"space_id" uuid NOT NULL,
	"parent_id" uuid,
	"type" text NOT NULL,
	"name" text NOT NULL,
	"owner_user_id" text,
	"size_bytes" bigint DEFAULT 0 NOT NULL,
	"mime_type" text,
	"r2_object_key" text,
	"is_trashed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drive_permission_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drive_permission_groups_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "drive_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"node_id" uuid NOT NULL,
	"token" text NOT NULL,
	"password_hash" text,
	"role" text DEFAULT 'viewer' NOT NULL,
	"allow_download" boolean DEFAULT true NOT NULL,
	"expires_at" timestamp,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "drive_shares_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "drive_spaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text DEFAULT 'personal' NOT NULL,
	"owner_user_id" text,
	"department_id" uuid,
	"name" text NOT NULL,
	"quota_bytes" bigint,
	"used_bytes" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "system_settings" ADD COLUMN "default_drive_quota_bytes" bigint DEFAULT 1073741824 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_quota" ADD COLUMN "drive_quota_bytes" bigint;--> statement-breakpoint
ALTER TABLE "user_quota" ADD COLUMN "drive_used_bytes" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "drive_group_members" ADD CONSTRAINT "drive_group_members_group_id_drive_permission_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."drive_permission_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_group_members" ADD CONSTRAINT "drive_group_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_node_grants" ADD CONSTRAINT "drive_node_grants_node_id_drive_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."drive_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_node_grants" ADD CONSTRAINT "drive_node_grants_group_id_drive_permission_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."drive_permission_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_node_grants" ADD CONSTRAINT "drive_node_grants_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_node_grants" ADD CONSTRAINT "drive_node_grants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_node_grants" ADD CONSTRAINT "drive_node_grants_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_nodes" ADD CONSTRAINT "drive_nodes_space_id_drive_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "public"."drive_spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_nodes" ADD CONSTRAINT "drive_nodes_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_shares" ADD CONSTRAINT "drive_shares_node_id_drive_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."drive_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_shares" ADD CONSTRAINT "drive_shares_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_spaces" ADD CONSTRAINT "drive_spaces_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_spaces" ADD CONSTRAINT "drive_spaces_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "drive_group_members_group_user_uniq" ON "drive_group_members" USING btree ("group_id","user_id");--> statement-breakpoint
CREATE INDEX "drive_group_members_user_idx" ON "drive_group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "drive_node_grants_node_idx" ON "drive_node_grants" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "drive_node_grants_group_idx" ON "drive_node_grants" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "drive_node_grants_department_idx" ON "drive_node_grants" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "drive_node_grants_user_idx" ON "drive_node_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "drive_nodes_space_parent_idx" ON "drive_nodes" USING btree ("space_id","parent_id");--> statement-breakpoint
CREATE INDEX "drive_nodes_parent_idx" ON "drive_nodes" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "drive_nodes_owner_idx" ON "drive_nodes" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "drive_shares_node_idx" ON "drive_shares" USING btree ("node_id");--> statement-breakpoint
CREATE INDEX "drive_shares_token_idx" ON "drive_shares" USING btree ("token");--> statement-breakpoint
CREATE INDEX "drive_spaces_owner_idx" ON "drive_spaces" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "drive_spaces_department_idx" ON "drive_spaces" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "drive_spaces_type_idx" ON "drive_spaces" USING btree ("type");
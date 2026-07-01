CREATE TABLE "calendar_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_id" uuid NOT NULL,
	"user_id" text,
	"uid" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"location" text,
	"color" text,
	"all_day" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"rrule" text,
	"recurrence_id" timestamp with time zone,
	"exdates" jsonb,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"organizer_email" text,
	"reminders" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"calendar_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendar_reminder_dispatch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"occurrence_start" timestamp with time zone NOT NULL,
	"minutes_before" integer NOT NULL,
	"method" text NOT NULL,
	"dispatched_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calendars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"color" text,
	"type" text DEFAULT 'personal' NOT NULL,
	"owner_user_id" text,
	"department_id" uuid,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_attendees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"user_id" text,
	"email" text NOT NULL,
	"display_name" text,
	"role" text DEFAULT 'required' NOT NULL,
	"is_organizer" boolean DEFAULT false NOT NULL,
	"partstat" text DEFAULT 'needs-action' NOT NULL,
	"responded_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_members" ADD CONSTRAINT "calendar_members_calendar_id_calendars_id_fk" FOREIGN KEY ("calendar_id") REFERENCES "public"."calendars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_members" ADD CONSTRAINT "calendar_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendar_reminder_dispatch" ADD CONSTRAINT "calendar_reminder_dispatch_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calendars" ADD CONSTRAINT "calendars_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_event_id_calendar_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."calendar_events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_attendees" ADD CONSTRAINT "event_attendees_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "calendar_events_calendar_idx" ON "calendar_events" USING btree ("calendar_id");--> statement-breakpoint
CREATE INDEX "calendar_events_uid_idx" ON "calendar_events" USING btree ("uid");--> statement-breakpoint
CREATE INDEX "calendar_events_starts_idx" ON "calendar_events" USING btree ("starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "calendar_members_cal_user_uniq" ON "calendar_members" USING btree ("calendar_id","user_id");--> statement-breakpoint
CREATE INDEX "calendar_members_user_idx" ON "calendar_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "reminder_dispatch_uniq" ON "calendar_reminder_dispatch" USING btree ("event_id","occurrence_start","minutes_before","method");--> statement-breakpoint
CREATE INDEX "calendars_owner_idx" ON "calendars" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "calendars_department_idx" ON "calendars" USING btree ("department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_attendees_event_email_uniq" ON "event_attendees" USING btree ("event_id","email");--> statement-breakpoint
CREATE INDEX "event_attendees_event_idx" ON "event_attendees" USING btree ("event_id");
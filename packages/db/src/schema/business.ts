import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";

/**
 * 自建业务表。
 *
 * 阶段约定：
 * - 「实装」表第一阶段建表并跑通 CRUD。
 * - 「骨架」表（messages / attachments）第一阶段仅建表，逻辑留到阶段二（邮件收发）。
 * - 部分字段标注「预留」：建列但第一阶段不写逻辑（别名 / catch-all / DKIM 等）。
 * - 业务表主键统一用 uuid + gen_random_uuid()；引用 user.id 的外键用 text。
 */

// ============ domains 托管域名（实装；DNS/DKIM 字段预留）============
export const domains = pgTable("domains", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  status: text("status").notNull().default("pending"), // pending/verifying/active/disabled

  // 以下为阶段二/四预留
  isCatchAllEnabled: boolean("is_catch_all_enabled").notNull().default(false),
  catchAllAddressId: uuid("catch_all_address_id"), // 预留：指向 email_addresses，阶段二再加 FK
  dkimSelector: text("dkim_selector"),
  dkimVerified: boolean("dkim_verified").notNull().default(false),
  spfVerified: boolean("spf_verified").notNull().default(false),
  mxVerified: boolean("mx_verified").notNull().default(false),
  cfZoneId: text("cf_zone_id"),
  cfRouteId: text("cf_route_id"),

  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// ============ email_addresses 邮箱地址 / mailbox（实装 mailbox；alias/catch-all 预留）============
export const emailAddresses = pgTable(
  "email_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    domainId: uuid("domain_id")
      .notNull()
      .references(() => domains.id, { onDelete: "cascade" }),
    // 拥有者；alias / catch-all 可为空
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    localPart: text("local_part").notNull(),
    // 冗余的完整地址（localPart@domain），便于唯一约束与查询
    address: text("address").notNull(),
    // 自定义发信人显示名（发信时用作 From 头 name；为空则回退用户昵称）
    senderName: text("sender_name"),
    // 公共邮箱专用签名；撰写时可与个人/组织签名组合
    sharedSignatureHtml: text("shared_signature_html"),
    // 公共邮箱发信时是否禁用个人签名
    sharedDisablePersonalSignature: boolean("shared_disable_personal_signature")
      .notNull()
      .default(false),
    type: text("type").notNull().default("mailbox"), // mailbox/alias/catch_all
    targetAddressId: uuid("target_address_id"), // 预留：alias 指向真实 mailbox
    isPrimary: boolean("is_primary").notNull().default(false),
    status: text("status").notNull().default("active"), // active/disabled
    // 地址级配额覆盖（为空则用用户级配额）
    storageQuotaBytes: bigint("storage_quota_bytes", { mode: "number" }),
    usedBytes: bigint("used_bytes", { mode: "number" }).notNull().default(0),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("email_addresses_domain_local_uniq").on(t.domainId, t.localPart),
    uniqueIndex("email_addresses_address_uniq").on(t.address),
    index("email_addresses_user_idx").on(t.userId),
    index("email_addresses_domain_idx").on(t.domainId),
  ],
);

// ============ mailbox_members 公共邮箱成员（实装）============
// 公共/共享邮箱（email_addresses.type = "shared"，userId 为空）通过此表授权用户访问。
export const mailboxMembers = pgTable(
  "mailbox_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    addressId: uuid("address_id")
      .notNull()
      .references(() => emailAddresses.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // 是否可从该共享邮箱发信（默认可读可发）
    canSend: boolean("can_send").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mailbox_members_addr_user_uniq").on(t.addressId, t.userId),
    index("mailbox_members_user_idx").on(t.userId),
  ],
);

// ============ plans 配额套餐（实装，轻量）============
export const plans = pgTable("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  storageQuotaBytes: bigint("storage_quota_bytes", { mode: "number" }).notNull(),
  maxAddresses: integer("max_addresses").notNull().default(1),
  dailySendQuota: integer("daily_send_quota"), // 预留：发信限额
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// ============ user_quota 每用户配额与用量（实装，核心）============
export const userQuota = pgTable("user_quota", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").references(() => plans.id, { onDelete: "set null" }),
  storageQuotaBytes: bigint("storage_quota_bytes", { mode: "number" }).notNull(),
  usedBytes: bigint("used_bytes", { mode: "number" }).notNull().default(0), // 阶段二真实聚合
  maxAddresses: integer("max_addresses").notNull().default(1),
  dailySendQuota: integer("daily_send_quota"), // 预留
  sentToday: integer("sent_today").notNull().default(0), // 预留
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// ============ invite_codes 邀请码（实装）============
export const inviteCodes = pgTable(
  "invite_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    maxUses: integer("max_uses").notNull().default(1),
    usedCount: integer("used_count").notNull().default(0),
    expiresAt: timestamp("expires_at", { mode: "date" }),
    note: text("note"),
    defaultPlanId: uuid("default_plan_id").references(() => plans.id, {
      onDelete: "set null",
    }),
    allowedDomainId: uuid("allowed_domain_id").references(() => domains.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("active"), // active/revoked/exhausted/expired
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("invite_codes_status_idx").on(t.status)],
);

// ============ invite_code_redemptions 邀请码使用记录（实装，审计 + 防超用）============
export const inviteCodeRedemptions = pgTable("invite_code_redemptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  inviteCodeId: uuid("invite_code_id")
    .notNull()
    .references(() => inviteCodes.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  redeemedAt: timestamp("redeemed_at", { mode: "date" }).notNull().defaultNow(),
});

// ============ system_settings 全局设置（实装，固定单行）============
export const systemSettings = pgTable("system_settings", {
  id: text("id").primaryKey().default("global"),
  // 品牌：站点名称与 Logo（logoUrl 可为外链或 data: URL；为空则用内置名称与图标）
  siteName: text("site_name"),
  logoUrl: text("logo_url"),
  registrationMode: text("registration_mode").notNull().default("closed"),
  requireAdminApproval: boolean("require_admin_approval").notNull().default(false),
  defaultPlanId: uuid("default_plan_id").references(() => plans.id, {
    onDelete: "set null",
  }),
  defaultStorageQuotaBytes: bigint("default_storage_quota_bytes", { mode: "number" })
    .notNull()
    .default(1073741824), // 1 GiB
  defaultMaxAddresses: integer("default_max_addresses").notNull().default(1),
  signupDefaultDomainId: uuid("signup_default_domain_id").references(() => domains.id, {
    onDelete: "set null",
  }),
  // 组织整体签名（HTML）：撰写时自动附加在个人签名之后
  orgSignatureHtml: text("org_signature_html"),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  updatedByUserId: text("updated_by_user_id"),
});

// ============ user_settings 用户个人偏好（实装）============
export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // 个人签名（HTML）：撰写时自动插入正文
  signatureHtml: text("signature_html"),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// ============ departments 组织部门（通讯录用；层级预留）============
// 组织通讯录 = 用户 + 部门模型。部门由 admin 维护，对所有登录用户可见。
export const departments = pgTable("departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // 预留：多级部门；v1 平铺，不建自引用外键
  parentId: uuid("parent_id"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

// ============ department_mailbox_access 部门公共邮箱授权（实装）============
// 部门开通公共邮箱后，部门成员及其下级部门成员动态获得访问权。
// defaultCanSend=false 即「全部只读」；需要发信的人员通过 mailbox_members 显式授权 canSend=true。
export const departmentMailboxAccess = pgTable(
  "department_mailbox_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    departmentId: uuid("department_id")
      .notNull()
      .references(() => departments.id, { onDelete: "cascade" }),
    addressId: uuid("address_id")
      .notNull()
      .references(() => emailAddresses.id, { onDelete: "cascade" }),
    defaultCanSend: boolean("default_can_send").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("department_mailbox_access_dept_addr_uniq").on(t.departmentId, t.addressId),
    index("department_mailbox_access_addr_idx").on(t.addressId),
  ],
);

// ============ directory_profiles 用户组织资料（通讯录用；每用户一行）============
// 扩展 user 表的组织通讯录字段（部门/职位/电话等），由 admin 维护。
// 姓名/邮箱/头像仍取自 user 表；此表只存组织补充信息。
export const directoryProfiles = pgTable(
  "directory_profiles",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    jobTitle: text("job_title"),
    phone: text("phone"),
    mobile: text("mobile"),
    extension: text("extension"),
    location: text("location"),
    // 部门内排序
    sortOrder: integer("sort_order").notNull().default(0),
    // 从组织目录隐藏该用户（默认展示）
    isHidden: boolean("is_hidden").notNull().default(false),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("directory_profiles_dept_idx").on(t.departmentId)],
);

// ============ personal_contacts 个人通讯录（用户私有地址簿）============
// 用户自己维护，可含系统外的人；displayName 即用户为其取的别名。
export const personalContacts = pgTable(
  "personal_contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    company: text("company"),
    jobTitle: text("job_title"),
    notes: text("notes"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("personal_contacts_user_idx").on(t.userId),
    // 同一用户下同邮箱唯一：去重 + 让「从邮件加为联系人」可幂等 upsert
    uniqueIndex("personal_contacts_user_email_uniq").on(t.userId, t.email),
  ],
);

// ============ audit_log 操作审计（可选实装，轻量）============
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorUserId: text("actor_user_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [index("audit_log_actor_idx").on(t.actorUserId)],
);

// ============ messages 邮件元数据（阶段二骨架，第一阶段仅建表）============
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    addressId: uuid("address_id")
      .notNull()
      .references(() => emailAddresses.id, { onDelete: "cascade" }),
    direction: text("direction").notNull(), // inbound/outbound
    messageId: text("message_id"),
    inReplyTo: text("in_reply_to"),
    references: text("references"),
    fromAddress: text("from_address"),
    // 发件人显示名（From 头的 name 部分，收发一致展示「张三」而非仅地址）
    fromName: text("from_name"),
    toAddresses: jsonb("to_addresses").$type<string[]>(),
    ccAddresses: jsonb("cc_addresses").$type<string[]>(),
    bccAddresses: jsonb("bcc_addresses").$type<string[]>(),
    subject: text("subject"),
    snippet: text("snippet"),
    // 可检索/可直接展示的正文（大对象原文仍在 R2）
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    sizeBytes: bigint("size_bytes", { mode: "number" }),
    // 原始 MIME 在 R2 的对象 key
    r2ObjectKey: text("r2_object_key"),
    isRead: boolean("is_read").notNull().default(false),
    isStarred: boolean("is_starred").notNull().default(false),
    folder: text("folder").notNull().default("inbox"), // inbox/sent/trash...
    receivedAt: timestamp("received_at", { mode: "date" }),
    sentAt: timestamp("sent_at", { mode: "date" }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true, mode: "date" }),
    sendStatus: text("send_status"), // draft/scheduled/sending/sent/failed
    sendError: text("send_error"),
    sentByUserId: text("sent_by_user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_address_idx").on(t.addressId),
    index("messages_message_id_idx").on(t.messageId),
    index("messages_folder_idx").on(t.addressId, t.folder),
    index("messages_scheduled_idx").on(t.sendStatus, t.scheduledAt),
  ],
);

// ============ attachments 附件元数据（阶段二骨架）============
export const attachments = pgTable("attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id, { onDelete: "cascade" }),
  filename: text("filename"),
  contentType: text("content_type"),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  // 附件二进制在 R2 的对象 key
  r2ObjectKey: text("r2_object_key").notNull(),
  contentId: text("content_id"), // inline cid
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

// ============ calendars 日历本（个人 / 部门 / 手动共享）============
// personal：ownerUserId 拥有；department：关联部门，可见性派生自 directory_profiles；
// shared：靠 calendar_members 显式授权。每用户懒创建一个 isDefault 的个人日历。
export const calendars = pgTable(
  "calendars",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    color: text("color"),
    type: text("type").notNull().default("personal"), // personal/department/shared
    // 个人日历拥有者；部门日历可记创建者
    ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
    // type=department 时关联的部门
    departmentId: uuid("department_id").references(() => departments.id, {
      onDelete: "set null",
    }),
    isDefault: boolean("is_default").notNull().default(false),
    isVisible: boolean("is_visible").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("calendars_owner_idx").on(t.ownerUserId),
    index("calendars_department_idx").on(t.departmentId),
  ],
);

// ============ calendar_members 日历共享成员（跨部门/显式授权）============
export const calendarMembers = pgTable(
  "calendar_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("viewer"), // viewer/editor/owner
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("calendar_members_cal_user_uniq").on(t.calendarId, t.userId),
    index("calendar_members_user_idx").on(t.userId),
  ],
);

// ============ calendar_events 事件（含 RRULE 重复规则）============
// 列表接口按 [from,to] 展开重复为实例；本表存主事件 + override 行（recurrenceId 指向被改期的 occurrence）。
export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    calendarId: uuid("calendar_id")
      .notNull()
      .references(() => calendars.id, { onDelete: "cascade" }),
    // 创建者/组织者归属
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    // iCalendar UID（互操作用），应用层 crypto.randomUUID()+"@domain" 生成
    uid: text("uid").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    location: text("location"),
    color: text("color"),
    allDay: boolean("all_day").notNull().default(false),
    // 存 UTC instant；timezone 列辅助显示与 RRULE 展开
    startsAt: timestamp("starts_at", { withTimezone: true, mode: "date" }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true, mode: "date" }).notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    // RRULE 字符串（不含前缀），null 为单次
    rrule: text("rrule"),
    // override 实例指向的原始 occurrence 起点（null 为主事件）
    recurrenceId: timestamp("recurrence_id", { withTimezone: true, mode: "date" }),
    // 被删除/改期的 occurrence 起点（ISO 列表）
    exdates: jsonb("exdates").$type<string[]>(),
    status: text("status").notNull().default("confirmed"), // confirmed/tentative/cancelled
    sequence: integer("sequence").notNull().default(0), // 改一次 +1（iCalendar SEQUENCE）
    organizerEmail: text("organizer_email"),
    reminders: jsonb("reminders").$type<{ minutesBefore: number; method: string }[]>(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("calendar_events_calendar_idx").on(t.calendarId),
    index("calendar_events_uid_idx").on(t.uid),
    index("calendar_events_starts_idx").on(t.startsAt),
  ],
);

// ============ event_attendees 参与者 + RSVP 回执 ============
export const eventAttendees = pgTable(
  "event_attendees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    // 内部用户带 userId；外部参与者为空
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    email: text("email").notNull(),
    displayName: text("display_name"),
    role: text("role").notNull().default("required"), // required/optional
    isOrganizer: boolean("is_organizer").notNull().default(false),
    partstat: text("partstat").notNull().default("needs-action"), // needs-action/accepted/declined/tentative
    respondedAt: timestamp("responded_at", { withTimezone: true, mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("event_attendees_event_email_uniq").on(t.eventId, t.email),
    index("event_attendees_event_idx").on(t.eventId),
  ],
);

// ============ calendar_reminder_dispatch 提醒去重台账（cron 用）============
// 记录已派发的 (事件, occurrence, 提前量, 方式)，保证提醒幂等不重复。
export const calendarReminderDispatch = pgTable(
  "calendar_reminder_dispatch",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .notNull()
      .references(() => calendarEvents.id, { onDelete: "cascade" }),
    occurrenceStart: timestamp("occurrence_start", { withTimezone: true, mode: "date" }).notNull(),
    minutesBefore: integer("minutes_before").notNull(),
    method: text("method").notNull(),
    dispatchedAt: timestamp("dispatched_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reminder_dispatch_uniq").on(
      t.eventId,
      t.occurrenceStart,
      t.minutesBefore,
      t.method,
    ),
  ],
);

// 行类型导出，供后端使用
export type Domain = typeof domains.$inferSelect;
export type EmailAddress = typeof emailAddresses.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type UserQuota = typeof userQuota.$inferSelect;
export type InviteCode = typeof inviteCodes.$inferSelect;
export type SystemSettings = typeof systemSettings.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type MailboxMember = typeof mailboxMembers.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type DepartmentMailboxAccess = typeof departmentMailboxAccess.$inferSelect;
export type DirectoryProfile = typeof directoryProfiles.$inferSelect;
export type PersonalContact = typeof personalContacts.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;
export type CalendarRow = typeof calendars.$inferSelect;
export type CalendarMemberRow = typeof calendarMembers.$inferSelect;
export type CalendarEventRow = typeof calendarEvents.$inferSelect;
export type EventAttendeeRow = typeof eventAttendees.$inferSelect;
export type CalendarReminderDispatchRow = typeof calendarReminderDispatch.$inferSelect;

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
  registrationMode: text("registration_mode").notNull().default("invite_only"),
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
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
  },
  (t) => [
    index("messages_address_idx").on(t.addressId),
    index("messages_message_id_idx").on(t.messageId),
    index("messages_folder_idx").on(t.addressId, t.folder),
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

// 行类型导出，供后端使用
export type Domain = typeof domains.$inferSelect;
export type EmailAddress = typeof emailAddresses.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type UserQuota = typeof userQuota.$inferSelect;
export type InviteCode = typeof inviteCodes.$inferSelect;
export type SystemSettings = typeof systemSettings.$inferSelect;
export type UserSettings = typeof userSettings.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Attachment = typeof attachments.$inferSelect;

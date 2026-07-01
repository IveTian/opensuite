import { z } from "zod";
import {
  ADDRESS_TYPES,
  ATTENDEE_PARTSTATS,
  ATTENDEE_ROLES,
  CALENDAR_MEMBER_ROLES,
  CALENDAR_TYPES,
  DOMAIN_STATUSES,
  EVENT_EDIT_SCOPES,
  EVENT_STATUSES,
  REGISTRATION_MODES,
  REMINDER_METHODS,
  ROLES,
} from "../constants.js";

/**
 * 跨端共享的 Zod 校验 schema。
 * 前端表单与后端 API 复用同一份，保证校验规则与类型一致。
 */

/** 邮箱本地部分（@ 前缀）：小写字母数字与 . _ - ，1-64 位 */
const localPart = z
  .string()
  .trim()
  .toLowerCase()
  .min(1)
  .max(64)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, "邮箱前缀格式不合法");

/** 域名：基础格式校验 */
const domainName = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/, "域名格式不合法");

// ----------------------- 认证 -----------------------

export const signInSchema = z.object({
  email: z.string().trim().email("邮箱格式不合法"),
  password: z.string().min(8, "密码至少 8 位").max(128),
});
export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z
  .object({
    name: z.string().trim().min(1, "请填写昵称").max(64),
    /** 首位管理员引导：系统尚无域名，用外部邮箱注册登录 */
    email: z.string().trim().email("邮箱格式不合法").optional(),
    password: z.string().min(8, "密码至少 8 位").max(128),
    /** 兼容旧客户端；首位管理员引导不会使用邀请码 */
    inviteCode: z.string().trim().min(1).max(64).optional(),
  })
  .refine((d) => Boolean(d.email), {
    message: "请填写邮箱",
    path: ["email"],
  });
export type SignUpInput = z.infer<typeof signUpSchema>;

// ----------------------- 域名 -----------------------

export const createDomainSchema = z.object({
  name: domainName,
});
export type CreateDomainInput = z.infer<typeof createDomainSchema>;

export const updateDomainSchema = z.object({
  status: z.enum(DOMAIN_STATUSES).optional(),
  isCatchAllEnabled: z.boolean().optional(),
  catchAllAddressId: z.string().uuid().nullable().optional(),
});
export type UpdateDomainInput = z.infer<typeof updateDomainSchema>;

// ----------------------- 邮箱地址 -----------------------

export const createAddressSchema = z.object({
  domainId: z.string().uuid(),
  userId: z.string().min(1).optional(),
  localPart,
  type: z.enum(ADDRESS_TYPES).default("mailbox"),
  isPrimary: z.boolean().default(false),
  /** type=alias 时必填：投递到的目标 mailbox 地址 id */
  targetAddressId: z.string().uuid().optional(),
});
export type CreateAddressInput = z.infer<typeof createAddressSchema>;

/** 公共邮箱：添加可访问成员 */
export const addMailboxMemberSchema = z.object({
  userId: z.string().min(1),
  canSend: z.boolean().optional(),
});
export type AddMailboxMemberInput = z.infer<typeof addMailboxMemberSchema>;

/** 公共邮箱：更新显式成员权限 */
export const updateMailboxMemberSchema = z.object({
  canSend: z.boolean(),
});
export type UpdateMailboxMemberInput = z.infer<typeof updateMailboxMemberSchema>;

/** 部门开通公共邮箱 */
export const setDepartmentMailboxSchema = z.object({
  addressId: z.string().uuid(),
  defaultCanSend: z.boolean().default(false),
});
export type SetDepartmentMailboxInput = z.infer<typeof setDepartmentMailboxSchema>;

/** 公共邮箱发信配置 */
export const updateSharedAddressSettingsSchema = z.object({
  senderName: z.string().trim().max(120).nullable().optional(),
  sharedSignatureHtml: z.string().max(20000).nullable().optional(),
  sharedDisablePersonalSignature: z.boolean().optional(),
});
export type UpdateSharedAddressSettingsInput = z.infer<
  typeof updateSharedAddressSettingsSchema
>;

// ----------------------- 套餐 / 配额 -----------------------

export const createPlanSchema = z.object({
  name: z.string().trim().min(1).max(64),
  storageQuotaBytes: z.coerce.number().int().nonnegative(),
  maxAddresses: z.coerce.number().int().positive().max(1000),
  dailySendQuota: z.coerce.number().int().nonnegative().nullable().optional(),
  isDefault: z.boolean().default(false),
});
export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const assignQuotaSchema = z.object({
  planId: z.string().uuid().nullable().optional(),
  storageQuotaBytes: z.coerce.number().int().nonnegative(),
  maxAddresses: z.coerce.number().int().positive().max(1000),
  dailySendQuota: z.coerce.number().int().nonnegative().nullable().optional(),
});
export type AssignQuotaInput = z.infer<typeof assignQuotaSchema>;

// ----------------------- 邀请码 -----------------------

export const createInviteCodesSchema = z.object({
  /** 一次批量生成的数量 */
  count: z.coerce.number().int().positive().max(100).default(1),
  maxUses: z.coerce.number().int().positive().max(10000).default(1),
  expiresAt: z.coerce.date().nullable().optional(),
  note: z.string().trim().max(255).nullable().optional(),
  defaultPlanId: z.string().uuid().nullable().optional(),
  allowedDomainId: z.string().uuid().nullable().optional(),
});
export type CreateInviteCodesInput = z.infer<typeof createInviteCodesSchema>;

export const validateInviteSchema = z.object({
  code: z.string().trim().min(1).max(64),
});
export type ValidateInviteInput = z.infer<typeof validateInviteSchema>;

// ----------------------- 系统设置 -----------------------

/** 签名 HTML：撰写时插入正文，长度上限 20k */
const signatureHtml = z.string().max(20000).nullable().optional();

export const updateSettingsSchema = z.object({
  registrationMode: z.enum(REGISTRATION_MODES),
  requireAdminApproval: z.boolean(),
  defaultPlanId: z.string().uuid().nullable().optional(),
  defaultStorageQuotaBytes: z.coerce.number().int().nonnegative(),
  defaultMaxAddresses: z.coerce.number().int().positive().max(1000),
  signupDefaultDomainId: z.string().uuid().nullable().optional(),
  /** 组织整体签名 */
  orgSignatureHtml: signatureHtml,
  /** 品牌：站点名称 */
  siteName: z.string().trim().max(60).nullable().optional(),
  /** 品牌：Logo（外链或 data: URL，最长约 700k 以容纳内嵌小图） */
  logoUrl: z.string().trim().max(700000).nullable().optional(),
});
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

// ----------------------- 用户发信设置 -----------------------

/** 个人签名设置 */
export const updateMailSettingsSchema = z.object({
  signatureHtml: signatureHtml,
});
export type UpdateMailSettingsInput = z.infer<typeof updateMailSettingsSchema>;

/** 头像上传（base64，约 200KB 上限） */
export const updateAvatarSchema = z.object({
  contentType: z
    .string()
    .regex(/^image\/(png|jpe?g|gif|webp|svg\+xml)$/i, "仅支持常见图片格式"),
  imageBase64: z.string().min(1).max(280000),
});
export type UpdateAvatarInput = z.infer<typeof updateAvatarSchema>;

/** 按邮箱地址批量解析头像（目录查询，同 Google 域内做法） */
export const resolveAvatarsSchema = z.object({
  emails: z.array(z.string().trim().toLowerCase().max(320)).min(1).max(100),
});
export type ResolveAvatarsInput = z.infer<typeof resolveAvatarsSchema>;

/** 自定义某个邮箱地址的发信人显示名（空串视为清除） */
export const updateSenderNameSchema = z.object({
  senderName: z.string().trim().max(120).nullable().optional(),
});
export type UpdateSenderNameInput = z.infer<typeof updateSenderNameSchema>;

// ----------------------- 管理员改用户 -----------------------

export const updateUserSchema = z.object({
  role: z.enum(ROLES).optional(),
  approvalStatus: z.enum(["active", "pending"]).optional(),
  locale: z.string().trim().max(16).nullable().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

/** 管理员邀请/创建用户：内部邮箱作为登录身份，外部邮箱只用于通知 */
export const createManagedUserSchema = z.object({
  name: z.string().trim().min(1, "请填写姓名").max(64),
  externalEmail: z.string().trim().toLowerCase().email("外部邮箱格式不合法"),
  domainId: z.string().uuid(),
  localPart,
  password: z.string().min(8, "密码至少 8 位").max(128),
  sendNotice: z.boolean().default(true),
  role: z.enum(ROLES).default("user"),
});
export type CreateManagedUserInput = z.infer<typeof createManagedUserSchema>;

// ----------------------- 邮件（阶段二）-----------------------

/** 发信附件（前端以 base64 上传） */
export const attachmentInputSchema = z.object({
  filename: z.string().max(255),
  contentType: z.string().max(127).optional(),
  contentBase64: z.string().max(36_000_000), // ~25MiB base64
  /** 内联资源（正文 cid: 引用的图片）。inline 时需提供 contentId。 */
  inline: z.boolean().optional(),
  contentId: z.string().max(255).optional(),
});
export type AttachmentInput = z.infer<typeof attachmentInputSchema>;

const outboundMessageSchema = z
  .object({
    /** 发件地址（必须是当前用户名下的 active mailbox） */
    fromAddressId: z.string().uuid(),
    to: z.array(z.string().email()).min(1, "至少一个收件人").max(50),
    cc: z.array(z.string().email()).max(50).optional(),
    bcc: z.array(z.string().email()).max(50).optional(),
    subject: z.string().max(255).default(""),
    text: z.string().max(1_000_000).optional(),
    html: z.string().max(2_000_000).optional(),
    attachments: z.array(attachmentInputSchema).max(10).optional(),
    /** 回复/转发：被回复邮件的行 id，用于派生线程头 */
    replyToMessageId: z.string().uuid().optional(),
    /** 发送草稿后删除该草稿 */
    draftId: z.string().uuid().optional(),
  })
  .refine((d) => Boolean(d.text?.length) || Boolean(d.html?.length), {
    message: "正文不能为空",
    path: ["text"],
  });
export const sendMessageSchema = outboundMessageSchema;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const scheduleMessageSchema = outboundMessageSchema
  .and(
    z.object({
      /** 计划发送时间：ISO 8601 时间点（含偏移或 Z） */
      scheduledAt: z.string().datetime({ offset: true }),
    }),
  )
  .refine((d) => new Date(d.scheduledAt).getTime() > Date.now(), {
    message: "定时发送时间必须晚于当前时间",
    path: ["scheduledAt"],
  });
export type ScheduleMessageInput = z.infer<typeof scheduleMessageSchema>;

/** 草稿保存（字段宽松，允许不完整） */
export const saveDraftSchema = z.object({
  id: z.string().uuid().optional(),
  fromAddressId: z.string().uuid(),
  to: z.array(z.string()).max(50).optional(),
  cc: z.array(z.string()).max(50).optional(),
  bcc: z.array(z.string()).max(50).optional(),
  subject: z.string().max(255).optional(),
  text: z.string().max(1_000_000).optional(),
  html: z.string().max(2_000_000).optional(),
});
export type SaveDraftInput = z.infer<typeof saveDraftSchema>;

export const updateMessageSchema = z.object({
  isRead: z.boolean().optional(),
  isStarred: z.boolean().optional(),
  folder: z.string().max(32).optional(),
});
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;

/** 批量操作：勾选多封后一次性归档/删除/标记 */
export const BULK_ACTIONS = [
  "archive",
  "trash",
  "inbox",
  "read",
  "unread",
  "star",
  "unstar",
] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export const bulkActionSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, "请至少选择一封").max(500),
  action: z.enum(BULK_ACTIONS),
});
export type BulkActionInput = z.infer<typeof bulkActionSchema>;

// ----------------------- 通讯录 -----------------------

/** 个人通讯录：新建联系人 */
export const createPersonalContactSchema = z.object({
  /** 用户为其取的显示名/别名 */
  displayName: z.string().trim().min(1, "请填写名称").max(120),
  email: z.string().trim().toLowerCase().email("邮箱格式不合法").max(254),
  phone: z.string().trim().max(40).nullable().optional(),
  company: z.string().trim().max(120).nullable().optional(),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  isFavorite: z.boolean().optional(),
});
export type CreatePersonalContactInput = z.infer<typeof createPersonalContactSchema>;

/** 个人通讯录：更新联系人（字段可选） */
export const updatePersonalContactSchema = createPersonalContactSchema.partial();
export type UpdatePersonalContactInput = z.infer<typeof updatePersonalContactSchema>;

/** 组织通讯录：新建/更新部门（admin） */
export const upsertDepartmentSchema = z.object({
  name: z.string().trim().min(1, "请填写部门名称").max(80),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.coerce.number().int().optional(),
});
export type UpsertDepartmentInput = z.infer<typeof upsertDepartmentSchema>;

/** 组织通讯录：更新某用户的组织资料（admin） */
export const updateDirectoryProfileSchema = z.object({
  departmentId: z.string().uuid().nullable().optional(),
  jobTitle: z.string().trim().max(120).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  mobile: z.string().trim().max(40).nullable().optional(),
  extension: z.string().trim().max(20).nullable().optional(),
  location: z.string().trim().max(120).nullable().optional(),
  sortOrder: z.coerce.number().int().optional(),
  isHidden: z.boolean().optional(),
});
export type UpdateDirectoryProfileInput = z.infer<typeof updateDirectoryProfileSchema>;

// ----------------------- 日历 -----------------------

/** ISO 8601 时间点字符串（带偏移，如 2026-07-01T09:00:00+08:00） */
const isoDateTime = z.string().datetime({ offset: true });
/** 十六进制颜色（如 #7c3aed），或预留调色板键 */
const colorField = z.string().trim().max(32).nullable().optional();

/** 新建日历本 */
export const createCalendarSchema = z.object({
  name: z.string().trim().min(1, "请填写日历名称").max(80),
  color: colorField,
  type: z.enum(CALENDAR_TYPES).default("personal"),
  /** type=department 时必填 */
  departmentId: z.string().uuid().nullable().optional(),
});
export type CreateCalendarInput = z.infer<typeof createCalendarSchema>;

/** 更新日历本（字段可选） */
export const updateCalendarSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    color: colorField,
    isVisible: z.boolean().optional(),
  })
  .strict();
export type UpdateCalendarInput = z.infer<typeof updateCalendarSchema>;

/** 把日历共享给某用户 */
export const shareCalendarSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(CALENDAR_MEMBER_ROLES).default("viewer"),
});
export type ShareCalendarInput = z.infer<typeof shareCalendarSchema>;

/** 事件参与者（表单/请求） */
export const eventAttendeeInputSchema = z.object({
  email: z.string().trim().toLowerCase().email("参与者邮箱格式不合法").max(254),
  displayName: z.string().trim().max(120).nullable().optional(),
  /** 内部用户则带 userId，外部参与者为空 */
  userId: z.string().nullable().optional(),
  role: z.enum(ATTENDEE_ROLES).default("required"),
});
export type EventAttendeeInput = z.infer<typeof eventAttendeeInputSchema>;

/** 事件提醒项 */
export const eventReminderInputSchema = z.object({
  minutesBefore: z.coerce.number().int().min(0).max(40320), // ≤ 4 周
  method: z.enum(REMINDER_METHODS).default("popup"),
});
export type EventReminderInput = z.infer<typeof eventReminderInputSchema>;

/** RRULE 字符串（iCalendar 重复规则，不含 RRULE: 前缀，如 FREQ=WEEKLY;BYDAY=MO,WE） */
const rruleField = z.string().trim().max(1000).nullable().optional();

/** 新建事件 */
export const createEventSchema = z
  .object({
    calendarId: z.string().uuid(),
    title: z.string().trim().min(1, "请填写标题").max(200),
    description: z.string().trim().max(20000).nullable().optional(),
    location: z.string().trim().max(300).nullable().optional(),
    color: colorField,
    allDay: z.boolean().default(false),
    startsAt: isoDateTime,
    endsAt: isoDateTime,
    /** IANA 时区名，如 Asia/Shanghai */
    timezone: z.string().trim().max(64).default("UTC"),
    rrule: rruleField,
    status: z.enum(EVENT_STATUSES).default("confirmed"),
    attendees: z.array(eventAttendeeInputSchema).max(500).default([]),
    reminders: z.array(eventReminderInputSchema).max(10).default([]),
    /** 是否给参与者发送 .ics 邮件邀请（默认发） */
    sendInvites: z.boolean().default(true),
  })
  .refine((v) => new Date(v.endsAt).getTime() >= new Date(v.startsAt).getTime(), {
    message: "结束时间不能早于开始时间",
    path: ["endsAt"],
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

/** 更新事件（字段可选，不校验时间先后于服务端处理） */
export const updateEventSchema = z.object({
  calendarId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(20000).nullable().optional(),
  location: z.string().trim().max(300).nullable().optional(),
  color: colorField,
  allDay: z.boolean().optional(),
  startsAt: isoDateTime.optional(),
  endsAt: isoDateTime.optional(),
  timezone: z.string().trim().max(64).optional(),
  rrule: rruleField,
  status: z.enum(EVENT_STATUSES).optional(),
  attendees: z.array(eventAttendeeInputSchema).max(500).optional(),
  reminders: z.array(eventReminderInputSchema).max(10).optional(),
  sendInvites: z.boolean().optional(),
  /** 重复事件的编辑范围 */
  scope: z.enum(EVENT_EDIT_SCOPES).default("all"),
  /** scope=this|following 时，指定作用的 occurrence 起点（ISO） */
  occurrenceStart: isoDateTime.optional(),
});
export type UpdateEventInput = z.infer<typeof updateEventSchema>;

/** 本人对事件的 RSVP 回执 */
export const rsvpSchema = z.object({
  partstat: z.enum(ATTENDEE_PARTSTATS),
  /** 重复事件时可指定针对某 occurrence（预留，默认整条） */
  occurrenceStart: isoDateTime.optional(),
});
export type RsvpInput = z.infer<typeof rsvpSchema>;

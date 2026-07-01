import { z } from "zod";
import {
  ADDRESS_TYPES,
  DOMAIN_STATUSES,
  REGISTRATION_MODES,
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
    /** 普通注册：用户名（邮箱本地部分），服务端按注册域名拼成 username@域名 作为登录身份与主邮箱 */
    username: localPart.optional(),
    /** 首位管理员引导：系统尚无域名，用外部邮箱注册登录 */
    email: z.string().trim().email("邮箱格式不合法").optional(),
    password: z.string().min(8, "密码至少 8 位").max(128),
    /** 仅邀请码模式需要 */
    inviteCode: z.string().trim().min(1).max(64).optional(),
  })
  .refine((d) => Boolean(d.username) || Boolean(d.email), {
    message: "请填写用户名",
    path: ["username"],
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

export const sendMessageSchema = z
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
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

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

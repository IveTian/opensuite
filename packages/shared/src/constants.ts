/**
 * 全系统共享的枚举常量。
 * 这些字面量同时被 Drizzle schema、后端校验、前端表单引用，集中定义避免漂移。
 */

/** 用户角色 */
export const ROLES = ["user", "admin"] as const;
export type Role = (typeof ROLES)[number];

/** 用户审核状态（审核模式下使用） */
export const APPROVAL_STATUSES = ["active", "pending"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** 注册模式：开放 / 仅邀请码 / 关闭 */
export const REGISTRATION_MODES = ["open", "invite_only", "closed"] as const;
export type RegistrationMode = (typeof REGISTRATION_MODES)[number];

/** 域名状态 */
export const DOMAIN_STATUSES = ["pending", "verifying", "active", "disabled"] as const;
export type DomainStatus = (typeof DOMAIN_STATUSES)[number];

/** 邮箱地址类型：真实邮箱 / 别名 / catch-all / 公共共享邮箱 */
export const ADDRESS_TYPES = ["mailbox", "alias", "catch_all", "shared"] as const;
export type AddressType = (typeof ADDRESS_TYPES)[number];

/** 邮箱地址状态 */
export const ADDRESS_STATUSES = ["active", "disabled"] as const;
export type AddressStatus = (typeof ADDRESS_STATUSES)[number];

/** 邀请码状态 */
export const INVITE_CODE_STATUSES = ["active", "revoked", "exhausted", "expired"] as const;
export type InviteCodeStatus = (typeof INVITE_CODE_STATUSES)[number];

/** 邮件方向（第二阶段使用） */
export const MESSAGE_DIRECTIONS = ["inbound", "outbound"] as const;
export type MessageDirection = (typeof MESSAGE_DIRECTIONS)[number];

/** 容量单位换算助手 */
export const BYTES_PER_MB = 1024 * 1024;
export const BYTES_PER_GB = 1024 * BYTES_PER_MB;

/** 系统设置固定单行主键 */
export const SYSTEM_SETTINGS_ID = "global";

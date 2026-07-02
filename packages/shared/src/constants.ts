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

// ----------------------- 日历 -----------------------

/** 日历本类型：个人 / 部门 / 手动共享 */
export const CALENDAR_TYPES = ["personal", "department", "shared"] as const;
export type CalendarType = (typeof CALENDAR_TYPES)[number];

/** 日历共享成员角色（权限从低到高：viewer < editor < owner） */
export const CALENDAR_MEMBER_ROLES = ["viewer", "editor", "owner"] as const;
export type CalendarMemberRole = (typeof CALENDAR_MEMBER_ROLES)[number];

/** 事件状态（对齐 iCalendar STATUS） */
export const EVENT_STATUSES = ["confirmed", "tentative", "cancelled"] as const;
export type EventStatus = (typeof EVENT_STATUSES)[number];

/** 参与者角色 */
export const ATTENDEE_ROLES = ["required", "optional"] as const;
export type AttendeeRole = (typeof ATTENDEE_ROLES)[number];

/** 参与者回执状态（对齐 iCalendar PARTSTAT） */
export const ATTENDEE_PARTSTATS = ["needs-action", "accepted", "declined", "tentative"] as const;
export type AttendeePartstat = (typeof ATTENDEE_PARTSTATS)[number];

/** 提醒方式：站内实时弹窗 / 邮件 */
export const REMINDER_METHODS = ["popup", "email"] as const;
export type ReminderMethod = (typeof REMINDER_METHODS)[number];

/** iCalendar METHOD（出/入站 .ics 用） */
export const ICAL_METHODS = ["REQUEST", "REPLY", "CANCEL"] as const;
export type IcalMethod = (typeof ICAL_METHODS)[number];

/** 重复规则频率（RRULE FREQ 子集） */
export const RRULE_FREQS = ["DAILY", "WEEKLY", "MONTHLY", "YEARLY"] as const;
export type RruleFreq = (typeof RRULE_FREQS)[number];

/** 编辑/删除重复事件的作用范围 */
export const EVENT_EDIT_SCOPES = ["this", "following", "all"] as const;
export type EventEditScope = (typeof EVENT_EDIT_SCOPES)[number];

// ----------------------- 网盘 -----------------------

/** 网盘空间类型：个人 / 组织公共 / 部门 */
export const DRIVE_SPACE_TYPES = ["personal", "org", "department"] as const;
export type DriveSpaceType = (typeof DRIVE_SPACE_TYPES)[number];

/** 网盘节点类型：文件夹 / 文件 */
export const DRIVE_NODE_TYPES = ["folder", "file"] as const;
export type DriveNodeType = (typeof DRIVE_NODE_TYPES)[number];

/** 网盘授权角色（低→高）：只读 / 读写 */
export const DRIVE_ROLES = ["viewer", "editor"] as const;
export type DriveRole = (typeof DRIVE_ROLES)[number];

/** 网盘授权主体：权限组 / 部门（动态）/ 用户直授（对内分享） */
export const DRIVE_GRANT_SUBJECTS = ["group", "department", "user"] as const;
export type DriveGrantSubject = (typeof DRIVE_GRANT_SUBJECTS)[number];

/** 单文件上传大小上限（Worker 直传，字节）；超大文件后续走分片 */
export const DRIVE_MAX_UPLOAD_BYTES = 100 * BYTES_PER_MB;

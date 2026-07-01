import type {
  AttendeePartstat,
  AttendeeRole,
  CalendarMemberRole,
  CalendarType,
  EventStatus,
  RegistrationMode,
  ReminderMethod,
  Role,
} from "./constants.js";

/**
 * 跨端共享的 API DTO 类型（与数据库行无强绑定，便于前端消费）。
 */

/** 注册页读取的公开配置 */
export interface RegistrationConfig {
  /** 是否允许任何人注册（open 或 invite_only 时为 true，closed 为 false；bootstrap 时恒 true） */
  enabled: boolean;
  mode: RegistrationMode;
  /** 是否必须填写邀请码 */
  requireInviteCode: boolean;
  /** 公开注册默认域名（用于展示将分配的邮箱后缀） */
  defaultDomain: string | null;
  /** 系统零用户：首位注册者将成为管理员，免邀请码 */
  bootstrap: boolean;
}

/** 站点品牌（公开，未登录页也可读） */
export interface BrandingConfig {
  /** 站点名称；为空时前端回退为默认 */
  siteName: string;
  /** Logo 图片地址（外链或 data: URL）；为空时用内置图标 */
  logoUrl: string | null;
}

/** 邮箱账号（侧栏切换器用）：个人邮箱 + 被授权的公共邮箱 */
export interface MailboxAccount {
  /** email_addresses.id */
  id: string;
  address: string;
  /** personal=自有邮箱；shared=公共邮箱 */
  kind: "personal" | "shared";
  isPrimary: boolean;
  /** 是否可从该账号发信 */
  canSend: boolean;
  /** 自定义发信人显示名 */
  senderName: string | null;
}

/** 邀请码预校验结果 */
export interface InviteValidationResult {
  valid: boolean;
  reason?: "not_found" | "revoked" | "expired" | "exhausted";
}

/** 管理后台仪表盘统计 */
export interface AdminStats {
  userCount: number;
  domainCount: number;
  addressCount: number;
  pendingApprovalCount: number;
  totalStorageQuotaBytes: number;
  totalUsedBytes: number;
}

/** 当前登录用户（前端 me 接口） */
export interface MeProfile {
  id: string;
  name: string;
  email: string;
  role: Role;
  emailVerified: boolean;
}

// ----------------------- 通讯录 -----------------------

/** 组织部门 */
export interface Department {
  id: string;
  name: string;
  parentId: string | null;
  sortOrder: number;
  /** 该部门成员数（列表接口返回） */
  memberCount?: number;
}

/** 组织通讯录条目（= 用户 + 组织资料，姓名/邮箱/头像取自 user 表） */
export interface DirectoryEntry {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  departmentId: string | null;
  departmentName: string | null;
  jobTitle: string | null;
  phone: string | null;
  mobile: string | null;
  extension: string | null;
  location: string | null;
  /** 仅 admin 目录管理接口返回：是否从目录隐藏 */
  isHidden?: boolean;
}

/** 组织通讯录一次拉取：部门 + 成员 */
export interface DirectoryPayload {
  departments: Department[];
  entries: DirectoryEntry[];
}

/** 个人通讯录联系人 */
export interface PersonalContact {
  id: string;
  displayName: string;
  email: string;
  phone: string | null;
  company: string | null;
  jobTitle: string | null;
  notes: string | null;
  isFavorite: boolean;
}

/** 邮件视图用：邮箱地址（小写）→ 显示名。个人别名优先，其次组织目录名 */
export type ContactNameMap = Record<string, string>;

// ----------------------- 日历 -----------------------

/** 日历本（含当前用户对它的权限角色） */
export interface Calendar {
  id: string;
  name: string;
  color: string | null;
  type: CalendarType;
  ownerUserId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  isDefault: boolean;
  isVisible: boolean;
  /** 当前用户对该日历的权限（owner 可管理成员/删日历） */
  role: CalendarMemberRole;
}

/** 事件参与者 + RSVP 状态 */
export interface EventAttendee {
  id: string;
  userId: string | null;
  email: string;
  displayName: string | null;
  role: AttendeeRole;
  isOrganizer: boolean;
  partstat: AttendeePartstat;
  respondedAt: string | null;
}

/** 事件提醒项 */
export interface EventReminder {
  minutesBefore: number;
  method: ReminderMethod;
}

/**
 * 日历事件。列表接口（GET /events?from&to）返回的是**展开后的实例**：
 * 主事件字段照带，另附本次 occurrence 的起止（occurrenceStart/occurrenceEnd）。
 */
export interface CalendarEvent {
  id: string;
  calendarId: string;
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  color: string | null;
  allDay: boolean;
  /** 主事件的起止（ISO 8601） */
  startsAt: string;
  endsAt: string;
  timezone: string;
  rrule: string | null;
  status: EventStatus;
  sequence: number;
  organizerEmail: string | null;
  reminders: EventReminder[];
  attendees?: EventAttendee[];
  /** 展开实例：本次 occurrence 起止；非重复事件与 startsAt/endsAt 相同 */
  occurrenceStart: string;
  occurrenceEnd: string;
  /** 该实例是否重复系列的一份子 */
  isRecurring: boolean;
}

/** 日历共享成员 */
export interface CalendarMember {
  userId: string;
  name: string;
  email: string;
  role: CalendarMemberRole;
}

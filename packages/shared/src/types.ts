import type {
  AttendeePartstat,
  AttendeeRole,
  CalendarMemberRole,
  CalendarType,
  DriveNodeType,
  DriveRole,
  DriveSpaceType,
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
  /** 是否允许公开注册；当前仅系统零用户引导时为 true */
  enabled: boolean;
  mode: RegistrationMode;
  /** 兼容旧注册页；管理员邀请流程不使用邀请码 */
  requireInviteCode: boolean;
  /** 兼容旧注册页；管理员邀请流程在后台选择域名 */
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
  /** 公共邮箱签名；个人邮箱为空 */
  sharedSignatureHtml?: string | null;
  /** 使用公共邮箱发信时是否禁用个人签名 */
  sharedDisablePersonalSignature?: boolean;
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

// ----------------------- 网盘 -----------------------

/** 网盘空间（含当前用户对它的最高权限角色） */
export interface DriveSpace {
  id: string;
  type: DriveSpaceType;
  name: string;
  ownerUserId: string | null;
  departmentId: string | null;
  departmentName: string | null;
  /** 容量上限；个人空间为用户配额，null 表示不限 */
  quotaBytes: number | null;
  usedBytes: number;
  /** 当前用户在该空间根的默认权限（personal owner=editor；org/department 依授权） */
  role: DriveRole;
  /** 是否本人个人空间 */
  isOwner: boolean;
}

/** 网盘节点（文件/文件夹），含当前用户有效权限 */
export interface DriveNode {
  id: string;
  spaceId: string;
  parentId: string | null;
  type: DriveNodeType;
  name: string;
  ownerUserId: string | null;
  ownerName: string | null;
  sizeBytes: number;
  mimeType: string | null;
  isTrashed: boolean;
  createdAt: string;
  updatedAt: string;
  /** 当前用户对该节点的有效权限 */
  role: DriveRole;
  /** 是否有公开分享链接（列表标记，可选） */
  hasShare?: boolean;
}

/** 面包屑项 */
export interface DriveBreadcrumb {
  id: string;
  name: string;
}

/** 权限组（含成员数） */
export interface DrivePermissionGroup {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
}

/** 权限组成员 */
export interface DriveGroupMember {
  userId: string;
  name: string;
  email: string;
}

/** 节点授权项（管理界面展示） */
export interface DriveGrant {
  id: string;
  nodeId: string;
  subject: "group" | "department" | "user";
  groupId: string | null;
  departmentId: string | null;
  userId: string | null;
  /** 主体展示名 */
  label: string;
  role: DriveRole;
}

/** 对外分享链接 */
export interface DriveShare {
  id: string;
  nodeId: string;
  token: string;
  hasPassword: boolean;
  role: DriveRole;
  allowDownload: boolean;
  expiresAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

/** 网盘配额（用户侧） */
export interface DriveQuota {
  quotaBytes: number;
  usedBytes: number;
}

/** 对外分享落地页元数据（免登录） */
export interface PublicShareMeta {
  needsPassword: boolean;
  /** 解锁后才带节点信息 */
  node?: {
    id: string;
    name: string;
    type: DriveNodeType;
    sizeBytes: number;
    mimeType: string | null;
  };
  allowDownload: boolean;
  expired: boolean;
}

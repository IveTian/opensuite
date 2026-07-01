import type { RegistrationMode, Role } from "./constants.js";

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

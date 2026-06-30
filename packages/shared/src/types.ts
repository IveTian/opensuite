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

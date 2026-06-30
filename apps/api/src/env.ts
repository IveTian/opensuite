import type { Database } from "@mailflare/db";
import type { Auth } from "@mailflare/auth";
import type { Client } from "pg";

/**
 * Worker 绑定与变量类型。
 *
 * Cloudflare 运行时类型（Hyperdrive / R2Bucket / SendEmail 等）由 `wrangler types`
 * 生成的 worker-configuration.d.ts 以全局形式提供，无需从 @cloudflare/workers-types 导入。
 * 这里显式声明 Bindings 以纳入 secret（BETTER_AUTH_SECRET）与可选 SUPER_ADMIN_ID。
 */
export interface Bindings {
  /** Hyperdrive：运行时用 .connectionString 连 Postgres */
  HYPERDRIVE: Hyperdrive;
  /** R2：阶段二存原始 MIME / 附件（第一阶段占位） */
  RAW_EMAILS: R2Bucket;
  /** send_email 绑定（第一阶段占位，阶段二出站用） */
  EMAIL: SendEmail;

  // vars / secrets
  BETTER_AUTH_SECRET: string;
  WEB_ORIGIN: string;
  API_ORIGIN: string;
  COOKIE_DOMAIN?: string;
  SUPER_ADMIN_ID?: string;
}

type SessionResult = Awaited<ReturnType<Auth["api"]["getSession"]>>;
export type AuthUser = NonNullable<SessionResult>["user"];
export type AuthSession = NonNullable<SessionResult>["session"];

export interface Variables {
  db: Database;
  dbClient: Client;
  auth: Auth;
  user: AuthUser | null;
  session: AuthSession | null;
}

export type AppEnv = { Bindings: Bindings; Variables: Variables };

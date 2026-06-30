import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import type { Database } from "@mailflare/db";
import { schema, systemSettings, userQuota } from "@mailflare/db";
import { BYTES_PER_GB, SYSTEM_SETTINGS_ID } from "@mailflare/shared";

/**
 * createAuth 所需的环境变量（结构子集，与 Worker 的 Env 结构兼容）。
 */
export interface AuthEnv {
  BETTER_AUTH_SECRET: string;
  /** api 自身的对外地址，如 https://api.example.com（本地 http://localhost:8787） */
  API_ORIGIN: string;
  /** 前端地址，用于 trustedOrigins，如 https://app.example.com */
  WEB_ORIGIN: string;
  /** 跨子域 cookie 的根域，如 .example.com；本地留空 */
  COOKIE_DOMAIN?: string;
  /** 可选：始终视为管理员的用户 id */
  SUPER_ADMIN_ID?: string;
}

/**
 * 每请求构造 Better Auth 实例（Workers 无 process.env，须运行时注入 env 与 db）。
 *
 * 说明：
 * - 注册策略（公开/邀请码/审核）由 API 的 /api/public/sign-up 包装 + Hono 守卫强制执行，
 *   这里保持 signUp 可用以便服务端 `auth.api.signUpEmail` 调用。
 * - after 钩子保证每个新用户都有一行 user_quota（读系统默认配额），覆盖公开注册与管理员建号两条路径。
 */
export function createAuth(db: Database, env: AuthEnv) {
  const isLocal = env.API_ORIGIN.startsWith("http://");

  return betterAuth({
    appName: "MailFlare",
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.API_ORIGIN,
    basePath: "/api/auth",
    trustedOrigins: [env.WEB_ORIGIN],

    database: drizzleAdapter(db, {
      provider: "pg",
      schema,
    }),

    emailAndPassword: {
      enabled: true,
      // 保持 false：公开注册的策略闸门放在 API 包装层，服务端 signUpEmail 仍需可用
      disableSignUp: false,
      minPasswordLength: 8,
      // 注册不自动登录：由 /api/public/sign-up 包装在「业务收尾 + 非待审核」后显式 signIn
      autoSignIn: false,
    },

    user: {
      additionalFields: {
        // 审核状态：审核模式下新用户置 pending；不接受客户端输入
        approvalStatus: {
          type: "string",
          defaultValue: "active",
          input: false,
        },
        locale: {
          type: "string",
          required: false,
        },
      },
    },

    plugins: [
      admin({
        defaultRole: "user",
        adminRoles: ["admin"],
        ...(env.SUPER_ADMIN_ID ? { adminUserIds: [env.SUPER_ADMIN_ID] } : {}),
      }),
    ],

    advanced: {
      database: {
        // 统一 ID 策略：用 uuid 字符串（存于 text 列）
        generateId: () => crypto.randomUUID(),
      },
      ...(env.COOKIE_DOMAIN
        ? {
            crossSubDomainCookies: {
              enabled: true,
              domain: env.COOKIE_DOMAIN,
            },
          }
        : {}),
      useSecureCookies: !isLocal,
      defaultCookieAttributes: {
        sameSite: "lax",
        secure: !isLocal,
      },
    },

    databaseHooks: {
      user: {
        create: {
          after: async (createdUser) => {
            // 读系统默认配额，确保每个新用户都有一行 user_quota
            const settings = await db.query.systemSettings.findFirst({
              where: eq(systemSettings.id, SYSTEM_SETTINGS_ID),
            });
            await db
              .insert(userQuota)
              .values({
                userId: createdUser.id,
                planId: settings?.defaultPlanId ?? null,
                storageQuotaBytes: settings?.defaultStorageQuotaBytes ?? BYTES_PER_GB,
                maxAddresses: settings?.defaultMaxAddresses ?? 1,
              })
              .onConflictDoNothing({ target: userQuota.userId });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

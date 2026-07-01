import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, jwt, oidcProvider } from "better-auth/plugins";
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
 * - 公开注册只允许首位管理员引导；后续用户由管理员业务接口创建。
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
      // 保持 false：管理员业务接口和首位管理员引导都需要服务端 signUpEmail
      disableSignUp: false,
      minPasswordLength: 8,
      // 注册不自动登录：由 /api/public/sign-up 在首位管理员收尾后显式 signIn
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
        externalEmail: {
          type: "string",
          required: false,
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
      // JWT/JWKS：让 OIDC 的 id_token 用 RS256 非对称签名（多数第三方 OIDC 客户端要求），
      // 并在 /api/auth/jwks 暴露公钥。disableSettingJwtHeader：会话响应不再附带 JWT（OIDC 场景无需）。
      jwt({
        jwks: { keyPairConfig: { alg: "RS256", modulusLength: 2048 } },
        disableSettingJwtHeader: true,
      }),
      // OIDC Provider：把 MailFlare 变成身份提供方（IdP），第三方应用可「用 MailFlare 登录」。
      // - loginPage/consentPage 指向前端 SPA；未登录会带原始授权参数跳登录页，登录后自动回到 authorize。
      // - useJWTPlugin：用上面的 jwt 插件做 RS256 签名 + JWKS 发现。
      // - storeClientSecret:"hashed"：数据库只存 client_secret 的哈希（明文仅在创建时返回一次）。
      oidcProvider({
        loginPage: `${env.WEB_ORIGIN}/login`,
        consentPage: `${env.WEB_ORIGIN}/oauth/consent`,
        useJWTPlugin: true,
        requirePKCE: true,
        storeClientSecret: "hashed",
        // 插件在本版本被标记为将迁移到 @better-auth/oauth-provider（尚未发布），本版本仍应使用它。
        __skipDeprecationWarning: true,
        // 附加声明：按请求的 scope 往 id_token / userinfo 注入业务字段。
        getAdditionalUserInfoClaim: (user, scopes) => {
          const u = user as typeof user & {
            role?: string | null;
            locale?: string | null;
            approvalStatus?: string | null;
          };
          const claims: Record<string, unknown> = {};
          if (scopes.includes("profile")) {
            claims.preferred_username = u.name;
            claims.role = u.role ?? "user";
            if (u.locale) claims.locale = u.locale;
          }
          if (scopes.includes("email")) {
            claims.email = u.email;
            claims.email_verified = u.emailVerified;
          }
          return claims;
        },
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

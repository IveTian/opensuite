import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin, jwt, oidcProvider } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { schema } from "@mailflare/db";

/**
 * 仅供 `@better-auth/cli generate` 使用（Node 上下文，读 DATABASE_URL 直连）。
 *
 * 这里只镜像「影响 schema 的配置」（admin / jwt / oidc-provider 插件 + additionalFields + generateId），
 * 用于在改动认证配置后重新生成 packages/db/src/schema/auth.ts。
 * 运行时真正的实例在 packages/auth 的 createAuth 工厂里按请求构造。
 */
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: { enabled: true },
  user: {
    additionalFields: {
      approvalStatus: { type: "string", defaultValue: "active", input: false },
      externalEmail: { type: "string", required: false, input: false },
      locale: { type: "string", required: false },
    },
  },
  plugins: [
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    // jwt → jwks 表；oidc-provider → oauthApplication / oauthAccessToken / oauthConsent 表
    jwt(),
    oidcProvider({
      loginPage: "/login",
      consentPage: "/oauth/consent",
      useJWTPlugin: true,
      __skipDeprecationWarning: true,
    }),
  ],
  advanced: {
    database: { generateId: () => crypto.randomUUID() },
  },
});

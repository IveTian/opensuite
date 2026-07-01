import { boolean, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Better Auth 自管表。
 *
 * 重要约定：
 * - 这四张表的「列名」必须与 Better Auth 的字段名一致（camelCase），drizzleAdapter 按属性键映射。
 * - 这是手写版本，结构对齐 `@better-auth/cli generate` 的产物 + admin 插件字段 + 我们声明的 additionalFields。
 *   若日后用 CLI 重新生成，请保持本文件与生成结果一致（尤其新增插件时）。
 * - user.id 采用 text 类型（Better Auth 默认）；我们在 auth 配置里令其生成 uuid 字符串值。
 *   业务表引用 user.id 的外键列一律用 text。
 */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("emailVerified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),

  // admin 插件字段
  role: text("role").default("user"),
  banned: boolean("banned").default(false),
  banReason: text("banReason"),
  banExpires: timestamp("banExpires", { mode: "date" }),

  // 我们通过 user.additionalFields 声明的业务字段
  approvalStatus: text("approvalStatus").notNull().default("active"),
  externalEmail: text("externalEmail"),
  locale: text("locale"),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
  ipAddress: text("ipAddress"),
  userAgent: text("userAgent"),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  // admin 插件字段：被哪个管理员模拟登录
  impersonatedBy: text("impersonatedBy"),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("accountId").notNull(),
  providerId: text("providerId").notNull(),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("accessToken"),
  refreshToken: text("refreshToken"),
  idToken: text("idToken"),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { mode: "date" }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { mode: "date" }),
  scope: text("scope"),
  // 邮箱密码登录的密码哈希
  password: text("password"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
});

/**
 * jwt 插件表：存 JWKS 密钥对（私钥默认加密后落库）。
 * OIDC 的 id_token 用此密钥对做 RS256 签名，公钥经 /api/auth/jwks 暴露给第三方验签。
 */
export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("publicKey").notNull(),
  privateKey: text("privateKey").notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  expiresAt: timestamp("expiresAt", { mode: "date" }),
});

/**
 * oidc-provider 插件表（MailFlare 作为 IdP）。列名对齐 Better Auth 字段名（camelCase）。
 *
 * - oauthApplication：已注册的第三方应用（client）。clientId 唯一，被 token/consent 表按 clientId 外键引用。
 *   redirectUrls 为空格分隔的白名单；metadata 为 JSON 字符串（我们额外存 launchUrl / showInLauncher 供应用中心磁贴）。
 * - oauthAccessToken：签发的访问/刷新令牌。
 * - oauthConsent：用户对某 client 的授权同意记录（记住 scope，二次登录免再次同意）。
 */
export const oauthApplication = pgTable("oauthApplication", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  icon: text("icon"),
  metadata: text("metadata"),
  clientId: text("clientId").notNull().unique(),
  clientSecret: text("clientSecret"),
  redirectUrls: text("redirectUrls").notNull(),
  type: text("type").notNull(),
  disabled: boolean("disabled").default(false),
  userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

export const oauthAccessToken = pgTable("oauthAccessToken", {
  id: text("id").primaryKey(),
  accessToken: text("accessToken").notNull().unique(),
  refreshToken: text("refreshToken").notNull().unique(),
  accessTokenExpiresAt: timestamp("accessTokenExpiresAt", { mode: "date" }),
  refreshTokenExpiresAt: timestamp("refreshTokenExpiresAt", { mode: "date" }),
  clientId: text("clientId")
    .notNull()
    .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
  userId: text("userId").references(() => user.id, { onDelete: "cascade" }),
  scopes: text("scopes"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

export const oauthConsent = pgTable("oauthConsent", {
  id: text("id").primaryKey(),
  clientId: text("clientId")
    .notNull()
    .references(() => oauthApplication.clientId, { onDelete: "cascade" }),
  userId: text("userId")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  scopes: text("scopes"),
  consentGiven: boolean("consentGiven"),
  createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).notNull().defaultNow(),
});

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type OAuthApplication = typeof oauthApplication.$inferSelect;

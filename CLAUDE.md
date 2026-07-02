# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

MailFlare 是基于 Cloudflare 全家桶（Workers / Email Sending / Email Routing / R2 / Hyperdrive / DNS）的自建邮箱系统。前后端分离双 Worker + 外部 Postgres。产品全貌与分阶段进度见 `README.md` 与 `building_plan.md`。

## 常用命令

根目录用 Turborepo 编排全仓；`pnpm@10`、Node `>=24`。

```bash
pnpm dev                 # 并行起 web(5173) + api(8787)
pnpm typecheck           # 全量 tsc --noEmit（5 个包）
pnpm build               # web: vite build；api: wrangler dry-run 打包
pnpm deploy              # 各包 wrangler deploy

# 单包（改哪个包就只跑哪个，更快）
pnpm --filter @mailflare/api dev          # 只起 api（wrangler dev :8787）
pnpm --filter @mailflare/web dev          # 只起 web（vite :5173）
pnpm --filter @mailflare/api typecheck    # 单包类型检查

# 数据库（drizzle-kit，用「直连串」DATABASE_URL —— 不能用 Hyperdrive 串）
pnpm db:generate         # 改 schema 后生成迁移 SQL
pnpm db:migrate          # 应用迁移（部署前必跑）
pnpm db:seed             # 写默认套餐 + system_settings
pnpm --filter @mailflare/db studio        # drizzle studio

pnpm auth:generate       # 改认证配置后重新生成 packages/db/src/schema/auth.ts
pnpm cf-typegen          # 改 apps/api/wrangler.jsonc 后重新生成 Env 类型
```

**没有自动化测试框架、也没有真正的 lint**（各包 `lint` 是空 echo）。验证手段固定为：`pnpm typecheck` + `pnpm build`（api 打包含 cron 触发器）+ 本地 PG/miniflare R2 手动跑 E2E。改完代码默认至少跑 `pnpm typecheck`。

## 数据库连接的分界（最容易踩的坑）

- **Hyperdrive 只在 Worker 运行时可用**。所有本机工具（drizzle-kit、`@better-auth/cli`、seed）一律用外部 Postgres 的**直连串** `DATABASE_URL`；`packages/db/.env` 或行内 `DATABASE_URL=... pnpm ...` 提供。
- 生产库是 **PlanetScale Postgres**（README 里写的 Neon 是早期文案）。`packages/db/src/client.ts` 和 `drizzle.config.ts` 都对 PlanetScale 的 `sslrootcert=system` / `sslmode=verify-*` 做了归一化（node-postgres 会把 `system` 当文件路径读而 ENOENT）。
- **Hyperdrive 必须 `--caching-disabled`**：auth 是读写一致敏感场景，默认 SELECT 缓存(~60s)会让「注册后立即登录」读到过期空结果，报 `Invalid email or password`（账号其实已建好）。
- Worker 侧是**每请求一条 node-postgres 连接**：`createDb(HYPERDRIVE.connectionString)` 开一条 `Client`，响应后 `ctx.waitUntil(client.end())` 关闭（连接池化交给 Hyperdrive 边缘）。见 `contextMiddleware`。

## 架构

### monorepo 布局
pnpm workspaces + Turborepo。依赖版本由 `pnpm-workspace.yaml` 的 **catalog** 统一锁定（改 React/Tailwind/Hono 等公共依赖版本改这里，包内写 `catalog:`）。

```
apps/web        React 19 + HeroUI V3 + Tailwind v4（Vite）→ 静态资源 Worker
apps/api        Hono + Better Auth + email()/scheduled()/DO → Cloudflare Worker
packages/db     Drizzle schema + node-postgres 建连工厂 + 迁移 + 种子
packages/auth   Better Auth 工厂（admin 插件 / 跨子域 cookie / 配额钩子）
packages/shared Zod schema + 跨端类型 + 枚举常量（constants.ts 是唯一真源）
```

### api（`apps/api/src/index.ts` 是唯一入口，同时导出 4 个运行时钩子）
1. `fetch`：Hono app。中间件顺序 = CORS(带凭据，WS 升级请求跳过) → `contextMiddleware`(每请求注入 `db`/`auth`) → `/api/health` → **拦截原生 `/api/auth/sign-up/email` 返回 403** → Better Auth 挂在 `/api/auth/*` → 业务路由分组 `public` / `me` / `contacts` / `admin`。
2. `email`：入站处理器 `email/handler.ts`（postal-mime 解析 → `resolveDelivery` 按 精确 mailbox→alias→域 catch-all 解析收件人 → `messages` 落库 + 原始 MIME/附件入 R2 → 累加 usedBytes → 通知用户 DO）。
3. `scheduled`：Cron（UTC 0 点），`lib/cron.ts` 重置发信日计数 + 过期邀请码。
4. `UserHub` Durable Object：每用户一个 WebSocket 中枢（`idFromName(user.id)`），入站邮件 POST `/broadcast` 实时推送 `new-mail`；前端经 `GET /api/me/ws` 升级连接。

**鉴权**（`middleware/auth.ts`）：`loadUser`（解析会话，不强制）→ `requireAuth`（拒未登录/待审核/封禁）/ `requireAdmin`（要 admin 角色）。路由分组前置这些中间件。

### 认证（Better Auth）的主权边界
- 运行时实例由 `packages/auth` 的 `createAuth(db, env)` **每请求构造**（Workers 无 `process.env`，须注入）。`apps/api/auth.config.ts` 是**另一份**、仅供 `auth:generate` CLI 在 Node 上下文镜像「影响 schema 的配置」用，别把两者搞混。
- Better Auth **只拥有** `user`/`session`/`account`/`verification` 四张表（`schema/auth.ts`，**手写**以对齐 admin 插件 + additionalFields）；其余业务表自管，经 `userId` 外键关联。
- **注册策略（公开/邀请码/审核）不在 Better Auth 里**，而是 `/api/public/sign-up` 包装层 + Hono 守卫强制执行；`autoSignIn:false`，收尾后显式 signIn。`user.create.after` 钩子保证每个新用户都有一行 `user_quota`。首位注册者自动成为 admin。
- 跨子域会话：`app.` 与 `api.` 同根域，cookie `Domain=.example.com` + `SameSite=Lax`（`COOKIE_DOMAIN` 有值时开启）。

### OIDC 身份提供方（MailFlare 作为 IdP）
- `createAuth` 里挂了 Better Auth 的 `jwt` + `oidc-provider` 两个插件（`auth.config.ts` 同步镜像，改后需 `auth:generate`）。第三方应用可「用 MailFlare 登录」，首页应用中心也能挂第三方 SSO 磁贴。
- **端点**（均在 `/api/auth` 下，由 `index.ts` 的 `app.on(["GET","POST"],"/api/auth/*")` 统一交给 Better Auth）：`oauth2/authorize`、`oauth2/token`、`oauth2/userinfo`、`oauth2/consent`、`oauth2/register`、`jwks`、`.well-known/openid-configuration`。另在**顶层**加了 `/.well-known/openid-configuration` 别名（issuer 根发现），issuer = `API_ORIGIN`。
- **签名**：`useJWTPlugin:true` → id_token 用 `jwt` 插件的 **RS256** 密钥对签名，公钥经 `/api/auth/jwks` 暴露；`storeClientSecret:"hashed"`（明文 secret 仅注册时返回一次）；`requirePKCE:true`。
- **表**：`oauthApplication` / `oauthAccessToken` / `oauthConsent`（oidc-provider）+ `jwks`（jwt），均手写于 `schema/auth.ts`。
- **策略对齐**（这些端点由 Better Auth 直接处理、不经 `requireAuth`，故在 `index.ts` 单独补守卫）：
  - `oauth2/authorize` **与** `oauth2/consent` 前置 `loadUser + requireOidcEligible`，拦 `approvalStatus:"pending"` / `banned`（只拦 authorize 会被「登录后 resume 直达 consent」绕过）。
  - `oauth2/register`（动态客户端注册）前置 `loadUser + requireAdmin`——Better Auth 仅校验「有会话」，本站注册须限管理员（管理端 `registerOAuthApplication` 是服务端内部 api 调用，不经此 HTTP 路由、不受影响）。
  - `getAdditionalUserInfoClaim` 兼作兜底：pending/banned 抛 `APIError` 阻断 id_token 换发与 userinfo（覆盖守卫够不到的 resume 直发 code / refresh 路径）；且**不外泄内部 `role`**。
  - 封禁经 Better Auth `admin/ban-user`（只吊销会话、不失效已发令牌），`index.ts` 后置钩子成功后调 `lib/oidc.ts:revokeUserOidcTokens` 删该用户 `oauthAccessToken`；`PATCH /api/admin/users/:id` 置 pending 时同样清令牌。
- **管理与启动器**：管理端 `/api/admin/oauth-apps`（增删改查、启停、launcher 配置）+ 前端 `/admin/oauth-apps`；`oauthApplication.metadata` 存 `{launchUrl, showInLauncher}`，`/api/me/sso-apps` 供首页 Launchpad 渲染第三方磁贴（点击即跳应用 `launchUrl`，走标准 OIDC 单点登录）。同意页在前端 `/oauth/consent`。

### 数据模型（`packages/db/src/schema/business.ts`）
业务表：`domains` · `email_addresses`(mailbox/alias/catch_all/shared) · `mailbox_members` · `plans` · `user_quota` · `invite_codes` · `invite_code_redemptions` · `system_settings`(单行，主键固定 `global`) · `user_settings` · `departments` · `directory_profiles` · `personal_contacts` · `audit_log` · `messages` · `attachments`。R2 存大对象（`rawKey`=`raw/{id}.eml`、附件、`avatars/{userId}`），Postgres 只存元数据 + key + 可检索正文。

### 前端（`apps/web`）
React Router 7，路由在 `App.tsx`；`ProtectedRoute`（可选 `requireAdmin`）包住 `/admin/*` 与登录页。`lib/api.ts` 是业务 API 的 fetch 封装（统一 `credentials:"include"`，非 2xx 抛 `ApiError`）；`lib/auth-client.ts` 是 Better Auth React 客户端。`VITE_API_ORIGIN` 指向 api Worker。**HeroUI V3 是 CSS-first、无 Provider**，样式经 `styles/globals.css` 全局 `@import`；Tailwind v4 用官方 Vite 插件（非 PostCSS）。富文本用 TipTap，出/入站 HTML 用 DOMPurify + `lib/sanitize.ts` 消毒。

## 代码约定
- **ESM，源码 import 必须带 `.js` 扩展名**（`verbatimModuleSyntax` + Bundler 解析）。跨包引 `@mailflare/{db,auth,shared}`，枚举/常量从 `@mailflare/shared` 引，不要在多处重定义。
- 列命名：auth 表 camelCase（对齐 Better Auth），业务表 snake_case，均显式指定列名，不依赖 drizzle 自动 casing。
- `worker-configuration.d.ts` 由 `wrangler types` 生成但**纳入提交**（克隆即可过类型检查）；改 `wrangler.jsonc` 的绑定/vars 后重跑 `pnpm cf-typegen`。
- 密钥走 `.dev.vars`（本地）/ `wrangler secret`（生产），绝不进 `wrangler.jsonc` 或提交。

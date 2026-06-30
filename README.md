# MailFlare

基于 Cloudflare 全家桶（Workers / Email Sending / Email Routing / R2 / Hyperdrive / DNS）的自建邮箱系统。

> **进度**：阶段一「地基 + 管理后台」✅、阶段二「邮件收发核心」✅、阶段三「Webmail 体验」✅、阶段四「进阶与运维」✅。完整路线图见 [`building_plan.md`](./building_plan.md)。

## 功能一览

- **管理后台**（`/admin`，管理员）：仪表盘（含按域名用量）、域名（DNS 校验 + Catch-all）、用户（角色/封禁/审核/配额）、邮箱地址（mailbox / **别名 alias**）、配额套餐、邀请码、注册策略、审计日志。
- **用户邮箱**（`/mail`）：文件夹（收件箱/已发/草稿/星标/回收站）+ 未读计数、搜索、分页；读信与会话线程；写信（回复/转发带引用、附件上传、草稿自动保存）；星标、软删除→回收站→恢复/永久删除；`.eml` 原文与附件下载；配额条。「模拟收信」按钮可在未配置 DNS 时本地验证收件链路。
- **注册**：公开 / 仅邀请码 / 关闭；邀请码原子占用 + 撤销；可选管理员审核；首位注册者自动成为管理员。

## 架构

前后端分离双 Worker：

```
apps/web   React 19 + HeroUI V3 + Tailwind v4（Vite）→ Cloudflare Static Assets Worker
apps/api   Hono + Better Auth + email() 入站占位        → Cloudflare Worker
packages/db      Drizzle schema + node-postgres 建连工厂 + 迁移 + 种子
packages/auth    Better Auth 工厂（admin 插件 / 跨子域 cookie / 配额钩子）
packages/shared  Zod 校验 + 跨端类型 + 枚举常量
```

数据：外部 Postgres（推荐 Neon）经 **Hyperdrive** 连接 + **R2** 存原始邮件/附件（阶段二）。

## 技术栈

React 19 · HeroUI V3（3.2.x，CSS-first，无 Provider）· Tailwind v4 · Hono 4.12 · Better Auth 1.6 · Drizzle ORM 0.45 · node-postgres · Vite 8 · Wrangler 4 · pnpm workspaces + Turborepo。

## 需要你准备

1. **Cloudflare 账号** + `wrangler login`；一个 Cloudflare 托管的**根域名**（用于 `app.` / `api.` 子域与后续邮件 onboarding）。
2. **外部 Postgres**（推荐 [Neon](https://neon.tech) serverless），拿到「直连串」（非 pooler）。

## 快速开始（本地）

```bash
# 1) 安装
pnpm install

# 2) 创建 Cloudflare 资源（把输出的 id 填回 apps/api/wrangler.jsonc 的 hyperdrive.id）
wrangler r2 bucket create mailflare-raw-emails
wrangler hyperdrive create mailflare-hd \
  --connection-string="postgres://<neon-user>:<pw>@<neon-host>/<db>?sslmode=require"

# 3) 数据库迁移 + 种子（用 Neon 直连串）
cd packages/db && cp .env.example .env   # 填入 DATABASE_URL（Neon 直连串）
export DATABASE_URL="postgres://...neon-direct..."
pnpm drizzle-kit migrate                 # 已含生成好的迁移（drizzle/0000_*.sql）
pnpm --filter @mailflare/db seed         # 写入默认套餐 + system_settings（invite_only）
cd ../..

# 4) api 本地密钥
cd apps/api && cp .dev.vars.example .dev.vars
#   填 BETTER_AUTH_SECRET（openssl rand -base64 32）
#   填 WRANGLER_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE（= 你的 Neon 直连串）
cd ../..

# 5) 启动（两个终端，或根目录 turbo 并行）
pnpm --filter @mailflare/api dev    # http://localhost:8787
pnpm --filter @mailflare/web dev    # http://localhost:5173
#   或：pnpm dev
```

> **首位管理员**：在 invite_only 模式下，系统「零用户」时首个注册者会被自动放行并提升为 **admin**（解决引导鸡生蛋）。打开 `http://localhost:5173/register` 注册即成为管理员。之后注册需邀请码。

## 验证

| 检查 | 方法 |
|---|---|
| api + DB 连通 | `curl http://localhost:8787/api/health` → `{"ok":true}`（内部执行 `select 1`） |
| web + 样式 | 打开 5173，HeroUI 按钮带样式；右上角切换深/浅色生效 |
| 登录会话 | 注册/登录后 `GET /api/auth/get-session` 自动携带 cookie 返回当前用户 |
| 权限 | 普通用户访问 `/api/admin/*` 得 403；管理员可进入后台 CRUD |
| 邀请码 | invite_only 下无码注册 422；有效码注册成功且 `usedCount` 自增、配额自动创建 |

## 部署

同根域不同子域（`app.example.com` / `api.example.com`），跨子域 cookie 用 `Domain=.example.com` + `SameSite=Lax`：

```bash
# api：填 wrangler.jsonc 的 vars（WEB_ORIGIN/API_ORIGIN/COOKIE_DOMAIN=.example.com）
wrangler secret put BETTER_AUTH_SECRET   # 在 apps/api 下
pnpm --filter @mailflare/api deploy

# web：apps/web/.env.local 的 VITE_API_ORIGIN 指向 https://api.example.com
pnpm --filter @mailflare/web deploy
```

两个 Worker 各自绑定自定义域。生产迁移用 CI 跑 `drizzle-kit migrate`（Neon 直连串）。

## 关键约定

- **Hyperdrive 仅 Worker 运行时可用**：所有本机工具（drizzle-kit / better-auth CLI）一律用 Neon **直连串** `DATABASE_URL`，切勿误用 Hyperdrive 串。
- **Better Auth 只拥有** `user/session/account/verification` 四张表；业务表自管，经 `userId` 外键关联。
- **认证表 schema** 为手写（`packages/db/src/schema/auth.ts`），对齐 admin 插件 + additionalFields；改认证配置后可用 `pnpm auth:generate` 重新生成。
- 数据表清单见 `packages/db/src/schema/business.ts`（标注了第一阶段实装 vs 阶段二骨架）。

## 命令速查

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 并行起 web + api |
| `pnpm typecheck` | 全量类型检查 |
| `pnpm db:generate` / `db:migrate` / `db:seed` | 生成迁移 / 应用迁移 / 种子 |
| `pnpm cf-typegen` | 生成 api 的 Env 类型（改 wrangler.jsonc 后重跑） |

## 路线图

完整分阶段计划见 [`building_plan.md`](./building_plan.md)。

- **阶段一·地基 + 管理后台** ✅
- **阶段二·邮件收发核心** ✅ — `email()` 入站（postal-mime → `messages` 落库 + 原始 MIME/附件入 R2）；Email Sending 出站；`usedBytes` 计量。
- **阶段三·Webmail 体验** ✅ — 会话线程、文件夹/搜索/分页、回复转发、附件上传、草稿、配额条。
- **阶段四·进阶与运维** ✅ — 别名/catch-all、DNS(MX/SPF/DMARC/DKIM via DoH)校验、发信日配额 + Cron、审计日志、用量报表、.mbox 导出。
- **后续（可选）** — 域名 onboarding 自动化、退信/抑制名单、IMAP/SMTP 网关、垃圾过滤、AI 自动回复。

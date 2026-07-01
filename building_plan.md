# MailFlare 分阶段实施计划

基于 Cloudflare 生态（Workers / Email Sending / Email Routing / R2 / Hyperdrive / DNS）的自建邮箱系统。本文件记录整体路线图与每个阶段的目标、任务、产物与验证方式。

**架构基线**：前后端分离双 Worker（`apps/web` 静态 SPA + `apps/api` Hono）；外部 Postgres 经 Hyperdrive 连接 + R2 存原始邮件/附件；Better Auth 认证；Drizzle ORM。

图例：✅ 已完成 · 🚧 进行中 · ⏳ 规划中

---

## 阶段一 · 地基 + 管理后台 ✅

**目标**：把可运行的骨架立起来——认证、跨子域会话、管理后台 CRUD、容量/配额分配、注册策略。

**已交付**
- monorepo 脚手架（pnpm workspaces + Turborepo + 共享 TS 配置）；`packages/{db,auth,shared}` + `apps/{web,api}`。
- 数据模型（14 张表）：Better Auth 自管 4 表 + 业务表（domains / email_addresses / plans / user_quota / invite_codes / invite_code_redemptions / system_settings / audit_log），以及阶段二骨架 messages / attachments（含 R2 key 预留）。
- 认证：Better Auth 工厂（admin 插件、跨子域 cookie、注册不自动登录、配额 after 钩子）；Hono 挂载 + requireAuth / requireAdmin 中间件。
- 注册策略：公开 / 仅邀请码 / 关闭；邀请码原子占用 + 防超用 + 撤销；可选管理员审核；**首位注册者自动成为管理员**（引导）。
- 管理后台 API + 页面：仪表盘、域名、用户（角色/封禁/审核/配额）、邮箱地址、套餐配额、邀请码、注册策略。
- 前端：React 19 + HeroUI V3（CSS-first，无 Provider）+ Tailwind v4 + React Router；登录/注册/用户首页 + 暗黑模式。

**验证（已通过）**：5 包 typecheck 全绿；Drizzle 迁移 14 表；web 构建；Worker 打包；**真实 PG + 实跑 Worker 的端到端**——health、引导管理员、会话 cookie、配额钩子、域名 CRUD、邀请码注册流（无码 422 / 有码为普通用户 / 非管理员 403 / 用尽 422）。

**关键文件**：`packages/db/src/schema/*` · `packages/auth/src/index.ts` · `apps/api/src/index.ts` + `routes/*` · `apps/web/src/pages/*`。

---

## 阶段二 · 邮件收发核心 ✅

**目标**：打通真实收发链路与存储——入站落库 + 出站发信 + 容量计量；并提供最简 webmail 读写界面用于验证。

**验证（已通过）**：5 包 typecheck + Worker 打包 + 两个迁移；**本地 PG + miniflare R2 实跑** —— 入站存储（message + R2 原文 + usedBytes 累加 193B）、按文件夹列表、详情含正文、`.eml` 原文下载、标记已读、发信（非己地址 422 / 己地址落入 sent）、删除并清理 R2（删后原文 404）。真实收发仍需域名 onboarding + Email Routing 规则。

**任务**
1. **Schema**：`messages` 增加 `bodyText` / `bodyHtml`；补 folder / direction 索引。生成并应用迁移。
2. **入站 `email()`**：`postal-mime` 解析 → 按 envelope 收件人匹配 `email_addresses`（active mailbox，否则 setReject）→ `messages` 落库（含线程头 Message-ID / In-Reply-To / References）→ 原始 MIME 入 R2、附件入 R2 + `attachments` 元数据 → 累加 `email_addresses.usedBytes` 与 `user_quota.usedBytes`。
3. **出站发信**：`POST /api/me/messages/send`——校验 `from` 归属当前用户的 active mailbox → `env.EMAIL.send()` → 落 outbound 记录（folder=sent）→ 发信日配额（`dailySendQuota` / `sentToday`）。
4. **读取 API**：`GET /api/me/messages?folder=`（列表）、`/:id`（详情含正文）、`/:id/raw`（下载 .eml）、`/:id/attachments/:attId`（R2 流式下载）、`PATCH /:id`（已读/星标/移动）、`DELETE /:id`（删除并清理 R2）。
5. **最简 webmail UI**：用户侧收件箱/已发列表、读信、写信（compose）。
6. **R2 助手**：raw / attachment 的 key 规则与读写封装。

**产物**：`apps/api/src/email/handler.ts`（完整实现）· `apps/api/src/lib/{storage,mail}.ts` · `apps/api/src/routes/me.ts`（扩展）· `apps/web/src/pages/mail/*`。

**验证**：typecheck + Worker 打包 + 迁移；本地 PG 模拟入站存储（注入解析结果走 storeInbound）+ 读取 API；发信端点在无 onboarding 域名时返回正确校验错误。
> 注：真实收发需域名 onboarding（`wrangler email sending enable` + Email Routing 规则），无法在本地完全 E2E；本地验证聚焦存储/读取/校验逻辑。

---

## 阶段三 · Webmail 体验 ✅

**目标**：把最简界面打磨为可日常使用的 webmail。

**已交付**
- 会话线程视图（按 Message-ID / In-Reply-To / References 聚合）；回复/转发自动带线程头与引用正文。
- 文件夹（收件箱/已发/草稿/星标/回收站）；软删除→回收站→恢复/永久删除；星标切换。
- 搜索（主题/发件人/摘要）、分页；各文件夹计数 + 收件箱未读徽标。
- 写信附件上传（base64 → R2）+ 下载；草稿自动保存（防抖）与发送后自动清理。
- 配额条（接近上限红色提醒）、加载骨架、空状态。

**验证（已通过）**：5 包 typecheck + Worker 打包 + web 构建；**本地 PG + miniflare R2 实跑** —— 计数(inbox4/unread4)、搜索(q=apple→3)、分页(limit2/total4)、会话线程(原件+回复=2)、草稿(建→发→自动删)、回复线程头(inReplyTo/references)、附件(发→存→下载字节一致)、软删→回收站→恢复→永久删除。

**待阶段三外**：富文本编辑器 ✅（阶段五）、批量操作 ✅（阶段五）、桌面通知 ✅（Durable Object 实时推送 + Notification）。

---

## 阶段四 · 进阶与运维 ✅

**目标**：完善多租户邮箱能力与可运维性。

**已交付**
- **别名 / catch-all**：`type=alias`（targetAddressId 投递）+ 域级 catch-all；入站 `resolveDelivery` 按 精确 mailbox → alias→target → 域 catch-all 顺序解析。后台支持创建别名、开关 catch-all。
- **DNS 校验**：DoH（1.1.1.1）查询 MX / SPF / DMARC / DKIM，落库状态，MX+SPF 通过则置 active；后台展示应配置记录 + 实时状态 + 一键校验。
- **发信治理**：每用户发信日配额（`dailySendQuota` / `sentToday`）执行；Cron 每日重置 + 过期邀请码。
- **运维**：按域名用量报表（地址数/邮件数/容量）、审计日志查询页、邮箱 `.mbox` 导出。

**验证（已通过）**：5 包 typecheck + Worker 打包(含 cron 触发器) + web 构建；**本地 PG + miniflare 实跑** —— 别名投递、catch-all 投递（含未匹配 422）、DoH 校验真实域(cloudflare.com MX/SPF/DMARC ✓)、Cron 触发(`/__scheduled`)过期邀请码、审计日志、mbox 导出。

**未做（留作后续/可选）**：域名 onboarding 自动化（需 Cloudflare API token）、退信/抑制名单、IMAP/SMTP 网关、垃圾过滤、Agents SDK 自动回复。

---

## 阶段五 · Gmail 体验对齐 ✅

**目标**：对照 Gmail 核心交互补齐收件三连与快捷操作，让 webmail 更接近日常主力邮箱。

**已交付**
- **归档 + 全部邮件**：新增 `archive` 文件夹与「全部邮件」聚合视图（除回收站/草稿外全部）；阅读页与批量均可归档，对应 Gmail 的 Archive / All Mail。
- **批量操作**：列表勾选（含全选）+ 批量归档/删除/标已读/标未读/星标，后端 `POST /api/me/messages/bulk` 一次性处理（仅限本人邮件）。
- **键盘快捷键**（Gmail 默认键位）：`c` 写信、`/` 搜索、`j/k` 上下、`o/Enter` 打开、`u/Esc` 返回、`x` 勾选、`e` 归档、`#` 删除、`s` 星标、`Shift+I/U` 标已读/未读、`?` 帮助浮层。
- **发件人显示名**：`messages.from_name`（入站取 From 头 name、出站取用户名），列表与阅读页显示「张三」而非仅地址。
- **标为未读**：阅读页与批量均支持（此前只能标已读）。
- **移动端可用**：修复阅读面板在小屏被隐藏的缺陷（列表↔阅读切换 + 返回栏），并加移动端文件夹切换与写信入口。

**验证（已通过）**：5 包 typecheck 全绿 + web 构建 + API Worker 打包；新增迁移 `0002_*.sql`（`ALTER TABLE messages ADD COLUMN from_name`）。
> 部署前需在直连库执行 `pnpm db:migrate` 应用该迁移。

**未做（留作后续）**：会话式堆叠阅读（当前会话其它邮件仍折叠纯文本）、标签 Labels/分类标签页、Snooze 稍后处理、Mute 免打扰、Undo Send 撤销发送、桌面通知。

---

## 跨阶段约定

- **Hyperdrive 仅 Worker 运行时可用**：本机工具（drizzle-kit / better-auth CLI）一律用外部 Postgres「直连串」`DATABASE_URL`。
- **主权边界**：Better Auth 只拥有 `user/session/account/verification`；其余业务表自管。
- **R2 为大对象存储**：原始 MIME 与附件入 R2，Postgres 仅存元数据 + key + 可检索正文。
- **Cloudflare Email Sending 为事务性邮件**：有日配额、禁营销群发；个人/小团队自用场景适配。

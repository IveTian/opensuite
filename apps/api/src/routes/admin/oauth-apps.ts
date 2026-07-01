import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { oauthApplication } from "@mailflare/db";
import { z } from "zod";
import type { AppEnv } from "../../env.js";

/**
 * OIDC 应用（第三方 client）管理：仅管理员。
 *
 * - 创建走 Better Auth 的 `registerOAuthApplication`（带管理员会话）；client_secret 明文只在创建时返回一次。
 * - launcher 相关（应用中心磁贴的启动地址、是否展示）存在 oauthApplication.metadata 的 JSON 里。
 */

interface LauncherMeta {
  launchUrl?: string;
  showInLauncher?: boolean;
}

function parseMeta(raw: string | null): LauncherMeta {
  if (!raw) return {};
  try {
    const m = JSON.parse(raw) as LauncherMeta;
    return {
      launchUrl: typeof m.launchUrl === "string" ? m.launchUrl : undefined,
      showInLauncher: Boolean(m.showInLauncher),
    };
  } catch {
    return {};
  }
}

/** 列表行（绝不返回 clientSecret） */
function toRow(app: typeof oauthApplication.$inferSelect) {
  const meta = parseMeta(app.metadata);
  return {
    id: app.id,
    clientId: app.clientId,
    name: app.name,
    icon: app.icon,
    type: app.type,
    disabled: app.disabled ?? false,
    redirectUrls: (app.redirectUrls ?? "").split(",").filter(Boolean),
    launchUrl: meta.launchUrl ?? null,
    showInLauncher: meta.showInLauncher ?? false,
    createdAt: app.createdAt,
  };
}

const createSchema = z.object({
  name: z.string().min(1, "请填写应用名称"),
  redirectUrls: z.array(z.string().url("回调地址必须是完整 URL")).min(1, "至少一个回调地址"),
  icon: z.string().url().optional().or(z.literal("")),
  launchUrl: z.string().url().optional().or(z.literal("")),
  showInLauncher: z.boolean().optional(),
});

const updateSchema = z.object({
  disabled: z.boolean().optional(),
  redirectUrls: z.array(z.string().url()).min(1).optional(),
  icon: z.string().url().optional().or(z.literal("")),
  launchUrl: z.string().url().optional().or(z.literal("")),
  showInLauncher: z.boolean().optional(),
});

export const oauthAppRoutes = new Hono<AppEnv>()
  /** 列出全部已注册应用 */
  .get("/", async (c) => {
    const rows = await c.var.db
      .select()
      .from(oauthApplication)
      .orderBy(desc(oauthApplication.createdAt));
    return c.json(rows.map(toRow));
  })

  /** 注册新应用：返回一次性的 client_id + client_secret */
  .post("/", zValidator("json", createSchema), async (c) => {
    const { name, redirectUrls, icon, launchUrl, showInLauncher } = c.req.valid("json");
    const metadata: LauncherMeta = {
      showInLauncher: Boolean(showInLauncher),
      ...(launchUrl ? { launchUrl } : {}),
    };
    const registered = (await c.var.auth.api.registerOAuthApplication({
      body: {
        client_name: name,
        redirect_uris: redirectUrls,
        ...(icon ? { logo_uri: icon } : {}),
        scope: "openid profile email offline_access",
        metadata,
      },
      headers: c.req.raw.headers,
    })) as { client_id: string; client_secret?: string };

    return c.json(
      {
        clientId: registered.client_id,
        clientSecret: registered.client_secret ?? null,
        name,
        redirectUrls,
        launchUrl: launchUrl || null,
        showInLauncher: Boolean(showInLauncher),
      },
      201,
    );
  })

  /** 更新应用（启停 / 回调地址 / launcher 设置） */
  .patch("/:id", zValidator("json", updateSchema), async (c) => {
    const db = c.var.db;
    const id = c.req.param("id");
    const body = c.req.valid("json");

    const existing = await db.query.oauthApplication.findFirst({
      where: eq(oauthApplication.id, id),
    });
    if (!existing) return c.json({ error: "应用不存在" }, 404);

    const meta = parseMeta(existing.metadata);
    if (body.showInLauncher !== undefined) meta.showInLauncher = body.showInLauncher;
    if (body.launchUrl !== undefined) meta.launchUrl = body.launchUrl || undefined;

    const set: Partial<typeof oauthApplication.$inferInsert> = {
      updatedAt: new Date(),
      metadata: JSON.stringify(meta),
    };
    if (body.disabled !== undefined) set.disabled = body.disabled;
    if (body.redirectUrls !== undefined) set.redirectUrls = body.redirectUrls.join(",");
    if (body.icon !== undefined) set.icon = body.icon || null;

    const [row] = await db
      .update(oauthApplication)
      .set(set)
      .where(eq(oauthApplication.id, id))
      .returning();
    if (!row) return c.json({ error: "应用不存在" }, 404);
    return c.json(toRow(row));
  })

  /** 删除应用（级联删除其令牌与同意记录） */
  .delete("/:id", async (c) => {
    const [row] = await c.var.db
      .delete(oauthApplication)
      .where(eq(oauthApplication.id, c.req.param("id")))
      .returning();
    if (!row) return c.json({ error: "应用不存在" }, 404);
    return c.json({ ok: true });
  });

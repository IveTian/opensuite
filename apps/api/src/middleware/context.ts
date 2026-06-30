import { createMiddleware } from "hono/factory";
import { createAuth } from "@mailflare/auth";
import { createDb } from "@mailflare/db";
import type { AppEnv } from "../env.js";

/**
 * 每请求注入 db + auth 实例。
 * - 用 Hyperdrive 连接串建一条 node-postgres 连接（连接池化由 Hyperdrive 负责）。
 * - 响应后用 waitUntil 关闭连接，避免泄漏。
 */
export const contextMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const { db, client } = await createDb(c.env.HYPERDRIVE.connectionString);
  c.set("db", db);
  c.set("dbClient", client);
  c.set("auth", createAuth(db, c.env));
  try {
    await next();
  } finally {
    c.executionCtx.waitUntil(client.end());
  }
});

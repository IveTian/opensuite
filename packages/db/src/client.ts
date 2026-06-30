import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

const { Client } = pg;

export type Database = NodePgDatabase<typeof schema>;

/**
 * 用 node-postgres 单连建立 Drizzle 客户端。
 *
 * 设计要点（Cloudflare 官方 Drizzle × Hyperdrive 模式）：
 * - Worker 内「每请求一连」：连接池化交给 Hyperdrive 边缘侧，Worker 侧只开一条 Client。
 * - 调用方需在响应后 `ctx.waitUntil(client.end())` 释放连接。
 * - 运行时传 `env.HYPERDRIVE.connectionString`；本机脚本（迁移/seed）传 Neon 直连串。
 *
 * 返回 client 以便调用方关闭连接。
 */
export async function createDb(connectionString: string): Promise<{
  db: Database;
  client: pg.Client;
}> {
  const client = new Client({ connectionString });
  await client.connect();
  const db = drizzle(client, { schema });
  return { db, client };
}

export { schema };

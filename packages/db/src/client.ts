import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

const { Client } = pg;

export type Database = NodePgDatabase<typeof schema>;

/**
 * 归一化连接串以兼容 node-postgres。
 *
 * libpq/psql 约定 `sslrootcert=system`（PlanetScale 等）表示用系统 CA，但 node-postgres
 * 会把它当文件路径读取 → ENOENT 'system'。这里移除该参数与 verify-* 的 sslmode，
 * 改用 Node 内置 CA 做证书校验（rejectUnauthorized:true ≈ verify-full）。
 *
 * 仅对显式带这些参数的连接串生效；Worker 经 Hyperdrive 的连接串不受影响。
 */
function normalizeConn(connectionString: string): pg.ClientConfig {
  try {
    const u = new URL(connectionString);
    const sslrootcert = u.searchParams.get("sslrootcert");
    const sslmode = u.searchParams.get("sslmode");
    if (sslrootcert === "system" || sslmode?.startsWith("verify")) {
      u.searchParams.delete("sslrootcert");
      u.searchParams.delete("sslmode");
      return { connectionString: u.toString(), ssl: { rejectUnauthorized: true } };
    }
  } catch {
    /* 非标准 URL，原样透传 */
  }
  return { connectionString };
}

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
  const client = new Client(normalizeConn(connectionString));
  await client.connect();
  const db = drizzle(client, { schema });
  return { db, client };
}

export { schema };

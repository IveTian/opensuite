import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit 迁移配置。
 *
 * 关键分界：本机工具（generate/migrate/push/studio）一律用 Neon 的「直连串」DATABASE_URL，
 * 切勿误用 Hyperdrive 连接串——Hyperdrive 绑定只能从 Worker 运行时访问。
 *
 * 用法（任选其一）：
 *   1) 在 packages/db/.env 写 DATABASE_URL=...（本文件会自动加载）
 *   2) `DATABASE_URL="postgres://..." pnpm drizzle-kit migrate`
 */

// 自动加载当前目录的 .env（packages/db/.env）；不存在则回退到 shell 环境变量
try {
  process.loadEnvFile();
} catch {
  /* 无 .env 文件，忽略 */
}

if (!process.env.DATABASE_URL) {
  throw new Error(
    "缺少 DATABASE_URL：请在 packages/db/.env 设置，或用 `DATABASE_URL=... pnpm drizzle-kit migrate`（用直连串，勿用 Hyperdrive 串）",
  );
}

/** 兼容 PlanetScale 等的 `sslrootcert=system`（node-postgres 不识别，会当文件读） */
function sanitize(url: string): string {
  try {
    const u = new URL(url);
    if (u.searchParams.get("sslrootcert") === "system") u.searchParams.delete("sslrootcert");
    const mode = u.searchParams.get("sslmode");
    if (mode && mode.startsWith("verify")) u.searchParams.set("sslmode", "require");
    return u.toString();
  } catch {
    return url;
  }
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: sanitize(process.env.DATABASE_URL),
  },
  // 注意：所有列均显式指定列名（auth 表 camelCase 对齐 Better Auth，业务表 snake_case），
  // 故不依赖自动 casing 转换。
  verbose: true,
  strict: true,
});

import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit 迁移配置。
 *
 * 关键分界：本机工具（generate/migrate/push/studio）一律用 Neon 的「直连串」DATABASE_URL，
 * 切勿误用 Hyperdrive 连接串——Hyperdrive 绑定只能从 Worker 运行时访问。
 *
 * 用法：在 packages/db 下 `export DATABASE_URL=<Neon 直连串>` 后再运行迁移命令。
 */
export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  // 注意：所有列均显式指定列名（auth 表 camelCase 对齐 Better Auth，业务表 snake_case），
  // 故不依赖自动 casing 转换。
  verbose: true,
  strict: true,
});

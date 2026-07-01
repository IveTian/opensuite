import { eq, sql } from "drizzle-orm";
import { BYTES_PER_GB, SYSTEM_SETTINGS_ID } from "@mailflare/shared";
import { createDb } from "./client.js";
import { plans, systemSettings, user, userQuota } from "./schema/index.js";

/**
 * 初始化基线数据（幂等）：
 *  1. 默认配额套餐
 *  2. system_settings 单行（默认关闭公开注册）
 *  3. 可选：把指定邮箱的用户提升为管理员（SEED_PROMOTE_EMAIL 或 `--promote=<email>`）
 *
 * 用法：
 *   export DATABASE_URL=<Neon 直连串>
 *   pnpm --filter @mailflare/db seed
 *   pnpm --filter @mailflare/db seed --promote=you@example.com
 *
 * 关于首位管理员：API 的公开注册包装会在「系统零用户」时放行首个注册者并置为 admin，
 * 因此一般无需手动提升；本脚本的 --promote 仅作兜底/补救手段。
 */
async function main() {
  // 自动加载 packages/db/.env（不存在则用 shell 环境变量）
  try {
    process.loadEnvFile();
  } catch {
    /* 无 .env 文件，忽略 */
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("缺少 DATABASE_URL（请用 Neon 直连串，勿用 Hyperdrive 串）");

  const promoteEmail =
    process.env.SEED_PROMOTE_EMAIL ??
    process.argv.find((a) => a.startsWith("--promote="))?.split("=")[1];

  const { db, client } = await createDb(url);
  try {
    // 1) 默认套餐
    const [defaultPlan] = await db
      .insert(plans)
      .values({
        name: "默认套餐",
        storageQuotaBytes: 1 * BYTES_PER_GB,
        maxAddresses: 1,
        isDefault: true,
      })
      .onConflictDoNothing({ target: plans.name })
      .returning();

    const planRow =
      defaultPlan ??
      (await db.query.plans.findFirst({ where: eq(plans.name, "默认套餐") }));
    console.log(`✓ 默认套餐: ${planRow?.id ?? "(已存在)"}`);

    // 2) system_settings 单行
    await db
      .insert(systemSettings)
      .values({
        id: SYSTEM_SETTINGS_ID,
        registrationMode: "closed",
        requireAdminApproval: false,
        defaultPlanId: planRow?.id ?? null,
        defaultStorageQuotaBytes: 1 * BYTES_PER_GB,
        defaultMaxAddresses: 1,
      })
      .onConflictDoNothing({ target: systemSettings.id });
    // 若已存在但默认套餐为空，补上
    if (planRow?.id) {
      await db
        .update(systemSettings)
        .set({ defaultPlanId: planRow.id })
        .where(
          sql`${systemSettings.id} = ${SYSTEM_SETTINGS_ID} and ${systemSettings.defaultPlanId} is null`,
        );
    }
    console.log("✓ system_settings 已就绪（registrationMode=closed）");

    // 3) 可选：提升管理员
    if (promoteEmail) {
      const target = await db.query.user.findFirst({
        where: eq(user.email, promoteEmail),
      });
      if (!target) {
        console.warn(`⚠ 未找到用户 ${promoteEmail}，跳过提升（请先注册该账号）`);
      } else {
        await db
          .update(user)
          .set({ role: "admin", approvalStatus: "active" })
          .where(eq(user.id, target.id));
        await db
          .insert(userQuota)
          .values({
            userId: target.id,
            planId: planRow?.id ?? null,
            storageQuotaBytes: 1 * BYTES_PER_GB,
            maxAddresses: 1,
          })
          .onConflictDoNothing({ target: userQuota.userId });
        console.log(`✓ 已将 ${promoteEmail} 提升为管理员`);
      }
    }

    console.log("\n种子数据完成。");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

import { eq } from "drizzle-orm";
import { oauthAccessToken, type Database } from "@mailflare/db";

/**
 * 撤销某用户全部 OIDC 访问/刷新令牌。
 *
 * 停用（approvalStatus→pending）或封禁用户时调用：Better Auth 只吊销本站会话，
 * 已签发给第三方应用的 access/refresh 令牌不会随之失效（token 端点不复查用户状态），
 * 会造成「已封禁仍能持续访问第三方应用」的去授权缺口。删除令牌行即切断该访问。
 *
 * @returns 删除的令牌行数
 */
export async function revokeUserOidcTokens(db: Database, userId: string): Promise<number> {
  const rows = await db
    .delete(oauthAccessToken)
    .where(eq(oauthAccessToken.userId, userId))
    .returning({ id: oauthAccessToken.id });
  return rows.length;
}

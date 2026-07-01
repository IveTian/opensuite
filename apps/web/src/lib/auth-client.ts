import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";
import { clearSessionCache } from "./offline/session-cache";

/**
 * Better Auth 客户端。
 * - baseURL 指向 api Worker；basePath 默认 /api/auth。
 * - credentials:include 让跨子域/跨 origin 请求携带会话 cookie。
 */
export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_ORIGIN,
  basePath: "/api/auth",
  plugins: [adminClient()],
  fetchOptions: {
    credentials: "include",
  },
});

export const { useSession, signIn } = authClient;

/** 登出并清除离线会话缓存 */
export async function signOut() {
  clearSessionCache();
  await authClient.signOut();
}

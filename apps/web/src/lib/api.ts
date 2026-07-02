const BASE = import.meta.env.VITE_API_ORIGIN;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data && (data.error || data.message)) || `请求失败（${res.status}）`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

/** 业务 API（非 better-auth）封装，统一带凭据 */
export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};

/** 原始二进制上传（网盘），绕过 JSON 封装。文件名放 header（URL 编码）。 */
export async function uploadFile<T>(
  path: string,
  file: File,
  headers: Record<string, string>,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "x-filename": encodeURIComponent(file.name),
      ...headers,
    },
    body: file,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const message = (data && (data.error || data.message)) || `上传失败（${res.status}）`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

/** 对外分享公开链接（供复制/新窗口打开）。 */
export function shareUrl(token: string): string {
  return `${window.location.origin}/s/${token}`;
}

export const API_BASE = BASE;

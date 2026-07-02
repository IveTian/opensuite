import { Button, Input } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "react-router-dom";
import type { PublicShareMeta } from "@mailflare/shared";
import { BrandMark } from "../../components/BrandMark";
import { Alert } from "../../components/ui";
import { DownloadIcon, FileIcon, FolderIcon } from "../../components/icons";
import { API_BASE, api, ApiError } from "../../lib/api";
import { formatBytes } from "../../lib/format";

interface PubNode {
  id: string;
  name: string;
  type: "folder" | "file";
  sizeBytes: number;
  mimeType: string | null;
  parentId: string | null;
}

export function PublicShare() {
  const { token = "" } = useParams();
  const [meta, setMeta] = useState<PublicShareMeta | null>(null);
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // 文件夹浏览
  const [items, setItems] = useState<PubNode[]>([]);
  const [parentStack, setParentStack] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const m = await api.get<PublicShareMeta>(`/api/public/drive/shares/${token}`);
        setMeta(m);
        if (m.node) setUnlocked(true);
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "分享不存在");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const pwParam = meta?.needsPassword ? `&password=${encodeURIComponent(password)}` : "";

  const loadFolder = useCallback(
    async (parentId?: string) => {
      const pq = meta?.needsPassword ? `?password=${encodeURIComponent(password)}` : "";
      const extra = parentId ? `${pq ? "&" : "?"}parentId=${parentId}` : "";
      const res = await api.get<{ items: PubNode[] }>(
        `/api/public/drive/shares/${token}/nodes${pq}${extra}`,
      );
      setItems(res.items);
    },
    [token, meta?.needsPassword, password],
  );

  useEffect(() => {
    if (unlocked && meta?.node?.type === "folder") void loadFolder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, meta?.node?.id]);

  async function unlock(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const m = await api.post<PublicShareMeta>(`/api/public/drive/shares/${token}/unlock`, {
        password,
      });
      setMeta(m);
      setUnlocked(true);
    } catch (e2) {
      setError(e2 instanceof ApiError ? e2.message : "密码错误");
    }
  }

  function downloadRoot() {
    window.open(`${API_BASE}/api/public/drive/shares/${token}/content?download=1${pwParam}`, "_blank");
  }
  function downloadChild(id: string) {
    window.open(
      `${API_BASE}/api/public/drive/shares/${token}/content?download=1&nodeId=${id}${pwParam}`,
      "_blank",
    );
  }

  function enterFolder(n: PubNode) {
    setParentStack((s) => [...s, { id: n.id, name: n.name }]);
    void loadFolder(n.id);
  }
  function goStack(idx: number) {
    const next = parentStack.slice(0, idx);
    setParentStack(next);
    const last = next[next.length - 1];
    void loadFolder(last?.id);
  }

  return (
    <div className="flex min-h-full flex-col items-center bg-background px-4 py-10">
      <div className="mb-6 flex items-center gap-2">
        <BrandMark />
        <span className="text-sm font-semibold text-foreground">文件分享</span>
      </div>

      <div className="w-full max-w-2xl rounded-2xl bg-surface p-6 shadow-surface">
        {loading ? (
          <div className="h-24 animate-pulse rounded-xl bg-surface-secondary" />
        ) : error && !meta ? (
          <Alert>{error}</Alert>
        ) : meta?.expired ? (
          <Alert>该分享链接已过期</Alert>
        ) : !unlocked ? (
          <form onSubmit={unlock} className="space-y-4">
            <p className="text-sm text-muted">该分享受密码保护，请输入访问密码。</p>
            {error && <Alert>{error}</Alert>}
            <Input
              type="password"
              autoFocus
              placeholder="访问密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <Button type="submit" fullWidth isDisabled={!password}>访问</Button>
          </form>
        ) : meta?.node ? (
          <div className="space-y-4">
            {meta.node.type === "file" ? (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <FileIcon className="size-14 text-muted" />
                <div>
                  <div className="text-lg font-medium text-foreground">{meta.node.name}</div>
                  <div className="mt-1 text-sm text-muted">{formatBytes(meta.node.sizeBytes)}</div>
                </div>
                <div className="flex gap-2">
                  <Button variant="ghost" onClick={() => window.open(`${API_BASE}/api/public/drive/shares/${token}/content?1=1${pwParam}`, "_blank")}>
                    预览
                  </Button>
                  {meta.allowDownload && (
                    <Button onClick={downloadRoot}>
                      <DownloadIcon className="size-4" /> 下载
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-sm text-muted">
                  <button className="font-medium text-foreground hover:underline" onClick={() => goStack(0)}>
                    {meta.node.name}
                  </button>
                  {parentStack.map((p, i) => (
                    <span key={p.id} className="flex items-center gap-1">
                      /
                      <button className="hover:underline" onClick={() => goStack(i + 1)}>{p.name}</button>
                    </span>
                  ))}
                </div>
                <ul className="divide-y divide-separator/60 rounded-xl border border-border">
                  {items.length === 0 ? (
                    <li className="p-6 text-center text-sm text-muted">空文件夹</li>
                  ) : (
                    items.map((n) => (
                      <li key={n.id} className="flex items-center gap-3 px-3 py-2.5">
                        <button
                          className="flex min-w-0 flex-1 items-center gap-3 text-left"
                          onClick={() => (n.type === "folder" ? enterFolder(n) : downloadChild(n.id))}
                          disabled={n.type === "file" && !meta.allowDownload}
                        >
                          {n.type === "folder" ? (
                            <FolderIcon className="size-5 shrink-0 text-accent" />
                          ) : (
                            <FileIcon className="size-5 shrink-0 text-muted" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-sm text-foreground">{n.name}</span>
                          <span className="shrink-0 text-xs text-muted">
                            {n.type === "file" ? formatBytes(n.sizeBytes) : ""}
                          </span>
                        </button>
                        {n.type === "file" && meta.allowDownload && (
                          <Button size="sm" variant="ghost" isIconOnly aria-label="下载" onClick={() => downloadChild(n.id)}>
                            <DownloadIcon className="size-4" />
                          </Button>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </>
            )}
          </div>
        ) : (
          <Alert>分享内容不可用</Alert>
        )}
      </div>
    </div>
  );
}

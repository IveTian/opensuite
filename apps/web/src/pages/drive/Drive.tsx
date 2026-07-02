import { Button, Input, Modal } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { DriveBreadcrumb, DriveNode, DriveQuota, DriveSpace } from "@mailflare/shared";
import { AppSwitcher } from "../../components/AppSwitcher";
import { PersonAvatar } from "../../components/PersonAvatar";
import { Alert } from "../../components/ui";
import {
  ChevronRightIcon,
  DownloadIcon,
  FileIcon,
  FolderIcon,
  FolderPlusIcon,
  HardDriveIcon,
  LinkIcon,
  MoonIcon,
  PencilIcon,
  RefreshIcon,
  SunIcon,
  TrashIcon,
  UploadIcon,
  UsersIcon,
} from "../../components/icons";
import { useFetch } from "../../hooks/useFetch";
import { API_BASE, api, ApiError, uploadFile } from "../../lib/api";
import { useSession } from "../../lib/auth-client";
import { formatBytes } from "../../lib/format";
import { useTheme } from "../../providers/theme";
import { ShareDialog } from "./ShareDialog";

type ViewKind = "space" | "shared" | "trash";

export function Drive() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { data: session } = useSession();
  const image = (session?.user as { image?: string | null } | undefined)?.image ?? null;

  const { data: spaces, refetch: refetchSpaces } = useFetch<DriveSpace[]>("/api/me/drive/spaces");
  const { data: quota, refetch: refetchQuota } = useFetch<DriveQuota>("/api/me/drive/quota");

  const [spaceId, setSpaceId] = useState<string | null>(null);
  const [view, setView] = useState<ViewKind>("space");
  const [parentId, setParentId] = useState<string | null>(null);
  const [containerRole, setContainerRole] = useState<"viewer" | "editor">("viewer");
  const [breadcrumb, setBreadcrumb] = useState<DriveBreadcrumb[]>([]);

  const [items, setItems] = useState<DriveNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [nameModal, setNameModal] = useState<{ mode: "folder" | "rename"; node?: DriveNode } | null>(null);
  const [moveNode, setMoveNode] = useState<DriveNode | null>(null);
  const [shareNode, setShareNode] = useState<DriveNode | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const currentSpace = spaces?.find((s) => s.id === spaceId) ?? null;

  // 默认选中个人空间
  useEffect(() => {
    if (!spaceId && spaces && spaces.length) {
      const personal = spaces.find((s) => s.type === "personal") ?? spaces[0];
      if (personal) {
        setSpaceId(personal.id);
        setContainerRole(personal.role);
      }
    }
  }, [spaces, spaceId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      if (view === "shared") {
        const res = await api.get<{ items: DriveNode[] }>("/api/me/drive/shared-with-me");
        setItems(res.items);
        setBreadcrumb([]);
      } else if (view === "trash" && spaceId) {
        const res = await api.get<{ items: DriveNode[] }>(`/api/me/drive/spaces/${spaceId}/trash`);
        setItems(res.items);
        setBreadcrumb([]);
      } else if (spaceId) {
        const q = parentId ? `?parentId=${parentId}` : "";
        const res = await api.get<{ items: DriveNode[]; breadcrumb: DriveBreadcrumb[] }>(
          `/api/me/drive/spaces/${spaceId}/nodes${q}`,
        );
        setItems(res.items);
        setBreadcrumb(res.breadcrumb);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "加载失败");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [view, spaceId, parentId]);

  useEffect(() => {
    void load();
  }, [load]);

  function openSpace(s: DriveSpace) {
    setSpaceId(s.id);
    setView("space");
    setParentId(null);
    setContainerRole(s.role);
  }

  function openFolder(node: DriveNode) {
    setParentId(node.id);
    setContainerRole(node.role);
  }

  function goCrumb(id: string | null, idx: number) {
    setParentId(id);
    // 面包屑点击后角色回退为当前空间根角色（简化：写权限以空间根为准，逐级再校正）
    if (id === null) setContainerRole(currentSpace?.role ?? "viewer");
    setBreadcrumb((b) => b.slice(0, idx));
  }

  const canWrite = view === "space" && containerRole === "editor";

  async function onUpload(files: FileList | null) {
    if (!files || !files.length || !spaceId) return;
    setBusy(true);
    setError("");
    try {
      for (const f of Array.from(files)) {
        await uploadFile(`/api/me/drive/files`, f, {
          "x-space-id": spaceId,
          ...(parentId ? { "x-parent-id": parentId } : {}),
        });
      }
      await load();
      await refetchQuota();
      await refetchSpaces();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "上传失败");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function submitName(name: string) {
    if (!nameModal) return;
    setBusy(true);
    setError("");
    try {
      if (nameModal.mode === "folder" && spaceId) {
        await api.post("/api/me/drive/folders", { spaceId, parentId, name });
      } else if (nameModal.mode === "rename" && nameModal.node) {
        await api.patch(`/api/me/drive/nodes/${nameModal.node.id}`, { name });
      }
      setNameModal(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "操作失败");
    } finally {
      setBusy(false);
    }
  }

  async function trashNode(node: DriveNode) {
    await api.del(`/api/me/drive/nodes/${node.id}`);
    await load();
  }
  async function restoreNode(node: DriveNode) {
    await api.post(`/api/me/drive/nodes/${node.id}/restore`);
    await load();
  }
  async function deleteForever(node: DriveNode) {
    if (!confirm(`确定彻底删除「${node.name}」？此操作不可恢复。`)) return;
    await api.del(`/api/me/drive/nodes/${node.id}/permanent`);
    await load();
    await refetchQuota();
    await refetchSpaces();
  }

  function openNode(node: DriveNode) {
    if (node.type === "folder") {
      if (view === "space") openFolder(node);
      return;
    }
    window.open(`${API_BASE}/api/me/drive/nodes/${node.id}/content`, "_blank");
  }

  const usedPct = quota && quota.quotaBytes > 0 ? Math.min(100, (quota.usedBytes / quota.quotaBytes) * 100) : 0;

  return (
    <div className="flex h-full flex-col bg-background mobile-pad-bottom">
      <header className="safe-top flex shrink-0 items-center justify-between border-b border-border px-4 py-2.5 sm:px-6">
        <AppSwitcher current="drive" />
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" isIconOnly aria-label="切换主题" onClick={toggle}>
            {theme === "dark" ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}
          </Button>
          <button
            onClick={() => navigate("/profile")}
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus/60"
            aria-label="账户设置"
          >
            <PersonAvatar url={image} email={session?.user.email} seed={session?.user.email} className="size-9 shrink-0" />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* 侧栏 */}
        <aside className="hidden w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-3 sm:flex">
          <div className="px-2 py-1 text-xs font-medium text-muted">空间</div>
          {spaces?.map((s) => (
            <button
              key={s.id}
              onClick={() => openSpace(s)}
              className={
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm " +
                (spaceId === s.id && view === "space"
                  ? "bg-surface-secondary text-foreground"
                  : "text-muted hover:bg-surface-secondary hover:text-foreground")
              }
            >
              <HardDriveIcon className="size-4 shrink-0" />
              <span className="flex-1 truncate text-left">{s.name}</span>
              {s.type === "department" && <span className="text-[10px] text-muted">部门</span>}
              {s.type === "org" && <span className="text-[10px] text-muted">公共</span>}
            </button>
          ))}

          <div className="my-1 h-px bg-separator" />
          <button
            onClick={() => { setView("shared"); setParentId(null); }}
            className={
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm " +
              (view === "shared" ? "bg-surface-secondary text-foreground" : "text-muted hover:bg-surface-secondary hover:text-foreground")
            }
          >
            <UsersIcon className="size-4 shrink-0" /> 共享给我
          </button>
          <button
            onClick={() => { setView("trash"); setParentId(null); }}
            className={
              "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm " +
              (view === "trash" ? "bg-surface-secondary text-foreground" : "text-muted hover:bg-surface-secondary hover:text-foreground")
            }
          >
            <TrashIcon className="size-4 shrink-0" /> 回收站
          </button>

          {/* 个人配额 */}
          {quota && (
            <div className="mt-auto rounded-xl bg-surface-secondary p-3">
              <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted">
                <HardDriveIcon className="size-3.5" /> 个人空间
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-border">
                <div
                  className={"h-full rounded-full " + (usedPct >= 90 ? "bg-danger" : "bg-accent")}
                  style={{ width: `${usedPct}%` }}
                />
              </div>
              <div className="mt-1.5 text-xs text-muted">
                {formatBytes(quota.usedBytes)} / {formatBytes(quota.quotaBytes)}
              </div>
            </div>
          )}
        </aside>

        {/* 主区 */}
        <main className="flex min-h-0 flex-1 flex-col">
          {/* 工具栏 */}
          <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5 sm:px-6">
            <div className="flex min-w-0 flex-1 items-center gap-1 text-sm text-muted">
              {view === "shared" ? (
                <span className="font-medium text-foreground">共享给我</span>
              ) : view === "trash" ? (
                <span className="font-medium text-foreground">回收站 · {currentSpace?.name}</span>
              ) : (
                <>
                  <button className="truncate font-medium text-foreground hover:underline" onClick={() => goCrumb(null, 0)}>
                    {currentSpace?.name ?? "网盘"}
                  </button>
                  {breadcrumb.map((b, i) => (
                    <span key={b.id} className="flex items-center gap-1 truncate">
                      <ChevronRightIcon className="size-3.5 shrink-0" />
                      <button className="truncate hover:underline" onClick={() => goCrumb(b.id, i + 1)}>
                        {b.name}
                      </button>
                    </span>
                  ))}
                </>
              )}
            </div>
            <Button size="sm" variant="ghost" isIconOnly aria-label="刷新" onClick={() => load()}>
              <RefreshIcon className="size-4" />
            </Button>
            {canWrite && (
              <>
                <Button size="sm" variant="ghost" onClick={() => setNameModal({ mode: "folder" })}>
                  <FolderPlusIcon className="size-4" /> 新建文件夹
                </Button>
                <Button size="sm" onClick={() => fileRef.current?.click()} isDisabled={busy}>
                  <UploadIcon className="size-4" /> 上传
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => onUpload(e.target.files)}
                />
              </>
            )}
          </div>

          {error && <div className="px-4 pt-3 sm:px-6"><Alert>{error}</Alert></div>}

          {/* 列表 */}
          <div className="min-h-0 flex-1 overflow-auto px-2 py-2 sm:px-4">
            {loading ? (
              <div className="space-y-2 p-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-secondary" />
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 p-16 text-center text-muted">
                <FolderIcon className="size-10 opacity-40" />
                <p className="text-sm">这里还没有内容</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {items.map((n) => (
                  <li
                    key={n.id}
                    className="group flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-secondary"
                  >
                    <button
                      className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      onClick={() => openNode(n)}
                    >
                      {n.type === "folder" ? (
                        <FolderIcon className="size-5 shrink-0 text-accent" />
                      ) : (
                        <FileIcon className="size-5 shrink-0 text-muted" />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">{n.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {n.type === "file" ? formatBytes(n.sizeBytes) : "文件夹"}
                          {n.ownerName ? ` · ${n.ownerName}` : ""}
                          {n.role === "viewer" ? " · 只读" : ""}
                        </span>
                      </span>
                    </button>

                    <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                      {view === "trash" ? (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => restoreNode(n)}>还原</Button>
                          <Button size="sm" variant="ghost" isIconOnly aria-label="彻底删除" onClick={() => deleteForever(n)}>
                            <TrashIcon className="size-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          {n.type === "file" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              isIconOnly
                              aria-label="下载"
                              onClick={() => window.open(`${API_BASE}/api/me/drive/nodes/${n.id}/content?download=1`, "_blank")}
                            >
                              <DownloadIcon className="size-4" />
                            </Button>
                          )}
                          {n.role === "editor" && (
                            <>
                              <Button size="sm" variant="ghost" isIconOnly aria-label="分享" onClick={() => setShareNode(n)}>
                                <LinkIcon className="size-4" />
                              </Button>
                              <Button size="sm" variant="ghost" isIconOnly aria-label="重命名" onClick={() => setNameModal({ mode: "rename", node: n })}>
                                <PencilIcon className="size-4" />
                              </Button>
                              {view === "space" && (
                                <Button size="sm" variant="ghost" onClick={() => setMoveNode(n)}>移动</Button>
                              )}
                              <Button size="sm" variant="ghost" isIconOnly aria-label="删除" onClick={() => trashNode(n)}>
                                <TrashIcon className="size-4" />
                              </Button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>

      {nameModal && (
        <NameModal
          title={nameModal.mode === "folder" ? "新建文件夹" : "重命名"}
          initial={nameModal.node?.name ?? ""}
          busy={busy}
          onSubmit={submitName}
          onClose={() => setNameModal(null)}
        />
      )}
      {moveNode && spaceId && (
        <MoveModal
          node={moveNode}
          spaceId={spaceId}
          onClose={() => setMoveNode(null)}
          onMoved={async () => {
            setMoveNode(null);
            await load();
          }}
        />
      )}
      {shareNode && <ShareDialog node={shareNode} onClose={() => setShareNode(null)} />}
    </div>
  );
}

function NameModal({
  title,
  initial,
  busy,
  onSubmit,
  onClose,
}: {
  title: string;
  initial: string;
  busy: boolean;
  onSubmit: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  return (
    <Modal.Root isOpen onOpenChange={(v) => { if (!v) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container size="sm">
          <Modal.Dialog>
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                if (name.trim()) onSubmit(name.trim());
              }}
            >
              <Modal.Header>{title}</Modal.Header>
              <Modal.Body>
                <Input autoFocus placeholder="名称" value={name} onChange={(e) => setName(e.target.value)} />
              </Modal.Body>
              <Modal.Footer>
                <Button variant="ghost" onClick={onClose}>取消</Button>
                <Button type="submit" isDisabled={busy || !name.trim()}>确定</Button>
              </Modal.Footer>
            </form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

/** 移动对话框：在空间内导航文件夹并选择目标 */
function MoveModal({
  node,
  spaceId,
  onClose,
  onMoved,
}: {
  node: DriveNode;
  spaceId: string;
  onClose: () => void;
  onMoved: () => void;
}) {
  const [parentId, setParentId] = useState<string | null>(null);
  const [crumb, setCrumb] = useState<DriveBreadcrumb[]>([]);
  const [folders, setFolders] = useState<DriveNode[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const loadFolders = useCallback(async () => {
    const q = parentId ? `?parentId=${parentId}` : "";
    const res = await api.get<{ items: DriveNode[]; breadcrumb: DriveBreadcrumb[] }>(
      `/api/me/drive/spaces/${spaceId}/nodes${q}`,
    );
    setFolders(res.items.filter((n) => n.type === "folder" && n.id !== node.id));
    setCrumb(res.breadcrumb);
  }, [spaceId, parentId, node.id]);

  useEffect(() => {
    void loadFolders();
  }, [loadFolders]);

  async function doMove() {
    setBusy(true);
    setErr("");
    try {
      await api.post(`/api/me/drive/nodes/${node.id}/move`, { parentId });
      onMoved();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "移动失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal.Root isOpen onOpenChange={(v) => { if (!v) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container size="md">
          <Modal.Dialog>
            <Modal.Header>移动「{node.name}」</Modal.Header>
            <Modal.Body>
              {err && <div className="mb-3"><Alert>{err}</Alert></div>}
              <div className="mb-2 flex items-center gap-1 text-sm text-muted">
                <button className="font-medium text-foreground hover:underline" onClick={() => setParentId(null)}>根目录</button>
                {crumb.map((b) => (
                  <span key={b.id} className="flex items-center gap-1">
                    <ChevronRightIcon className="size-3.5" />
                    <button className="hover:underline" onClick={() => setParentId(b.id)}>{b.name}</button>
                  </span>
                ))}
              </div>
              <div className="max-h-64 overflow-auto rounded-xl border border-border">
                {folders.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted">无子文件夹</p>
                ) : (
                  folders.map((f) => (
                    <button
                      key={f.id}
                      className="flex w-full items-center gap-2 border-b border-separator/60 px-3 py-2 text-left text-sm last:border-0 hover:bg-surface-secondary"
                      onClick={() => setParentId(f.id)}
                    >
                      <FolderIcon className="size-4 text-accent" /> {f.name}
                    </button>
                  ))
                )}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button isDisabled={busy} onClick={doMove}>移动到此处</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

import { Button, Input, Modal, Switch } from "@heroui/react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { DirectoryPayload, DriveNode, DriveShare } from "@mailflare/shared";
import { Select } from "../../components/Select";
import { Alert } from "../../components/ui";
import { LinkIcon, TrashIcon, UsersIcon } from "../../components/icons";
import { api, ApiError, shareUrl } from "../../lib/api";
import { useFetch } from "../../hooks/useFetch";

interface GrantRow {
  id: string;
  userId: string | null;
  role: string;
  userName: string | null;
}

/** 分享对话框：对外公开链接（可选密码/过期）+ 对内授权给组织成员 */
export function ShareDialog({ node, onClose }: { node: DriveNode; onClose: () => void }) {
  const [tab, setTab] = useState<"external" | "internal">("external");
  const [shares, setShares] = useState<DriveShare[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  // 新建外链表单
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("viewer");
  const [allowDownload, setAllowDownload] = useState(true);
  const [expiresAt, setExpiresAt] = useState("");

  // 对内分享表单
  const { data: directory } = useFetch<DirectoryPayload>("/api/contacts/directory");
  const [shareUserId, setShareUserId] = useState("");
  const [internalRole, setInternalRole] = useState("viewer");

  async function loadShares() {
    try {
      setShares(await api.get<DriveShare[]>(`/api/me/drive/nodes/${node.id}/shares`));
    } catch {
      /* ignore */
    }
  }
  async function loadGrants() {
    try {
      setGrants(await api.get<GrantRow[]>(`/api/me/drive/nodes/${node.id}/grants`));
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void loadShares();
    void loadGrants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node.id]);

  async function createShare(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api.post(`/api/me/drive/nodes/${node.id}/shares`, {
        password: password.trim() ? password.trim() : null,
        role,
        allowDownload,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      });
      setPassword("");
      setExpiresAt("");
      await loadShares();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  async function deleteShare(id: string) {
    await api.del(`/api/me/drive/shares/${id}`);
    await loadShares();
  }

  async function addInternal(e: FormEvent) {
    e.preventDefault();
    if (!shareUserId) return;
    setBusy(true);
    setErr("");
    try {
      await api.post(`/api/me/drive/nodes/${node.id}/share-internal`, {
        userId: shareUserId,
        role: internalRole,
      });
      setShareUserId("");
      await loadGrants();
    } catch (e2) {
      setErr(e2 instanceof ApiError ? e2.message : "分享失败");
    } finally {
      setBusy(false);
    }
  }

  async function removeGrant(id: string) {
    await api.del(`/api/me/drive/grants/${id}`);
    await loadGrants();
  }

  const userGrants = grants.filter((g) => g.userId);

  return (
    <Modal.Root isOpen onOpenChange={(v) => { if (!v) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.Header>分享「{node.name}」</Modal.Header>
            <Modal.Body>
              <div className="mb-4 flex gap-2">
                <Button size="sm" variant={tab === "external" ? "primary" : "ghost"} onClick={() => setTab("external")}>
                  <LinkIcon className="size-4" /> 对外链接
                </Button>
                <Button size="sm" variant={tab === "internal" ? "primary" : "ghost"} onClick={() => setTab("internal")}>
                  <UsersIcon className="size-4" /> 对内分享
                </Button>
              </div>

              {err && <div className="mb-3"><Alert>{err}</Alert></div>}

              {tab === "external" ? (
                <div className="space-y-4">
                  <form onSubmit={createShare} className="space-y-3 rounded-xl bg-surface-secondary p-3">
                    <div className="flex flex-wrap items-center gap-4">
                      <Select
                        label="权限"
                        value={role}
                        onChange={setRole}
                        options={[
                          { value: "viewer", label: "只读" },
                          { value: "editor", label: "可编辑" },
                        ]}
                        className="w-32"
                      />
                      <Switch isSelected={allowDownload} onChange={setAllowDownload}>
                        允许下载
                      </Switch>
                    </div>
                    <div className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-foreground">访问密码（留空则公开）</span>
                      <Input
                        type="text"
                        placeholder="留空则无需密码"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col gap-1.5 text-sm">
                      <span className="font-medium text-foreground">过期时间（可选）</span>
                      <Input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
                    </div>
                    <Button type="submit" size="sm" isDisabled={busy}>创建链接</Button>
                  </form>

                  <div className="space-y-2">
                    {shares.length === 0 ? (
                      <p className="text-sm text-muted">暂无对外链接</p>
                    ) : (
                      shares.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-mono text-xs text-foreground">{shareUrl(s.token)}</div>
                            <div className="mt-0.5 text-xs text-muted">
                              {s.role === "editor" ? "可编辑" : "只读"}
                              {s.hasPassword ? " · 有密码" : " · 无密码"}
                              {s.allowDownload ? "" : " · 禁下载"}
                              {s.expiresAt ? ` · 到期 ${new Date(s.expiresAt).toLocaleString("zh-CN")}` : ""}
                            </div>
                          </div>
                          <Button size="sm" variant="ghost" onClick={() => navigator.clipboard?.writeText(shareUrl(s.token))}>
                            复制
                          </Button>
                          <Button size="sm" variant="ghost" isIconOnly aria-label="删除" onClick={() => deleteShare(s.id)}>
                            <TrashIcon className="size-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <form onSubmit={addInternal} className="flex flex-wrap items-end gap-3 rounded-xl bg-surface-secondary p-3">
                    <Select
                      label="选择成员"
                      value={shareUserId}
                      onChange={setShareUserId}
                      placeholder="选择组织成员"
                      options={(directory?.entries ?? []).map((e) => ({
                        value: e.userId,
                        label: `${e.name}（${e.email}）`,
                      }))}
                      className="min-w-56 flex-1"
                    />
                    <Select
                      label="权限"
                      value={internalRole}
                      onChange={setInternalRole}
                      options={[
                        { value: "viewer", label: "只读" },
                        { value: "editor", label: "可编辑" },
                      ]}
                      className="w-32"
                    />
                    <Button type="submit" size="sm" isDisabled={busy || !shareUserId}>分享</Button>
                  </form>

                  <div className="space-y-2">
                    {userGrants.length === 0 ? (
                      <p className="text-sm text-muted">尚未分享给任何成员</p>
                    ) : (
                      userGrants.map((g) => (
                        <div key={g.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                          <span className="flex-1 text-foreground">{g.userName ?? g.userId}</span>
                          <span className="text-xs text-muted">{g.role === "editor" ? "可编辑" : "只读"}</span>
                          <Button size="sm" variant="ghost" isIconOnly aria-label="移除" onClick={() => removeGrant(g.id)}>
                            <TrashIcon className="size-4" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onPress={onClose}>关闭</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

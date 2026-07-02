import { Button, Input, Label, Modal, TextField } from "@heroui/react";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { DirectoryPayload, DriveGrant, DriveGroupMember } from "@mailflare/shared";
import { Select } from "../../components/Select";
import { FolderIcon, FileIcon, TrashIcon } from "../../components/icons";
import { Alert, Badge, PageHeader, Panel, Table, type Column } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { api, ApiError } from "../../lib/api";
import { bytesToGib, formatBytes, gibToBytes } from "../../lib/format";

interface SpaceRow {
  id: string;
  type: string;
  name: string;
  departmentId: string | null;
  departmentName: string | null;
  quotaBytes: number | null;
  usedBytes: number;
}
interface GroupRow {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
}
interface DeptRow {
  id: string;
  name: string;
}
interface NodeRow {
  id: string;
  parentId: string | null;
  type: string;
  name: string;
}

export function DriveSettings() {
  const { data: spaces, refetch: refetchSpaces } = useFetch<SpaceRow[]>("/api/admin/drive/spaces");
  const { data: groups, refetch: refetchGroups } = useFetch<GroupRow[]>("/api/admin/drive/groups");
  const { data: depts } = useFetch<DeptRow[]>("/api/admin/directory/departments");
  const { data: directory } = useFetch<DirectoryPayload>("/api/contacts/directory");

  const [msg, setMsg] = useState<{ kind: "danger" | "success"; text: string } | null>(null);
  const [membersOf, setMembersOf] = useState<GroupRow | null>(null);
  const [grantSpace, setGrantSpace] = useState<SpaceRow | null>(null);

  // 新建空间表单
  const [spType, setSpType] = useState("org");
  const [spName, setSpName] = useState("");
  const [spDept, setSpDept] = useState("");
  const [spQuota, setSpQuota] = useState("");
  const [busy, setBusy] = useState(false);

  // 新建权限组
  const [grpName, setGrpName] = useState("");
  const [grpDesc, setGrpDesc] = useState("");

  async function createSpace(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      await api.post("/api/admin/drive/spaces", {
        type: spType,
        name: spName,
        departmentId: spType === "department" ? spDept || null : null,
        quotaBytes: spQuota ? gibToBytes(Number(spQuota)) : null,
      });
      setSpName("");
      setSpDept("");
      setSpQuota("");
      await refetchSpaces();
      setMsg({ kind: "success", text: "空间已创建" });
    } catch (err) {
      setMsg({ kind: "danger", text: err instanceof ApiError ? err.message : "创建失败" });
    } finally {
      setBusy(false);
    }
  }

  async function editQuota(s: SpaceRow) {
    const cur = s.quotaBytes != null ? String(bytesToGib(s.quotaBytes)) : "";
    const v = window.prompt(`设置「${s.name}」容量上限（GiB，留空为不限）`, cur);
    if (v === null) return;
    await api.patch(`/api/admin/drive/spaces/${s.id}`, {
      quotaBytes: v.trim() === "" ? null : gibToBytes(Number(v)),
    });
    await refetchSpaces();
  }

  async function deleteSpace(s: SpaceRow) {
    if (!confirm(`删除空间「${s.name}」？其中所有文件将被永久删除。`)) return;
    await api.del(`/api/admin/drive/spaces/${s.id}`);
    await refetchSpaces();
  }

  async function createGroup(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      await api.post("/api/admin/drive/groups", { name: grpName, description: grpDesc || null });
      setGrpName("");
      setGrpDesc("");
      await refetchGroups();
    } catch (err) {
      setMsg({ kind: "danger", text: err instanceof ApiError ? err.message : "创建失败" });
    } finally {
      setBusy(false);
    }
  }

  async function deleteGroup(g: GroupRow) {
    if (!confirm(`删除权限组「${g.name}」？`)) return;
    await api.del(`/api/admin/drive/groups/${g.id}`);
    await refetchGroups();
  }

  const spaceCols: Column<SpaceRow>[] = [
    { key: "name", header: "名称", render: (s) => <span className="font-medium text-foreground">{s.name}</span> },
    {
      key: "type",
      header: "类型",
      render: (s) => <Badge tone={s.type === "department" ? "primary" : "default"}>{s.type === "department" ? "部门" : "公共"}</Badge>,
    },
    { key: "dept", header: "部门", render: (s) => s.departmentName ?? "—" },
    {
      key: "quota",
      header: "容量",
      render: (s) => `${formatBytes(s.usedBytes)} / ${s.quotaBytes != null ? formatBytes(s.quotaBytes) : "不限"}`,
    },
    {
      key: "actions",
      header: "操作",
      render: (s) => (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setGrantSpace(s)}>授权</Button>
          <Button size="sm" variant="ghost" onClick={() => editQuota(s)}>容量</Button>
          <Button size="sm" variant="ghost" onClick={() => deleteSpace(s)}>删除</Button>
        </div>
      ),
    },
  ];

  const groupCols: Column<GroupRow>[] = [
    { key: "name", header: "组名", render: (g) => <span className="font-medium text-foreground">{g.name}</span> },
    { key: "description", header: "说明", render: (g) => g.description ?? "—" },
    { key: "memberCount", header: "成员数" },
    {
      key: "actions",
      header: "操作",
      render: (g) => (
        <div className="flex flex-wrap gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setMembersOf(g)}>成员</Button>
          <Button size="sm" variant="ghost" onClick={() => deleteGroup(g)}>删除</Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader title="网盘管理" subtitle="组织/部门空间、权限组与文件授权" />
      {msg && <Alert kind={msg.kind}>{msg.text}</Alert>}

      {/* 空间 */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">空间</h2>
        <Panel className="mb-4">
          <form onSubmit={createSpace} className="flex flex-wrap items-end gap-3">
            <Select
              label="类型"
              value={spType}
              onChange={setSpType}
              options={[
                { value: "org", label: "公共空间" },
                { value: "department", label: "部门空间" },
              ]}
              className="w-36"
            />
            <TextField className="min-w-48 flex-1">
              <Label>名称</Label>
              <Input value={spName} onChange={(e) => setSpName(e.target.value)} placeholder="空间名称" />
            </TextField>
            {spType === "department" && (
              <Select
                label="部门"
                value={spDept}
                onChange={setSpDept}
                placeholder="选择部门"
                options={(depts ?? []).map((d) => ({ value: d.id, label: d.name }))}
                className="w-48"
              />
            )}
            <TextField className="w-40">
              <Label>容量 (GiB，可空)</Label>
              <Input type="number" min={0} step="1" value={spQuota} onChange={(e) => setSpQuota(e.target.value)} placeholder="不限" />
            </TextField>
            <Button type="submit" isDisabled={busy || !spName.trim() || (spType === "department" && !spDept)}>
              创建空间
            </Button>
          </form>
        </Panel>
        <Table columns={spaceCols} rows={spaces ?? []} empty="暂无组织/部门空间" />
      </div>

      {/* 权限组 */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-foreground">权限组</h2>
        <Panel className="mb-4">
          <form onSubmit={createGroup} className="flex flex-wrap items-end gap-3">
            <TextField className="min-w-48 flex-1">
              <Label>组名</Label>
              <Input value={grpName} onChange={(e) => setGrpName(e.target.value)} placeholder="如 研发组" />
            </TextField>
            <TextField className="min-w-48 flex-1">
              <Label>说明（可选）</Label>
              <Input value={grpDesc} onChange={(e) => setGrpDesc(e.target.value)} />
            </TextField>
            <Button type="submit" isDisabled={busy || !grpName.trim()}>创建组</Button>
          </form>
        </Panel>
        <Table columns={groupCols} rows={groups ?? []} empty="暂无权限组" />
      </div>

      {membersOf && (
        <GroupMembersModal
          group={membersOf}
          directory={directory}
          onClose={() => {
            setMembersOf(null);
            void refetchGroups();
          }}
        />
      )}
      {grantSpace && (
        <SpaceGrantsModal
          space={grantSpace}
          groups={groups ?? []}
          depts={depts ?? []}
          directory={directory}
          onClose={() => setGrantSpace(null)}
        />
      )}
    </div>
  );
}

/** 权限组成员管理 */
function GroupMembersModal({
  group,
  directory,
  onClose,
}: {
  group: GroupRow;
  directory: DirectoryPayload | null;
  onClose: () => void;
}) {
  const [members, setMembers] = useState<DriveGroupMember[]>([]);
  const [addId, setAddId] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setMembers(await api.get<DriveGroupMember[]>(`/api/admin/drive/groups/${group.id}/members`));
  }
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);

  async function add() {
    if (!addId) return;
    setBusy(true);
    try {
      await api.post(`/api/admin/drive/groups/${group.id}/members`, { userId: addId });
      setAddId("");
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function remove(userId: string) {
    await api.del(`/api/admin/drive/groups/${group.id}/members/${userId}`);
    await load();
  }

  const memberIds = new Set(members.map((m) => m.userId));
  const candidates = (directory?.entries ?? []).filter((e) => !memberIds.has(e.userId));

  return (
    <Modal.Root isOpen onOpenChange={(v) => { if (!v) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container size="md">
          <Modal.Dialog>
            <Modal.Header>「{group.name}」成员</Modal.Header>
            <Modal.Body>
              <div className="mb-4 flex items-end gap-2">
                <Select
                  label="添加成员"
                  value={addId}
                  onChange={setAddId}
                  placeholder="选择用户"
                  options={candidates.map((e) => ({ value: e.userId, label: `${e.name}（${e.email}）` }))}
                  className="flex-1"
                />
                <Button onClick={add} isDisabled={busy || !addId}>添加</Button>
              </div>
              <div className="space-y-1.5">
                {members.length === 0 ? (
                  <p className="text-sm text-muted">暂无成员</p>
                ) : (
                  members.map((m) => (
                    <div key={m.userId} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                      <span className="flex-1 text-foreground">{m.name}</span>
                      <span className="text-xs text-muted">{m.email}</span>
                      <Button size="sm" variant="ghost" isIconOnly aria-label="移除" onClick={() => remove(m.userId)}>
                        <TrashIcon className="size-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onClick={onClose}>关闭</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

/** 空间节点授权：选择节点 → 给 组/部门/用户 授权 */
function SpaceGrantsModal({
  space,
  groups,
  depts,
  directory,
  onClose,
}: {
  space: SpaceRow;
  groups: GroupRow[];
  depts: DeptRow[];
  directory: DirectoryPayload | null;
  onClose: () => void;
}) {
  const [nodes, setNodes] = useState<NodeRow[]>([]);
  const [selected, setSelected] = useState<NodeRow | null>(null);
  const [grants, setGrants] = useState<DriveGrant[]>([]);

  const [subject, setSubject] = useState("group");
  const [targetId, setTargetId] = useState("");
  const [role, setRole] = useState("viewer");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    (async () => {
      setNodes(await api.get<NodeRow[]>(`/api/admin/drive/spaces/${space.id}/nodes`));
    })();
  }, [space.id]);

  async function loadGrants(node: NodeRow) {
    setSelected(node);
    setGrants(await api.get<DriveGrant[]>(`/api/admin/drive/nodes/${node.id}/grants`));
  }

  async function addGrant() {
    if (!selected || !targetId) return;
    setBusy(true);
    setErr("");
    try {
      await api.post(`/api/admin/drive/nodes/${selected.id}/grants`, {
        groupId: subject === "group" ? targetId : null,
        departmentId: subject === "department" ? targetId : null,
        userId: subject === "user" ? targetId : null,
        role,
      });
      setTargetId("");
      await loadGrants(selected);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "授权失败");
    } finally {
      setBusy(false);
    }
  }

  async function removeGrant(id: string) {
    await api.del(`/api/admin/drive/grants/${id}`);
    if (selected) await loadGrants(selected);
  }

  // 计算节点深度用于缩进
  const byId = new Map(nodes.map((n) => [n.id, n]));
  function depth(n: NodeRow): number {
    let d = 0;
    let cur = n.parentId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      d++;
      cur = byId.get(cur)?.parentId ?? null;
    }
    return d;
  }

  const targetOptions =
    subject === "group"
      ? groups.map((g) => ({ value: g.id, label: g.name }))
      : subject === "department"
        ? depts.map((d) => ({ value: d.id, label: d.name }))
        : (directory?.entries ?? []).map((e) => ({ value: e.userId, label: `${e.name}（${e.email}）` }));

  return (
    <Modal.Root isOpen onOpenChange={(v) => { if (!v) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container size="lg">
          <Modal.Dialog>
            <Modal.Header>「{space.name}」文件授权</Modal.Header>
            <Modal.Body>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {/* 节点树 */}
                <div>
                  <div className="mb-2 text-xs font-medium text-muted">选择文件 / 文件夹</div>
                  <div className="max-h-72 overflow-auto rounded-xl border border-border">
                    {nodes.length === 0 ? (
                      <p className="p-4 text-center text-sm text-muted">空间内暂无内容</p>
                    ) : (
                      nodes.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => loadGrants(n)}
                          className={
                            "flex w-full items-center gap-2 border-b border-separator/60 px-3 py-2 text-left text-sm last:border-0 hover:bg-surface-secondary " +
                            (selected?.id === n.id ? "bg-surface-secondary" : "")
                          }
                          style={{ paddingLeft: 12 + depth(n) * 16 }}
                        >
                          {n.type === "folder" ? (
                            <FolderIcon className="size-4 shrink-0 text-accent" />
                          ) : (
                            <FileIcon className="size-4 shrink-0 text-muted" />
                          )}
                          <span className="truncate">{n.name}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* 授权面板 */}
                <div>
                  <div className="mb-2 text-xs font-medium text-muted">
                    {selected ? `授权：${selected.name}` : "请选择左侧节点"}
                  </div>
                  {selected && (
                    <div className="space-y-3">
                      {err && <Alert>{err}</Alert>}
                      <div className="flex flex-wrap items-end gap-2">
                        <Select
                          label="主体"
                          value={subject}
                          onChange={(v) => {
                            setSubject(v);
                            setTargetId("");
                          }}
                          options={[
                            { value: "group", label: "权限组" },
                            { value: "department", label: "部门" },
                            { value: "user", label: "用户" },
                          ]}
                          className="w-28"
                        />
                        <Select
                          label="对象"
                          value={targetId}
                          onChange={setTargetId}
                          placeholder="选择"
                          options={targetOptions}
                          className="min-w-40 flex-1"
                        />
                        <Select
                          label="权限"
                          value={role}
                          onChange={setRole}
                          options={[
                            { value: "viewer", label: "只读" },
                            { value: "editor", label: "可编辑" },
                          ]}
                          className="w-28"
                        />
                        <Button onClick={addGrant} isDisabled={busy || !targetId}>授权</Button>
                      </div>

                      <div className="space-y-1.5">
                        {grants.length === 0 ? (
                          <p className="text-sm text-muted">尚无授权（该节点及其父级）</p>
                        ) : (
                          grants.map((g) => (
                            <div key={g.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                              <Badge tone={g.subject === "department" ? "primary" : g.subject === "group" ? "success" : "default"}>
                                {g.subject === "group" ? "组" : g.subject === "department" ? "部门" : "用户"}
                              </Badge>
                              <span className="flex-1 truncate text-foreground">{g.label}</span>
                              <span className="text-xs text-muted">{g.role === "editor" ? "可编辑" : "只读"}</span>
                              <Button size="sm" variant="ghost" isIconOnly aria-label="撤销" onClick={() => removeGrant(g.id)}>
                                <TrashIcon className="size-4" />
                              </Button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button variant="ghost" onClick={onClose}>关闭</Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal.Root>
  );
}

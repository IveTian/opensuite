import { Button, Input, Label, Switch, TextField } from "@heroui/react";
import { useEffect, useMemo, useState } from "react";
import type { Department } from "@mailflare/shared";
import { Select } from "../../components/Select";
import { PersonAvatar } from "../../components/PersonAvatar";
import { PlusIcon, TrashIcon } from "../../components/icons";
import { Alert, Badge, PageHeader, Panel } from "../../components/ui";
import { useFetch } from "../../hooks/useFetch";
import { api, ApiError } from "../../lib/api";

interface AdminMember {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  approvalStatus: string;
  banned: boolean;
  departmentId: string | null;
  jobTitle: string | null;
  phone: string | null;
  mobile: string | null;
  extension: string | null;
  location: string | null;
  isHidden: boolean;
  sortOrder: number;
}

interface AddressRow {
  id: string;
  address: string;
  type: string;
  status: string;
}

interface DeptMailbox {
  id: string;
  departmentId: string;
  addressId: string;
  address: string;
  status: string;
  defaultCanSend: boolean;
}

type DeptNode = Department & { children: DeptNode[] };

function buildTree(departments: Department[]): DeptNode[] {
  const nodes = new Map<string, DeptNode>();
  for (const d of departments) nodes.set(d.id, { ...d, children: [] });
  const roots: DeptNode[] = [];
  for (const d of departments) {
    const node = nodes.get(d.id)!;
    const parent = d.parentId ? nodes.get(d.parentId) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (items: DeptNode[]) => {
    items.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
    for (const item of items) sort(item.children);
  };
  sort(roots);
  return roots;
}

function descendantIds(departments: Department[], selectedId: string | null): Set<string> {
  if (!selectedId) return new Set();
  const children = new Map<string, string[]>();
  for (const d of departments) {
    if (!d.parentId) continue;
    children.set(d.parentId, [...(children.get(d.parentId) ?? []), d.id]);
  }
  const out = new Set<string>();
  const walk = (id: string) => {
    out.add(id);
    for (const child of children.get(id) ?? []) walk(child);
  };
  walk(selectedId);
  return out;
}

export function Directory() {
  const { data: departments, refetch: refetchDepts } = useFetch<Department[]>(
    "/api/admin/directory/departments",
  );
  const { data: members, refetch: refetchMembers } =
    useFetch<AdminMember[]>("/api/admin/directory/members");
  const { data: addresses, refetch: refetchAddresses } =
    useFetch<AddressRow[]>("/api/admin/addresses");
  const depts = departments ?? [];
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedDeptId && depts[0]) setSelectedDeptId(depts[0].id);
    if (selectedDeptId && !depts.some((d) => d.id === selectedDeptId)) {
      setSelectedDeptId(depts[0]?.id ?? null);
    }
  }, [depts, selectedDeptId]);

  const tree = useMemo(() => buildTree(depts), [depts]);
  const selectedDept = depts.find((d) => d.id === selectedDeptId) ?? null;
  const selectedScope = descendantIds(depts, selectedDeptId);
  const visibleMembers = selectedDeptId
    ? (members ?? []).filter((m) => m.departmentId && selectedScope.has(m.departmentId))
    : (members ?? []);
  const deptOptions = [
    { value: "", label: "（未分组）" },
    ...depts.map((d) => ({ value: d.id, label: d.name })),
  ];
  const sharedAddresses = (addresses ?? []).filter((a) => a.type === "shared");

  function refreshAll() {
    void refetchDepts();
    void refetchMembers();
    void refetchAddresses();
  }

  return (
    <div>
      <PageHeader
        title="通讯录"
        subtitle="左侧维护上下级部门，右侧按部门开通公共邮箱并管理成员架构"
      />

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <DeptSidebar
            tree={tree}
            departments={depts}
            selectedDeptId={selectedDeptId}
            onSelect={setSelectedDeptId}
            onChanged={refreshAll}
          />
        </div>

        <div className="space-y-4">
          {selectedDept ? (
            <>
              <DeptDetail
                dept={selectedDept}
                departments={depts}
                onChanged={refreshAll}
                onDeleted={() => setSelectedDeptId(null)}
              />
              <DepartmentMailboxPanel
                department={selectedDept}
                sharedAddresses={sharedAddresses}
              />
            </>
          ) : (
            <Panel>
              <p className="text-sm text-muted">先在左侧创建或选择一个部门。</p>
            </Panel>
          )}

          <Panel>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  {selectedDept ? `${selectedDept.name} 成员` : "全部成员"}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  移动成员部门后，部门公共邮箱访问范围会立即按新组织结构生效。
                </p>
              </div>
              <Badge>{visibleMembers.length} 人</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted">
                  <tr className="border-b border-separator">
                    <th className="px-3 py-2 font-medium">成员</th>
                    <th className="px-3 py-2 font-medium">部门</th>
                    <th className="px-3 py-2 font-medium">职位</th>
                    <th className="px-3 py-2 font-medium">电话</th>
                    <th className="px-3 py-2 font-medium">分机</th>
                    <th className="px-3 py-2 font-medium">隐藏</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visibleMembers.map((m) => (
                    <MemberRow
                      key={m.userId}
                      member={m}
                      deptOptions={deptOptions}
                      onSaved={refreshAll}
                    />
                  ))}
                  {visibleMembers.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-10 text-center text-muted">
                        当前范围暂无成员
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function DeptSidebar({
  tree,
  departments,
  selectedDeptId,
  onSelect,
  onChanged,
}: {
  tree: DeptNode[];
  departments: Department[];
  selectedDeptId: string | null;
  onSelect: (id: string) => void;
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    setErr("");
    try {
      const row = await api.post<Department>("/api/admin/directory/departments", {
        name: name.trim(),
        parentId: parentId || null,
      });
      setName("");
      onChanged();
      onSelect(row.id);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">部门树</h2>
        <p className="mt-1 text-xs text-muted">上级部门开通的公共邮箱会被下级部门继承。</p>
      </div>
      <div className="mb-4 flex flex-col gap-3">
        <TextField>
          <Label>新建部门</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：技术部" />
        </TextField>
        <Select
          label="上级部门"
          value={parentId}
          onChange={setParentId}
          options={[
            { value: "", label: "（顶级部门）" },
            ...departments.map((d) => ({ value: d.id, label: d.name })),
          ]}
        />
        <Button variant="primary" onClick={add} isDisabled={busy || !name.trim()}>
          <PlusIcon className="size-4" />
          新建部门
        </Button>
        {err && <Alert>{err}</Alert>}
      </div>
      <div className="space-y-1">
        {tree.map((node) => (
          <DeptTreeNode
            key={node.id}
            node={node}
            selectedDeptId={selectedDeptId}
            depth={0}
            onSelect={onSelect}
          />
        ))}
        {tree.length === 0 && <p className="text-sm text-muted">暂无部门</p>}
      </div>
    </Panel>
  );
}

function DeptTreeNode({
  node,
  selectedDeptId,
  depth,
  onSelect,
}: {
  node: DeptNode;
  selectedDeptId: string | null;
  depth: number;
  onSelect: (id: string) => void;
}) {
  const active = selectedDeptId === node.id;
  return (
    <div>
      <button
        type="button"
        onClick={() => onSelect(node.id)}
        className={
          "flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm " +
          (active
            ? "bg-accent text-accent-foreground"
            : "text-foreground hover:bg-surface-secondary")
        }
        style={{ paddingLeft: 12 + depth * 16 }}
      >
        <span className="truncate">{node.name}</span>
        <span className={active ? "text-accent-foreground/80" : "text-muted"}>
          {node.memberCount ?? 0}
        </span>
      </button>
      {node.children.map((child) => (
        <DeptTreeNode
          key={child.id}
          node={child}
          selectedDeptId={selectedDeptId}
          depth={depth + 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function DeptDetail({
  dept,
  departments,
  onChanged,
  onDeleted,
}: {
  dept: Department;
  departments: Department[];
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [name, setName] = useState(dept.name);
  const [parentId, setParentId] = useState(dept.parentId ?? "");
  const [sortOrder, setSortOrder] = useState(String(dept.sortOrder ?? 0));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setName(dept.name);
    setParentId(dept.parentId ?? "");
    setSortOrder(String(dept.sortOrder ?? 0));
    setErr("");
  }, [dept]);

  const invalidParents = descendantIds(departments, dept.id);
  const parentOptions = departments
    .filter((d) => d.id !== dept.id && !invalidParents.has(d.id))
    .map((d) => ({ value: d.id, label: d.name }));

  async function save() {
    setBusy(true);
    setErr("");
    try {
      await api.patch(`/api/admin/directory/departments/${dept.id}`, {
        name: name.trim(),
        parentId: parentId || null,
        sortOrder: Number(sortOrder || 0),
      });
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`确认删除部门 ${dept.name}？成员会变为未分组。`)) return;
    setBusy(true);
    try {
      await api.del(`/api/admin/directory/departments/${dept.id}`);
      onDeleted();
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-foreground">部门设置</h2>
          <p className="mt-1 text-xs text-muted">调整上下级关系会实时影响公共邮箱继承范围。</p>
        </div>
        <Button variant="danger-soft" size="sm" onClick={remove} isDisabled={busy}>
          <TrashIcon className="size-4" />
          删除
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_120px_auto] md:items-end">
        <TextField>
          <Label>部门名称</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </TextField>
        <Select
          label="上级部门"
          value={parentId}
          onChange={setParentId}
          options={[{ value: "", label: "（顶级部门）" }, ...parentOptions]}
        />
        <TextField>
          <Label>排序</Label>
          <Input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </TextField>
        <Button variant="primary" onClick={save} isDisabled={busy || !name.trim()}>
          保存
        </Button>
      </div>
      {err && <div className="mt-3"><Alert>{err}</Alert></div>}
    </Panel>
  );
}

function DepartmentMailboxPanel({
  department,
  sharedAddresses,
}: {
  department: Department;
  sharedAddresses: AddressRow[];
}) {
  const { data, refetch } = useFetch<DeptMailbox[]>(
    `/api/admin/directory/departments/${department.id}/mailboxes`,
  );
  const [addressId, setAddressId] = useState("");
  const [defaultCanSend, setDefaultCanSend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const existing = new Set((data ?? []).map((m) => m.addressId));
  const candidates = sharedAddresses.filter((a) => !existing.has(a.id));

  useEffect(() => {
    setAddressId("");
    setDefaultCanSend(false);
    setErr("");
  }, [department.id]);

  async function add() {
    if (!addressId) return;
    setBusy(true);
    setErr("");
    try {
      await api.post(`/api/admin/directory/departments/${department.id}/mailboxes`, {
        addressId,
        defaultCanSend,
      });
      setAddressId("");
      setDefaultCanSend(false);
      await refetch();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "开通失败");
    } finally {
      setBusy(false);
    }
  }

  async function update(addressId: string, canSend: boolean) {
    await api.patch(`/api/admin/directory/departments/${department.id}/mailboxes/${addressId}`, {
      canSend,
    });
    await refetch();
  }

  async function remove(addressId: string) {
    await api.del(`/api/admin/directory/departments/${department.id}/mailboxes/${addressId}`);
    await refetch();
  }

  return (
    <Panel>
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-foreground">部门公共邮箱</h2>
        <p className="mt-1 text-xs text-muted">
          默认设为只读时，部门成员都可读；需要发信的指定人员在「邮箱地址」里授权。
        </p>
      </div>
      <div className="mb-4 grid gap-3 md:grid-cols-[1fr_220px_auto] md:items-end">
        <Select
          label="开通公共邮箱"
          value={addressId}
          onChange={setAddressId}
          placeholder="选择公共邮箱"
          options={candidates.map((a) => ({ value: a.id, label: a.address }))}
        />
        <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2.5">
          <span className="text-sm text-foreground">全部可发信</span>
          <Switch isSelected={defaultCanSend} onChange={setDefaultCanSend} />
        </div>
        <Button variant="primary" onClick={add} isDisabled={busy || !addressId}>
          开通
        </Button>
      </div>
      {err && <div className="mb-3"><Alert>{err}</Alert></div>}
      <div className="flex flex-col gap-2">
        {(data ?? []).map((m) => (
          <div
            key={m.addressId}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
          >
            <div className="min-w-0">
              <div className="truncate text-sm font-medium text-foreground">{m.address}</div>
              <div className="text-xs text-muted">
                {m.defaultCanSend ? "部门范围内默认可读可发" : "部门范围内默认只读"}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 text-xs text-muted">
                全部可发信
                <Switch
                  isSelected={m.defaultCanSend}
                  onChange={(v) => void update(m.addressId, v)}
                />
              </label>
              <Button size="sm" variant="danger-soft" onClick={() => remove(m.addressId)}>
                取消
              </Button>
            </div>
          </div>
        ))}
        {data && data.length === 0 && (
          <p className="text-sm text-muted">该部门尚未开通公共邮箱。</p>
        )}
      </div>
    </Panel>
  );
}

function MemberRow({
  member,
  deptOptions,
  onSaved,
}: {
  member: AdminMember;
  deptOptions: { value: string; label: string }[];
  onSaved: () => void;
}) {
  const [departmentId, setDepartmentId] = useState(member.departmentId ?? "");
  const [jobTitle, setJobTitle] = useState(member.jobTitle ?? "");
  const [phone, setPhone] = useState(member.phone ?? "");
  const [extension, setExtension] = useState(member.extension ?? "");
  const [isHidden, setIsHidden] = useState(member.isHidden);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    setDepartmentId(member.departmentId ?? "");
    setJobTitle(member.jobTitle ?? "");
    setPhone(member.phone ?? "");
    setExtension(member.extension ?? "");
    setIsHidden(member.isHidden);
    setOk(false);
  }, [member]);

  async function save() {
    setBusy(true);
    setOk(false);
    try {
      await api.put(`/api/admin/directory/members/${member.userId}`, {
        departmentId: departmentId || null,
        jobTitle: jobTitle.trim() || null,
        phone: phone.trim() || null,
        extension: extension.trim() || null,
        mobile: member.mobile,
        location: member.location,
        sortOrder: member.sortOrder,
        isHidden,
      });
      setOk(true);
      onSaved();
    } finally {
      setBusy(false);
    }
  }

  return (
    <tr className="border-b border-separator/60 last:border-0">
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <PersonAvatar
            url={member.image}
            email={member.email}
            seed={member.name}
            className="size-8 shrink-0"
          />
          <div className="min-w-0">
            <div className="truncate font-medium text-foreground">{member.name}</div>
            <div className="truncate text-xs text-muted">{member.email}</div>
          </div>
        </div>
      </td>
      <td className="px-3 py-2">
        <Select
          ariaLabel="部门"
          value={departmentId}
          onChange={(v) => {
            setDepartmentId(v);
            setOk(false);
          }}
          options={deptOptions}
          className="w-36"
        />
      </td>
      <td className="px-3 py-2">
        <Input
          value={jobTitle}
          onChange={(e) => {
            setJobTitle(e.target.value);
            setOk(false);
          }}
          className="w-28"
        />
      </td>
      <td className="px-3 py-2">
        <Input
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setOk(false);
          }}
          className="w-32"
        />
      </td>
      <td className="px-3 py-2">
        <Input
          value={extension}
          onChange={(e) => {
            setExtension(e.target.value);
            setOk(false);
          }}
          className="w-16"
        />
      </td>
      <td className="px-3 py-2">
        <Switch
          isSelected={isHidden}
          onChange={(v) => {
            setIsHidden(v);
            setOk(false);
          }}
        />
      </td>
      <td className="px-3 py-2 text-right">
        <Button size="sm" variant="outline" onClick={save} isDisabled={busy}>
          {busy ? "保存中…" : ok ? "已保存" : "保存"}
        </Button>
      </td>
    </tr>
  );
}

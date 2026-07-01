import { Button, Input, Label, Switch, TextField } from "@heroui/react";
import { useState } from "react";
import type { Department } from "@mailflare/shared";
import { PageHeader, Panel, Alert, Badge } from "../../components/ui";
import { Select } from "../../components/Select";
import { PersonAvatar } from "../../components/PersonAvatar";
import { PlusIcon, TrashIcon } from "../../components/icons";
import { useFetch } from "../../hooks/useFetch";
import { api, ApiError } from "../../lib/api";

/** 后台成员目录行（/api/admin/directory/members 返回） */
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

export function Directory() {
  const { data: departments, refetch: refetchDepts } = useFetch<Department[]>(
    "/api/admin/directory/departments",
  );
  const { data: members, refetch: refetchMembers } =
    useFetch<AdminMember[]>("/api/admin/directory/members");

  const depts = departments ?? [];
  const deptOptions = [
    { value: "", label: "（未分组）" },
    ...depts.map((d) => ({ value: d.id, label: d.name })),
  ];

  return (
    <div>
      <PageHeader title="通讯录" subtitle="组织部门与成员目录，对全体登录用户可见" />

      <DeptManager departments={depts} onChanged={() => void refetchDepts()} />

      <Panel>
        <h2 className="mb-4 text-sm font-semibold text-foreground">成员目录</h2>
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
              {(members ?? []).map((m) => (
                <MemberRow
                  key={m.userId}
                  member={m}
                  deptOptions={deptOptions}
                  onSaved={() => {
                    void refetchMembers();
                    void refetchDepts();
                  }}
                />
              ))}
              {members && members.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted">
                    暂无成员
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

/** 部门管理：新建 + 逐个重命名/删除 */
function DeptManager({
  departments,
  onChanged,
}: {
  departments: Department[];
  onChanged: () => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    setErr("");
    try {
      await api.post("/api/admin/directory/departments", { name: name.trim() });
      setName("");
      onChanged();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "创建失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="mb-5">
      <h2 className="mb-4 text-sm font-semibold text-foreground">部门管理</h2>
      <div className="mb-3 flex items-end gap-2">
        <TextField className="flex-1">
          <Label>新建部门</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：技术部" />
        </TextField>
        <Button variant="primary" onClick={add} isDisabled={busy}>
          <PlusIcon className="size-4" />
          新建
        </Button>
      </div>
      {err && <Alert>{err}</Alert>}
      <ul className="flex flex-col gap-2">
        {departments.map((d) => (
          <DeptRow key={d.id} dept={d} onChanged={onChanged} />
        ))}
        {departments.length === 0 && <li className="text-sm text-muted">暂无部门</li>}
      </ul>
    </Panel>
  );
}

function DeptRow({ dept, onChanged }: { dept: Department; onChanged: () => void }) {
  const [name, setName] = useState(dept.name);
  const [busy, setBusy] = useState(false);

  async function rename() {
    if (!name.trim() || name.trim() === dept.name) return;
    setBusy(true);
    try {
      await api.patch(`/api/admin/directory/departments/${dept.id}`, { name: name.trim() });
      onChanged();
    } finally {
      setBusy(false);
    }
  }
  async function del() {
    setBusy(true);
    try {
      await api.del(`/api/admin/directory/departments/${dept.id}`);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-2">
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={rename}
        className="flex-1"
      />
      <Badge>{dept.memberCount ?? 0} 人</Badge>
      <Button size="sm" variant="ghost" isIconOnly aria-label="删除部门" onClick={del} isDisabled={busy}>
        <TrashIcon className="size-4 text-danger" />
      </Button>
    </li>
  );
}

/** 单个成员的组织资料编辑行 */
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

  async function save() {
    setBusy(true);
    setOk(false);
    try {
      await api.put(`/api/admin/directory/members/${member.userId}`, {
        departmentId: departmentId || null,
        jobTitle: jobTitle.trim() || null,
        phone: phone.trim() || null,
        extension: extension.trim() || null,
        // 未在本行编辑的字段原样回传，避免被置空
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
          <PersonAvatar url={member.image} email={member.email} seed={member.name} className="size-8 shrink-0" />
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
          className="w-32"
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

import { Button } from "@heroui/react";
import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { DirectoryEntry, DirectoryPayload, PersonalContact } from "@mailflare/shared";
import { BrandMark } from "../../components/BrandMark";
import { PersonAvatar } from "../../components/PersonAvatar";
import { Alert } from "../../components/ui";
import {
  DashboardIcon,
  MoonIcon,
  PlusIcon,
  SearchIcon,
  StarFilledIcon,
  SunIcon,
  UsersIcon,
} from "../../components/icons";
import { useFetch } from "../../hooks/useFetch";
import { api, ApiError } from "../../lib/api";
import { useSession } from "../../lib/auth-client";
import { useTheme } from "../../providers/theme";
import { useBranding } from "../../providers/branding";
import { ContactDetail, type ContactView } from "./ContactDetail";
import { PersonalContactForm } from "./PersonalContactForm";

type Tab = "org" | "personal";
type Selected =
  | { kind: "org"; entry: DirectoryEntry }
  | { kind: "personal"; contact: PersonalContact }
  | null;

const NO_DEPT = "__none__";

export function Contacts() {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const { siteName } = useBranding();
  const { data: session } = useSession();
  const image = (session?.user as { image?: string | null } | undefined)?.image ?? null;

  const { data: directory } = useFetch<DirectoryPayload>("/api/contacts/directory");
  const { data: personal, refetch: refetchPersonal } =
    useFetch<PersonalContact[]>("/api/contacts/personal");

  const [tab, setTab] = useState<Tab>("org");
  const [deptId, setDeptId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<Selected>(null);
  const [formOpen, setFormOpen] = useState<{ editing?: PersonalContact } | null>(null);
  const [notice, setNotice] = useState("");
  const [err, setErr] = useState("");

  const kw = q.trim().toLowerCase();
  const entries = directory?.entries ?? [];
  const departments = directory?.departments ?? [];

  const orgList = useMemo(() => {
    return entries.filter((e) => {
      if (deptId === NO_DEPT ? e.departmentId : deptId ? e.departmentId !== deptId : false)
        return false;
      if (!kw) return true;
      return [e.name, e.email, e.departmentName, e.jobTitle]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(kw));
    });
  }, [entries, deptId, kw]);

  const personalList = useMemo(() => {
    const list = personal ?? [];
    if (!kw) return list;
    return list.filter((c) =>
      [c.displayName, c.email, c.company, c.jobTitle]
        .filter(Boolean)
        .some((s) => s!.toLowerCase().includes(kw)),
    );
  }, [personal, kw]);

  const detailView: ContactView | null = useMemo(() => {
    if (!selected) return null;
    if (selected.kind === "org") {
      const e = selected.entry;
      return {
        source: "org",
        name: e.name,
        email: e.email,
        image: e.image,
        department: e.departmentName,
        jobTitle: e.jobTitle,
        phone: e.phone,
        mobile: e.mobile,
        extension: e.extension,
        location: e.location,
      };
    }
    const c = selected.contact;
    return {
      source: "personal",
      name: c.displayName,
      email: c.email,
      jobTitle: c.jobTitle,
      phone: c.phone,
      company: c.company,
      notes: c.notes,
    };
  }, [selected]);

  function writeMail(email: string) {
    navigate("/mail", { state: { compose: { to: email } } });
  }

  async function addOrgToContacts(entry: DirectoryEntry) {
    setErr("");
    try {
      await api.post<PersonalContact>("/api/contacts/personal", {
        displayName: entry.name,
        email: entry.email,
        jobTitle: entry.jobTitle ?? null,
      });
      await refetchPersonal();
      setNotice(`已将「${entry.name}」加入个人通讯录`);
      setTimeout(() => setNotice(""), 2500);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "操作失败");
    }
  }

  async function deleteContact(c: PersonalContact) {
    setErr("");
    try {
      await api.del(`/api/contacts/personal/${c.id}`);
      setSelected(null);
      await refetchPersonal();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "删除失败");
    }
  }

  const deptCount = (id: string | null) =>
    id === NO_DEPT
      ? entries.filter((e) => !e.departmentId).length
      : id
        ? entries.filter((e) => e.departmentId === id).length
        : entries.length;

  return (
    <div className="flex h-full flex-col bg-background">
      {/* 顶栏 */}
      <header className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-6">
        <div className="flex items-center gap-2">
          <BrandMark />
          <span className="text-sm font-semibold text-foreground">{siteName}</span>
          <span className="ml-1 text-sm text-muted">· 通讯录</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <DashboardIcon className="size-4" />
            应用
          </Button>
          <Button variant="ghost" isIconOnly aria-label="切换主题" onClick={toggle}>
            {theme === "dark" ? <MoonIcon className="size-4" /> : <SunIcon className="size-4" />}
          </Button>
          <button
            onClick={() => navigate("/account")}
            className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus/60"
            title="账户设置"
            aria-label="账户设置"
          >
            <PersonAvatar
              url={image}
              email={session?.user.email}
              seed={session?.user.email}
              className="size-8 shrink-0"
            />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* 左侧：Tab + 部门筛选 */}
        <aside className="hidden w-56 shrink-0 flex-col border-r border-border p-3 md:flex">
          <div className="flex gap-1 rounded-xl bg-surface-secondary p-1">
            <TabButton active={tab === "org"} onClick={() => setTab("org")}>
              组织
            </TabButton>
            <TabButton active={tab === "personal"} onClick={() => setTab("personal")}>
              个人
            </TabButton>
          </div>

          {tab === "org" ? (
            <nav className="mt-3 flex flex-1 flex-col gap-0.5 overflow-y-auto">
              <DeptItem active={deptId === null} count={deptCount(null)} onClick={() => setDeptId(null)}>
                全部成员
              </DeptItem>
              {departments.map((d) => (
                <DeptItem
                  key={d.id}
                  active={deptId === d.id}
                  count={deptCount(d.id)}
                  onClick={() => setDeptId(d.id)}
                >
                  {d.name}
                </DeptItem>
              ))}
              <DeptItem
                active={deptId === NO_DEPT}
                count={deptCount(NO_DEPT)}
                onClick={() => setDeptId(NO_DEPT)}
              >
                未分组
              </DeptItem>
            </nav>
          ) : (
            <div className="mt-3">
              <Button
                variant="primary"
                className="w-full justify-start"
                onClick={() => setFormOpen({})}
              >
                <PlusIcon className="size-4" />
                新建联系人
              </Button>
            </div>
          )}
        </aside>

        {/* 中间：列表 */}
        <section className="flex min-w-0 flex-1 flex-col">
          {/* 移动端 Tab */}
          <div className="flex gap-1 border-b border-border p-2 md:hidden">
            <TabButton active={tab === "org"} onClick={() => setTab("org")}>
              组织
            </TabButton>
            <TabButton active={tab === "personal"} onClick={() => setTab("personal")}>
              个人
            </TabButton>
            {tab === "personal" && (
              <Button size="sm" variant="ghost" isIconOnly aria-label="新建" onClick={() => setFormOpen({})}>
                <PlusIcon className="size-4" />
              </Button>
            )}
          </div>

          {/* 搜索 */}
          <div className="border-b border-border p-3">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="搜索姓名 / 邮箱 / 部门"
                className="w-full rounded-xl border border-border bg-surface-secondary py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus:border-field-border-focus focus:outline-none focus:ring-2 focus:ring-focus/40"
              />
            </div>
          </div>

          {(notice || err) && (
            <div className="px-3 pt-3">
              {notice && <Alert kind="success">{notice}</Alert>}
              {err && <Alert>{err}</Alert>}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3">
            {tab === "org" ? (
              orgList.length === 0 ? (
                <Empty text={directory ? "暂无成员" : "加载中…"} />
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {orgList.map((e) => (
                    <ContactRow
                      key={e.userId}
                      active={selected?.kind === "org" && selected.entry.userId === e.userId}
                      image={e.image}
                      email={e.email}
                      name={e.name}
                      sub={[e.jobTitle, e.departmentName].filter(Boolean).join(" · ") || e.email}
                      onClick={() => setSelected({ kind: "org", entry: e })}
                    />
                  ))}
                </ul>
              )
            ) : personalList.length === 0 ? (
              <Empty text={personal ? "暂无联系人，点「新建联系人」添加" : "加载中…"} />
            ) : (
              <ul className="flex flex-col gap-0.5">
                {personalList.map((c) => (
                  <ContactRow
                    key={c.id}
                    active={selected?.kind === "personal" && selected.contact.id === c.id}
                    email={c.email}
                    name={c.displayName}
                    sub={[c.jobTitle, c.company].filter(Boolean).join(" · ") || c.email}
                    favorite={c.isFavorite}
                    onClick={() => setSelected({ kind: "personal", contact: c })}
                  />
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* 右侧：详情（大屏为列，小屏为浮层） */}
        {detailView && selected && (
          <>
            <div
              className="fixed inset-0 z-40 bg-black/30 lg:hidden"
              onClick={() => setSelected(null)}
            />
            <aside className="fixed inset-y-0 right-0 z-40 w-full max-w-sm border-l border-border bg-background shadow-overlay lg:static lg:z-0 lg:w-96 lg:shadow-none">
              <ContactDetail
                view={detailView}
                onClose={() => setSelected(null)}
                onWriteMail={() => writeMail(detailView.email)}
                onAddToContacts={
                  selected.kind === "org"
                    ? () => addOrgToContacts(selected.entry)
                    : undefined
                }
                onEdit={
                  selected.kind === "personal"
                    ? () => setFormOpen({ editing: selected.contact })
                    : undefined
                }
                onDelete={
                  selected.kind === "personal"
                    ? () => deleteContact(selected.contact)
                    : undefined
                }
              />
            </aside>
          </>
        )}
      </div>

      {formOpen && (
        <PersonalContactForm
          initial={formOpen.editing}
          onClose={() => setFormOpen(null)}
          onSaved={(saved) => {
            setFormOpen(null);
            setSelected({ kind: "personal", contact: saved });
            setTab("personal");
            void refetchPersonal();
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex-1 rounded-lg px-3 py-1.5 text-sm transition-colors " +
        (active
          ? "bg-surface font-medium text-foreground shadow-surface"
          : "text-muted hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

function DeptItem({
  active,
  count,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "flex items-center justify-between rounded-xl px-3 py-2 text-sm transition-colors " +
        (active
          ? "bg-surface font-medium text-foreground shadow-surface"
          : "text-muted hover:bg-surface-secondary hover:text-foreground")
      }
    >
      <span className="flex items-center gap-2 truncate">
        <UsersIcon className="size-4 shrink-0" />
        <span className="truncate">{children}</span>
      </span>
      <span className="ml-2 shrink-0 tabular-nums text-xs text-muted">{count}</span>
    </button>
  );
}

function ContactRow({
  active,
  image,
  email,
  name,
  sub,
  favorite,
  onClick,
}: {
  active: boolean;
  image?: string | null;
  email: string;
  name: string;
  sub: string;
  favorite?: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={
          "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors " +
          (active ? "bg-surface shadow-surface" : "hover:bg-surface-secondary")
        }
      >
        <PersonAvatar url={image} email={email} seed={name || email} className="size-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium text-foreground">{name}</span>
            {favorite && <StarFilledIcon className="size-3.5 shrink-0 text-warning" />}
          </div>
          <div className="truncate text-xs text-muted">{sub}</div>
        </div>
      </button>
    </li>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="py-16 text-center text-sm text-muted">{text}</div>;
}

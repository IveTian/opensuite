import { Button } from "@heroui/react";
import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { PersonAvatar } from "../../components/PersonAvatar";
import {
  AtSignIcon,
  BuildingIcon,
  ChevronRightIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
  SendIcon,
  TrashIcon,
  UsersIcon,
  XIcon,
} from "../../components/icons";
import { useFetch } from "../../hooks/useFetch";
import { formatDate } from "../../lib/format";

/** 详情面板统一视图模型（组织条目与个人联系人都归一到此结构） */
export interface ContactView {
  source: "org" | "personal";
  name: string;
  email: string;
  image?: string | null;
  department?: string | null;
  jobTitle?: string | null;
  phone?: string | null;
  mobile?: string | null;
  extension?: string | null;
  location?: string | null;
  company?: string | null;
  notes?: string | null;
}

/** 往来邮件行（复用邮件搜索接口 participant 过滤） */
interface MsgLite {
  id: string;
  direction: string;
  subject: string | null;
  receivedAt: string | null;
  sentAt: string | null;
  createdAt: string;
}

/** 联系人详情内嵌：与此人的最近邮件往来 + 在邮箱查看全部 */
function MailHistory({ email }: { email: string }) {
  const navigate = useNavigate();
  const { data } = useFetch<{ items: MsgLite[]; total: number }>(
    `/api/me/messages/search?participant=${encodeURIComponent(email)}&limit=6`,
  );
  if (!data) return null;
  const { items, total } = data;

  return (
    <div className="mt-6 border-t border-separator/60 pt-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-muted">邮件往来</h3>
        {total > 0 && <span className="text-xs text-muted tabular-nums">{total} 封</span>}
      </div>
      {items.length === 0 ? (
        <p className="py-2 text-sm text-muted">暂无往来邮件</p>
      ) : (
        <ul className="flex flex-col gap-0.5">
          {items.map((m) => {
            const out = m.direction === "outbound";
            const Icon = out ? SendIcon : MailIcon;
            return (
              <li key={m.id}>
                <button
                  onClick={() =>
                    navigate("/mail", {
                      state: { search: { participant: email }, openMessageId: m.id },
                    })
                  }
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-surface-secondary"
                  title={out ? "我发出" : "对方发来"}
                >
                  <Icon className="size-4 shrink-0 text-muted" />
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {m.subject || "(无主题)"}
                  </span>
                  <span className="shrink-0 text-xs text-muted">
                    {formatDate(m.receivedAt ?? m.sentAt ?? m.createdAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {total > 0 && (
        <button
          onClick={() => navigate("/mail", { state: { search: { participant: email } } })}
          className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg py-1.5 text-xs text-accent hover:bg-surface-secondary"
        >
          在邮箱中查看全部
          <ChevronRightIcon className="size-3.5" />
        </button>
      )}
    </div>
  );
}

function Field({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 px-1 py-2">
      <span className="mt-0.5 text-muted">{icon}</span>
      <div className="min-w-0">
        <div className="text-xs text-muted">{label}</div>
        <div className="break-words text-sm text-foreground">{value}</div>
      </div>
    </div>
  );
}

export function ContactDetail({
  view,
  onWriteMail,
  onAddToContacts,
  onEdit,
  onDelete,
  onClose,
}: {
  view: ContactView;
  onWriteMail: () => void;
  /** 组织条目：加入个人通讯录 */
  onAddToContacts?: () => void;
  /** 个人条目：编辑 */
  onEdit?: () => void;
  /** 个人条目：删除 */
  onDelete?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-medium text-muted">联系人</span>
        <Button size="sm" variant="ghost" isIconOnly aria-label="关闭" onClick={onClose}>
          <XIcon className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="flex flex-col items-center text-center">
          <PersonAvatar
            url={view.image}
            email={view.email}
            seed={view.name || view.email}
            className="size-20"
          />
          <h2 className="mt-3 text-lg font-semibold text-foreground">{view.name}</h2>
          {view.jobTitle && <p className="text-sm text-muted">{view.jobTitle}</p>}
        </div>

        <div className="mt-5 flex justify-center">
          <Button variant="primary" onClick={onWriteMail}>
            <MailIcon className="size-4" />
            写邮件
          </Button>
        </div>

        <div className="mt-6 divide-y divide-separator/60">
          <Field icon={<AtSignIcon className="size-4" />} label="邮箱" value={view.email} />
          {view.department && (
            <Field icon={<UsersIcon className="size-4" />} label="部门" value={view.department} />
          )}
          {view.company && (
            <Field icon={<BuildingIcon className="size-4" />} label="公司" value={view.company} />
          )}
          {view.phone && (
            <Field icon={<PhoneIcon className="size-4" />} label="电话" value={view.phone} />
          )}
          {view.mobile && (
            <Field icon={<PhoneIcon className="size-4" />} label="手机" value={view.mobile} />
          )}
          {view.extension && (
            <Field icon={<PhoneIcon className="size-4" />} label="分机" value={view.extension} />
          )}
          {view.location && (
            <Field icon={<BuildingIcon className="size-4" />} label="办公地点" value={view.location} />
          )}
          {view.notes && (
            <Field icon={<PencilIcon className="size-4" />} label="备注" value={view.notes} />
          )}
        </div>

        <MailHistory email={view.email} />
      </div>

      <div className="flex gap-2 border-t border-border px-4 py-3">
        {view.source === "org" && onAddToContacts && (
          <Button variant="outline" className="flex-1" onClick={onAddToContacts}>
            <PlusIcon className="size-4" />
            加为联系人
          </Button>
        )}
        {view.source === "personal" && (
          <>
            <Button variant="outline" className="flex-1" onClick={onEdit}>
              <PencilIcon className="size-4" />
              编辑
            </Button>
            <Button variant="ghost" isIconOnly aria-label="删除" onClick={onDelete}>
              <TrashIcon className="size-4 text-danger" />
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

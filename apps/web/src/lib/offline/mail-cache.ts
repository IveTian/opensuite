import { openDB, type DBSchema, type IDBPDatabase } from "idb";

/** 与 Mailbox 列表项结构一致（本地副本，避免循环依赖） */
export interface CachedMsgItem {
  id: string;
  direction: string;
  fromAddress: string | null;
  fromName: string | null;
  toAddresses: string[] | null;
  subject: string | null;
  snippet: string | null;
  isRead: boolean;
  isStarred: boolean;
  folder: string;
  receivedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  hasAttachments?: boolean;
  hasCalendarInvite?: boolean;
}

export interface CachedMsgDetail {
  id: string;
  addressId: string;
  fromAddress: string | null;
  fromName?: string | null;
  toAddresses: string[] | null;
  ccAddresses?: string[] | null;
  bccAddresses?: string[] | null;
  subject: string | null;
  bodyText: string | null;
  bodyHtml: string | null;
  isStarred: boolean;
  folder: string;
  direction: string;
  sizeBytes: number | null;
  receivedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  attachments: {
    id: string;
    filename: string | null;
    contentType: string | null;
    sizeBytes: number | null;
    contentId?: string | null;
  }[];
  calendarInvites?: {
    attachmentId: string;
    filename: string | null;
    method: string | null;
    uid: string | null;
    summary: string | null;
    description: string | null;
    location: string | null;
    startsAt: string | null;
    endsAt: string | null;
    allDay: boolean;
    organizer: string | null;
    myPartstat: "needs-action" | "accepted" | "declined" | "tentative" | null;
    eventId: string | null;
  }[];
}

interface MailCacheDb extends DBSchema {
  lists: {
    key: string;
    value: {
      key: string;
      items: CachedMsgItem[];
      total: number;
      cachedAt: number;
    };
  };
  messages: {
    key: string;
    value: {
      id: string;
      detail: CachedMsgDetail;
      cachedAt: number;
    };
  };
  meta: {
    key: string;
    value: { key: string; data: unknown; cachedAt: number };
  };
}

const DB_NAME = "mailflare-offline";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<MailCacheDb>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<MailCacheDb>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("lists", { keyPath: "key" });
        db.createObjectStore("messages", { keyPath: "id" });
        db.createObjectStore("meta", { keyPath: "key" });
      },
    });
  }
  return dbPromise;
}

function listKey(addressId: string, folder: string, page: number) {
  return `${addressId || "_"}:${folder}:${page}`;
}

export async function cacheMessageList(
  addressId: string,
  folder: string,
  page: number,
  items: CachedMsgItem[],
  total: number,
) {
  const db = await getDb();
  await db.put("lists", {
    key: listKey(addressId, folder, page),
    items,
    total,
    cachedAt: Date.now(),
  });
  // 列表项也写入 messages 索引，便于按 id 查找
  const tx = db.transaction("messages", "readwrite");
  for (const item of items) {
    const existing = await tx.store.get(item.id);
    if (!existing) {
      await tx.store.put({
        id: item.id,
        detail: listItemToMinimalDetail(item, addressId),
        cachedAt: Date.now(),
      });
    }
  }
  await tx.done;
}

function listItemToMinimalDetail(item: CachedMsgItem, addressId: string): CachedMsgDetail {
  return {
    id: item.id,
    addressId,
    fromAddress: item.fromAddress,
    fromName: item.fromName,
    toAddresses: item.toAddresses,
    subject: item.subject,
    bodyText: item.snippet,
    bodyHtml: null,
    isStarred: item.isStarred,
    folder: item.folder,
    direction: item.direction,
    sizeBytes: null,
    receivedAt: item.receivedAt,
    sentAt: item.sentAt,
    createdAt: item.createdAt,
    attachments: [],
  };
}

export async function getCachedMessageList(
  addressId: string,
  folder: string,
  page: number,
): Promise<{ items: CachedMsgItem[]; total: number; cachedAt: number } | null> {
  const db = await getDb();
  const row = await db.get("lists", listKey(addressId, folder, page));
  if (!row) return null;
  return { items: row.items, total: row.total, cachedAt: row.cachedAt };
}

export async function cacheMessageDetail(detail: CachedMsgDetail) {
  const db = await getDb();
  await db.put("messages", { id: detail.id, detail, cachedAt: Date.now() });
}

export async function getCachedMessageDetail(
  id: string,
): Promise<{ detail: CachedMsgDetail; cachedAt: number } | null> {
  const db = await getDb();
  const row = await db.get("messages", id);
  if (!row) return null;
  return { detail: row.detail, cachedAt: row.cachedAt };
}

export async function cacheMeta<T>(key: string, data: T) {
  const db = await getDb();
  await db.put("meta", { key, data, cachedAt: Date.now() });
}

export async function getCachedMeta<T>(key: string): Promise<{ data: T; cachedAt: number } | null> {
  const db = await getDb();
  const row = await db.get("meta", key);
  if (!row) return null;
  return { data: row.data as T, cachedAt: row.cachedAt };
}

/** 离线搜索：在当前账号已缓存的列表项中按关键词过滤 */
export async function searchCachedMessages(
  addressId: string,
  q: string,
  limit = 50,
): Promise<CachedMsgItem[]> {
  const db = await getDb();
  const prefix = `${addressId || "_"}:`;
  const all: CachedMsgItem[] = [];
  const keys = await db.getAllKeys("lists");
  for (const key of keys) {
    if (!String(key).startsWith(prefix)) continue;
    const row = await db.get("lists", key);
    if (row) all.push(...row.items);
  }
  const term = q.trim().toLowerCase();
  if (!term) return all.slice(0, limit);
  const seen = new Set<string>();
  const hits: CachedMsgItem[] = [];
  for (const m of all) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    const hay = [
      m.subject,
      m.snippet,
      m.fromAddress,
      m.fromName,
      ...(m.toAddresses ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (hay.includes(term)) hits.push(m);
    if (hits.length >= limit) break;
  }
  return hits;
}

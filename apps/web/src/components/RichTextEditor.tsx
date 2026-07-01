import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Color, TextStyle, FontFamily, FontSize } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  BoldIcon,
  CheckIcon,
  ChevronDownIcon,
  CodeIcon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListBulletIcon,
  ListOrderedIcon,
  PaletteIcon,
  QuoteIcon,
  RedoIcon,
  RemoveFormattingIcon,
  SearchIcon,
  StrikethroughIcon,
  UnderlineIcon,
  UndoIcon,
} from "./icons";
import {
  SYSTEM_FONTS,
  fetchGoogleFonts,
  loadGoogleFont,
  googleFontCss,
  primaryFontName,
  type FontOption,
} from "../lib/google-fonts";

export interface RichTextEditorProps {
  /** 初始 HTML 内容 */
  value?: string;
  /** 内容变化回调：html = editor.getHTML()，text = editor.getText() */
  onChange?: (html: string, text: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}

function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function RichTextEditor({
  value = "",
  onChange,
  placeholder = "撰写邮件正文…",
  autoFocus = false,
  className = "",
}: RichTextEditorProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const colorRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
        },
      }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image.configure({ inline: false, allowBase64: true }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    autofocus: autoFocus,
    editorProps: {
      attributes: { class: "tiptap", "aria-label": "邮件正文编辑器" },
      handlePaste(_view, event) {
        const files = Array.from(event.clipboardData?.items ?? [])
          .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
          .map((i) => i.getAsFile())
          .filter((f): f is File => !!f);
        if (!files.length) return false;
        void Promise.all(files.map(readImageFile)).then((urls) =>
          urls.forEach((src) => editorRef.current?.chain().focus().setImage({ src }).run()),
        );
        return true;
      },
      handleDrop(_view, event) {
        const files = Array.from(event.dataTransfer?.files ?? []).filter((f) =>
          f.type.startsWith("image/"),
        );
        if (!files.length) return false;
        event.preventDefault();
        void Promise.all(files.map(readImageFile)).then((urls) =>
          urls.forEach((src) => editorRef.current?.chain().focus().setImage({ src }).run()),
        );
        return true;
      },
    },
    onUpdate({ editor }) {
      onChange?.(editor.getHTML(), editor.getText());
    },
  });

  // 在闭包（handlePaste/handleDrop）中安全引用最新 editor
  editorRef.current = editor;

  // 当外部传入的初始 HTML 变化（回复/转发切换）时同步内容
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      underline: e?.isActive("underline") ?? false,
      strike: e?.isActive("strike") ?? false,
      h1: e?.isActive("heading", { level: 1 }) ?? false,
      h2: e?.isActive("heading", { level: 2 }) ?? false,
      h3: e?.isActive("heading", { level: 3 }) ?? false,
      fontSize: (e?.getAttributes("textStyle").fontSize as string) ?? "",
      fontFamily: (e?.getAttributes("textStyle").fontFamily as string) ?? "",
      bulletList: e?.isActive("bulletList") ?? false,
      orderedList: e?.isActive("orderedList") ?? false,
      blockquote: e?.isActive("blockquote") ?? false,
      codeBlock: e?.isActive("codeBlock") ?? false,
      link: e?.isActive("link") ?? false,
      canUndo: e?.can().undo() ?? false,
      canRedo: e?.can().redo() ?? false,
    }),
  });

  if (!editor) {
    return <div className={"min-h-48 rounded-xl bg-surface-secondary " + className} />;
  }

  function insertImages(files: FileList | null) {
    if (!files?.length) return;
    void Promise.all(Array.from(files).map(readImageFile)).then((urls) =>
      urls.forEach((src) => editor!.chain().focus().setImage({ src }).run()),
    );
  }

  function openLink() {
    setLinkUrl(editor!.getAttributes("link").href ?? "");
    setLinkOpen((v) => !v);
  }
  function applyLink() {
    const url = linkUrl.trim();
    if (!url) {
      editor!.chain().focus().extendMarkRange("link").unsetLink().run();
    } else {
      const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
      editor!.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkOpen(false);
  }

  return (
    <div
      className={
        "flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-field " + className
      }
    >
      {/* 工具栏 */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border px-1.5 py-1">
        <ToolBtn
          label="撤销"
          disabled={!state?.canUndo}
          onClick={() => editor.chain().focus().undo().run()}
        >
          <UndoIcon className="size-4" />
        </ToolBtn>
        <ToolBtn
          label="重做"
          disabled={!state?.canRedo}
          onClick={() => editor.chain().focus().redo().run()}
        >
          <RedoIcon className="size-4" />
        </ToolBtn>
        <Divider />
        {/* 段落 / 标题、字体、字号 */}
        <BlockDropdown editor={editor} h1={state?.h1} h2={state?.h2} h3={state?.h3} />
        <FontDropdown editor={editor} fontFamily={state?.fontFamily ?? ""} />
        <SizeDropdown editor={editor} fontSize={state?.fontSize ?? ""} />
        <Divider />
        <ToolBtn label="加粗" active={state?.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
          <BoldIcon className="size-4" />
        </ToolBtn>
        <ToolBtn label="斜体" active={state?.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <ItalicIcon className="size-4" />
        </ToolBtn>
        <ToolBtn
          label="下划线"
          active={state?.underline}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="size-4" />
        </ToolBtn>
        <ToolBtn
          label="删除线"
          active={state?.strike}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <StrikethroughIcon className="size-4" />
        </ToolBtn>
        <button
          type="button"
          aria-label="文字颜色"
          title="文字颜色"
          onClick={() => colorRef.current?.click()}
          className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-secondary hover:text-foreground"
        >
          <PaletteIcon className="size-4" />
        </button>
        <input
          ref={colorRef}
          type="color"
          className="sr-only"
          onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
        />
        <Divider />
        <ToolBtn
          label="无序列表"
          active={state?.bulletList}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          <ListBulletIcon className="size-4" />
        </ToolBtn>
        <ToolBtn
          label="有序列表"
          active={state?.orderedList}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          <ListOrderedIcon className="size-4" />
        </ToolBtn>
        <ToolBtn
          label="引用"
          active={state?.blockquote}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <QuoteIcon className="size-4" />
        </ToolBtn>
        <ToolBtn
          label="代码块"
          active={state?.codeBlock}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
        >
          <CodeIcon className="size-4" />
        </ToolBtn>
        <Divider />
        <div className="relative">
          <ToolBtn label="链接" active={state?.link} onClick={openLink}>
            <LinkIcon className="size-4" />
          </ToolBtn>
          {linkOpen && (
            <div className="absolute left-0 top-9 z-10 flex w-64 items-center gap-1.5 rounded-xl border border-border bg-surface p-2 shadow-overlay">
              <input
                autoFocus
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyLink();
                  }
                  if (e.key === "Escape") setLinkOpen(false);
                }}
                placeholder="https://…"
                className="min-w-0 flex-1 rounded-lg border border-border bg-field px-2 py-1 text-sm text-field-foreground focus:outline-none focus:ring-2 focus:ring-focus/40"
              />
              <button
                type="button"
                onClick={applyLink}
                className="shrink-0 rounded-lg bg-accent px-2 py-1 text-xs text-accent-foreground"
              >
                确定
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          aria-label="插入图片"
          title="插入图片"
          onClick={() => fileRef.current?.click()}
          className="flex size-8 items-center justify-center rounded-lg text-muted hover:bg-surface-secondary hover:text-foreground"
        >
          <ImageIcon className="size-4" />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            insertImages(e.target.files);
            e.target.value = "";
          }}
        />
        <Divider />
        <ToolBtn
          label="清除格式"
          onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}
        >
          <RemoveFormattingIcon className="size-4" />
        </ToolBtn>
      </div>

      {/* 内容区 */}
      <EditorContent editor={editor} className="min-h-0 flex-1 overflow-auto" />
    </div>
  );
}

function ToolBtn({
  children,
  label,
  active,
  disabled,
  onClick,
}: {
  children: ReactNode;
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={
        "flex size-8 items-center justify-center rounded-lg disabled:opacity-40 " +
        (active
          ? "bg-surface-secondary text-foreground"
          : "text-muted hover:bg-surface-secondary hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-0.5 h-5 w-px bg-separator" />;
}

/** 工具栏通用下拉：按钮显示当前值，点开弹出菜单，点击外部关闭 */
function Dropdown({
  label,
  title,
  minWidth,
  align = "left",
  children,
}: {
  label: ReactNode;
  title: string;
  minWidth?: number;
  align?: "left" | "right";
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        title={title}
        aria-label={title}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs text-muted hover:bg-surface-secondary hover:text-foreground"
      >
        {label}
        <ChevronDownIcon className="size-3.5 shrink-0" />
      </button>
      {open && (
        <div
          className={
            "absolute top-9 z-20 max-h-72 overflow-auto rounded-xl border border-border bg-surface p-1 shadow-overlay " +
            (align === "right" ? "right-0" : "left-0")
          }
          style={minWidth ? { minWidth } : undefined}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  active,
  onClick,
  children,
  style,
}: {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={
        "flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm " +
        (active ? "bg-surface-secondary text-foreground" : "text-foreground hover:bg-surface-secondary")
      }
      style={style}
    >
      {children}
    </button>
  );
}

const BLOCKS = [
  { key: "paragraph", label: "正文", cls: "text-sm" },
  { key: "h1", label: "标题 1", cls: "text-lg font-bold" },
  { key: "h2", label: "标题 2", cls: "text-base font-semibold" },
  { key: "h3", label: "标题 3", cls: "text-sm font-semibold" },
] as const;

/** 段落 / 标题级别下拉 */
function BlockDropdown({
  editor,
  h1,
  h2,
  h3,
}: {
  editor: Editor;
  h1?: boolean;
  h2?: boolean;
  h3?: boolean;
}) {
  const current = h1 ? "h1" : h2 ? "h2" : h3 ? "h3" : "paragraph";
  const currentLabel = BLOCKS.find((b) => b.key === current)?.label ?? "正文";
  function apply(key: string) {
    const c = editor.chain().focus();
    if (key === "paragraph") c.setParagraph().run();
    else c.setHeading({ level: Number(key.slice(1)) as 1 | 2 | 3 }).run();
  }
  return (
    <Dropdown
      title="段落样式"
      minWidth={132}
      label={<span className="w-12 truncate text-left">{currentLabel}</span>}
    >
      {(close) =>
        BLOCKS.map((b) => (
          <MenuItem
            key={b.key}
            active={b.key === current}
            onClick={() => {
              apply(b.key);
              close();
            }}
          >
            <span className={b.cls}>{b.label}</span>
            {b.key === current && <CheckIcon className="size-3.5 shrink-0 text-accent" />}
          </MenuItem>
        ))
      }
    </Dropdown>
  );
}

const SIZES = ["12", "14", "16", "18", "20", "24", "28", "32", "36"];

/** 字号下拉（写入 inline font-size，随邮件送达收件端） */
function SizeDropdown({ editor, fontSize }: { editor: Editor; fontSize: string }) {
  const cur = fontSize ? String(parseInt(fontSize, 10)) : "";
  return (
    <Dropdown
      title="字号"
      minWidth={96}
      label={<span className="w-8 truncate text-left tabular-nums">{cur || "字号"}</span>}
    >
      {(close) => (
        <>
          <MenuItem
            active={!cur}
            onClick={() => {
              editor.chain().focus().unsetFontSize().run();
              close();
            }}
          >
            默认
          </MenuItem>
          {SIZES.map((s) => (
            <MenuItem
              key={s}
              active={cur === s}
              onClick={() => {
                editor.chain().focus().setFontSize(`${s}px`).run();
                close();
              }}
            >
              <span className="tabular-nums">{s}</span>
              {cur === s && <CheckIcon className="size-3.5 shrink-0 text-accent" />}
            </MenuItem>
          ))}
        </>
      )}
    </Dropdown>
  );
}

/** 字体下拉：系统字体 + Google Fonts（带搜索），选中即加载 web 字体做预览 */
function FontDropdown({ editor, fontFamily }: { editor: Editor; fontFamily: string }) {
  const [fonts, setFonts] = useState<FontOption[]>([]);
  const [q, setQ] = useState("");
  const current = primaryFontName(fontFamily);

  useEffect(() => {
    let alive = true;
    void fetchGoogleFonts().then((f) => {
      if (alive) setFonts(f);
    });
    return () => {
      alive = false;
    };
  }, []);

  const kw = q.trim().toLowerCase();
  const filtered = (kw ? fonts.filter((f) => f.family.toLowerCase().includes(kw)) : fonts).slice(0, 80);

  return (
    <Dropdown
      title="字体"
      minWidth={208}
      label={<span className="w-16 truncate text-left">{current || "字体"}</span>}
    >
      {(close) => (
        <div className="flex flex-col">
          {/* 搜索框（滚动时固定在顶部） */}
          <div className="sticky top-0 z-10 mb-1 flex items-center gap-1.5 rounded-lg bg-surface-secondary px-2 py-1">
            <SearchIcon className="size-3.5 shrink-0 text-muted" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="搜索字体…"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted"
            />
          </div>
          {/* 系统安全字体 */}
          {SYSTEM_FONTS.map((sf) => (
            <MenuItem
              key={sf.label}
              active={sf.value ? primaryFontName(sf.value) === current : !current}
              onClick={() => {
                if (sf.value) editor.chain().focus().setFontFamily(sf.value).run();
                else editor.chain().focus().unsetFontFamily().run();
                close();
              }}
            >
              <span style={{ fontFamily: sf.value || undefined }} className="truncate">
                {sf.label}
              </span>
              {(sf.value ? primaryFontName(sf.value) === current : !current) && (
                <CheckIcon className="size-3.5 shrink-0 text-accent" />
              )}
            </MenuItem>
          ))}
          <div className="my-1 border-t border-border" />
          {/* Google Fonts */}
          {filtered.length === 0 && (
            <p className="px-2.5 py-2 text-xs text-muted">{fonts.length ? "无匹配字体" : "加载中…"}</p>
          )}
          {filtered.map((f) => (
            <MenuItem
              key={f.family}
              active={f.family === current}
              onClick={() => {
                loadGoogleFont(f.family);
                editor.chain().focus().setFontFamily(googleFontCss(f.family, f.category)).run();
                close();
              }}
            >
              <span className="truncate">{f.family}</span>
              {f.family === current && <CheckIcon className="size-3.5 shrink-0 text-accent" />}
            </MenuItem>
          ))}
        </div>
      )}
    </Dropdown>
  );
}

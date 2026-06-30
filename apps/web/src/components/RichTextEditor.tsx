import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Color, TextStyle } from "@tiptap/extension-text-style";
import TextAlign from "@tiptap/extension-text-align";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BoldIcon,
  CodeIcon,
  HeadingIcon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListBulletIcon,
  ListOrderedIcon,
  PaletteIcon,
  QuoteIcon,
  RedoIcon,
  RemoveFormattingIcon,
  StrikethroughIcon,
  UnderlineIcon,
  UndoIcon,
} from "./icons";

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
      h2: e?.isActive("heading", { level: 2 }) ?? false,
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
        <ToolBtn
          label="标题"
          active={state?.h2}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <HeadingIcon className="size-4" />
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

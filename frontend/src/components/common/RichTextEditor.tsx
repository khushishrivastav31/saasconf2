import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import { useState, useEffect, useCallback } from "react";

interface RichTextEditorProps {
  value: string | undefined;
  onChange: (html: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
  maxLength?: number;
}

const EMPTY_BODY = "<p></p>";

export default function RichTextEditor({
  value,
  onChange,
  placeholder = "",
  rows = 3,
  className = "",
  disabled = false,
  maxLength,
}: RichTextEditorProps) {
  const [charCount, setCharCount] = useState(0);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        code: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
    ],
    content: value || "",
    editable: !disabled,
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none focus:outline-none",
        style: `min-height: ${rows * 1.5}rem`,
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const textLen = ed.getText().length;
      setCharCount(textLen);
      onChange(html === EMPTY_BODY ? "" : html);
    },
    onCreate: ({ editor: ed }) => {
      setCharCount(ed.getText().length);
    },
  });

  // Sync external value changes (only when editor is not focused)
  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    const current = editor.getHTML();
    const normalized = value || "";
    if (current !== normalized && !(current === EMPTY_BODY && normalized === "")) {
      editor.commands.setContent(normalized, { emitUpdate: false });
    }
  }, [value, editor]);

  // Sync editable state
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [disabled, editor]);

  // Set placeholder via extension isn't included — we use CSS placeholder via data attr
  useEffect(() => {
    if (!editor) return;
    const el = editor.view.dom.querySelector("p.is-editor-empty");
    if (el) {
      el.setAttribute("data-placeholder", placeholder);
    }
  }, [editor, placeholder]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href;
    const url = window.prompt("URL", previousUrl || "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      className={`border border-gray-300 rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-primary-500 focus-within:border-primary-500 ${disabled ? "opacity-50 bg-gray-100" : "bg-white"} ${className}`}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1 border-b border-gray-200 bg-gray-50">
        <ToolbarButton
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={disabled}
          title="Bold"
        >
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={disabled}
          title="Italic"
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("underline")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          disabled={disabled}
          title="Underline"
        >
          <span className="underline">U</span>
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton
          active={editor.isActive("bulletList")}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={disabled}
          title="Bullet List"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive("orderedList")}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={disabled}
          title="Numbered List"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 6h13M8 12h13M8 18h13M3 6v1m0 4v1m0 4v1" />
          </svg>
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 mx-1" />
        <ToolbarButton
          active={editor.isActive("link")}
          onClick={setLink}
          disabled={disabled}
          title="Link"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </ToolbarButton>
      </div>

      {/* Editor area */}
      <div className="px-3 py-2">
        <EditorContent editor={editor} />
      </div>

      {/* Character counter */}
      {maxLength != null && (
        <div className="flex justify-end px-3 py-1 border-t border-gray-200 bg-gray-50">
          <span
            className={`text-xs ${
              charCount > maxLength
                ? "text-red-600 font-medium"
                : charCount > maxLength * 0.9
                  ? "text-yellow-600"
                  : "text-gray-400"
            }`}
          >
            {charCount} / {maxLength}
          </span>
        </div>
      )}
    </div>
  );
}

function ToolbarButton({
  active,
  onClick,
  disabled,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  disabled: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`p-1.5 rounded text-sm leading-none transition-colors ${
        active
          ? "bg-primary-100 text-primary-700"
          : "text-gray-600 hover:bg-gray-200 hover:text-gray-900"
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

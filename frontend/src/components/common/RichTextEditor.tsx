import { useEditor, EditorContent, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { ResizableImage } from './ResizableImage';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import FontFamily from '@tiptap/extension-font-family';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Youtube from '@tiptap/extension-youtube';
import { useState, useEffect, useCallback, useRef } from 'react';

// Custom extension for font size
const FontSize = Extension.create({
  name: 'fontSize',
  addOptions() {
    return {
      types: ['textStyle'],
    };
  },
  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize?.replace(/['"]+/g, ''),
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return { style: `font-size: ${attributes.fontSize}` };
            },
          },
        },
      },
    ];
  },
  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }) => {
          return chain().setMark('textStyle', { fontSize }).run();
        },
      unsetFontSize:
        () =>
        ({ chain }) => {
          return chain().setMark('textStyle', { fontSize: null }).removeEmptyTextStyle().run();
        },
    };
  },
});

interface RichTextEditorProps {
  value: string | undefined;
  onChange: (html: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  disabled?: boolean;
  maxLength?: number;
}

const EMPTY_BODY = '<p></p>';

export default function RichTextEditor({
  value,
  onChange,
  placeholder = '',
  rows = 3,
  className = '',
  disabled = false,
  maxLength,
}: RichTextEditorProps) {
  const [charCount, setCharCount] = useState(0);
  const [, setSelectionUpdate] = useState(0); // Force re-render on selection change

  const editorRef = useRef<ReturnType<typeof useEditor>>(null) as React.MutableRefObject<
    ReturnType<typeof useEditor>
  >;

  const handleImageFile = useCallback((file: File) => {
    const ed = editorRef.current;
    if (!ed) return false;
    if (!file.type.startsWith('image/')) return false;
    const maxSize = 5 * 1024 * 1024; // 5 MB
    if (file.size > maxSize) {
      alert('Image is too large. Maximum size is 5 MB.');
      return true;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const src = reader.result as string;
      ed.chain().focus().setImage({ src }).run();
    };
    reader.readAsDataURL(file);
    return true;
  }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable link/underline from StarterKit v3.19+ — we add them separately with custom config
        link: false,
        underline: false,
        heading: {
          levels: [1, 2, 3],
        },
        codeBlock: {
          HTMLAttributes: {
            class: 'bg-gray-100 rounded p-2 font-mono text-sm',
          },
        },
        code: {
          HTMLAttributes: {
            class: 'bg-gray-100 rounded px-1 font-mono text-sm',
          },
        },
        blockquote: {
          HTMLAttributes: {
            class: 'border-l-4 border-gray-300 pl-4 italic',
          },
        },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      }),
      ResizableImage.configure({
        inline: false,
        allowBase64: true,
        HTMLAttributes: {
          class: 'max-w-full h-auto rounded',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph', 'image'],
      }),
      Highlight.configure({
        multicolor: true,
      }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Subscript,
      Superscript,
      Table.configure({
        resizable: true,
        cellMinWidth: 50,
        allowTableNodeSelection: true,
        HTMLAttributes: {
          class: 'border-collapse border border-gray-300',
        },
      }),
      TableRow,
      TableCell.configure({
        HTMLAttributes: {
          class: 'border border-gray-300 p-2',
        },
      }),
      TableHeader.configure({
        HTMLAttributes: {
          class: 'border border-gray-300 p-2 bg-gray-100 font-bold',
        },
      }),
      TaskList.configure({
        HTMLAttributes: {
          class: 'list-none pl-0',
        },
      }),
      TaskItem.configure({
        nested: true,
        HTMLAttributes: {
          class: 'flex items-start gap-2',
        },
      }),
      Youtube.configure({
        HTMLAttributes: {
          class: 'w-full aspect-video rounded',
        },
      }),
    ],
    content: value || '',
    editable: !disabled,
    editorProps: {
      attributes: {
        class: 'prose prose-sm max-w-none focus:outline-none',
        style: `min-height: ${rows * 1.5}rem`,
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (moved || !event.dataTransfer?.files?.length) return false;
        const file = event.dataTransfer.files[0];
        if (!file?.type.startsWith('image/')) return false;
        event.preventDefault();
        handleImageFile(file);
        return true;
      },
      handlePaste: (_view, event) => {
        const items = event.clipboardData?.items;
        if (!items) return false;
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) {
              event.preventDefault();
              handleImageFile(file);
              return true;
            }
          }
        }
        return false;
      },
    },
    onUpdate: ({ editor: ed }) => {
      const html = ed.getHTML();
      const textLen = ed.getText().length;
      setCharCount(textLen);
      onChange(html === EMPTY_BODY ? '' : html);
    },
    onSelectionUpdate: () => {
      // Force re-render to update toolbar button states (e.g., merge cells)
      setSelectionUpdate((n) => n + 1);
    },
  });

  // Keep ref in sync so drop/paste handlers can access the editor
  editorRef.current = editor;

  // Initialize char count after mount (avoids state update before mount warning)
  useEffect(() => {
    if (!editor) return;
    try {
      setCharCount(editor.getText().length);
    } catch {
      // Editor view not yet mounted
    }
  }, [editor]);

  // Sync external value changes (only when editor is not focused)
  useEffect(() => {
    if (!editor) return;
    try {
      if (editor.isFocused) return;
      const current = editor.getHTML();
      const normalized = value || '';
      if (current !== normalized && !(current === EMPTY_BODY && normalized === '')) {
        editor.commands.setContent(normalized, { emitUpdate: false });
      }
    } catch {
      // Editor view not yet mounted
    }
  }, [value, editor]);

  // Sync editable state
  useEffect(() => {
    if (!editor) return;
    try {
      editor.setEditable(!disabled);
    } catch {
      // Editor view not yet mounted
    }
  }, [disabled, editor]);

  // Set placeholder via CSS data attribute
  useEffect(() => {
    if (!editor) return;
    try {
      const el = editor.view.dom.querySelector('p.is-editor-empty');
      if (el) {
        el.setAttribute('data-placeholder', placeholder);
      }
    } catch {
      // Editor view not yet mounted
    }
  }, [editor, placeholder]);

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl || 'https://');
    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    const url = window.prompt('Image URL', 'https://');
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const addYoutubeVideo = useCallback(() => {
    if (!editor) return;
    const url = window.prompt('YouTube URL', 'https://www.youtube.com/watch?v=');
    if (url) {
      editor.commands.setYoutubeVideo({ src: url });
    }
  }, [editor]);

  const insertTable = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  }, [editor]);

  const setTextColor = useCallback(
    (color: string) => {
      if (!editor) return;
      editor.chain().focus().setColor(color).run();
    },
    [editor]
  );

  const setHighlightColor = useCallback(
    (color: string) => {
      if (!editor) return;
      editor.chain().focus().toggleHighlight({ color }).run();
    },
    [editor]
  );

  const clearFormatting = useCallback(() => {
    if (!editor) return;
    editor.chain().focus().clearNodes().unsetAllMarks().run();
  }, [editor]);

  if (!editor) return null;

  return (
    <div
      className={`border border-gray-300 rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-primary-500 focus-within:border-primary-500 ${disabled ? 'opacity-50 bg-gray-100' : 'bg-white'} ${className}`}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-gray-200 bg-gray-50">
        {/* Undo/Redo */}
        <ToolbarButton
          active={false}
          onClick={() => editor.chain().focus().undo().run()}
          disabled={disabled || !editor.can().undo()}
          title="Undo"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
            />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={false}
          onClick={() => editor.chain().focus().redo().run()}
          disabled={disabled || !editor.can().redo()}
          title="Redo"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6"
            />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={false}
          onClick={clearFormatting}
          disabled={disabled}
          title="Clear Formatting"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* Font Family */}
        <select
          value={editor.getAttributes('textStyle').fontFamily || ''}
          onChange={(e) => {
            if (e.target.value) {
              editor.chain().focus().setFontFamily(e.target.value).run();
            } else {
              editor.chain().focus().unsetFontFamily().run();
            }
          }}
          disabled={disabled}
          className="h-7 text-xs border border-gray-300 rounded px-1 bg-white disabled:opacity-50"
          title="Font Family"
        >
          <option value="">Default</option>
          <option value="Arial, sans-serif">Arial</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="Times New Roman, serif">Times</option>
          <option value="Courier New, monospace">Courier</option>
          <option value="Verdana, sans-serif">Verdana</option>
        </select>

        {/* Font Size */}
        <select
          value={editor.getAttributes('textStyle').fontSize || ''}
          onChange={(e) => {
            if (e.target.value) {
              (
                editor.chain().focus() as ReturnType<typeof editor.chain> & {
                  setFontSize: (size: string) => ReturnType<typeof editor.chain>;
                }
              )
                .setFontSize(e.target.value)
                .run();
            } else {
              (
                editor.chain().focus() as ReturnType<typeof editor.chain> & {
                  unsetFontSize: () => ReturnType<typeof editor.chain>;
                }
              )
                .unsetFontSize()
                .run();
            }
          }}
          disabled={disabled}
          className="h-7 text-xs border border-gray-300 rounded px-1 bg-white disabled:opacity-50"
          title="Font Size"
        >
          <option value="">Default</option>
          <option value="12px">Small</option>
          <option value="16px">Normal</option>
          <option value="20px">Large</option>
          <option value="24px">X-Large</option>
          <option value="32px">XX-Large</option>
        </select>
        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* Headings */}
        <ToolbarButton
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          disabled={disabled}
          title="Heading 1"
        >
          <span className="font-bold text-xs">H1</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          disabled={disabled}
          title="Heading 2"
        >
          <span className="font-bold text-xs">H2</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          disabled={disabled}
          title="Heading 3"
        >
          <span className="font-bold text-xs">H3</span>
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* Basic formatting */}
        <ToolbarButton
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={disabled}
          title="Bold"
        >
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={disabled}
          title="Italic"
        >
          <span className="italic">I</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          disabled={disabled}
          title="Underline"
        >
          <span className="underline">U</span>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={disabled}
          title="Strikethrough"
        >
          <span className="line-through">S</span>
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* Subscript/Superscript */}
        <ToolbarButton
          active={editor.isActive('subscript')}
          onClick={() => editor.chain().focus().toggleSubscript().run()}
          disabled={disabled}
          title="Subscript"
        >
          <span className="text-xs">
            X<sub>2</sub>
          </span>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('superscript')}
          onClick={() => editor.chain().focus().toggleSuperscript().run()}
          disabled={disabled}
          title="Superscript"
        >
          <span className="text-xs">
            X<sup>2</sup>
          </span>
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* Text Color */}
        <ColorPicker
          onChange={setTextColor}
          disabled={disabled}
          title="Text Color"
          icon={
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 3v1m0 16v1m8-9h1M3 12H2m15.364-6.364l.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 8a4 4 0 100 8 4 4 0 000-8z"
              />
            </svg>
          }
        />
        {/* Highlight */}
        <ColorPicker
          onChange={setHighlightColor}
          disabled={disabled}
          title="Highlight"
          icon={
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
              />
            </svg>
          }
        />
        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* Lists */}
        <ToolbarButton
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={disabled}
          title="Bullet List"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"
            />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={disabled}
          title="Numbered List"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 6h13M8 12h13M8 18h13M3 6v1m0 4v1m0 4v1"
            />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('taskList')}
          onClick={() => editor.chain().focus().toggleTaskList().run()}
          disabled={disabled}
          title="Task List"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={false}
          onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
          disabled={disabled || !editor.can().sinkListItem('listItem')}
          title="Indent (Nested List)"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={false}
          onClick={() => editor.chain().focus().liftListItem('listItem').run()}
          disabled={disabled || !editor.can().liftListItem('listItem')}
          title="Outdent (Lift List)"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7M19 19l-7-7 7-7" />
          </svg>
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* Block elements */}
        <ToolbarButton
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          disabled={disabled}
          title="Blockquote"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
            />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          disabled={disabled}
          title="Code Block"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
            />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={false}
          onClick={() => editor.chain().focus().setHorizontalRule().run()}
          disabled={disabled}
          title="Horizontal Rule"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
          </svg>
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* Links & Media */}
        <ToolbarButton
          active={editor.isActive('link')}
          onClick={setLink}
          disabled={disabled}
          title="Link"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        </ToolbarButton>
        <ToolbarButton active={false} onClick={addImage} disabled={disabled} title="Insert Image">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={false}
          onClick={addYoutubeVideo}
          disabled={disabled}
          title="YouTube Video"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </ToolbarButton>
        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* Table */}
        <ToolbarButton
          active={editor.isActive('table')}
          onClick={insertTable}
          disabled={disabled}
          title="Insert Table"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
            />
          </svg>
        </ToolbarButton>
        {editor.isActive('table') && (
          <>
            <ToolbarButton
              active={false}
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              disabled={disabled}
              title="Add Column"
            >
              <span className="text-xs">+Col</span>
            </ToolbarButton>
            <ToolbarButton
              active={false}
              onClick={() => editor.chain().focus().deleteColumn().run()}
              disabled={disabled}
              title="Delete Column"
            >
              <span className="text-xs">-Col</span>
            </ToolbarButton>
            <ToolbarButton
              active={false}
              onClick={() => editor.chain().focus().addRowAfter().run()}
              disabled={disabled}
              title="Add Row"
            >
              <span className="text-xs">+Row</span>
            </ToolbarButton>
            <ToolbarButton
              active={false}
              onClick={() => editor.chain().focus().deleteRow().run()}
              disabled={disabled}
              title="Delete Row"
            >
              <span className="text-xs">-Row</span>
            </ToolbarButton>
            <ToolbarButton
              active={false}
              onClick={() => editor.chain().focus().mergeCells().run()}
              disabled={disabled || !editor.can().mergeCells()}
              title="Merge Cells (Click and drag across cells to select, then click here)"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12" />
              </svg>
            </ToolbarButton>
            <ToolbarButton
              active={false}
              onClick={() => editor.chain().focus().splitCell().run()}
              disabled={disabled || !editor.can().splitCell()}
              title="Split Cell"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 6h16M4 12h6m4 0h6M4 18h16"
                />
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v3m0 6v3" />
              </svg>
            </ToolbarButton>
            <ToolbarButton
              active={false}
              onClick={() => editor.chain().focus().toggleHeaderCell().run()}
              disabled={disabled}
              title="Toggle Header Cell"
            >
              <span className="text-xs font-bold">TH</span>
            </ToolbarButton>
            <ToolbarButton
              active={false}
              onClick={() => editor.chain().focus().deleteTable().run()}
              disabled={disabled}
              title="Delete Table"
            >
              <svg
                className="w-4 h-4 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </ToolbarButton>
          </>
        )}
        <div className="w-px h-5 bg-gray-300 mx-1" />

        {/* Alignment */}
        <ToolbarButton
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          disabled={disabled}
          title="Align Left"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h12M3 18h18" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          disabled={disabled}
          title="Align Center"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M6 12h12M3 18h18" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          disabled={disabled}
          title="Align Right"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M9 12h12M3 18h18" />
          </svg>
        </ToolbarButton>
        <ToolbarButton
          active={editor.isActive({ textAlign: 'justify' })}
          onClick={() => editor.chain().focus().setTextAlign('justify').run()}
          disabled={disabled}
          title="Justify"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
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
                ? 'text-red-600 font-medium'
                : charCount > maxLength * 0.9
                  ? 'text-yellow-600'
                  : 'text-gray-400'
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
          ? 'bg-primary-100 text-primary-700'
          : 'text-gray-600 hover:bg-gray-200 hover:text-gray-900'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

const COLOR_PRESETS = [
  '#000000',
  '#374151',
  '#6B7280',
  '#EF4444',
  '#F59E0B',
  '#10B981',
  '#3B82F6',
  '#6366F1',
  '#8B5CF6',
  '#EC4899',
  '#FFFFFF',
  '#F3F4F6',
];

function ColorPicker({
  onChange,
  disabled,
  title,
  icon,
}: {
  onChange: (color: string) => void;
  disabled: boolean;
  title: string;
  icon: React.ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        title={title}
        className={`p-1.5 rounded text-sm leading-none transition-colors text-gray-600 hover:bg-gray-200 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {icon}
      </button>
      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute top-full left-0 mt-1 p-2 bg-white rounded-lg shadow-lg border border-gray-200 z-20 grid grid-cols-6 gap-1">
            {COLOR_PRESETS.map((color) => (
              <button
                key={color}
                type="button"
                onClick={() => {
                  onChange(color);
                  setIsOpen(false);
                }}
                className="w-6 h-6 rounded border border-gray-200 hover:scale-110 transition-transform"
                style={{ backgroundColor: color }}
                title={color}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

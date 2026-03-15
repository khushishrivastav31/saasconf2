/**
 * Compact Rich Text Editor
 *
 * Stripped-down tiptap editor with only Bold, Italic, Underline, and Link.
 * Used for help text fields where full rich text is overkill.
 */
import { useEditor, EditorContent } from '@tiptap/react';
import { useEffect, useCallback, useRef } from 'react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';

interface MiniRichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const EMPTY_BODY = '<p></p>';

export default function MiniRichTextEditor({
  value,
  onChange,
  placeholder = '',
  disabled = false,
}: MiniRichTextEditorProps) {
  const isInternalChange = useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        link: false,
        underline: false,
        heading: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer' },
      }),
    ],
    content: value || '',
    editable: !disabled,
    editorProps: {
      attributes: {
        class: 'outline-none min-h-[2rem] px-3 py-1.5 text-sm text-gray-900 dark:text-gray-100',
      },
    },
    onUpdate: ({ editor: ed }) => {
      isInternalChange.current = true;
      const html = ed.getHTML();
      onChange(html === EMPTY_BODY ? '' : html);
    },
  });

  // Sync external value changes
  useEffect(() => {
    if (!editor || isInternalChange.current) {
      isInternalChange.current = false;
      return;
    }
    const current = editor.getHTML();
    const incoming = value || EMPTY_BODY;
    if (current !== incoming) {
      editor.commands.setContent(incoming);
    }
  }, [value, editor]);

  const toggleLink = useCallback(() => {
    if (!editor) return;
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    const url = prompt('Enter URL:');
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  if (!editor) return null;

  return (
    <div className="border border-gray-200 dark:border-gray-600 rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500">
      {/* Mini toolbar */}
      <div className="flex items-center gap-0.5 px-1.5 py-1 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900">
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          className={`p-1 rounded text-xs font-bold ${
            editor.isActive('bold')
              ? 'bg-primary-100 text-primary-700'
              : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
          title="Bold"
        >
          B
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          className={`p-1 rounded text-xs italic ${
            editor.isActive('italic')
              ? 'bg-primary-100 text-primary-700'
              : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
          title="Italic"
        >
          I
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          className={`p-1 rounded text-xs underline ${
            editor.isActive('underline')
              ? 'bg-primary-100 text-primary-700'
              : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
          title="Underline"
        >
          U
        </button>
        <div className="w-px h-4 bg-gray-300 dark:bg-gray-600 mx-0.5" />
        <button
          type="button"
          onClick={toggleLink}
          className={`p-1 rounded ${
            editor.isActive('link')
              ? 'bg-primary-100 text-primary-700'
              : 'text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
          title="Link"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
            />
          </svg>
        </button>
      </div>
      {/* Editor area */}
      <div className="dark:bg-gray-800">
        <EditorContent editor={editor} />
        {!value && placeholder && (
          <div className="pointer-events-none absolute px-3 py-1.5 text-xs text-gray-400 dark:text-gray-500">
            {/* Placeholder handled by editor empty state */}
          </div>
        )}
      </div>
    </div>
  );
}

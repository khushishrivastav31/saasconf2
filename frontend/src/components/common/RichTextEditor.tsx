import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { getEditorExtensions } from './richtext/extensions';
import EditorToolbar from './richtext/EditorToolbar';

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

  const editorRef = useRef<Editor | null>(null);

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
    // Prevent editor.view access before DOM is mounted (tiptap v3.19+)
    immediatelyRender: false,
    extensions: getEditorExtensions(),
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
    onUpdate: ({ editor: ed, transaction }) => {
      const html = ed.getHTML();
      const textLen = ed.getText().length;
      setCharCount(textLen);
      // Only notify parent of content changes from actual edits, not from
      // programmatic updates like setEditable or setContent
      if (transaction.docChanged) {
        onChange(html === EMPTY_BODY ? '' : html);
      }
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
      editor.setEditable(!disabled, false);
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

  // ---- Toolbar callbacks ----

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
      if (color) {
        editor.chain().focus().setColor(color).run();
      } else {
        editor.chain().focus().unsetColor().run();
      }
    },
    [editor]
  );

  const setHighlightColor = useCallback(
    (color: string) => {
      if (!editor) return;
      if (color) {
        editor.chain().focus().toggleHighlight({ color }).run();
      } else {
        editor.chain().focus().unsetHighlight().run();
      }
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
      className={`border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden focus-within:ring-1 focus-within:ring-primary-500 focus-within:border-primary-500 ${disabled ? 'opacity-50 bg-gray-100 dark:bg-gray-800' : 'bg-white dark:bg-gray-800'} ${className}`}
    >
      {/* Toolbar */}
      <EditorToolbar
        editor={editor}
        disabled={disabled}
        onSetLink={setLink}
        onAddImage={addImage}
        onAddYoutubeVideo={addYoutubeVideo}
        onInsertTable={insertTable}
        onSetTextColor={setTextColor}
        onSetHighlightColor={setHighlightColor}
        onClearFormatting={clearFormatting}
      />

      {/* Editor area */}
      <div className="px-3 py-2">
        <EditorContent editor={editor} />
      </div>

      {/* Character counter */}
      {maxLength != null && (
        <div className="flex justify-end px-3 py-1 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <span
            className={`text-xs ${
              charCount > maxLength
                ? 'text-red-600 font-medium'
                : charCount > maxLength * 0.9
                  ? 'text-yellow-600'
                  : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            {charCount} / {maxLength}
          </span>
        </div>
      )}
    </div>
  );
}

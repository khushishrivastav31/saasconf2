import { useEditor, EditorContent, type Editor } from '@tiptap/react';
import { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { getEditorExtensions } from './richtext/extensions';
import EditorToolbar from './richtext/EditorToolbar';

/** Imperative API exposed via ref so parents can drive the editor
 *  (e.g. insert a placeholder token at the current cursor position). */
export interface RichTextEditorHandle {
  /** Insert plain text at the current cursor; focuses the editor. */
  insertText: (text: string) => void;
  /** Move focus into the editor without changing content. */
  focus: () => void;
}

interface PromptDialogState {
  open: boolean;
  title: string;
  defaultValue: string;
  onSubmit: (value: string) => void;
}

function PromptDialog({ state, onClose }: { state: PromptDialogState; onClose: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(state.defaultValue);

  useEffect(() => {
    if (state.open) {
      setValue(state.defaultValue);
      setTimeout(() => inputRef.current?.select(), 0);
    }
  }, [state.open, state.defaultValue]);

  if (!state.open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    state.onSubmit(value);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-5 w-full max-w-sm mx-4"
      >
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
          {state.title}
        </h3>
        <input
          ref={inputRef}
          type="url"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          placeholder="https://"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-3 py-1.5 text-sm text-white bg-primary-600 rounded-md hover:bg-primary-700"
          >
            OK
          </button>
        </div>
      </form>
    </div>
  );
}

interface RichTextEditorProps {
  value: string | undefined;
  onChange: (html: string) => void;
  placeholder?: string;
  rows?: number;
  /** Maximum visible rows before the editor scrolls (default: 15) */
  maxRows?: number;
  className?: string;
  disabled?: boolean;
  minLength?: number;
  maxLength?: number;
  /** Extra CSS classes for the ProseMirror editor element (e.g. 'prose-tight') */
  editorClassName?: string;
  /** Show a toggle button to switch between visual editing and raw HTML source */
  showHtmlToggle?: boolean;
}

const EMPTY_BODY = '<p></p>';

function RichTextEditor(
  {
    value,
    onChange,
    placeholder = '',
    rows = 3,
    maxRows = 15,
    className = '',
    disabled = false,
    minLength,
    maxLength,
    editorClassName = '',
    showHtmlToggle = false,
  }: RichTextEditorProps,
  ref: React.Ref<RichTextEditorHandle>
) {
  const [charCount, setCharCount] = useState(0);
  const [isSourceMode, setIsSourceMode] = useState(false);
  const [sourceHtml, setSourceHtml] = useState('');
  const [, setSelectionUpdate] = useState(0); // Force re-render on selection change
  const defaultPromptState: PromptDialogState = {
    open: false,
    title: '',
    defaultValue: '',
    onSubmit: () => {},
  };
  const [promptState, setPromptState] = useState<PromptDialogState>(defaultPromptState);
  const closePrompt = useCallback(() => setPromptState((s) => ({ ...s, open: false })), []);

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
        class: `prose prose-sm max-w-none focus:outline-none ${editorClassName}`.trim(),
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

  useImperativeHandle(
    ref,
    (): RichTextEditorHandle => ({
      insertText: (text: string) => {
        editorRef.current?.chain().focus().insertContent(text).run();
      },
      focus: () => {
        editorRef.current?.commands.focus();
      },
    }),
    []
  );

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

  // ---- HTML source toggle ----

  const handleSourceChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const html = e.target.value;
      setSourceHtml(html);
      onChange(html);
    },
    [onChange]
  );

  const toggleSourceMode = useCallback(() => {
    if (!editor) return;
    if (!isSourceMode) {
      const current = editor.getHTML();
      setSourceHtml(current === EMPTY_BODY ? '' : current);
    } else {
      editor.commands.setContent(sourceHtml || '', { emitUpdate: false });
    }
    setIsSourceMode((prev) => !prev);
  }, [editor, isSourceMode, sourceHtml]);

  // ---- Toolbar callbacks ----

  const setLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href;
    setPromptState({
      open: true,
      title: 'Enter URL',
      defaultValue: previousUrl || 'https://',
      onSubmit: (url: string) => {
        if (url === '') {
          editor.chain().focus().extendMarkRange('link').unsetLink().run();
          return;
        }
        try {
          const parsed = new URL(url);
          if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) return;
        } catch {
          return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
      },
    });
  }, [editor]);

  const addImage = useCallback(() => {
    if (!editor) return;
    setPromptState({
      open: true,
      title: 'Image URL',
      defaultValue: 'https://',
      onSubmit: (url: string) => {
        if (!url) return;
        try {
          const parsed = new URL(url);
          if (!['https:', 'http:'].includes(parsed.protocol)) return;
        } catch {
          return;
        }
        editor.chain().focus().setImage({ src: url }).run();
      },
    });
  }, [editor]);

  const addYoutubeVideo = useCallback(() => {
    if (!editor) return;
    setPromptState({
      open: true,
      title: 'YouTube URL',
      defaultValue: 'https://www.youtube.com/watch?v=',
      onSubmit: (url: string) => {
        if (!url) return;
        try {
          const parsed = new URL(url);
          if (
            !['www.youtube.com', 'youtube.com', 'youtu.be', 'm.youtube.com'].includes(
              parsed.hostname
            )
          )
            return;
        } catch {
          return;
        }
        editor.commands.setYoutubeVideo({ src: url });
      },
    });
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
      {/* Toolbar — hidden in source mode */}
      {!isSourceMode && (
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
      )}

      {/* HTML source toggle button */}
      {showHtmlToggle && (
        <div className="flex justify-end px-2 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <button
            type="button"
            onClick={toggleSourceMode}
            disabled={disabled}
            className="text-xs px-2 py-0.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 font-mono"
          >
            {isSourceMode ? 'Visual' : '<> HTML'}
          </button>
        </div>
      )}

      {/* Editor area */}
      {isSourceMode ? (
        <textarea
          value={sourceHtml}
          onChange={handleSourceChange}
          disabled={disabled}
          spellCheck={false}
          className="w-full px-3 py-2 font-mono text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none resize-none"
          style={{ minHeight: `${rows * 1.5}rem`, maxHeight: `${maxRows * 1.5}rem` }}
        />
      ) : (
        <div className="px-3 py-2 overflow-y-auto" style={{ maxHeight: `${maxRows * 1.5}rem` }}>
          <EditorContent editor={editor} />
        </div>
      )}

      {/* Character counter */}
      {(minLength != null || maxLength != null) && (
        <div className="flex justify-end px-3 py-1 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <span
            className={`text-xs ${
              maxLength != null && charCount > maxLength
                ? 'text-red-600 font-medium'
                : minLength != null && charCount > 0 && charCount < minLength
                  ? 'text-red-600 font-medium'
                  : maxLength != null && charCount > maxLength * 0.9
                    ? 'text-yellow-600'
                    : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            {charCount}
            {minLength != null && <span> (min {minLength})</span>}
            {maxLength != null && <span> / {maxLength}</span>}
          </span>
        </div>
      )}

      <PromptDialog state={promptState} onClose={closePrompt} />
    </div>
  );
}

export default forwardRef<RichTextEditorHandle, RichTextEditorProps>(RichTextEditor);

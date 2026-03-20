import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';

interface EditorToolbarProps {
  editor: Editor;
  disabled: boolean;
  onSetLink: () => void;
  onAddImage: () => void;
  onAddYoutubeVideo: () => void;
  onInsertTable: () => void;
  onSetTextColor: (color: string) => void;
  onSetHighlightColor: (color: string) => void;
  onClearFormatting: () => void;
}

export default function EditorToolbar({
  editor,
  disabled,
  onSetLink,
  onAddImage,
  onAddYoutubeVideo,
  onInsertTable,
  onSetTextColor,
  onSetHighlightColor,
  onClearFormatting,
}: EditorToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
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
        onClick={onClearFormatting}
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
      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

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
        className="h-7 text-xs border border-gray-300 dark:border-gray-600 rounded px-1 bg-white dark:bg-gray-800 dark:text-gray-300 disabled:opacity-50"
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
              editor.chain().focus() as ReturnType<Editor['chain']> & {
                setFontSize: (size: string) => ReturnType<Editor['chain']>;
              }
            )
              .setFontSize(e.target.value)
              .run();
          } else {
            (
              editor.chain().focus() as ReturnType<Editor['chain']> & {
                unsetFontSize: () => ReturnType<Editor['chain']>;
              }
            )
              .unsetFontSize()
              .run();
          }
        }}
        disabled={disabled}
        className="h-7 text-xs border border-gray-300 dark:border-gray-600 rounded px-1 bg-white dark:bg-gray-800 dark:text-gray-300 disabled:opacity-50"
        title="Font Size"
      >
        <option value="">Default</option>
        <option value="6px">XXX-Small</option>
        <option value="8px">XX-Small</option>
        <option value="10px">X-Small</option>
        <option value="12px">Small</option>
        <option value="16px">Normal</option>
        <option value="20px">Large</option>
        <option value="24px">X-Large</option>
        <option value="32px">XX-Large</option>
        <option value="40px">XXX-Large</option>
      </select>
      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

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
      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

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
      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

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
      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

      {/* Text Color */}
      <ColorPicker
        onChange={onSetTextColor}
        disabled={disabled}
        title="Text Color"
        activeColor={editor.getAttributes('textStyle').color}
        mode="text"
      />
      {/* Highlight */}
      <ColorPicker
        onChange={onSetHighlightColor}
        disabled={disabled}
        title="Highlight Color"
        activeColor={
          editor.isActive('highlight') ? editor.getAttributes('highlight').color : undefined
        }
        mode="highlight"
      />
      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

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
      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

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
      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

      {/* Links & Media */}
      <ToolbarButton
        active={editor.isActive('link')}
        onClick={onSetLink}
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
      <ToolbarButton active={false} onClick={onAddImage} disabled={disabled} title="Insert Image">
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
        onClick={onAddYoutubeVideo}
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
      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

      {/* Table */}
      <ToolbarButton
        active={editor.isActive('table')}
        onClick={onInsertTable}
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
          {/* Table Border Color */}
          <TableBorderColorPicker editor={editor} disabled={disabled} />
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
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h6m4 0h6M4 18h16" />
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
      <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

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
  );
}

// ---------------------------------------------------------------------------
// Internal helper components
// ---------------------------------------------------------------------------

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
      aria-label={title}
      className={`p-1.5 rounded text-sm leading-none transition-colors ${
        active
          ? 'bg-primary-100 text-primary-700'
          : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
      } disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}

const COLOR_GROUPS = [
  {
    label: 'Grayscale',
    colors: [
      { value: '#000000', name: 'Black' },
      { value: '#374151', name: 'Dark Gray' },
      { value: '#6B7280', name: 'Gray' },
      { value: '#9CA3AF', name: 'Medium Gray' },
      { value: '#D1D5DB', name: 'Light Gray' },
      { value: '#F3F4F6', name: 'Near White' },
    ],
  },
  {
    label: 'Colors',
    colors: [
      { value: '#DC2626', name: 'Red' },
      { value: '#EA580C', name: 'Orange' },
      { value: '#D97706', name: 'Amber' },
      { value: '#16A34A', name: 'Green' },
      { value: '#2563EB', name: 'Blue' },
      { value: '#7C3AED', name: 'Purple' },
      { value: '#DB2777', name: 'Pink' },
      { value: '#0891B2', name: 'Cyan' },
      { value: '#4F46E5', name: 'Indigo' },
      { value: '#059669', name: 'Emerald' },
      { value: '#CA8A04', name: 'Yellow' },
      { value: '#E11D48', name: 'Rose' },
    ],
  },
];

function ColorPicker({
  onChange,
  disabled,
  title,
  activeColor,
  mode,
}: {
  onChange: (color: string) => void;
  disabled: boolean;
  title: string;
  activeColor?: string;
  mode: 'text' | 'highlight';
}) {
  const [isOpen, setIsOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const displayColor = activeColor || (mode === 'text' ? '#000000' : '#FBBF24');

  // Compute dropdown position from button ref
  const getDropdownStyle = (): React.CSSProperties => {
    if (!btnRef.current) return { top: 0, left: 0 };
    const rect = btnRef.current.getBoundingClientRect();
    return {
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left,
      zIndex: 50,
    };
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        title={title}
        className={`p-1 rounded text-sm leading-none transition-colors ${
          activeColor
            ? 'bg-primary-50 text-primary-700'
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {mode === 'text' ? (
          <div className="w-5 h-5 flex flex-col items-center justify-center">
            <span
              className="text-xs font-bold leading-none"
              style={{ color: activeColor || 'currentColor' }}
            >
              A
            </span>
            <div className="w-4 h-1 rounded-sm mt-0.5" style={{ backgroundColor: displayColor }} />
          </div>
        ) : (
          <div className="w-5 h-5 flex flex-col items-center justify-center">
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 2L3 19h4l1.5-4h7l1.5 4h4L12 2z"
              />
            </svg>
            <div className="w-4 h-1 rounded-sm mt-0.5" style={{ backgroundColor: displayColor }} />
          </div>
        )}
      </button>
      {isOpen &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <div
              style={getDropdownStyle()}
              className="p-2.5 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
            >
              <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                {title}
              </div>
              {COLOR_GROUPS.map((group) => (
                <div key={group.label} className="mb-2 last:mb-0">
                  <div className="text-[10px] text-gray-400 dark:text-gray-500 mb-1">
                    {group.label}
                  </div>
                  <div className="grid grid-cols-6 gap-1">
                    {group.colors.map((color) => (
                      <button
                        key={color.value}
                        type="button"
                        onClick={() => {
                          onChange(color.value);
                          setIsOpen(false);
                        }}
                        className={`w-6 h-6 rounded border transition-transform hover:scale-110 ${
                          activeColor === color.value
                            ? 'border-primary-500 ring-1 ring-primary-500'
                            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                        }`}
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>
              ))}
              <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    onChange('');
                    setIsOpen(false);
                  }}
                  className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 py-1 px-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                    />
                  </svg>
                  Remove
                </button>
                <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 py-1 px-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                  Custom
                  <input
                    type="color"
                    value={activeColor || (mode === 'text' ? '#000000' : '#FBBF24')}
                    onChange={(e) => {
                      onChange(e.target.value);
                    }}
                    className="w-5 h-5 rounded border border-gray-300 dark:border-gray-600 cursor-pointer p-0"
                  />
                </label>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table border color picker — applies border color to ALL cells in the
// current table so the entire grid gets a uniform border color.
// ---------------------------------------------------------------------------

const BORDER_COLORS = [
  { value: '', name: 'Default (gray)' },
  { value: '#000000', name: 'Black' },
  { value: '#D1D5DB', name: 'Light Gray' },
  { value: '#9CA3AF', name: 'Gray' },
  { value: '#2563EB', name: 'Blue' },
  { value: '#DC2626', name: 'Red' },
  { value: '#16A34A', name: 'Green' },
  { value: '#D97706', name: 'Amber' },
  { value: '#7C3AED', name: 'Purple' },
  { value: '#FFFFFF', name: 'White (hidden)' },
];

function TableBorderColorPicker({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);

  // Read current border color from the cell under the cursor
  const cellAttrs = editor.getAttributes('tableCell');
  const headerAttrs = editor.getAttributes('tableHeader');
  const activeColor = cellAttrs.borderColor || headerAttrs.borderColor || '';

  const applyBorderColor = (color: string) => {
    const { state } = editor.view;
    const { selection } = state;

    // Walk up from cursor to find the enclosing table
    const $from = selection.$from;
    let tableStart: number | null = null;
    let tableEnd: number | null = null;
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type.name === 'table') {
        tableStart = $from.before(depth);
        tableEnd = $from.after(depth);
        break;
      }
    }
    if (tableStart === null || tableEnd === null) return;

    // Set borderColor on every cell and header in the table
    const tr = state.tr;
    state.doc.nodesBetween(tableStart, tableEnd, (node, pos) => {
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        tr.setNodeMarkup(pos, undefined, {
          ...node.attrs,
          borderColor: color || null,
        });
      }
    });
    editor.view.dispatch(tr);
    setIsOpen(false);
  };

  const getDropdownStyle = (): React.CSSProperties => {
    if (!btnRef.current) return { top: 0, left: 0 };
    const rect = btnRef.current.getBoundingClientRect();
    return { position: 'fixed', top: rect.bottom + 4, left: rect.left, zIndex: 50 };
  };

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={disabled}
        title="Table Border Color"
        className={`p-1 rounded text-sm leading-none transition-colors ${
          activeColor
            ? 'bg-primary-50 text-primary-700'
            : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <div className="w-5 h-5 flex flex-col items-center justify-center">
          <svg
            className="w-3.5 h-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
          >
            <rect x="3" y="3" width="18" height="18" rx="1" />
            <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
          </svg>
          <div
            className="w-4 h-1 rounded-sm mt-0.5"
            style={{ backgroundColor: activeColor || '#D1D5DB' }}
          />
        </div>
      </button>
      {isOpen &&
        createPortal(
          <>
            <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />
            <div
              style={getDropdownStyle()}
              className="p-2.5 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
            >
              <div className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">
                Table Border Color
              </div>
              <div className="grid grid-cols-5 gap-1">
                {BORDER_COLORS.map((color) => (
                  <button
                    key={color.value || 'default'}
                    type="button"
                    onClick={() => applyBorderColor(color.value)}
                    className={`w-6 h-6 rounded border transition-transform hover:scale-110 ${
                      activeColor === color.value
                        ? 'border-primary-500 ring-1 ring-primary-500'
                        : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                    }`}
                    style={{
                      backgroundColor: color.value || '#D1D5DB',
                      ...(color.value === '#FFFFFF'
                        ? {
                            backgroundImage:
                              'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)',
                            backgroundSize: '6px 6px',
                          }
                        : {}),
                    }}
                    title={color.name}
                  />
                ))}
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 mt-2 pt-2">
                <label className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 py-1 px-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer">
                  Custom
                  <input
                    type="color"
                    value={activeColor || '#D1D5DB'}
                    onChange={(e) => applyBorderColor(e.target.value)}
                    className="w-5 h-5 rounded border border-gray-300 dark:border-gray-600 cursor-pointer p-0"
                  />
                </label>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}

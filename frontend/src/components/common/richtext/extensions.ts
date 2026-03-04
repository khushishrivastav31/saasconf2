import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import { ResizableImage } from '../ResizableImage';
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

// Extend TableCell with a borderColor attribute so users can style table borders.
// The value is persisted as an inline style and carries through to PDF generation.
const CustomTableCell = TableCell.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      borderColor: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.style.borderColor || element.getAttribute('data-border-color') || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.borderColor) return {};
          return { style: `border-color: ${attributes.borderColor}` };
        },
      },
    };
  },
});

const CustomTableHeader = TableHeader.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      borderColor: {
        default: null,
        parseHTML: (element: HTMLElement) =>
          element.style.borderColor || element.getAttribute('data-border-color') || null,
        renderHTML: (attributes: Record<string, unknown>) => {
          if (!attributes.borderColor) return {};
          return { style: `border-color: ${attributes.borderColor}` };
        },
      },
    };
  },
});
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Youtube from '@tiptap/extension-youtube';
import FontSize from './FontSizeExtension';
import type { Extensions } from '@tiptap/react';

/**
 * Returns the full list of configured tiptap extensions used by the
 * RichTextEditor.  Extracted so the main component file stays focused on
 * wiring rather than configuration.
 */
export function getEditorExtensions(): Extensions {
  return [
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
    CustomTableCell.configure({
      HTMLAttributes: {
        class: 'border border-gray-300 p-2',
      },
    }),
    CustomTableHeader.configure({
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
  ];
}

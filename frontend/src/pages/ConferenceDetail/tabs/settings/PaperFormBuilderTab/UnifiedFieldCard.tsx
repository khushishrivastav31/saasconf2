import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type {
  PaperFormField,
  PaperFormVariantField,
  BuiltinFieldConfig,
} from '../../../../../types';

// Unified field that can be either built-in or custom
export interface UnifiedField {
  id: string; // For built-in: "builtin_<key>", for custom: actual UUID
  type: 'builtin' | 'custom';
  key: string; // field_key for custom, key for builtin
  label: string;
  display_order: number;
  is_visible: boolean;
  is_required: boolean;
  is_visible_to_reviewer: boolean;
  alwaysRequired?: boolean;
  // Only for custom fields
  customField?: PaperFormField | PaperFormVariantField;
  // Only for builtin fields
  builtinConfig?: BuiltinFieldConfig;
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: 'Text',
  textarea: 'Text Area',
  richtext: 'Rich Text',
  checkbox: 'Checkbox',
  checkbox_group: 'Checkbox Group',
  dropdown: 'Dropdown',
  file_upload: 'File Upload',
};

const FIELD_TYPE_COLORS: Record<string, string> = {
  text: 'bg-blue-100 text-blue-800',
  textarea: 'bg-green-100 text-green-800',
  richtext: 'bg-purple-100 text-purple-800',
  checkbox: 'bg-yellow-100 text-yellow-800',
  checkbox_group: 'bg-orange-100 text-orange-800',
  dropdown: 'bg-pink-100 text-pink-800',
  file_upload: 'bg-cyan-100 text-cyan-800',
};

interface UnifiedFieldCardProps {
  field: UnifiedField;
  isSelected: boolean;
  onSelect: () => void;
  onDelete?: () => void;
  onToggleVisible?: (visible: boolean) => void;
  onToggleRequired?: (required: boolean) => void;
  onToggleReviewerVisible?: (visible: boolean) => void;
  isAdmin: boolean;
  isDragging?: boolean;
}

export default function UnifiedFieldCard({
  field,
  isSelected,
  onSelect,
  onDelete,
  onToggleVisible,
  onToggleRequired,
  onToggleReviewerVisible,
  isAdmin,
  isDragging = false,
}: UnifiedFieldCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: field.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.5 : 1,
  };

  const isBuiltin = field.type === 'builtin';
  const fieldType = field.customField?.field_type;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
        ${
          isSelected
            ? 'border-primary-500 bg-primary-50 ring-2 ring-primary-200'
            : field.is_visible
              ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
              : 'border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900'
        }
        ${isDragging ? 'shadow-lg' : ''}
      `}
      onClick={onSelect}
    >
      {/* Drag Handle */}
      {isAdmin && (
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing touch-none"
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8h16M4 16h16"
            />
          </svg>
        </button>
      )}

      {/* Field Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={`text-sm font-medium ${
              field.is_visible
                ? 'text-gray-900 dark:text-gray-100'
                : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            {field.label}
          </span>
          {field.is_required && <span className="text-red-500 text-sm">*</span>}
          {!field.is_visible && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400">
              Hidden
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{field.key}</p>
      </div>

      {/* Type Badge */}
      {isBuiltin ? (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
          Built-in
        </span>
      ) : (
        <>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
            Custom
          </span>
          {fieldType && (
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                FIELD_TYPE_COLORS[fieldType] ||
                'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
              }`}
            >
              {FIELD_TYPE_LABELS[fieldType] || fieldType}
            </span>
          )}
        </>
      )}

      {/* Always Required Badge */}
      {field.alwaysRequired && (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
          Always Required
        </span>
      )}

      {/* Quick toggles for built-in fields */}
      {isBuiltin && isAdmin && (
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={field.is_visible}
              onChange={(e) => onToggleVisible?.(e.target.checked)}
              disabled={field.alwaysRequired}
              className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 disabled:opacity-50 h-3.5 w-3.5"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">Visible for speaker</span>
          </label>
          <label className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={field.is_required}
              onChange={(e) => onToggleRequired?.(e.target.checked)}
              disabled={field.alwaysRequired}
              className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 disabled:opacity-50 h-3.5 w-3.5"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">Required for speaker</span>
          </label>
          <label className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={field.is_visible_to_reviewer}
              onChange={(e) => onToggleReviewerVisible?.(e.target.checked)}
              disabled={field.alwaysRequired}
              className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500 disabled:opacity-50 h-3.5 w-3.5"
            />
            <span className="text-xs text-gray-500 dark:text-gray-400">Visible for reviewer</span>
          </label>
        </div>
      )}

      {/* Delete Button (only for custom fields) */}
      {!isBuiltin && isAdmin && onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex-shrink-0 text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
          title="Delete field"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PaperFormField } from "../../../../../types";

interface FieldCardProps {
  field: PaperFormField;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  isAdmin: boolean;
  isDragging?: boolean;
}

const FIELD_TYPE_LABELS: Record<string, string> = {
  text: "Text",
  textarea: "Text Area",
  richtext: "Rich Text",
  checkbox: "Checkbox",
  checkbox_group: "Checkbox Group",
  dropdown: "Dropdown",
  file_upload: "File Upload",
};

const FIELD_TYPE_COLORS: Record<string, string> = {
  text: "bg-blue-100 text-blue-800",
  textarea: "bg-green-100 text-green-800",
  richtext: "bg-purple-100 text-purple-800",
  checkbox: "bg-yellow-100 text-yellow-800",
  checkbox_group: "bg-orange-100 text-orange-800",
  dropdown: "bg-pink-100 text-pink-800",
  file_upload: "bg-cyan-100 text-cyan-800",
};

export default function FieldCard({
  field,
  isSelected,
  onSelect,
  onDelete,
  isAdmin,
  isDragging = false,
}: FieldCardProps) {
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

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`
        flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
        ${isSelected
          ? "border-primary-500 bg-primary-50 ring-2 ring-primary-200"
          : "border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50"}
        ${isDragging ? "shadow-lg" : ""}
      `}
      onClick={onSelect}
    >
      {/* Drag Handle */}
      {isAdmin && (
        <button
          {...attributes}
          {...listeners}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
          onClick={(e) => e.stopPropagation()}
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </button>
      )}

      {/* Field Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900 truncate">
            {field.label}
          </span>
          {field.is_required && (
            <span className="text-red-500 text-sm">*</span>
          )}
          {!field.is_visible && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
              Hidden
            </span>
          )}
        </div>
        <p className="text-xs text-gray-500 truncate">{field.field_key}</p>
      </div>

      {/* Custom Badge */}
      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-700">
        Custom
      </span>

      {/* Field Type Badge */}
      <span
        className={`
          inline-flex items-center px-2 py-0.5 rounded text-xs font-medium
          ${FIELD_TYPE_COLORS[field.field_type] || "bg-gray-100 text-gray-800"}
        `}
      >
        {FIELD_TYPE_LABELS[field.field_type] || field.field_type}
      </span>

      {/* Delete Button */}
      {isAdmin && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors"
          title="Delete field"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}
    </div>
  );
}

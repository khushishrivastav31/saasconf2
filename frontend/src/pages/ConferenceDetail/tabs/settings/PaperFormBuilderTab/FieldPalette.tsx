import type { PaperFormFieldType } from "../../../../../types";

interface FieldPaletteProps {
  onAddField: (fieldType: PaperFormFieldType) => void;
  isAdmin: boolean;
}

const FIELD_TYPES: {
  type: PaperFormFieldType;
  label: string;
  icon: React.ReactNode;
  description: string;
}[] = [
  {
    type: "text",
    label: "Text Field",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
    description: "Single-line text input",
  },
  {
    type: "textarea",
    label: "Text Area",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    ),
    description: "Multi-line text input",
  },
  {
    type: "richtext",
    label: "Rich Text",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    description: "Formatted text with styling",
  },
  {
    type: "checkbox",
    label: "Checkbox",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    description: "Single yes/no option",
  },
  {
    type: "checkbox_group",
    label: "Checkbox Group",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
    description: "Multiple checkable options",
  },
  {
    type: "dropdown",
    label: "Dropdown",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
      </svg>
    ),
    description: "Single selection from list",
  },
  {
    type: "file_upload",
    label: "File Upload",
    icon: (
      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
      </svg>
    ),
    description: "File attachment field",
  },
];

export default function FieldPalette({ onAddField, isAdmin }: FieldPaletteProps) {
  if (!isAdmin) {
    return (
      <div className="bg-gray-50 shadow rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-2">Field Types</h3>
        <p className="text-xs text-gray-500">
          You need admin access to add custom fields
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-4">
      <h3 className="text-sm font-medium text-gray-900 mb-2">Add Field</h3>
      <p className="text-xs text-gray-500 mb-4">
        Click to add a new field to the form
      </p>
      <div className="space-y-2">
        {FIELD_TYPES.map((ft) => (
          <button
            key={ft.type}
            onClick={() => onAddField(ft.type)}
            className="w-full flex items-center gap-3 p-3 text-left rounded-lg border border-gray-200 hover:border-primary-300 hover:bg-primary-50 transition-colors group"
          >
            <div className="flex-shrink-0 text-gray-400 group-hover:text-primary-600">
              {ft.icon}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 group-hover:text-primary-900">
                {ft.label}
              </p>
              <p className="text-xs text-gray-500 truncate">{ft.description}</p>
            </div>
            <svg
              className="h-4 w-4 text-gray-400 group-hover:text-primary-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}

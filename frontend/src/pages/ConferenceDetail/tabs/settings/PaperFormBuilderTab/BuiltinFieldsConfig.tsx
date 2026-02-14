import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { BuiltinFieldConfig } from "../../../../../types";

interface BuiltinFieldDef {
  key: string;
  label: string;
  alwaysRequired?: boolean;
}

interface BuiltinFieldsConfigProps {
  builtinFields: BuiltinFieldDef[];
  config: Record<string, BuiltinFieldConfig>;
  onChange: (fieldKey: string, config: BuiltinFieldConfig) => void;
  onReorder: (orderedKeys: string[]) => void;
  isAdmin: boolean;
}

interface SortableBuiltinFieldProps {
  field: BuiltinFieldDef;
  fieldConfig: BuiltinFieldConfig;
  onChange: (config: BuiltinFieldConfig) => void;
  isAdmin: boolean;
  isDragging?: boolean;
}

function SortableBuiltinField({
  field,
  fieldConfig,
  onChange,
  isAdmin,
  isDragging = false,
}: SortableBuiltinFieldProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({ id: field.key });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSortableDragging ? 0.5 : 1,
  };

  const isRequired = field.alwaysRequired || fieldConfig.required;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center justify-between p-3 rounded-lg border ${
        fieldConfig.visible
          ? "border-gray-200 bg-white"
          : "border-gray-100 bg-gray-50"
      } ${isDragging ? "shadow-lg" : ""}`}
    >
      <div className="flex items-center gap-3">
        {/* Drag Handle */}
        {isAdmin && (
          <button
            {...attributes}
            {...listeners}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
            </svg>
          </button>
        )}
        <span
          className={`text-sm font-medium ${
            fieldConfig.visible ? "text-gray-900" : "text-gray-400"
          }`}
        >
          {field.label}
        </span>
        {/* Built-in Badge */}
        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
          Built-in
        </span>
        {field.alwaysRequired && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
            Always Required
          </span>
        )}
      </div>
      <div className="flex items-center gap-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={fieldConfig.visible}
            onChange={(e) =>
              onChange({
                ...fieldConfig,
                visible: e.target.checked,
              })
            }
            disabled={!isAdmin || field.alwaysRequired}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-50"
          />
          <span className="text-xs text-gray-600">Visible</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={isRequired}
            onChange={(e) =>
              onChange({
                ...fieldConfig,
                required: e.target.checked,
              })
            }
            disabled={!isAdmin || field.alwaysRequired}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 disabled:opacity-50"
          />
          <span className="text-xs text-gray-600">Required</span>
        </label>
      </div>
    </div>
  );
}

export default function BuiltinFieldsConfig({
  builtinFields,
  config,
  onChange,
  onReorder,
  isAdmin,
}: BuiltinFieldsConfigProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Sort fields by display_order from config, falling back to original order
  const sortedFields = useMemo(() => {
    return [...builtinFields].sort((a, b) => {
      const orderA = config[a.key]?.display_order ?? builtinFields.findIndex((f) => f.key === a.key);
      const orderB = config[b.key]?.display_order ?? builtinFields.findIndex((f) => f.key === b.key);
      return orderA - orderB;
    });
  }, [builtinFields, config]);

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = sortedFields.findIndex((f) => f.key === active.id);
    const newIndex = sortedFields.findIndex((f) => f.key === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Compute new order
    const reordered = [...sortedFields];
    const [moved] = reordered.splice(oldIndex, 1);
    reordered.splice(newIndex, 0, moved);

    onReorder(reordered.map((f) => f.key));
  };

  const activeField = activeId ? sortedFields.find((f) => f.key === activeId) : null;

  return (
    <div>
      <h4 className="text-sm font-medium text-gray-700 mb-3">
        Built-in Fields
      </h4>
      <p className="text-xs text-gray-500 mb-4">
        Configure visibility, requirements, and order for standard paper fields
      </p>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sortedFields.map((f) => f.key)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {sortedFields.map((bf) => {
              const fieldConfig = config[bf.key] || { visible: true, required: false };
              return (
                <SortableBuiltinField
                  key={bf.key}
                  field={bf}
                  fieldConfig={fieldConfig}
                  onChange={(newConfig) => onChange(bf.key, newConfig)}
                  isAdmin={isAdmin}
                />
              );
            })}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeField ? (
            <SortableBuiltinField
              field={activeField}
              fieldConfig={config[activeField.key] || { visible: true, required: false }}
              onChange={() => {}}
              isAdmin={isAdmin}
              isDragging
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

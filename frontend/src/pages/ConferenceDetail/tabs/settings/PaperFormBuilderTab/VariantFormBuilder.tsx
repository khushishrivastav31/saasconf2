import { useState, useEffect, useMemo, useCallback, useRef, useContext } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
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
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import api from '../../../../../config/api';
import { queryKeys } from '../../../../../config/queryKeys';
import type {
  PaperFormVariant,
  PaperFormVariantField,
  PaperFormFieldUpdate,
  PaperFormFieldCreate,
  PaperFormVariantUpdate,
  BuiltinFieldConfig,
  PaperFormFieldType,
} from '../../../../../types';
import { parseApiError } from '../../../../../utils/apiError';
import { SuccessBanner, ErrorBanner } from '../../../../../components/common/ErrorBanner';
import ConfirmDialog from '../../../../../components/ConfirmDialog';
import { DirtyContext } from '../../../DirtyContext';
import FieldPalette from './FieldPalette';
import FieldPropertyEditor from './FieldPropertyEditor';
import UnifiedFieldCard, { type UnifiedField } from './UnifiedFieldCard';
import { BUILTIN_FIELDS_DEF } from './constants';
import { BuiltinHelpTextPanel, FormPreview } from './shared';

interface VariantFormBuilderProps {
  conferenceId: string;
  variant: PaperFormVariant;
  isAdmin: boolean;
  onBack: () => void;
}

function VariantFormBuilder({ conferenceId, variant, isAdmin, onBack }: VariantFormBuilderProps) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [deleteFieldTarget, setDeleteFieldTarget] = useState<UnifiedField | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Track unsaved changes across panels
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showUnsavedDialog, setShowUnsavedDialog] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  // Report to parent ConferenceDetail tab guard
  const reportDirty = useContext(DirtyContext);
  useEffect(() => {
    reportDirty(hasUnsavedChanges);
    return () => reportDirty(false);
  }, [hasUnsavedChanges, reportDirty]);

  // Warn on browser close/reload with unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  // Editable variant metadata
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(variant.name);
  const [descValue, setDescValue] = useState(variant.description || '');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const basePath = `/conferences/${conferenceId}/paper-form-schema/variants/${variant.id}`;

  const invalidateSchema = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.settings.paperFormSchema(conferenceId),
    });
  }, [queryClient, conferenceId]);

  // --- Unified Fields --------------------------------------------------------

  const unifiedFields = useMemo((): UnifiedField[] => {
    const builtinConfig = variant.builtin_fields_config || {};
    const builtinCount = BUILTIN_FIELDS_DEF.length;

    const builtinUnified: UnifiedField[] = BUILTIN_FIELDS_DEF.map((bf, defaultIdx) => {
      const config = builtinConfig[bf.key] || { visible: true, required: false };
      return {
        id: `builtin_${bf.key}`,
        type: 'builtin' as const,
        key: bf.key,
        label: bf.label,
        display_order: config.display_order ?? defaultIdx,
        is_visible: config.visible ?? true,
        is_required: bf.alwaysRequired || (config.required ?? false),
        alwaysRequired: bf.alwaysRequired,
        builtinConfig: config,
      };
    });

    const customUnified: UnifiedField[] = variant.fields.map((f) => {
      const unifiedOrderingInUse = Object.values(builtinConfig).some(
        (c) => c.display_order !== undefined && c.display_order !== null
      );
      const order = unifiedOrderingInUse ? f.display_order : f.display_order + builtinCount;

      return {
        id: f.id,
        type: 'custom' as const,
        key: f.field_key,
        label: f.label,
        display_order: order,
        is_visible: f.is_visible,
        is_required: f.is_required,
        customField: f,
      };
    });

    return [...builtinUnified, ...customUnified].sort((a, b) => a.display_order - b.display_order);
  }, [variant]);

  const selectedCustomField = useMemo((): PaperFormVariantField | null => {
    if (!selectedFieldId || selectedFieldId.startsWith('builtin_')) return null;
    return variant.fields.find((f) => f.id === selectedFieldId) ?? null;
  }, [selectedFieldId, variant]);

  const selectedBuiltinKey = useMemo(() => {
    if (!selectedFieldId?.startsWith('builtin_')) return null;
    return selectedFieldId.replace('builtin_', '');
  }, [selectedFieldId]);

  // --- Mutations -------------------------------------------------------------

  const updateVariantMutation = useMutation({
    mutationFn: async (data: PaperFormVariantUpdate) => {
      await api.put(basePath, data);
    },
    onSuccess: () => {
      invalidateSchema();
      setSuccessMessage('Variant updated');
      setError(null);
    },
    onError: (err: unknown) => setError(parseApiError(err)),
  });

  const createFieldMutation = useMutation({
    mutationFn: async (data: PaperFormFieldCreate) => {
      const res = await api.post<PaperFormVariantField>(`${basePath}/fields`, data);
      return res.data;
    },
    onSuccess: (newField) => {
      invalidateSchema();
      setSuccessMessage('Field created');
      setSelectedFieldId(newField.id);
      setError(null);
    },
    onError: (err: unknown) => setError(parseApiError(err)),
  });

  const updateFieldMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: PaperFormFieldUpdate }) => {
      await api.put(`${basePath}/fields/${id}`, data);
    },
    onSuccess: () => {
      invalidateSchema();
      setSuccessMessage('Field updated');
      setError(null);
    },
    onError: (err: unknown) => setError(parseApiError(err)),
  });

  const deleteFieldMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`${basePath}/fields/${id}`);
    },
    onSuccess: () => {
      invalidateSchema();
      setSuccessMessage('Field deleted');
      setSelectedFieldId(null);
      setError(null);
    },
    onError: (err: unknown) => setError(parseApiError(err)),
  });

  // --- Handlers --------------------------------------------------------------

  const handleBuiltinFieldToggle = (
    fieldKey: string,
    property: 'visible' | 'required',
    value: boolean
  ) => {
    const existing = variant.builtin_fields_config[fieldKey] || { visible: true, required: false };
    const newConfig = {
      ...variant.builtin_fields_config,
      [fieldKey]: { ...existing, [property]: value },
    };
    updateVariantMutation.mutate({ builtin_fields_config: newConfig });
  };

  const handleBuiltinFieldHelpText = (
    fieldKey: string,
    helpText: string,
    options?: { value: string; label: string }[] | null
  ) => {
    const existing = variant.builtin_fields_config[fieldKey] || { visible: true, required: false };
    const updated = {
      ...existing,
      help_text: helpText || null,
      ...(options !== undefined ? { options: options && options.length > 0 ? options : null } : {}),
    };
    const newConfig = {
      ...variant.builtin_fields_config,
      [fieldKey]: updated,
    };
    updateVariantMutation.mutate({ builtin_fields_config: newConfig });
  };

  const handleAddField = (fieldType: PaperFormFieldType) => {
    const nextOrder = unifiedFields.length;
    const fieldKey = `custom_${fieldType}_${Date.now()}`;
    const defaultOptions =
      fieldType === 'dropdown' || fieldType === 'checkbox_group'
        ? [{ value: 'option1', label: 'Option 1' }]
        : undefined;

    createFieldMutation.mutate({
      field_key: fieldKey,
      field_type: fieldType,
      label: `New ${fieldType.replace('_', ' ')} field`,
      display_order: nextOrder,
      is_visible: true,
      is_required: false,
      options: defaultOptions,
    });
  };

  const handleUpdateField = (id: string, data: PaperFormFieldUpdate) => {
    updateFieldMutation.mutate({ id, data });
  };

  const handleDeleteField = (field: UnifiedField) => {
    if (field.type === 'builtin') return;
    setDeleteFieldTarget(field);
  };

  const confirmDeleteField = () => {
    if (!deleteFieldTarget || deleteFieldTarget.type === 'builtin') return;
    deleteFieldMutation.mutate(deleteFieldTarget.id);
    setDeleteFieldTarget(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) return;

    const oldIndex = unifiedFields.findIndex((f) => f.id === active.id);
    const newIndex = unifiedFields.findIndex((f) => f.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(unifiedFields, oldIndex, newIndex);

    const newBuiltinConfig: Record<string, BuiltinFieldConfig> = {};
    const customFieldOrders: { id: string; display_order: number }[] = [];
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    reordered.forEach((field, idx) => {
      if (field.type === 'builtin' || field.id.startsWith('builtin_')) {
        const key = field.key;
        const existing = variant.builtin_fields_config[key] || { visible: true, required: false };
        newBuiltinConfig[key] = { ...existing, display_order: idx };
      } else if (uuidRegex.test(field.id)) {
        customFieldOrders.push({ id: field.id, display_order: idx });
      }
    });

    BUILTIN_FIELDS_DEF.forEach((bf) => {
      if (!newBuiltinConfig[bf.key]) {
        newBuiltinConfig[bf.key] = variant.builtin_fields_config[bf.key] || {
          visible: true,
          required: false,
        };
      }
    });

    const doReorder = async () => {
      const promises: Promise<unknown>[] = [];
      promises.push(api.put(basePath, { builtin_fields_config: newBuiltinConfig }));
      if (customFieldOrders.length > 0) {
        promises.push(api.put(`${basePath}/fields/reorder`, { fields: customFieldOrders }));
      }
      try {
        await Promise.all(promises);
        invalidateSchema();
        setSuccessMessage('Field order updated');
      } catch (err) {
        setError(parseApiError(err));
      }
    };
    doReorder();
  };

  const guardUnsaved = useCallback(
    (action: () => void) => {
      if (hasUnsavedChanges) {
        pendingActionRef.current = action;
        setShowUnsavedDialog(true);
      } else {
        action();
      }
    },
    [hasUnsavedChanges]
  );

  const confirmDiscard = () => {
    setHasUnsavedChanges(false);
    setShowUnsavedDialog(false);
    pendingActionRef.current?.();
    pendingActionRef.current = null;
  };

  const cancelDiscard = () => {
    setShowUnsavedDialog(false);
    pendingActionRef.current = null;
  };

  const handleSaveName = () => {
    const trimmed = nameValue.trim();
    if (!trimmed) return;
    updateVariantMutation.mutate({
      name: trimmed,
      description: descValue.trim() || undefined,
    });
    setEditingName(false);
  };

  // --- Render ----------------------------------------------------------------

  const activeField = activeId ? unifiedFields.find((f) => f.id === activeId) : null;

  return (
    <div className="h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => guardUnsaved(onBack)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back
          </button>
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {showPreview ? 'Edit Mode' : 'Preview'}
          </button>
          <div>
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm dark:bg-gray-800 dark:text-gray-100"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                    if (e.key === 'Escape') {
                      setEditingName(false);
                      setNameValue(variant.name);
                    }
                  }}
                />
                <input
                  type="text"
                  value={descValue}
                  onChange={(e) => setDescValue(e.target.value)}
                  placeholder="Description (optional)"
                  className="border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm dark:bg-gray-800 dark:text-gray-100"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleSaveName();
                  }}
                />
                <button
                  onClick={handleSaveName}
                  className="px-2 py-1 text-xs font-medium text-white bg-primary-600 rounded-md hover:bg-primary-700"
                >
                  Save
                </button>
                <button
                  onClick={() => {
                    setEditingName(false);
                    setNameValue(variant.name);
                    setDescValue(variant.description || '');
                  }}
                  className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  {variant.name}
                </h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300">
                  {variant.role_name}
                </span>
                <button
                  onClick={() => setEditingName(true)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  title="Edit name & description"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                </button>
              </div>
            )}
            {!editingName && variant.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400">{variant.description}</p>
            )}
            {!editingName && !variant.description && (
              <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                Customize form fields for the {variant.role_name} role.
              </p>
            )}
          </div>
        </div>
      </div>

      <SuccessBanner message={successMessage} />
      {error && <ErrorBanner message={error} />}

      {showPreview ? (
        <FormPreview unifiedFields={unifiedFields} />
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div className="grid grid-cols-12 gap-4" style={{ minHeight: '600px' }}>
            {/* Left: Field Palette */}
            <div className="col-span-3">
              <FieldPalette onAddField={handleAddField} isAdmin={isAdmin} />
            </div>

            {/* Center: Unified Form Canvas */}
            <div className="col-span-6">
              <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 h-full">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-4">
                  Form Fields
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
                  All fields in submission order. Drag to reorder, toggle visibility and required.
                </p>

                <SortableContext
                  items={unifiedFields.map((f) => f.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {unifiedFields.map((field) => (
                      <UnifiedFieldCard
                        key={field.id}
                        field={field}
                        isSelected={selectedFieldId === field.id}
                        onSelect={() => guardUnsaved(() => setSelectedFieldId(field.id))}
                        onDelete={
                          field.type === 'custom' ? () => handleDeleteField(field) : undefined
                        }
                        onToggleVisible={
                          field.type === 'builtin' && !field.alwaysRequired
                            ? (v) => handleBuiltinFieldToggle(field.key, 'visible', v)
                            : undefined
                        }
                        onToggleRequired={
                          field.type === 'builtin' && !field.alwaysRequired
                            ? (v) => handleBuiltinFieldToggle(field.key, 'required', v)
                            : undefined
                        }
                        isAdmin={isAdmin}
                      />
                    ))}
                  </div>
                </SortableContext>

                {unifiedFields.length === 0 && (
                  <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center text-sm text-gray-500 dark:text-gray-400">
                    Click a field type from the palette to add custom fields
                  </div>
                )}
              </div>
            </div>

            {/* Right: Field Properties */}
            <div className="col-span-3">
              {selectedBuiltinKey ? (
                <BuiltinHelpTextPanel
                  fieldKey={selectedBuiltinKey}
                  initialValue={variant.builtin_fields_config[selectedBuiltinKey]?.help_text || ''}
                  initialMinChars={variant.builtin_fields_config[selectedBuiltinKey]?.min_chars}
                  initialMaxChars={variant.builtin_fields_config[selectedBuiltinKey]?.max_chars}
                  initialOptions={variant.builtin_fields_config[selectedBuiltinKey]?.options}
                  onSave={handleBuiltinFieldHelpText}
                  onDirtyChange={setHasUnsavedChanges}
                />
              ) : (
                <FieldPropertyEditor
                  field={selectedCustomField}
                  onUpdate={handleUpdateField}
                  isAdmin={isAdmin}
                />
              )}
            </div>
          </div>

          {/* Drag Overlay */}
          <DragOverlay>
            {activeField ? (
              <UnifiedFieldCard
                field={activeField}
                isSelected={false}
                onSelect={() => {}}
                isAdmin={isAdmin}
                isDragging
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Delete Field Confirm */}
      <ConfirmDialog
        open={!!deleteFieldTarget}
        title="Delete Field"
        message={`Are you sure you want to delete the field "${deleteFieldTarget?.label}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDeleteField}
        onCancel={() => setDeleteFieldTarget(null)}
      />

      {/* Unsaved Changes Confirm */}
      <ConfirmDialog
        open={showUnsavedDialog}
        title="Unsaved Changes"
        message="You have unsaved changes. Do you want to discard them?"
        confirmLabel="Discard"
        onConfirm={confirmDiscard}
        onCancel={cancelDiscard}
      />
    </div>
  );
}

export default VariantFormBuilder;

import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
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
  Conference,
  PaperFormSchema,
  PaperFormField,
  PaperFormFieldCreate,
  PaperFormFieldUpdate,
  PaperFormSchemaUpdate,
  BuiltinFieldConfig,
  HasSubmissionsResponse,
  PaperFormFieldType,
} from '../../../../../types';
import { parseApiError } from '../../../../../utils/apiError';
import { ErrorBanner, SuccessBanner } from '../../../../../components/common/ErrorBanner';
import { LoadingSpinner } from '../../../../../components/common/LoadingSpinner';
import ConfirmDialog from '../../../../../components/ConfirmDialog';
import FieldPalette from './FieldPalette';
import FieldPropertyEditor from './FieldPropertyEditor';
import UnifiedFieldCard, { type UnifiedField } from './UnifiedFieldCard';

// --- Constants ---------------------------------------------------------------

const BUILTIN_FIELDS_DEF = [
  { key: 'title', label: 'Title', alwaysRequired: true },
  { key: 'abstract_short', label: 'Short Abstract' },
  { key: 'abstract_long', label: 'Long Abstract' },
  { key: 'level', label: 'Level' },
  { key: 'learning_objectives', label: 'Learning Objectives' },
  { key: 'importance', label: 'Importance' },
  { key: 'session_type', label: 'Session Type' },
  { key: 'topics', label: 'Topics' },
];

// --- Main Component ----------------------------------------------------------

function PaperFormBuilderTab({
  conference,
  isAdmin,
}: {
  conference: Conference;
  isAdmin: boolean;
}) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showVersioningWarning, setShowVersioningWarning] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [deleteFieldTarget, setDeleteFieldTarget] = useState<UnifiedField | null>(null);
  const [showPreview, setShowPreview] = useState(false);

  // Drag & drop sensors with activation constraints for smoother dragging
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Require 8px movement before drag starts
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Auto-clear success message
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  // --- Queries ---------------------------------------------------------------

  const {
    data: schema,
    isLoading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: queryKeys.settings.paperFormSchema(conference.id),
    queryFn: async () => {
      const response = await api.get<PaperFormSchema>(
        `/conferences/${conference.id}/paper-form-schema`
      );
      return response.data;
    },
  });

  const { data: submissionsData } = useQuery({
    queryKey: queryKeys.settings.paperFormHasSubmissions(conference.id),
    queryFn: async () => {
      const response = await api.get<HasSubmissionsResponse>(
        `/conferences/${conference.id}/paper-form-schema/has-submissions`
      );
      return response.data;
    },
  });

  const hasSubmissions = submissionsData?.has_submissions ?? false;

  // --- Unified Fields --------------------------------------------------------

  // Combine built-in and custom fields into a single sorted list
  const unifiedFields = useMemo((): UnifiedField[] => {
    if (!schema) return [];

    const builtinCount = BUILTIN_FIELDS_DEF.length;

    // Create unified built-in fields
    const builtinUnified: UnifiedField[] = BUILTIN_FIELDS_DEF.map((bf, defaultIdx) => {
      const config = schema.builtin_fields_config[bf.key] || { visible: true, required: false };
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

    // Create unified custom fields - use actual display_order for interleaving
    // If custom field has display_order < builtinCount, it was created before unified ordering
    // In that case, add builtinCount to preserve relative order
    const customUnified: UnifiedField[] = schema.fields.map((f) => {
      // Check if any builtin field has a display_order set (meaning unified ordering is in use)
      const unifiedOrderingInUse = Object.values(schema.builtin_fields_config).some(
        (c) => c.display_order !== undefined && c.display_order !== null
      );

      // If unified ordering is in use, use the actual display_order
      // Otherwise, offset custom fields to appear after built-in fields
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

    // Combine and sort by display_order
    return [...builtinUnified, ...customUnified].sort((a, b) => a.display_order - b.display_order);
  }, [schema]);

  // Selected field for the property editor (only custom fields can be edited)
  const selectedCustomField = useMemo(() => {
    if (!selectedFieldId || !schema) return null;
    // Only return custom fields for editing
    if (selectedFieldId.startsWith('builtin_')) return null;
    return schema.fields.find((f) => f.id === selectedFieldId) ?? null;
  }, [selectedFieldId, schema]);

  // --- Mutations -------------------------------------------------------------

  const updateSchemaMutation = useMutation({
    mutationFn: async (data: PaperFormSchemaUpdate) => {
      const response = await api.put<PaperFormSchema>(
        `/conferences/${conference.id}/paper-form-schema`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.settings.paperFormSchema(conference.id),
      });
      setSuccessMessage('Form schema updated successfully');
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  const createFieldMutation = useMutation({
    mutationFn: async (data: PaperFormFieldCreate) => {
      const response = await api.post<PaperFormField>(
        `/conferences/${conference.id}/paper-form-schema/fields`,
        data
      );
      return response.data;
    },
    onSuccess: (newField) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.settings.paperFormSchema(conference.id),
      });
      setSuccessMessage('Field created successfully');
      setSelectedFieldId(newField.id);
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  const updateFieldMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: PaperFormFieldUpdate }) => {
      const response = await api.put<PaperFormField>(
        `/conferences/${conference.id}/paper-form-schema/fields/${id}`,
        data
      );
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.settings.paperFormSchema(conference.id),
      });
      setSuccessMessage('Field updated successfully');
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/conferences/${conference.id}/paper-form-schema/fields/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.settings.paperFormSchema(conference.id),
      });
      setSuccessMessage('Field deleted successfully');
      setSelectedFieldId(null);
      setError(null);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  // --- Handlers --------------------------------------------------------------

  const checkVersioningAndExecute = (action: () => void) => {
    if (hasSubmissions) {
      setPendingAction(() => action);
      setShowVersioningWarning(true);
    } else {
      action();
    }
  };

  const handleBuiltinFieldToggle = (
    fieldKey: string,
    property: 'visible' | 'required',
    value: boolean
  ) => {
    if (!schema) return;
    checkVersioningAndExecute(() => {
      const existing = schema.builtin_fields_config[fieldKey] || { visible: true, required: false };
      const newConfig = {
        ...schema.builtin_fields_config,
        [fieldKey]: { ...existing, [property]: value },
      };
      updateSchemaMutation.mutate({ builtin_fields_config: newConfig });
    });
  };

  const handleAddField = (fieldType: PaperFormFieldType) => {
    // New custom fields go at the end
    const nextOrder = unifiedFields.length;
    const fieldKey = `custom_${fieldType}_${Date.now()}`;

    // Provide default options for dropdown/checkbox_group
    const defaultOptions =
      fieldType === 'dropdown' || fieldType === 'checkbox_group'
        ? [{ value: 'option1', label: 'Option 1' }]
        : undefined;

    checkVersioningAndExecute(() => {
      createFieldMutation.mutate({
        field_key: fieldKey,
        field_type: fieldType,
        label: `New ${fieldType.replace('_', ' ')} field`,
        display_order: nextOrder,
        is_visible: true,
        is_required: false,
        options: defaultOptions,
      });
    });
  };

  const handleUpdateField = (id: string, data: PaperFormFieldUpdate) => {
    checkVersioningAndExecute(() => {
      updateFieldMutation.mutate({ id, data });
    });
  };

  const handleDeleteField = (field: UnifiedField) => {
    if (field.type === 'builtin') return; // Can't delete built-in fields
    setDeleteFieldTarget(field);
  };

  const confirmDeleteField = () => {
    if (!deleteFieldTarget || deleteFieldTarget.type === 'builtin') return;
    checkVersioningAndExecute(() => {
      deleteFieldMutation.mutate(deleteFieldTarget.id);
    });
    setDeleteFieldTarget(null);
  };

  // Drag handlers - handles unified reordering
  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id || !schema) return;

    const oldIndex = unifiedFields.findIndex((f) => f.id === active.id);
    const newIndex = unifiedFields.findIndex((f) => f.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    // Compute new order using arrayMove for correct positioning
    const reordered = arrayMove(unifiedFields, oldIndex, newIndex);

    // Separate into builtin config updates and custom field order updates
    const newBuiltinConfig: Record<string, BuiltinFieldConfig> = {};
    const customFieldOrders: { id: string; display_order: number }[] = [];

    // UUID regex pattern for validation
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    reordered.forEach((field, idx) => {
      if (field.type === 'builtin' || field.id.startsWith('builtin_')) {
        // Handle builtin fields - use key for config
        const key = field.key;
        const existing = schema.builtin_fields_config[key] || { visible: true, required: false };
        newBuiltinConfig[key] = { ...existing, display_order: idx };
      } else if (uuidRegex.test(field.id)) {
        // Only add valid UUIDs to custom field orders
        customFieldOrders.push({ id: field.id, display_order: idx });
      }
    });

    // Preserve any builtin fields that weren't in the reordered list (shouldn't happen, but safety)
    BUILTIN_FIELDS_DEF.forEach((bf) => {
      if (!newBuiltinConfig[bf.key]) {
        newBuiltinConfig[bf.key] = schema.builtin_fields_config[bf.key] || {
          visible: true,
          required: false,
        };
      }
    });

    checkVersioningAndExecute(async () => {
      // Update both builtin config and custom field orders
      const promises: Promise<unknown>[] = [];

      promises.push(
        api.put(`/conferences/${conference.id}/paper-form-schema`, {
          builtin_fields_config: newBuiltinConfig,
        })
      );

      if (customFieldOrders.length > 0) {
        promises.push(
          api.put(`/conferences/${conference.id}/paper-form-schema/fields/reorder`, {
            fields: customFieldOrders,
          })
        );
      }

      try {
        await Promise.all(promises);
        queryClient.invalidateQueries({
          queryKey: queryKeys.settings.paperFormSchema(conference.id),
        });
        setSuccessMessage('Field order updated');
      } catch (err) {
        setError(parseApiError(err));
      }
    });
  };

  const handleVersioningConfirm = () => {
    setShowVersioningWarning(false);
    if (pendingAction) {
      pendingAction();
      setPendingAction(null);
    }
  };

  const handleVersioningCancel = () => {
    setShowVersioningWarning(false);
    setPendingAction(null);
  };

  // --- Render ----------------------------------------------------------------

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (isError) {
    return <ErrorBanner message={`Failed to load form schema: ${parseApiError(queryError)}`} />;
  }

  if (!schema) {
    return <ErrorBanner message="No form schema found" />;
  }

  const activeField = activeId ? unifiedFields.find((f) => f.id === activeId) : null;

  return (
    <div className="h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Paper Form Builder
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Design the paper submission form for this conference. Drag fields to reorder.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasSubmissions && (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
              {submissionsData?.submission_count} submissions exist
            </span>
          )}
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {showPreview ? 'Edit Mode' : 'Preview'}
          </button>
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
                        onSelect={() => setSelectedFieldId(field.id)}
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
              <FieldPropertyEditor
                field={selectedCustomField}
                onUpdate={handleUpdateField}
                isAdmin={isAdmin}
              />
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

      {/* Versioning Warning Modal */}
      <ConfirmDialog
        open={showVersioningWarning}
        title="Papers Already Submitted"
        message={`There are ${submissionsData?.submission_count ?? 0} paper(s) already submitted for this conference. Modifying the form schema may affect existing submissions. Do you want to continue?`}
        confirmLabel="Continue"
        onConfirm={handleVersioningConfirm}
        onCancel={handleVersioningCancel}
      />

      {/* Delete Field Confirm */}
      <ConfirmDialog
        open={!!deleteFieldTarget}
        title="Delete Field"
        message={`Are you sure you want to delete the field "${deleteFieldTarget?.label}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmDeleteField}
        onCancel={() => setDeleteFieldTarget(null)}
      />
    </div>
  );
}

// --- Form Preview Component --------------------------------------------------

function FormPreview({ unifiedFields }: { unifiedFields: UnifiedField[] }) {
  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 max-w-3xl mx-auto">
      <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-6">Form Preview</h3>

      <div className="space-y-6">
        {unifiedFields
          .filter((f) => f.is_visible)
          .map((field) => (
            <div key={field.id}>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {field.label}
                {field.is_required && <span className="text-red-500 ml-1">*</span>}
              </label>
              {field.type === 'builtin' ? (
                renderBuiltinPreviewField(field.key)
              ) : field.customField ? (
                <>
                  {field.customField.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                      {field.customField.description}
                    </p>
                  )}
                  {renderCustomPreviewField(field.customField)}
                  {field.customField.help_text && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {field.customField.help_text}
                    </p>
                  )}
                </>
              ) : null}
            </div>
          ))}
      </div>
    </div>
  );
}

function renderBuiltinPreviewField(key: string) {
  switch (key) {
    case 'abstract_long':
    case 'learning_objectives':
    case 'importance':
      return (
        <textarea
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm dark:bg-gray-800 dark:text-gray-100"
          rows={4}
          placeholder={`Enter ${key.replace('_', ' ')}...`}
          disabled
        />
      );
    case 'level':
      return (
        <select
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm dark:bg-gray-800 dark:text-gray-100"
          disabled
        >
          <option>Select level...</option>
          <option>Beginner</option>
          <option>Intermediate</option>
          <option>Advanced</option>
          <option>All Levels</option>
        </select>
      );
    case 'session_type':
    case 'topics':
      return (
        <select
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm dark:bg-gray-800 dark:text-gray-100"
          disabled
        >
          <option>Select {key.replace('_', ' ')}...</option>
        </select>
      );
    default:
      return (
        <input
          type="text"
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm dark:bg-gray-800 dark:text-gray-100"
          placeholder={`Enter ${key.replace('_', ' ')}...`}
          disabled
        />
      );
  }
}

function renderCustomPreviewField(field: PaperFormField) {
  switch (field.field_type) {
    case 'text':
      return (
        <input
          type="text"
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm dark:bg-gray-800 dark:text-gray-100"
          placeholder={field.placeholder || ''}
          disabled
        />
      );
    case 'textarea':
      return (
        <textarea
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm dark:bg-gray-800 dark:text-gray-100"
          rows={3}
          placeholder={field.placeholder || ''}
          disabled
        />
      );
    case 'richtext':
      return (
        <div className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm bg-gray-50 dark:bg-gray-900 h-24">
          <span className="text-gray-400 dark:text-gray-500">Rich text editor...</span>
        </div>
      );
    case 'checkbox':
      return (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            className="rounded border-gray-300 dark:border-gray-600"
            disabled
          />
          <span className="text-sm text-gray-700 dark:text-gray-300">
            {field.placeholder || 'Yes'}
          </span>
        </label>
      );
    case 'checkbox_group':
      return (
        <div className="space-y-2">
          {(field.options || []).map((opt, idx) => (
            <label key={idx} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="rounded border-gray-300 dark:border-gray-600"
                disabled
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">{opt.label}</span>
            </label>
          ))}
        </div>
      );
    case 'dropdown':
      return (
        <select
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm p-2 text-sm dark:bg-gray-800 dark:text-gray-100"
          disabled
        >
          <option>{field.placeholder || 'Select...'}</option>
          {(field.options || []).map((opt, idx) => (
            <option key={idx} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    case 'file_upload':
      return (
        <div className="flex items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Drag and drop file here or click to browse
          </span>
        </div>
      );
    default:
      return null;
  }
}

export default PaperFormBuilderTab;

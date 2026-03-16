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
import VariantManager from './VariantManager';
import { BUILTIN_FIELDS_DEF } from './constants';
import { BuiltinHelpTextPanel, FormPreview } from './shared';

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
  const [showBuilder, setShowBuilder] = useState(false);

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

  const handleBuiltinFieldHelpText = (fieldKey: string, helpText: string) => {
    if (!schema) return;
    checkVersioningAndExecute(() => {
      const existing = schema.builtin_fields_config[fieldKey] || { visible: true, required: false };
      const newConfig = {
        ...schema.builtin_fields_config,
        [fieldKey]: { ...existing, help_text: helpText || null },
      };
      updateSchemaMutation.mutate({ builtin_fields_config: newConfig });
    });
  };

  // Get selected built-in field info for help text editing
  const selectedBuiltinKey = useMemo(() => {
    if (!selectedFieldId?.startsWith('builtin_') || !schema) return null;
    return selectedFieldId.replace('builtin_', '');
  }, [selectedFieldId, schema]);

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

  const visibleFieldCount = unifiedFields.filter((f) => f.is_visible).length;
  const customFieldCount = unifiedFields.filter((f) => f.type === 'custom').length;

  return (
    <div className="h-full">
      <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
        Paper Form Builder
      </h2>

      {/* Standard Form — Collapsed Card */}
      {!showBuilder ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Standard Form
                  </h4>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                    Default
                  </span>
                  {hasSubmissions && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
                      {submissionsData?.submission_count} submissions
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Used by all submitters unless a role-based variant is assigned.
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                  {visibleFieldCount} visible field{visibleFieldCount !== 1 ? 's' : ''}
                  {customFieldCount > 0 && ` (${customFieldCount} custom)`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-4">
              <button
                type="button"
                onClick={() => setShowBuilder(true)}
                className="px-2.5 py-1 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                Edit
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Standard Form — Expanded Builder */
        <div>
          {/* Builder Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setShowBuilder(false);
                  setShowPreview(false);
                }}
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
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                    Standard Form
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300">
                    Default
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  Design the paper submission form. Drag fields to reorder.
                </p>
              </div>
            </div>
            {hasSubmissions && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300">
                {submissionsData?.submission_count} submissions exist
              </span>
            )}
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
                      All fields in submission order. Drag to reorder, toggle visibility and
                      required.
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
                  {selectedBuiltinKey ? (
                    <BuiltinHelpTextPanel
                      fieldKey={selectedBuiltinKey}
                      initialValue={
                        schema?.builtin_fields_config[selectedBuiltinKey]?.help_text || ''
                      }
                      onSave={handleBuiltinFieldHelpText}
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
        </div>
      )}

      {/* Role-Based Variants Manager */}
      <VariantManager
        conferenceId={conference.id}
        variants={schema.variants ?? []}
        isAdmin={isAdmin}
      />

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

export default PaperFormBuilderTab;

import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../../../../config/api';
import { queryKeys } from '../../../../../config/queryKeys';
import { useToast } from '../../../../../components/Toast';
import { parseApiError } from '../../../../../utils/apiError';
import { AuthImage } from './AuthImage';
import {
  CONDITION_TYPES,
  CONDITION_TYPE_LABELS,
  CONDITION_FIELDS,
  CONDITION_OPERATORS,
  NO_VALUE_OPERATORS,
  type ConditionalImage,
} from './constants';

interface ConditionalImagesSectionProps {
  conferenceId: string;
  isAdmin: boolean;
  showCondImages: boolean;
  setShowCondImages: (show: boolean) => void;
  conditionalImages: ConditionalImage[];
  setConditionalImages: React.Dispatch<React.SetStateAction<ConditionalImage[]>>;
}

export function ConditionalImagesSection({
  conferenceId,
  isAdmin,
  showCondImages,
  setShowCondImages,
  conditionalImages,
  setConditionalImages,
}: ConditionalImagesSectionProps) {
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [showAddCondImage, setShowAddCondImage] = useState(false);
  const [condName, setCondName] = useState('');
  const [condPlaceholder, setCondPlaceholder] = useState('');
  const [condType, setCondType] = useState<string>('booking_option');
  const [condValue, setCondValue] = useState('');
  const [condFile, setCondFile] = useState<File | null>(null);
  const [uploadingCondImage, setUploadingCondImage] = useState(false);
  const condFileRef = useRef<HTMLInputElement>(null);
  const [editingCondImageId, setEditingCondImageId] = useState<string | null>(null);
  const [editCondType, setEditCondType] = useState<string>('booking_option');
  const [editCondValue, setEditCondValue] = useState('');
  const [editCondName, setEditCondName] = useState('');
  const [editCondField, setEditCondField] = useState('');
  const [editCondOperator, setEditCondOperator] = useState('eq');
  const [condField, setCondField] = useState('');
  const [condOperator, setCondOperator] = useState('eq');

  // Fetch booking options for condition dropdowns
  const { data: bookingOptions } = useQuery({
    queryKey: queryKeys.booking.options(conferenceId),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conferenceId}/settings/booking-options`);
      return (res.data?.items ?? res.data) as { id: string; name: string }[];
    },
    enabled: showCondImages,
    staleTime: 30_000,
  });

  // Fetch program days for condition dropdowns
  const { data: programDays } = useQuery({
    queryKey: queryKeys.program.days(conferenceId),
    queryFn: async () => {
      const res = await api.get(`/conferences/${conferenceId}/program/days`);
      return (res.data?.items ?? res.data) as { id: string; name: string }[];
    },
    enabled: showCondImages,
    staleTime: 30_000,
  });

  // Condition value options based on selected type
  const condValueOptions =
    condType === 'conference_day' ? (programDays ?? []) : (bookingOptions ?? []);

  // Delete conditional image
  const handleDeleteCondImage = async (imageId: string) => {
    try {
      await api.delete(
        `/conferences/${conferenceId}/settings/badge-settings/conditional-images/${imageId}`
      );
      setConditionalImages((prev) => prev.filter((img) => img.id !== imageId));
      queryClient.invalidateQueries({ queryKey: queryKeys.badgeSettings(conferenceId) });
      showToast('Conditional image deleted', 'success');
    } catch (err: unknown) {
      showToast(parseApiError(err, 'Failed to delete image'), 'error');
    }
  };

  // Upload conditional image
  const handleUploadCondImage = async () => {
    if (!condFile || !condName.trim() || !condPlaceholder.trim()) return;
    if (condType === 'field') {
      if (!condField || !condOperator) return;
      if (!NO_VALUE_OPERATORS.has(condOperator) && !condValue) return;
    } else if (!condValue) {
      return;
    }
    setUploadingCondImage(true);
    try {
      const formData = new FormData();
      formData.append('file', condFile);
      formData.append('name', condName.trim());
      formData.append('placeholder', condPlaceholder.trim());
      formData.append('condition_type', condType);
      formData.append(
        'condition_value',
        condType === 'field' && NO_VALUE_OPERATORS.has(condOperator) ? '' : condValue
      );
      if (condType === 'field') {
        formData.append('condition_field', condField);
        formData.append('condition_operator', condOperator);
      }
      const res = await api.post(
        `/conferences/${conferenceId}/settings/badge-settings/conditional-images`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setConditionalImages(res.data.badge_conditional_images ?? []);
      queryClient.invalidateQueries({ queryKey: queryKeys.badgeSettings(conferenceId) });
      showToast('Conditional image added', 'success');
      // Reset form
      setCondName('');
      setCondPlaceholder('');
      setCondType('booking_option');
      setCondValue('');
      setCondField('');
      setCondOperator('eq');
      setCondFile(null);
      if (condFileRef.current) condFileRef.current.value = '';
      setShowAddCondImage(false);
    } catch (err: unknown) {
      showToast(parseApiError(err, 'Failed to upload conditional image'), 'error');
    } finally {
      setUploadingCondImage(false);
    }
  };

  // Start editing a conditional image
  const startEditCondImage = (img: ConditionalImage) => {
    setEditingCondImageId(img.id);
    setEditCondType(
      img.condition_type === 'registration_item' ? 'booking_option' : img.condition_type
    );
    setEditCondValue(img.condition_value);
    setEditCondName(img.name);
    setEditCondField(img.condition_field ?? '');
    setEditCondOperator(img.condition_operator ?? 'eq');
  };

  // Save edited conditional image via PUT badge settings
  const saveEditCondImage = async () => {
    if (!editingCondImageId) return;
    if (editCondType === 'field') {
      if (!editCondField || !editCondOperator) return;
      if (!NO_VALUE_OPERATORS.has(editCondOperator) && !editCondValue) return;
    } else if (!editCondValue) {
      return;
    }
    const updated = conditionalImages.map((img) =>
      img.id === editingCondImageId
        ? {
            ...img,
            name: editCondName.trim() || img.name,
            condition_type: editCondType,
            condition_value:
              editCondType === 'field' && NO_VALUE_OPERATORS.has(editCondOperator)
                ? ''
                : editCondValue,
            condition_field: editCondType === 'field' ? editCondField : null,
            condition_operator: editCondType === 'field' ? editCondOperator : null,
          }
        : img
    );
    try {
      await api.put(`/conferences/${conferenceId}/settings/badge-settings`, {
        badge_conditional_images: updated,
      });
      setConditionalImages(updated);
      queryClient.invalidateQueries({ queryKey: queryKeys.badgeSettings(conferenceId) });
      showToast('Conditional image updated', 'success');
      setEditingCondImageId(null);
    } catch (err: unknown) {
      showToast(parseApiError(err, 'Failed to update conditional image'), 'error');
    }
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setShowCondImages(!showCondImages)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <span>
          Conditional Images{' '}
          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
            — images that appear only when conditions are met ({conditionalImages.length})
          </span>
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${showCondImages ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {showCondImages && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-3">
          {conditionalImages.length === 0 && !showAddCondImage && (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No conditional images configured.
            </p>
          )}

          {conditionalImages.length > 0 && (
            <div className="space-y-2">
              {conditionalImages.map((img) => {
                const isEditing = editingCondImageId === img.id;
                const typeLabel = CONDITION_TYPE_LABELS[img.condition_type] ?? img.condition_type;
                let condLabel: string | undefined;
                if (img.condition_type === 'field') {
                  const fieldLabel =
                    CONDITION_FIELDS.find((f) => f.key === img.condition_field)?.label ??
                    img.condition_field;
                  const opLabel =
                    CONDITION_OPERATORS.find((o) => o.key === img.condition_operator)?.label ??
                    img.condition_operator;
                  condLabel = `${fieldLabel} ${opLabel}${NO_VALUE_OPERATORS.has(img.condition_operator ?? '') ? '' : ` "${img.condition_value}"`}`;
                } else if (img.condition_type === 'conference_day') {
                  condLabel = programDays?.find((d) => d.id === img.condition_value)?.name;
                } else {
                  condLabel = bookingOptions?.find((o) => o.id === img.condition_value)?.name;
                }
                const editValueOptions =
                  (isEditing ? editCondType : img.condition_type) === 'conference_day'
                    ? (programDays ?? [])
                    : (bookingOptions ?? []);

                return (
                  <div
                    key={img.id}
                    className="bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden"
                  >
                    <div className="flex items-center gap-3 p-3">
                      {img.attachment_id ? (
                        <AuthImage
                          url={`/conferences/${conferenceId}/settings/badge-settings/conditional-images/${img.attachment_id}/file`}
                          alt={img.name}
                          className="h-8 w-8 object-contain rounded shrink-0"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-8 w-8 bg-gray-200 dark:bg-gray-700 rounded text-gray-400 dark:text-gray-500 shrink-0">
                          <svg
                            className="h-4 w-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                            />
                          </svg>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          {img.name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Placeholder:{' '}
                          <code className="font-mono text-primary-600 dark:text-primary-400">
                            [{img.placeholder}]
                          </code>
                          {' — '}
                          {typeLabel}: {condLabel ?? img.condition_value}
                        </p>
                      </div>
                      {isAdmin && !isEditing && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEditCondImage(img)}
                            className="p-1.5 text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                            title="Edit"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                              />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteCondImage(img.id)}
                            className="p-1.5 text-red-500 hover:text-red-700 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                            title="Delete"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                              />
                            </svg>
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Inline edit form */}
                    {isEditing && (
                      <div className="px-3 pb-3 pt-1 border-t border-gray-200 dark:border-gray-700 space-y-2">
                        <div>
                          <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                            Name
                          </label>
                          <input
                            type="text"
                            value={editCondName}
                            onChange={(e) => setEditCondName(e.target.value)}
                            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                              Condition Type
                            </label>
                            <select
                              value={editCondType}
                              onChange={(e) => {
                                setEditCondType(e.target.value);
                                setEditCondValue('');
                                setEditCondField('');
                                setEditCondOperator('eq');
                              }}
                              className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                            >
                              {CONDITION_TYPES.map((ct) => (
                                <option key={ct.key} value={ct.key}>
                                  {ct.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          {editCondType === 'field' ? (
                            <div>
                              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                Field
                              </label>
                              <select
                                value={editCondField}
                                onChange={(e) => setEditCondField(e.target.value)}
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                              >
                                <option value="">Select field...</option>
                                {CONDITION_FIELDS.map((f) => (
                                  <option key={f.key} value={f.key}>
                                    {f.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div>
                              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                Condition Value
                              </label>
                              <select
                                value={editCondValue}
                                onChange={(e) => setEditCondValue(e.target.value)}
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                              >
                                <option value="">Select...</option>
                                {editValueOptions.map((opt) => (
                                  <option key={opt.id} value={opt.id}>
                                    {opt.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                        {editCondType === 'field' && (
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                Operator
                              </label>
                              <select
                                value={editCondOperator}
                                onChange={(e) => setEditCondOperator(e.target.value)}
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                              >
                                {CONDITION_OPERATORS.map((op) => (
                                  <option key={op.key} value={op.key}>
                                    {op.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            {!NO_VALUE_OPERATORS.has(editCondOperator) && (
                              <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                  Value
                                </label>
                                <input
                                  type="text"
                                  value={editCondValue}
                                  onChange={(e) => setEditCondValue(e.target.value)}
                                  placeholder="e.g. she/her"
                                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                                />
                              </div>
                            )}
                          </div>
                        )}
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={saveEditCondImage}
                            disabled={
                              editCondType === 'field'
                                ? !editCondField ||
                                  !editCondOperator ||
                                  (!NO_VALUE_OPERATORS.has(editCondOperator) && !editCondValue)
                                : !editCondValue
                            }
                            className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingCondImageId(null)}
                            className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Conditional Image Form */}
          {isAdmin && !showAddCondImage && (
            <button
              onClick={() => setShowAddCondImage(true)}
              className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
            >
              + Add Conditional Image
            </button>
          )}

          {isAdmin && showAddCondImage && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3 bg-white dark:bg-gray-800">
              <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                Add Conditional Image
              </h4>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Name
                  </label>
                  <input
                    type="text"
                    value={condName}
                    onChange={(e) => setCondName(e.target.value)}
                    placeholder="e.g. Day 1 Badge"
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Placeholder
                  </label>
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-400">[</span>
                    <input
                      type="text"
                      value={condPlaceholder}
                      onChange={(e) =>
                        setCondPlaceholder(e.target.value.toUpperCase().replace(/\s+/g, '_'))
                      }
                      placeholder="IMG_DAY1"
                      className="flex-1 border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm font-mono dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                    />
                    <span className="text-sm text-gray-400">]</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                    Condition Type
                  </label>
                  <select
                    value={condType}
                    onChange={(e) => {
                      setCondType(e.target.value);
                      setCondValue('');
                      setCondField('');
                      setCondOperator('eq');
                    }}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                  >
                    {CONDITION_TYPES.map((ct) => (
                      <option key={ct.key} value={ct.key}>
                        {ct.label}
                      </option>
                    ))}
                  </select>
                </div>
                {condType === 'field' ? (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Field
                    </label>
                    <select
                      value={condField}
                      onChange={(e) => setCondField(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="">Select field...</option>
                      {CONDITION_FIELDS.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Condition Value
                    </label>
                    <select
                      value={condValue}
                      onChange={(e) => setCondValue(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                    >
                      <option value="">Select...</option>
                      {condValueOptions.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {condType === 'field' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Operator
                    </label>
                    <select
                      value={condOperator}
                      onChange={(e) => setCondOperator(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                    >
                      {CONDITION_OPERATORS.map((op) => (
                        <option key={op.key} value={op.key}>
                          {op.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {!NO_VALUE_OPERATORS.has(condOperator) && (
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                        Value
                      </label>
                      <input
                        type="text"
                        value={condValue}
                        onChange={(e) => setCondValue(e.target.value)}
                        placeholder="e.g. she/her"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm dark:bg-gray-800 dark:text-gray-100 focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                  )}
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Image File
                </label>
                <input
                  ref={condFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={(e) => setCondFile(e.target.files?.[0] ?? null)}
                  className="w-full text-sm text-gray-700 dark:text-gray-300 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 dark:file:bg-primary-900/30 dark:file:text-primary-300 hover:file:bg-primary-100 dark:hover:file:bg-primary-900/50"
                />
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  onClick={handleUploadCondImage}
                  disabled={
                    uploadingCondImage ||
                    !condFile ||
                    !condName.trim() ||
                    !condPlaceholder.trim() ||
                    (condType === 'field'
                      ? !condField ||
                        !condOperator ||
                        (!NO_VALUE_OPERATORS.has(condOperator) && !condValue)
                      : !condValue)
                  }
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadingCondImage ? 'Uploading...' : 'Add Image'}
                </button>
                <button
                  onClick={() => {
                    setShowAddCondImage(false);
                    setCondName('');
                    setCondPlaceholder('');
                    setCondType('booking_option');
                    setCondValue('');
                    setCondField('');
                    setCondOperator('eq');
                    setCondFile(null);
                    if (condFileRef.current) condFileRef.current.value = '';
                  }}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
              </div>
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Use <code className="font-mono">[{condPlaceholder || 'PLACEHOLDER'}]</code> in your
                badge template. The image will only appear when the condition is met.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

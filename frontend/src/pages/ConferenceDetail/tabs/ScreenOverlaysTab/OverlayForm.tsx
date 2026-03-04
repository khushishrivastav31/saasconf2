import { useRef } from 'react';
import type {
  ScreenOverlayCreate,
  OverlayTriggerType,
  OverlayAnimationStyle,
} from '../../../../types';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import api from '../../../../config/api';
import { TRIGGER_OPTIONS, ANIMATION_OPTIONS } from './constants';

interface OverlayFormProps {
  form: ScreenOverlayCreate;
  onChange: (updates: Partial<ScreenOverlayCreate>) => void;
}

export function OverlayForm({ form, onChange }: OverlayFormProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Title */}
      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Title
        </label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Welcome to {conference_name}!"
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
        />
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          Use {'{conference_name}'} to insert the conference name.
        </p>
      </div>

      {/* Body Text */}
      <div className="md:col-span-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Body Text (optional)
        </label>
        <RichTextEditor
          value={form.body_text || ''}
          onChange={(html) => onChange({ body_text: html || undefined })}
          placeholder="Thank you for registering..."
          rows={2}
        />
      </div>

      {/* Trigger Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Trigger
        </label>
        <select
          value={form.trigger_type}
          onChange={(e) => onChange({ trigger_type: e.target.value as OverlayTriggerType })}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
        >
          {TRIGGER_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Animation Style */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Animation
        </label>
        <select
          value={form.animation_style}
          onChange={(e) => onChange({ animation_style: e.target.value as OverlayAnimationStyle })}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
        >
          {ANIMATION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Duration */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Duration (seconds)
        </label>
        <input
          type="number"
          min={1}
          max={30}
          value={form.duration_seconds}
          onChange={(e) => onChange({ duration_seconds: parseInt(e.target.value) || 5 })}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>

      {/* Display Order */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Display Order
        </label>
        <input
          type="number"
          min={0}
          value={form.display_order}
          onChange={(e) => onChange({ display_order: parseInt(e.target.value) || 0 })}
          className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
        />
      </div>

      {/* Schedule Date (only for scheduled trigger) */}
      {form.trigger_type === 'scheduled' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Schedule Date
          </label>
          <input
            type="datetime-local"
            value={form.schedule_date ? form.schedule_date.slice(0, 16) : ''}
            onChange={(e) =>
              onChange({
                schedule_date: e.target.value ? new Date(e.target.value).toISOString() : undefined,
              })
            }
            className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-800 dark:text-gray-100"
          />
        </div>
      )}

      {/* Active checkbox */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="overlay-active"
          checked={form.is_active ?? false}
          onChange={(e) => onChange({ is_active: e.target.checked })}
          className="h-4 w-4 rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
        />
        <label htmlFor="overlay-active" className="text-sm text-gray-700 dark:text-gray-300">
          Active
        </label>
      </div>
    </div>
  );
}

interface OverlayImageUploadProps {
  imageUrl: string | null;
  localPreview?: string | null;
  onUpload: (file: File) => void;
  onDelete: () => void;
  isUploading: boolean;
  isDeleting: boolean;
}

export function OverlayImageUpload({
  imageUrl,
  localPreview,
  onUpload,
  onDelete,
  isUploading,
  isDeleting,
}: OverlayImageUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewSrc = imageUrl ? `${api.defaults.baseURL}${imageUrl}` : localPreview || null;
  const hasImage = !!imageUrl || !!localPreview;

  return (
    <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Overlay Image
      </label>
      <div className="flex items-start gap-4">
        {/* Preview */}
        <div className="w-32 h-24 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 flex items-center justify-center overflow-hidden shrink-0">
          {previewSrc ? (
            <img src={previewSrc} alt="Overlay" className="w-full h-full object-contain" />
          ) : (
            <svg
              className="w-8 h-8 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 disabled:opacity-50"
          >
            {isUploading ? 'Uploading...' : hasImage ? 'Replace Image' : 'Upload Image'}
          </button>
          {hasImage && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              className="px-3 py-1.5 text-sm font-medium text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-50"
            >
              {isDeleting ? 'Removing...' : 'Remove Image'}
            </button>
          )}
          <p className="text-xs text-gray-400 dark:text-gray-500">
            JPEG, PNG, WebP, or GIF. Max 10 MB.
          </p>
        </div>
      </div>
    </div>
  );
}

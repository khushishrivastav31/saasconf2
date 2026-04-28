import type { ScreenOverlay } from '../../types';
import api from '../../config/api';
import { stripHtml } from '../../utils/richText';
import { EyeIcon, EditIcon, DeleteIcon } from '../../pages/ConferenceDetail/icons';
import { triggerBadgeClass } from './constants';

interface OverlayCardProps {
  overlay: ScreenOverlay;
  isAdmin: boolean;
  onPreview: (overlay: ScreenOverlay) => void;
  onEdit: (overlay: ScreenOverlay) => void;
  onDelete: (overlay: ScreenOverlay) => void;
  onToggleActive: (id: string, is_active: boolean) => void;
}

export function OverlayCard({
  overlay,
  isAdmin,
  onPreview,
  onEdit,
  onDelete,
  onToggleActive,
}: OverlayCardProps) {
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-700">
      <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
        <div className="flex items-center gap-2">
          {overlay.image_url && (
            <img
              src={`${api.defaults.baseURL}${overlay.image_url}`}
              alt=""
              className="w-10 h-10 rounded object-cover shrink-0"
            />
          )}
          <div>
            <div className="font-medium">{overlay.title}</div>
            {overlay.body_text && (
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-xs">
                {stripHtml(overlay.body_text)}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <span
          className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
            triggerBadgeClass[overlay.trigger_type]
          }`}
        >
          {overlay.trigger_type.replace('_', ' ')}
        </span>
        {overlay.trigger_type === 'scheduled' && overlay.schedule_date && (
          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            {new Date(overlay.schedule_date).toLocaleDateString()}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 capitalize">
        {overlay.animation_style}
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
        {overlay.duration_seconds}s
      </td>
      <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
        {overlay.display_order}
      </td>
      <td className="px-4 py-3">
        <button
          onClick={() => isAdmin && onToggleActive(overlay.id, !overlay.is_active)}
          disabled={!isAdmin}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            overlay.is_active ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-700'
          } ${isAdmin ? 'cursor-pointer' : 'cursor-default'}`}
          aria-label={overlay.is_active ? 'Deactivate overlay' : 'Activate overlay'}
        >
          <span
            className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white dark:bg-gray-800 transition-transform ${
              overlay.is_active ? 'translate-x-4.5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </td>
      {isAdmin && (
        <td className="px-4 py-3 text-right">
          <div className="flex justify-end gap-1">
            <button
              onClick={() => onPreview(overlay)}
              className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-blue-600 rounded"
              title="Preview"
              aria-label="Preview"
            >
              <EyeIcon />
            </button>
            <button
              onClick={() => onEdit(overlay)}
              className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-primary-600 rounded"
              title="Edit"
              aria-label="Edit"
            >
              <EditIcon />
            </button>
            <button
              onClick={() => onDelete(overlay)}
              className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 rounded"
              title="Delete"
              aria-label="Delete"
            >
              <DeleteIcon />
            </button>
          </div>
        </td>
      )}
    </tr>
  );
}

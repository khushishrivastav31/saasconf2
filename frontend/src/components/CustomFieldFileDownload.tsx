import portalApi from '../config/portalApi';
import { downloadViaApi } from '../utils/downloadFile';

interface CustomFieldFileDownloadProps {
  attachmentId: string;
  filename: string;
}

/**
 * Renders an uploaded custom-field file (📎 filename) with a Download action.
 * The file is served from the auth-gated portal attachments endpoint, so the
 * download goes through the authenticated API rather than a plain link.
 */
export default function CustomFieldFileDownload({
  attachmentId,
  filename,
}: CustomFieldFileDownloadProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-gray-700 dark:text-gray-300">📎 {filename}</span>
      <button
        type="button"
        onClick={() =>
          downloadViaApi(portalApi, `/portal/attachments/${attachmentId}/download`, filename)
        }
        className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
          />
        </svg>
        Download
      </button>
    </div>
  );
}

import portalApi from '../../config/portalApi';
import { sanitizeHtml } from '../../utils/richText';
import { formatDate } from '../../utils/formatDate';
import { INVITATION_STATUS_COLORS } from '../../config/statusColors';
import type { PortalPaper } from '../../types/portal';

export interface ViewCustomField {
  key: string;
  label: string;
  fieldType: string;
  options?: { value: string; label: string }[] | null;
}

interface PaperViewDisplayProps {
  paper: PortalPaper;
  videoPreviewSrc: string | null;
  onMediaPreview: (src: string) => void;
  customFields?: ViewCustomField[];
}

async function downloadPortalAttachment(attachmentId: string, filename: string) {
  try {
    const res = await portalApi.get(`/portal/attachments/${attachmentId}/download`, {
      responseType: 'blob',
    });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch {
    // silent
  }
}

function renderCustomFieldValue(
  fieldType: string,
  value: unknown,
  options?: { value: string; label: string }[] | null
): React.ReactNode {
  if (value === undefined || value === null || value === '') return null;

  if (fieldType === 'file_upload') {
    const fileVal = value as { attachment_id?: string; filename?: string };
    if (!fileVal?.filename) return null;
    return (
      <div className="flex items-center gap-2">
        <svg
          className="w-4 h-4 text-gray-400 flex-shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
          />
        </svg>
        <span className="text-sm text-gray-900 dark:text-gray-100">{fileVal.filename}</span>
        {fileVal.attachment_id && (
          <button
            type="button"
            onClick={() => downloadPortalAttachment(fileVal.attachment_id!, fileVal.filename!)}
            className="inline-flex items-center gap-1 text-xs text-primary-600 dark:text-primary-400 hover:underline"
          >
            Download
          </button>
        )}
      </div>
    );
  }

  if (fieldType === 'richtext') {
    return (
      <span
        className="prose prose-sm max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(String(value)) }}
      />
    );
  }

  if (fieldType === 'checkbox') {
    return <span>{value ? 'Yes' : 'No'}</span>;
  }

  if (fieldType === 'checkbox_group') {
    const vals = Array.isArray(value) ? (value as string[]) : [];
    if (!vals.length) return null;
    const labels = options ? vals.map((v) => options.find((o) => o.value === v)?.label ?? v) : vals;
    return <span>{labels.join(', ')}</span>;
  }

  if (fieldType === 'dropdown') {
    const label = options?.find((o) => o.value === String(value))?.label ?? String(value);
    return <span>{label}</span>;
  }

  return <span>{String(value)}</span>;
}

export default function PaperViewDisplay({
  paper,
  videoPreviewSrc,
  onMediaPreview,
  customFields,
}: PaperViewDisplayProps) {
  return (
    <div className="space-y-5">
      {/* Read-only fields */}
      {paper.session_type_name && (
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            Session Type
          </dt>
          <dd className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">
            {paper.session_type_name}
          </dd>
        </div>
      )}

      {paper.level && (
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Level</dt>
          <dd className="text-sm text-gray-900 dark:text-gray-100 mt-0.5 capitalize">
            {paper.level.replace('_', ' ')}
          </dd>
        </div>
      )}

      {paper.abstract_short && (
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            Short Abstract
          </dt>
          <dd
            className="text-sm text-gray-900 dark:text-gray-100 mt-0.5 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(paper.abstract_short),
            }}
          />
        </div>
      )}

      {paper.abstract_long && (
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            Detailed Abstract
          </dt>
          <dd
            className="text-sm text-gray-900 dark:text-gray-100 mt-0.5 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(paper.abstract_long),
            }}
          />
        </div>
      )}

      {paper.learning_objectives && (
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
            Learning Objectives
          </dt>
          <dd
            className="text-sm text-gray-900 dark:text-gray-100 mt-0.5 prose prose-sm max-w-none"
            dangerouslySetInnerHTML={{
              __html: sanitizeHtml(paper.learning_objectives),
            }}
          />
        </div>
      )}

      {/* Custom fields */}
      {customFields &&
        customFields.length > 0 &&
        paper.custom_field_answers &&
        customFields.map((cf) => {
          const value = paper.custom_field_answers?.[cf.key];
          const rendered = renderCustomFieldValue(cf.fieldType, value, cf.options);
          if (!rendered) return null;
          return (
            <div key={cf.key}>
              <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                {cf.label}
              </dt>
              <dd className="text-sm text-gray-900 dark:text-gray-100 mt-0.5">{rendered}</dd>
            </div>
          );
        })}

      {/* Video (read-only display) */}
      {videoPreviewSrc && (
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
            Video
          </dt>
          <button
            type="button"
            onClick={() => onMediaPreview(videoPreviewSrc)}
            className="w-24 h-24 rounded-lg border-2 border-gray-300 dark:border-gray-600 overflow-hidden bg-gray-50 dark:bg-gray-900 relative cursor-pointer hover:border-primary-400 hover:shadow-md transition-all"
            title="Click to play video"
          >
            <video src={videoPreviewSrc} className="w-full h-full object-cover" muted playsInline />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                <svg
                  className="w-4 h-4 text-gray-700 ml-0.5"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Co-speakers */}
      {paper.cospeakers.length > 0 && (
        <div>
          <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase mb-2">
            Co-speakers
          </dt>
          <div className="flex flex-wrap gap-2">
            {paper.cospeakers.map((cs) => (
              <span
                key={cs.applicant_id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-primary-50 text-primary-700 border border-primary-200"
              >
                <span>{`${cs.first_name || ''} ${cs.last_name || ''}`.trim()}</span>
                <span className="text-primary-400 text-xs">({cs.email})</span>
                <span
                  className={`ml-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${INVITATION_STATUS_COLORS[cs.invitation_status] || 'bg-gray-100 text-gray-600'}`}
                >
                  {cs.invitation_status}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {paper.submitted_at && (
        <div className="pt-4 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-400 dark:text-gray-500">
          Submitted on {formatDate(paper.submitted_at)}
        </div>
      )}
    </div>
  );
}

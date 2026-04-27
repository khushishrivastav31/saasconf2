import portalApi from '../../../config/portalApi';
import type { PortalMessageAttachmentInfo } from '../../../types/portal';
import { formatFileSize } from './utils';

export default function PortalAttachmentDisplay({
  attachment,
  isMe,
}: {
  attachment: PortalMessageAttachmentInfo;
  isMe: boolean;
}) {
  const handleDownload = async () => {
    const response = await portalApi.get(`/portal/messages/attachments/${attachment.id}/download`, {
      responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', attachment.filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleDownload}
      className={`flex items-center gap-2 text-xs px-2.5 py-1.5 rounded mt-1 ${
        isMe
          ? 'bg-blue-500/30 text-blue-100 hover:bg-blue-500/50'
          : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
      }`}
    >
      <svg
        className="w-3.5 h-3.5 flex-shrink-0"
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
      <span className="truncate max-w-[200px]">{attachment.filename}</span>
      <span className="opacity-70 flex-shrink-0">({formatFileSize(attachment.file_size)})</span>
    </button>
  );
}

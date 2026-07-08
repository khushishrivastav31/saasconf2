import { downloadObjectUrl } from '../utils/downloadFile';

interface VideoAttachmentLinkProps {
  /**
   * The resolved blob object URL for the video, or `null` while it is still
   * being fetched. Callers resolve this with `useAuthMedia` (admin) or
   * `usePortalAuthMedia` (portal) so this component stays context-agnostic.
   */
  videoSrc: string | null;
  /** Opens the in-modal preview player (existing behaviour, unchanged). */
  onPreview: () => void;
  /** Base name for the downloaded file (extension is inferred). */
  filenameBase?: string;
}

/**
 * Renders a paper video as: a clickable preview thumbnail, an "Open video" link
 * that opens the video in a new tab, and a "Download" action. Shared by the
 * reviewer portal (AssignedPapersTab, EvaluatedPapersTab) and the admin
 * assignments view (PaperDetailModal).
 */
export default function VideoAttachmentLink({
  videoSrc,
  onPreview,
  filenameBase = 'paper-video',
}: VideoAttachmentLinkProps) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        onClick={onPreview}
        disabled={!videoSrc}
        className={`w-32 h-20 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden bg-gray-100 dark:bg-gray-800 relative ${
          videoSrc ? 'cursor-pointer hover:border-primary-400 hover:shadow-md transition-all' : ''
        }`}
        aria-label={videoSrc ? 'Play video' : 'Loading video'}
        title={videoSrc ? 'Click to play video' : 'Loading video...'}
      >
        {videoSrc ? (
          <>
            <video src={videoSrc} className="w-full h-full object-cover" muted playsInline />
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
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-gray-400" />
          </div>
        )}
      </button>

      {videoSrc && (
        <div className="flex flex-col gap-1.5 text-sm">
          <a
            href={videoSrc}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 hover:underline"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
              />
            </svg>
            Open video
          </a>
          <button
            type="button"
            onClick={() => downloadObjectUrl(videoSrc, filenameBase)}
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
      )}
    </div>
  );
}

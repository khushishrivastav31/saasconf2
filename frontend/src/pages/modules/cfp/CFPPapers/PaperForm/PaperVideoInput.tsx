import { ACCEPTED_VIDEO_FORMATS } from '../../../../../utils/mediaValidation';
import MediaPreviewModal from '../../../../../components/MediaPreviewModal';
import type { MediaPreviewState } from './usePaperVideoState';

interface Props {
  canEdit: boolean;
  videoPreviewSrc: string | null;
  videoError: string | null;
  mediaPreview: MediaPreviewState;
  onMediaPreviewOpen: (src: string) => void;
  onMediaPreviewClose: () => void;
  onVideoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export default function PaperVideoInput({
  canEdit,
  videoPreviewSrc,
  videoError,
  mediaPreview,
  onMediaPreviewOpen,
  onMediaPreviewClose,
  onVideoChange,
}: Props) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Video
        </label>
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => {
              if (videoPreviewSrc) {
                onMediaPreviewOpen(videoPreviewSrc);
              }
            }}
            disabled={!videoPreviewSrc}
            className={`w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden shrink-0 bg-gray-50 dark:bg-gray-900 relative ${
              videoPreviewSrc
                ? 'cursor-pointer hover:border-primary-400 hover:shadow-md transition-all'
                : ''
            }`}
            title={videoPreviewSrc ? 'Click to play video' : undefined}
          >
            {videoPreviewSrc ? (
              <>
                <video
                  src={videoPreviewSrc}
                  className="w-full h-full object-cover"
                  muted
                  playsInline
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <div className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center">
                    <svg
                      className="w-4 h-4 text-gray-700 dark:text-gray-300 ml-0.5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}
          </button>
          <div className="flex-1">
            {canEdit && (
              <>
                <input
                  type="file"
                  accept={ACCEPTED_VIDEO_FORMATS}
                  onChange={onVideoChange}
                  className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
                />
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  MP4, MOV, WebM, AVI, or MKV. Max 50MB.
                </p>
              </>
            )}
            {videoError && <p className="mt-1 text-xs text-red-600">{videoError}</p>}
          </div>
        </div>
      </div>

      <MediaPreviewModal
        open={mediaPreview.open}
        onClose={onMediaPreviewClose}
        src={mediaPreview.src}
        type="video"
        alt="Paper video"
      />
    </>
  );
}

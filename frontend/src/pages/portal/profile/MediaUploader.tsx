import { ACCEPTED_IMAGE_FORMATS, ACCEPTED_VIDEO_FORMATS } from '../../../utils/mediaValidation';

interface Props {
  picturePreviewSrc: string | null;
  videoPreviewSrc: string | null;
  pictureError: string | null;
  videoError: string | null;
  requiredFields?: string[];
  onPictureChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onVideoChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenPreview: (src: string, type: 'image' | 'video') => void;
}

const Req = () => <span className="text-red-500"> *</span>;

export default function MediaUploader({
  picturePreviewSrc,
  videoPreviewSrc,
  pictureError,
  videoError,
  requiredFields = [],
  onPictureChange,
  onVideoChange,
  onOpenPreview,
}: Props) {
  return (
    <>
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Picture{requiredFields.includes('picture') && <Req />}
        </label>
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => {
              if (picturePreviewSrc) onOpenPreview(picturePreviewSrc, 'image');
            }}
            disabled={!picturePreviewSrc}
            className={`w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden flex-shrink-0 bg-gray-50 dark:bg-gray-900 ${
              picturePreviewSrc
                ? 'cursor-pointer hover:border-primary-400 hover:shadow-md transition-all'
                : ''
            }`}
            title={picturePreviewSrc ? 'Click to view full size' : undefined}
          >
            {picturePreviewSrc ? (
              <img src={picturePreviewSrc} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-300">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
            )}
          </button>
          <div className="flex-1">
            <input
              type="file"
              accept={ACCEPTED_IMAGE_FORMATS}
              onChange={onPictureChange}
              className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:dark:bg-gray-700 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              JPEG, PNG, WebP, TIFF, or BMP. Min 600x600px (300 DPI).
            </p>
            {pictureError && <p className="mt-1 text-xs text-red-600">{pictureError}</p>}
          </div>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Video{requiredFields.includes('video') && <Req />}
        </label>
        <div className="flex items-start gap-4">
          <button
            type="button"
            onClick={() => {
              if (videoPreviewSrc) onOpenPreview(videoPreviewSrc, 'video');
            }}
            disabled={!videoPreviewSrc}
            className={`w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden flex-shrink-0 bg-gray-50 dark:bg-gray-900 relative ${
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
            <input
              type="file"
              accept={ACCEPTED_VIDEO_FORMATS}
              onChange={onVideoChange}
              className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:dark:bg-gray-700 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
            />
            <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
              MP4, MOV, WebM, AVI, or MKV. Max 5MB.
            </p>
            {videoError && <p className="mt-1 text-xs text-red-600">{videoError}</p>}
          </div>
        </div>
      </div>
    </>
  );
}

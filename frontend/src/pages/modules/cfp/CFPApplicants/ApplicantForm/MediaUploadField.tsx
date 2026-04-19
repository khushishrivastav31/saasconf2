interface Props {
  kind: 'image' | 'video';
  label: string;
  acceptedFormats: string;
  helpText: string;
  previewSrc: string | null;
  error: string | null;
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onPreviewClick: (src: string) => void;
}

const IMAGE_PLACEHOLDER_PATH =
  'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z';
const VIDEO_PLACEHOLDER_PATH =
  'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z';

export default function MediaUploadField({
  kind,
  label,
  acceptedFormats,
  helpText,
  previewSrc,
  error,
  onFileChange,
  onPreviewClick,
}: Props) {
  const placeholderPath = kind === 'image' ? IMAGE_PLACEHOLDER_PATH : VIDEO_PLACEHOLDER_PATH;
  const clickTitle = previewSrc
    ? kind === 'image'
      ? 'Click to view full size'
      : 'Click to play video'
    : undefined;

  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        {label}
      </label>
      <div className="flex items-start gap-4">
        <button
          type="button"
          onClick={() => {
            if (previewSrc) onPreviewClick(previewSrc);
          }}
          disabled={!previewSrc}
          className={`w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 overflow-hidden flex-shrink-0 bg-gray-50 dark:bg-gray-900 relative ${
            previewSrc
              ? 'cursor-pointer hover:border-primary-400 hover:shadow-md transition-all'
              : ''
          }`}
          title={clickTitle}
        >
          {previewSrc ? (
            kind === 'image' ? (
              <img src={previewSrc} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <>
                <video src={previewSrc} className="w-full h-full object-cover" muted playsInline />
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
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300 dark:text-gray-600">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d={placeholderPath}
                />
              </svg>
            </div>
          )}
        </button>
        <div className="flex-1">
          <input
            type="file"
            accept={acceptedFormats}
            onChange={onFileChange}
            className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
          />
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">{helpText}</p>
          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}

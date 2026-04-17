import { useRef } from 'react';
import { fieldLabelCls } from './styles';

interface Props {
  firstName: string;
  lastName: string;
  pictureUrl: string | null;
  videoUrl: string | null;
  onUploadPicture: (file: File) => void;
  onDeletePicture: () => void;
  onUploadVideo: (file: File) => void;
  onDeleteVideo: () => void;
  pictureUploading: boolean;
  pictureDeleting: boolean;
  videoUploading: boolean;
  videoDeleting: boolean;
}

export default function ProfileMediaFields({
  firstName,
  lastName,
  pictureUrl,
  videoUrl,
  onUploadPicture,
  onDeletePicture,
  onUploadVideo,
  onDeleteVideo,
  pictureUploading,
  pictureDeleting,
  videoUploading,
  videoDeleting,
}: Props) {
  const pictureInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div>
        <label className={fieldLabelCls}>Profile Picture</label>
        <div className="flex items-center gap-4 mt-1">
          {pictureUrl ? (
            <img
              src={pictureUrl}
              alt="Profile"
              className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-500 text-2xl font-semibold">
              {firstName.charAt(0)}
              {lastName.charAt(0)}
            </div>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => pictureInputRef.current?.click()}
                disabled={pictureUploading}
                className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-40"
              >
                {pictureUploading ? 'Uploading...' : 'Choose file'}
              </button>
              {pictureUrl && (
                <button
                  type="button"
                  onClick={onDeletePicture}
                  disabled={pictureDeleting}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 disabled:opacity-40"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              JPEG, PNG, WebP. Min 600x600px
            </p>
          </div>
          <input
            ref={pictureInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadPicture(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>

      <div>
        <label className={fieldLabelCls}>Profile Video</label>
        <div className="flex items-center gap-4 mt-1">
          {videoUrl ? (
            <video
              src={videoUrl}
              className="w-32 h-20 rounded-md object-cover border border-gray-200 dark:border-gray-600 bg-black"
              controls={false}
            />
          ) : (
            <div className="w-32 h-20 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <svg
                className="w-8 h-8 text-gray-400 dark:text-gray-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => videoInputRef.current?.click()}
                disabled={videoUploading}
                className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 disabled:opacity-40"
              >
                {videoUploading ? 'Uploading...' : 'Choose file'}
              </button>
              {videoUrl && (
                <button
                  type="button"
                  onClick={onDeleteVideo}
                  disabled={videoDeleting}
                  className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 disabled:opacity-40"
                >
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              MP4, MOV, WebM, AVI, or MKV. Max 5MB.
            </p>
          </div>
          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/x-matroska"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUploadVideo(file);
              e.target.value = '';
            }}
          />
        </div>
      </div>
    </>
  );
}

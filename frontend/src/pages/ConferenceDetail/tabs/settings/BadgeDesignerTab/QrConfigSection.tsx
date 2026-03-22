import { QR_FIELD_OPTIONS } from './constants';

interface QrConfigSectionProps {
  conferenceId: string;
  isAdmin: boolean;
  showQrConfig: boolean;
  setShowQrConfig: (show: boolean) => void;
  qrFields: string[];
  toggleQrField: (field: string) => void;
  qrLogoAttachmentId: string | null;
  qrPreviewUrl: string | undefined;
  uploadingLogo: boolean;
  handleQrLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleRemoveQrLogo: () => void;
  refetchQrPreview: () => void;
}

export function QrConfigSection({
  isAdmin,
  showQrConfig,
  setShowQrConfig,
  qrFields,
  toggleQrField,
  qrLogoAttachmentId,
  qrPreviewUrl,
  uploadingLogo,
  handleQrLogoUpload,
  handleRemoveQrLogo,
  refetchQrPreview,
}: QrConfigSectionProps) {
  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setShowQrConfig(!showQrConfig)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-900 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <span>
          QR Code Configuration{' '}
          <span className="text-xs font-normal text-gray-500 dark:text-gray-400">
            — select which fields to include in the vCard QR code
          </span>
        </span>
        <svg
          className={`w-4 h-4 transition-transform ${showQrConfig ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {showQrConfig && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            Place{' '}
            <code className="font-mono text-primary-600 dark:text-primary-400">[QR_CODE]</code> in
            your badge template to show the QR code. Select which attendee fields are encoded:
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {QR_FIELD_OPTIONS.map((field) => (
              <label
                key={field.key}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={qrFields.includes(field.key)}
                  onChange={() => toggleQrField(field.key)}
                  disabled={!isAdmin}
                  className="rounded border-gray-300 dark:border-gray-600 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">{field.label}</span>
              </label>
            ))}
          </div>

          {/* QR Logo + Preview */}
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-start gap-6">
              {/* Logo Upload */}
              <div className="flex-1">
                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Center Logo (optional)
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                  Upload a logo to display in the center of the QR code. It will be rendered in
                  black &amp; white. Works best with simple, high-contrast logos.
                </p>
                {qrLogoAttachmentId ? (
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-md text-sm">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      Logo uploaded
                    </span>
                    {isAdmin && (
                      <button
                        onClick={handleRemoveQrLogo}
                        className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ) : (
                  isAdmin && (
                    <label className="inline-flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors">
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleQrLogoUpload}
                        disabled={uploadingLogo}
                        className="hidden"
                      />
                    </label>
                  )
                )}
              </div>

              {/* QR Preview */}
              {qrFields.length > 0 && (
                <div className="shrink-0 text-center">
                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Preview
                  </p>
                  {qrPreviewUrl ? (
                    <img
                      src={qrPreviewUrl}
                      alt="QR Code Preview"
                      className="w-32 h-32 border border-gray-200 dark:border-gray-700 rounded"
                    />
                  ) : (
                    <div className="w-32 h-32 border border-gray-200 dark:border-gray-700 rounded flex items-center justify-center">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
                    </div>
                  )}
                  <button
                    onClick={() => refetchQrPreview()}
                    className="mt-1 text-xs text-primary-600 dark:text-primary-400 hover:underline"
                  >
                    Refresh preview
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

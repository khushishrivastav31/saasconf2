import { useRef } from 'react';
import api from '../../../../../config/api';
import type { Tenant } from '../../../../../types';
import type { LogoStatus } from './useTenantMutations';

interface Props {
  tenant: Tenant;
  logoStatus: LogoStatus;
  logoError: string | null;
  onUpload: (file: File) => void;
  onDelete: () => void;
}

export default function LogoSection({ tenant, logoStatus, logoError, onUpload, onDelete }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="border-b dark:border-gray-700 pb-4">
      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Company Logo</h5>
      <div className="flex items-start gap-4">
        <div className="min-w-24 max-w-48 h-24 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-2">
          {tenant.logo_url ? (
            <img
              src={`${api.defaults.baseURL}${tenant.logo_url}`}
              alt="Company logo"
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <svg
              className="h-12 w-12 text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              />
            </svg>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            onChange={handleLogoUpload}
            className="hidden"
            id="logo-upload"
          />
          <label
            htmlFor="logo-upload"
            className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer ${
              logoStatus === 'uploading'
                ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-wait'
                : 'bg-primary-600 text-white hover:bg-primary-700'
            }`}
          >
            {logoStatus === 'uploading' ? (
              <>
                <Spinner />
                Uploading...
              </>
            ) : (
              <>
                <UploadIcon />
                {tenant.logo_url ? 'Replace Logo' : 'Upload Logo'}
              </>
            )}
          </label>

          {tenant.logo_url && (
            <button
              type="button"
              onClick={onDelete}
              disabled={logoStatus === 'deleting'}
              className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md ${
                logoStatus === 'deleting'
                  ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-wait'
                  : 'bg-white dark:bg-gray-800 text-red-600 border border-red-300 dark:border-red-700 hover:bg-red-50 dark:hover:bg-red-900/30'
              }`}
            >
              {logoStatus === 'deleting' ? (
                <>
                  <Spinner />
                  Deleting...
                </>
              ) : (
                <>
                  <TrashIcon />
                  Delete Logo
                </>
              )}
            </button>
          )}

          {logoError && <p className="text-sm text-red-600">{logoError}</p>}

          <p className="text-xs text-gray-500 dark:text-gray-400">
            JPEG, PNG, WebP, or GIF. Max 10MB.
          </p>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

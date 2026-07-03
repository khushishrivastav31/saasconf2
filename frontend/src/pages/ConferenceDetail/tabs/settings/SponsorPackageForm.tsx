import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import type {
  Attachment,
  SponsorPackage,
  SponsorPackageCreate,
  PlatformCurrency,
} from '../../../../types';
import { queryKeys } from '../../../../config/queryKeys';
import RichTextEditor from '../../../../components/common/RichTextEditor';
import { ErrorBanner } from '../../../../components/common/ErrorBanner';
import ModalFooter from '../../../../components/common/ModalFooter';

export default function SponsorPackageForm({
  item,
  currencies,
  conferenceCurrency,
  onSubmit,
  onClose,
  isLoading,
  error,
}: {
  item: SponsorPackage | null;
  currencies: PlatformCurrency[];
  conferenceCurrency?: string | null;
  onSubmit: (data: SponsorPackageCreate) => void;
  onClose: () => void;
  isLoading: boolean;
  error: string | null;
}) {
  const isEditMode = !!item;
  const isCurrencyLocked = !!conferenceCurrency;
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'deleting'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Contract attachment query (only in edit mode)
  const { data: contractData } = useQuery({
    queryKey: queryKeys.attachments.list('sponsor_package_contract', item?.id ?? ''),
    queryFn: async () => {
      const res = await api.get<{ items: Attachment[]; total: number }>(
        `/attachments?entity_type=sponsor_package_contract&entity_id=${item!.id}`
      );
      return res.data;
    },
    enabled: isEditMode,
  });
  const contract = contractData?.items?.[0] ?? null;

  const uploadContract = useMutation({
    mutationFn: async (file: File) => {
      if (contract) await api.delete(`/attachments/${contract.id}`);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('entity_type', 'sponsor_package_contract');
      fd.append('entity_id', item!.id);
      return api.post<Attachment>('/attachments', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onMutate: () => {
      setUploadStatus('uploading');
      setUploadError(null);
    },
    onSuccess: () => {
      setUploadStatus('idle');
      queryClient.invalidateQueries({
        queryKey: queryKeys.attachments.list('sponsor_package_contract', item?.id ?? ''),
      });
    },
    onError: () => {
      setUploadStatus('idle');
      setUploadError('Upload failed. Please try again.');
    },
  });

  const deleteContract = useMutation({
    mutationFn: async () => {
      if (contract) await api.delete(`/attachments/${contract.id}`);
    },
    onMutate: () => {
      setUploadStatus('deleting');
      setUploadError(null);
    },
    onSuccess: () => {
      setUploadStatus('idle');
      queryClient.invalidateQueries({
        queryKey: queryKeys.attachments.list('sponsor_package_contract', item?.id ?? ''),
      });
    },
    onError: () => {
      setUploadStatus('idle');
      setUploadError('Delete failed. Please try again.');
    },
  });

  const handleContractUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadContract.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleContractDownload = async () => {
    if (!contract) return;
    const res = await api.get(`/attachments/${contract.id}/download`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = contract.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const [formData, setFormData] = useState<SponsorPackageCreate>({
    name: '',
    description: '',
    price: 0,
    currency: conferenceCurrency || '',
    is_active: true,
  });

  useEffect(() => {
    setFormData({
      name: item?.name || '',
      description: item?.description || '',
      price: item?.price ?? 0,
      currency: isCurrencyLocked ? conferenceCurrency : item?.currency || '',
      is_active: item?.is_active ?? true,
    });
  }, [item, isCurrencyLocked, conferenceCurrency]);

  const activeCurrencies = currencies.filter((c) => c.is_active);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      ...formData,
      currency: formData.currency || undefined,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="px-6 py-4 space-y-4">
        <ErrorBanner message={error} />

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Package Name *
          </label>
          <input
            type="text"
            required
            className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Description
          </label>
          <RichTextEditor
            value={formData.description || ''}
            onChange={(html) => setFormData({ ...formData, description: html })}
            rows={3}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Price *
            </label>
            <input
              type="number"
              required
              min="0"
              step="0.01"
              className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
              value={formData.price}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  price: parseFloat(e.target.value) || 0,
                })
              }
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Currency
            </label>
            {isCurrencyLocked ? (
              <input
                type="text"
                value={conferenceCurrency || ''}
                disabled
                title="Set by conference"
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-800 shadow-sm py-2 px-3 text-sm text-gray-600 dark:text-gray-300"
              />
            ) : (
              <select
                className="mt-1 block w-full border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm dark:bg-gray-800 dark:text-gray-100"
                value={formData.currency || ''}
                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              >
                <option value="">-- None --</option>
                {activeCurrencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} ({c.symbol})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="flex items-center">
          <input
            id="conf-sponsor-pkg-active"
            type="checkbox"
            className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded"
            checked={formData.is_active ?? true}
            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
          />
          <label
            htmlFor="conf-sponsor-pkg-active"
            className="ml-2 block text-sm text-gray-900 dark:text-gray-100"
          >
            Active
          </label>
        </div>

        {/* Contract template — edit mode only */}
        {isEditMode && (
          <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Contract Template
            </label>
            {contract ? (
              <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-md">
                <svg
                  className="h-8 w-8 text-gray-400 dark:text-gray-500 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={handleContractDownload}
                    className="text-sm font-medium text-primary-600 hover:text-primary-700 truncate block"
                    title={contract.filename}
                  >
                    {contract.filename}
                  </button>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatFileSize(contract.file_size)}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.doc,.docx,.txt,.rtf"
                    onChange={handleContractUpload}
                    className="hidden"
                    id="contract-upload"
                  />
                  <label
                    htmlFor="contract-upload"
                    className={`px-2.5 py-1 text-xs font-medium rounded-md cursor-pointer ${
                      uploadStatus === 'uploading'
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-wait'
                        : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {uploadStatus === 'uploading' ? 'Uploading...' : 'Replace'}
                  </label>
                  <button
                    type="button"
                    onClick={() => deleteContract.mutate()}
                    disabled={uploadStatus === 'deleting'}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md ${
                      uploadStatus === 'deleting'
                        ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-wait'
                        : 'text-red-600 border border-red-300 hover:bg-red-50'
                    }`}
                  >
                    {uploadStatus === 'deleting' ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.rtf"
                  onChange={handleContractUpload}
                  className="hidden"
                  id="contract-upload"
                />
                <label
                  htmlFor="contract-upload"
                  className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md cursor-pointer ${
                    uploadStatus === 'uploading'
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-wait'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  <svg
                    className="h-4 w-4 mr-1.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  {uploadStatus === 'uploading' ? 'Uploading...' : 'Upload Contract'}
                </label>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  PDF, Word, or text files. Max 10MB.
                </span>
              </div>
            )}
            {uploadError && <p className="mt-1 text-sm text-red-600">{uploadError}</p>}
          </div>
        )}
      </div>

      <ModalFooter onCancel={onClose} isLoading={isLoading} />
    </form>
  );
}

import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../../config/api';
import { queryKeys } from '../../../../config/queryKeys';
import type { Attachment } from '../../../../types/attachment';

/* ─── Photo upload sub-component ──────────────────────────────── */

export function TrainerPhoto({ trainerId }: { trainerId: string }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'idle' | 'uploading' | 'deleting' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const { data: photoData } = useQuery({
    queryKey: queryKeys.attachments.list('trainer_photo', trainerId),
    queryFn: async () => {
      const res = await api.get<{ items: Attachment[]; total: number }>(
        `/attachments?entity_type=trainer_photo&entity_id=${trainerId}`
      );
      return res.data;
    },
  });

  const photo = photoData?.items?.[0];
  const photoId = photo?.id;

  useEffect(() => {
    if (!photoId) {
      setBlobUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    const fetchPhoto = async () => {
      try {
        const res = await api.get(`/attachments/${photoId}/download`, { responseType: 'blob' });
        objectUrl = URL.createObjectURL(res.data);
        setBlobUrl(objectUrl);
      } catch {
        setBlobUrl(null);
      }
    };
    fetchPhoto();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (photo) await api.delete(`/attachments/${photo.id}`);
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entity_type', 'trainer_photo');
      formData.append('entity_id', trainerId);
      return (
        await api.post<Attachment>('/attachments', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
      ).data;
    },
    onMutate: () => {
      setStatus('uploading');
      setError(null);
    },
    onSuccess: () => {
      setStatus('idle');
      queryClient.invalidateQueries({
        queryKey: queryKeys.attachments.list('trainer_photo', trainerId),
      });
    },
    onError: () => {
      setStatus('error');
      setError('Upload failed.');
      setTimeout(() => setStatus('idle'), 3000);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (photo) await api.delete(`/attachments/${photo.id}`);
    },
    onMutate: () => {
      setStatus('deleting');
      setError(null);
    },
    onSuccess: () => {
      setStatus('idle');
      queryClient.invalidateQueries({
        queryKey: queryKeys.attachments.list('trainer_photo', trainerId),
      });
    },
    onError: () => {
      setStatus('error');
      setError('Delete failed.');
      setTimeout(() => setStatus('idle'), 3000);
    },
  });

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="flex items-center gap-4">
      <div className="w-20 h-20 rounded-full border border-gray-300 dark:border-gray-600 overflow-hidden bg-gray-50 dark:bg-gray-900 flex items-center justify-center shrink-0">
        {blobUrl ? (
          <img src={blobUrl} alt="Trainer" className="w-full h-full object-cover" />
        ) : (
          <svg
            className="h-10 w-10 text-gray-300 dark:text-gray-600"
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleUpload}
          className="hidden"
          id={`trainer-photo-${trainerId}`}
        />
        <label
          htmlFor={`trainer-photo-${trainerId}`}
          className={`inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${status === 'uploading' ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 cursor-wait' : 'bg-primary-600 text-white hover:bg-primary-700'}`}
        >
          {status === 'uploading' ? 'Uploading...' : photo ? 'Replace Photo' : 'Upload Photo'}
        </label>
        {photo && (
          <button
            type="button"
            onClick={() => deleteMutation.mutate()}
            disabled={status === 'deleting'}
            className="inline-flex items-center px-3 py-1.5 text-xs font-medium rounded-md bg-white dark:bg-gray-800 text-red-600 border border-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 disabled:opacity-50"
          >
            {status === 'deleting' ? 'Deleting...' : 'Remove'}
          </button>
        )}
        {error && <p className="text-xs text-red-600">{error}</p>}
        <p className="text-xs text-gray-400 dark:text-gray-500">JPEG, PNG, WebP</p>
      </div>
    </div>
  );
}

/* ─── Sidebar avatar (shows photo if uploaded) ────────────────── */

export const TrainerAvatar = React.memo(function TrainerAvatar({
  trainerId,
  initials,
}: {
  trainerId: string;
  initials: string;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const { data: photoData } = useQuery({
    queryKey: queryKeys.attachments.list('trainer_photo', trainerId),
    queryFn: async () => {
      const res = await api.get<{ items: Attachment[]; total: number }>(
        `/attachments?entity_type=trainer_photo&entity_id=${trainerId}`
      );
      return res.data;
    },
    staleTime: 60_000,
  });

  const photoId = photoData?.items?.[0]?.id;

  useEffect(() => {
    if (!photoId) {
      setBlobUrl(null);
      return;
    }
    let objectUrl: string | null = null;
    const fetchPhoto = async () => {
      try {
        const res = await api.get(`/attachments/${photoId}/download`, { responseType: 'blob' });
        objectUrl = URL.createObjectURL(res.data);
        setBlobUrl(objectUrl);
      } catch {
        setBlobUrl(null);
      }
    };
    fetchPhoto();
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);

  return (
    <span className="shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase overflow-hidden">
      {blobUrl ? <img src={blobUrl} alt="" className="w-full h-full object-cover" /> : initials}
    </span>
  );
});

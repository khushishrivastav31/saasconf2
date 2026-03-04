import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../config/api';
import { parseApiError } from '../../utils/apiError';

interface UseConferenceCrudOptions<TEntity> {
  conferenceId: string;
  /** API path segment after /conferences/{id}/, e.g. "sponsors" or "news" */
  endpoint: string;
  /** The query key tuple returned by the queryKeys factory */
  queryKey: readonly unknown[];
  /** Additional query keys to invalidate on any mutation success */
  invalidateKeys?: readonly (readonly unknown[])[];
  /** Callback after a successful create */
  onCreateSuccess?: (entity: TEntity) => void;
  /** Callback after a successful update */
  onUpdateSuccess?: (entity: TEntity) => void;
  /** Callback after a successful delete */
  onDeleteSuccess?: () => void;
}

interface ConferenceCrudResult<TEntity, TCreate, TUpdate> {
  items: TEntity[];
  total: number;
  isLoading: boolean;
  createMutation: ReturnType<typeof useMutation<TEntity, unknown, TCreate>>;
  updateMutation: ReturnType<typeof useMutation<TEntity, unknown, { id: string; data: TUpdate }>>;
  deleteMutation: ReturnType<typeof useMutation<void, unknown, string>>;
  error: string | null;
  setError: (error: string | null) => void;
}

export function useConferenceCrud<TEntity, TCreate, TUpdate = Partial<TCreate>>(
  options: UseConferenceCrudOptions<TEntity>
): ConferenceCrudResult<TEntity, TCreate, TUpdate> {
  const {
    conferenceId,
    endpoint,
    queryKey,
    invalidateKeys,
    onCreateSuccess,
    onUpdateSuccess,
    onDeleteSuccess,
  } = options;
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const basePath = `/conferences/${conferenceId}/${endpoint}`;

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const response = await api.get<{ items: TEntity[]; total: number }>(basePath);
      return response.data;
    },
  });

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey });
    invalidateKeys?.forEach((key) => {
      queryClient.invalidateQueries({ queryKey: key as unknown[] });
    });
  }

  const createMutation = useMutation<TEntity, unknown, TCreate>({
    mutationFn: async (createData: TCreate) => {
      const response = await api.post<TEntity>(basePath, createData);
      return response.data;
    },
    onSuccess: (entity) => {
      invalidateAll();
      setError(null);
      onCreateSuccess?.(entity);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, `Failed to create ${endpoint.replace(/-/g, ' ')}`));
    },
  });

  const updateMutation = useMutation<TEntity, unknown, { id: string; data: TUpdate }>({
    mutationFn: async ({ id, data: updateData }) => {
      const response = await api.put<TEntity>(`${basePath}/${id}`, updateData);
      return response.data;
    },
    onSuccess: (entity) => {
      invalidateAll();
      setError(null);
      onUpdateSuccess?.(entity);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, `Failed to update ${endpoint.replace(/-/g, ' ')}`));
    },
  });

  const deleteMutation = useMutation<void, unknown, string>({
    mutationFn: async (id: string) => {
      await api.delete(`${basePath}/${id}`);
    },
    onSuccess: () => {
      invalidateAll();
      setError(null);
      onDeleteSuccess?.();
    },
    onError: (err: unknown) => {
      setError(parseApiError(err, `Failed to delete ${endpoint.replace(/-/g, ' ')}`));
    },
  });

  return {
    items: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    createMutation,
    updateMutation,
    deleteMutation,
    error,
    setError,
  };
}

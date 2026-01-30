import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "../config/api";
import { parseApiError } from "../utils/apiError";

interface UseSettingsCrudOptions {
  conferenceId: string;
  endpoint: string;
  queryKey: string;
  onCreateSuccess?: () => void;
  onUpdateSuccess?: (variables: { id: string; data: unknown }) => void;
  onDeleteSuccess?: () => void;
}

interface SettingsCrudResult<TEntity, TCreate, TUpdate> {
  data: { items: TEntity[]; total: number } | undefined;
  isLoading: boolean;
  isError: boolean;
  queryError: Error | null;
  createMutation: ReturnType<typeof useMutation<TEntity, unknown, TCreate>>;
  updateMutation: ReturnType<typeof useMutation<TEntity, unknown, { id: string; data: TUpdate }>>;
  deleteMutation: ReturnType<typeof useMutation<void, unknown, string>>;
  error: string | null;
  setError: (error: string | null) => void;
}

export function useSettingsCrud<TEntity, TCreate, TUpdate>(
  options: UseSettingsCrudOptions,
): SettingsCrudResult<TEntity, TCreate, TUpdate> {
  const { conferenceId, endpoint, queryKey, onCreateSuccess, onUpdateSuccess, onDeleteSuccess } = options;
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const basePath = `/conferences/${conferenceId}/settings/${endpoint}`;
  const qk = [queryKey, conferenceId];

  const {
    data,
    isLoading,
    isError,
    error: queryError,
  } = useQuery({
    queryKey: qk,
    queryFn: async () => {
      const response = await api.get<{ items: TEntity[]; total: number }>(basePath);
      return response.data;
    },
  });

  const createMutation = useMutation<TEntity, unknown, TCreate>({
    mutationFn: async (createData: TCreate) => {
      const response = await api.post<TEntity>(basePath, createData);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk });
      setError(null);
      onCreateSuccess?.();
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  const updateMutation = useMutation<TEntity, unknown, { id: string; data: TUpdate }>({
    mutationFn: async ({ id, data: updateData }) => {
      const response = await api.put<TEntity>(`${basePath}/${id}`, updateData);
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: qk });
      setError(null);
      onUpdateSuccess?.(variables);
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  const deleteMutation = useMutation<void, unknown, string>({
    mutationFn: async (id: string) => {
      await api.delete(`${basePath}/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: qk });
      setError(null);
      onDeleteSuccess?.();
    },
    onError: (err: unknown) => {
      setError(parseApiError(err));
    },
  });

  return {
    data,
    isLoading,
    isError,
    queryError: queryError as Error | null,
    createMutation,
    updateMutation,
    deleteMutation,
    error,
    setError,
  };
}

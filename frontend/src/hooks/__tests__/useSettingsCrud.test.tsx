import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSettingsCrud } from "../useSettingsCrud";

// Mock the api module
vi.mock("../../config/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// Mock parseApiError
vi.mock("../../utils/apiError", () => ({
  parseApiError: vi.fn((error) => {
    if (error instanceof Error) return error.message;
    if (error?.response?.data?.detail) return error.response.data.detail;
    return "An unexpected error occurred";
  }),
}));

import api from "../../config/api";
import { parseApiError } from "../../utils/apiError";

// Test entity types
interface TestEntity {
  id: string;
  name: string;
  value: number;
}

interface TestCreate {
  name: string;
  value: number;
}

interface TestUpdate {
  name?: string;
  value?: number;
}

// Helper to create a fresh QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

// Wrapper component that provides QueryClient
function createWrapper() {
  const queryClient = createTestQueryClient();
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe("useSettingsCrud", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("query functionality", () => {
    it("fetches data on mount", async () => {
      const mockData = {
        items: [
          { id: "1", name: "Item 1", value: 10 },
          { id: "2", name: "Item 2", value: 20 },
        ],
        total: 2,
      };

      vi.mocked(api.get).mockResolvedValue({ data: mockData });

      const { result } = renderHook(
        () =>
          useSettingsCrud<TestEntity, TestCreate, TestUpdate>({
            conferenceId: "conf-123",
            endpoint: "categories",
            queryKey: "settings-categories",
          }),
        { wrapper: createWrapper() }
      );

      expect(result.current.isLoading).toBe(true);

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data).toEqual(mockData);
      expect(api.get).toHaveBeenCalledWith(
        "/conferences/conf-123/settings/categories"
      );
    });

    it("returns error state when query fails", async () => {
      vi.mocked(api.get).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(
        () =>
          useSettingsCrud<TestEntity, TestCreate, TestUpdate>({
            conferenceId: "conf-123",
            endpoint: "categories",
            queryKey: "settings-categories",
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isError).toBe(true);
      });

      expect(result.current.queryError).toBeInstanceOf(Error);
      expect(result.current.queryError?.message).toBe("Network error");
    });

    it("uses correct query key with conference ID", async () => {
      const mockData = { items: [], total: 0 };
      vi.mocked(api.get).mockResolvedValue({ data: mockData });

      const queryClient = createTestQueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      const { result } = renderHook(
        () =>
          useSettingsCrud<TestEntity, TestCreate, TestUpdate>({
            conferenceId: "different-conf",
            endpoint: "tracks",
            queryKey: "settings-tracks",
          }),
        { wrapper }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // Verify the query was cached with the correct key
      const cachedData = queryClient.getQueryData(["settings-tracks", "different-conf"]);
      expect(cachedData).toEqual(mockData);
    });
  });

  describe("create mutation", () => {
    it("creates new entity successfully", async () => {
      const mockData = { items: [], total: 0 };
      const newEntity = { id: "new-1", name: "New Item", value: 100 };

      vi.mocked(api.get).mockResolvedValue({ data: mockData });
      vi.mocked(api.post).mockResolvedValue({ data: newEntity });

      const onCreateSuccess = vi.fn();

      const { result } = renderHook(
        () =>
          useSettingsCrud<TestEntity, TestCreate, TestUpdate>({
            conferenceId: "conf-123",
            endpoint: "categories",
            queryKey: "settings-categories",
            onCreateSuccess,
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.createMutation.mutateAsync({
          name: "New Item",
          value: 100,
        });
      });

      expect(api.post).toHaveBeenCalledWith(
        "/conferences/conf-123/settings/categories",
        { name: "New Item", value: 100 }
      );
      expect(onCreateSuccess).toHaveBeenCalled();
      expect(result.current.error).toBeNull();
    });

    it("sets error on create failure", async () => {
      const mockData = { items: [], total: 0 };

      vi.mocked(api.get).mockResolvedValue({ data: mockData });
      vi.mocked(api.post).mockRejectedValue({
        response: { data: { detail: "Name already exists" } },
      });
      vi.mocked(parseApiError).mockReturnValue("Name already exists");

      const { result } = renderHook(
        () =>
          useSettingsCrud<TestEntity, TestCreate, TestUpdate>({
            conferenceId: "conf-123",
            endpoint: "categories",
            queryKey: "settings-categories",
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.createMutation.mutateAsync({
            name: "Duplicate",
            value: 50,
          });
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe("Name already exists");
      expect(parseApiError).toHaveBeenCalled();
    });
  });

  describe("update mutation", () => {
    it("updates entity successfully", async () => {
      const mockData = {
        items: [{ id: "1", name: "Old Name", value: 10 }],
        total: 1,
      };
      const updatedEntity = { id: "1", name: "New Name", value: 10 };

      vi.mocked(api.get).mockResolvedValue({ data: mockData });
      vi.mocked(api.put).mockResolvedValue({ data: updatedEntity });

      const onUpdateSuccess = vi.fn();

      const { result } = renderHook(
        () =>
          useSettingsCrud<TestEntity, TestCreate, TestUpdate>({
            conferenceId: "conf-123",
            endpoint: "categories",
            queryKey: "settings-categories",
            onUpdateSuccess,
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateMutation.mutateAsync({
          id: "1",
          data: { name: "New Name" },
        });
      });

      expect(api.put).toHaveBeenCalledWith(
        "/conferences/conf-123/settings/categories/1",
        { name: "New Name" }
      );
      expect(onUpdateSuccess).toHaveBeenCalledWith({
        id: "1",
        data: { name: "New Name" },
      });
      expect(result.current.error).toBeNull();
    });

    it("sets error on update failure", async () => {
      const mockData = { items: [], total: 0 };

      vi.mocked(api.get).mockResolvedValue({ data: mockData });
      vi.mocked(api.put).mockRejectedValue({
        response: { data: { detail: "Entity not found" } },
      });
      vi.mocked(parseApiError).mockReturnValue("Entity not found");

      const { result } = renderHook(
        () =>
          useSettingsCrud<TestEntity, TestCreate, TestUpdate>({
            conferenceId: "conf-123",
            endpoint: "categories",
            queryKey: "settings-categories",
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.updateMutation.mutateAsync({
            id: "nonexistent",
            data: { name: "Updated" },
          });
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe("Entity not found");
    });
  });

  describe("delete mutation", () => {
    it("deletes entity successfully", async () => {
      const mockData = {
        items: [{ id: "1", name: "To Delete", value: 10 }],
        total: 1,
      };

      vi.mocked(api.get).mockResolvedValue({ data: mockData });
      vi.mocked(api.delete).mockResolvedValue({});

      const onDeleteSuccess = vi.fn();

      const { result } = renderHook(
        () =>
          useSettingsCrud<TestEntity, TestCreate, TestUpdate>({
            conferenceId: "conf-123",
            endpoint: "categories",
            queryKey: "settings-categories",
            onDeleteSuccess,
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.deleteMutation.mutateAsync("1");
      });

      expect(api.delete).toHaveBeenCalledWith(
        "/conferences/conf-123/settings/categories/1"
      );
      expect(onDeleteSuccess).toHaveBeenCalled();
      expect(result.current.error).toBeNull();
    });

    it("sets error on delete failure", async () => {
      const mockData = { items: [], total: 0 };

      vi.mocked(api.get).mockResolvedValue({ data: mockData });
      vi.mocked(api.delete).mockRejectedValue({
        response: { data: { detail: "Cannot delete: entity in use" } },
      });
      vi.mocked(parseApiError).mockReturnValue("Cannot delete: entity in use");

      const { result } = renderHook(
        () =>
          useSettingsCrud<TestEntity, TestCreate, TestUpdate>({
            conferenceId: "conf-123",
            endpoint: "categories",
            queryKey: "settings-categories",
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.deleteMutation.mutateAsync("1");
        } catch {
          // Expected to throw
        }
      });

      expect(result.current.error).toBe("Cannot delete: entity in use");
    });
  });

  describe("error management", () => {
    it("clears error on successful mutation after failure", async () => {
      const mockData = { items: [], total: 0 };
      const newEntity = { id: "1", name: "New", value: 10 };

      vi.mocked(api.get).mockResolvedValue({ data: mockData });
      vi.mocked(api.post)
        .mockRejectedValueOnce({ response: { data: { detail: "First error" } } })
        .mockResolvedValueOnce({ data: newEntity });
      vi.mocked(parseApiError).mockReturnValue("First error");

      const { result } = renderHook(
        () =>
          useSettingsCrud<TestEntity, TestCreate, TestUpdate>({
            conferenceId: "conf-123",
            endpoint: "categories",
            queryKey: "settings-categories",
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      // First attempt fails
      await act(async () => {
        try {
          await result.current.createMutation.mutateAsync({
            name: "Test",
            value: 10,
          });
        } catch {
          // Expected
        }
      });

      expect(result.current.error).toBe("First error");

      // Second attempt succeeds
      await act(async () => {
        await result.current.createMutation.mutateAsync({
          name: "Test",
          value: 10,
        });
      });

      expect(result.current.error).toBeNull();
    });

    it("allows manual error clearing with setError", async () => {
      const mockData = { items: [], total: 0 };

      vi.mocked(api.get).mockResolvedValue({ data: mockData });
      vi.mocked(api.post).mockRejectedValue({
        response: { data: { detail: "Some error" } },
      });
      vi.mocked(parseApiError).mockReturnValue("Some error");

      const { result } = renderHook(
        () =>
          useSettingsCrud<TestEntity, TestCreate, TestUpdate>({
            conferenceId: "conf-123",
            endpoint: "categories",
            queryKey: "settings-categories",
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        try {
          await result.current.createMutation.mutateAsync({
            name: "Test",
            value: 10,
          });
        } catch {
          // Expected
        }
      });

      expect(result.current.error).toBe("Some error");

      // Manually clear the error
      act(() => {
        result.current.setError(null);
      });

      expect(result.current.error).toBeNull();
    });

    it("allows setting custom error message", async () => {
      const mockData = { items: [], total: 0 };
      vi.mocked(api.get).mockResolvedValue({ data: mockData });

      const { result } = renderHook(
        () =>
          useSettingsCrud<TestEntity, TestCreate, TestUpdate>({
            conferenceId: "conf-123",
            endpoint: "categories",
            queryKey: "settings-categories",
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      act(() => {
        result.current.setError("Custom validation error");
      });

      expect(result.current.error).toBe("Custom validation error");
    });
  });

  describe("different endpoints", () => {
    it("works with tracks endpoint", async () => {
      const mockData = {
        items: [{ id: "track-1", name: "Main Track", value: 1 }],
        total: 1,
      };

      vi.mocked(api.get).mockResolvedValue({ data: mockData });

      const { result } = renderHook(
        () =>
          useSettingsCrud<TestEntity, TestCreate, TestUpdate>({
            conferenceId: "conf-456",
            endpoint: "tracks",
            queryKey: "settings-tracks",
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(api.get).toHaveBeenCalledWith(
        "/conferences/conf-456/settings/tracks"
      );
      expect(result.current.data).toEqual(mockData);
    });

    it("works with formats endpoint", async () => {
      const mockData = {
        items: [{ id: "format-1", name: "Workshop", value: 90 }],
        total: 1,
      };

      vi.mocked(api.get).mockResolvedValue({ data: mockData });

      const { result } = renderHook(
        () =>
          useSettingsCrud<TestEntity, TestCreate, TestUpdate>({
            conferenceId: "conf-789",
            endpoint: "formats",
            queryKey: "settings-formats",
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(api.get).toHaveBeenCalledWith(
        "/conferences/conf-789/settings/formats"
      );
    });
  });

  describe("return value structure", () => {
    it("returns all expected properties", async () => {
      const mockData = { items: [], total: 0 };
      vi.mocked(api.get).mockResolvedValue({ data: mockData });

      const { result } = renderHook(
        () =>
          useSettingsCrud<TestEntity, TestCreate, TestUpdate>({
            conferenceId: "conf-123",
            endpoint: "categories",
            queryKey: "settings-categories",
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current).toHaveProperty("data");
      expect(result.current).toHaveProperty("isLoading");
      expect(result.current).toHaveProperty("isError");
      expect(result.current).toHaveProperty("queryError");
      expect(result.current).toHaveProperty("createMutation");
      expect(result.current).toHaveProperty("updateMutation");
      expect(result.current).toHaveProperty("deleteMutation");
      expect(result.current).toHaveProperty("error");
      expect(result.current).toHaveProperty("setError");

      // Verify mutation objects have expected properties
      expect(result.current.createMutation).toHaveProperty("mutate");
      expect(result.current.createMutation).toHaveProperty("mutateAsync");
      expect(result.current.updateMutation).toHaveProperty("mutate");
      expect(result.current.updateMutation).toHaveProperty("mutateAsync");
      expect(result.current.deleteMutation).toHaveProperty("mutate");
      expect(result.current.deleteMutation).toHaveProperty("mutateAsync");
    });
  });

  describe("query invalidation", () => {
    it("invalidates queries after create", async () => {
      const mockData = { items: [], total: 0 };
      const newEntity = { id: "1", name: "New", value: 10 };
      const updatedData = { items: [newEntity], total: 1 };

      vi.mocked(api.get)
        .mockResolvedValueOnce({ data: mockData })
        .mockResolvedValueOnce({ data: updatedData });
      vi.mocked(api.post).mockResolvedValue({ data: newEntity });

      const { result } = renderHook(
        () =>
          useSettingsCrud<TestEntity, TestCreate, TestUpdate>({
            conferenceId: "conf-123",
            endpoint: "categories",
            queryKey: "settings-categories",
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.data?.items).toHaveLength(0);

      await act(async () => {
        await result.current.createMutation.mutateAsync({
          name: "New",
          value: 10,
        });
      });

      // Wait for the refetch after invalidation
      await waitFor(() => {
        expect(api.get).toHaveBeenCalledTimes(2);
      });
    });

    it("invalidates queries after update", async () => {
      const mockData = { items: [{ id: "1", name: "Old", value: 10 }], total: 1 };
      const updatedEntity = { id: "1", name: "Updated", value: 20 };
      const updatedData = { items: [updatedEntity], total: 1 };

      vi.mocked(api.get)
        .mockResolvedValueOnce({ data: mockData })
        .mockResolvedValueOnce({ data: updatedData });
      vi.mocked(api.put).mockResolvedValue({ data: updatedEntity });

      const { result } = renderHook(
        () =>
          useSettingsCrud<TestEntity, TestCreate, TestUpdate>({
            conferenceId: "conf-123",
            endpoint: "categories",
            queryKey: "settings-categories",
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.updateMutation.mutateAsync({
          id: "1",
          data: { name: "Updated", value: 20 },
        });
      });

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledTimes(2);
      });
    });

    it("invalidates queries after delete", async () => {
      const mockData = { items: [{ id: "1", name: "ToDelete", value: 10 }], total: 1 };
      const updatedData = { items: [], total: 0 };

      vi.mocked(api.get)
        .mockResolvedValueOnce({ data: mockData })
        .mockResolvedValueOnce({ data: updatedData });
      vi.mocked(api.delete).mockResolvedValue({});

      const { result } = renderHook(
        () =>
          useSettingsCrud<TestEntity, TestCreate, TestUpdate>({
            conferenceId: "conf-123",
            endpoint: "categories",
            queryKey: "settings-categories",
          }),
        { wrapper: createWrapper() }
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      await act(async () => {
        await result.current.deleteMutation.mutateAsync("1");
      });

      await waitFor(() => {
        expect(api.get).toHaveBeenCalledTimes(2);
      });
    });
  });
});

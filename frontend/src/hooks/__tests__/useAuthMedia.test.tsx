import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useAuthMedia } from "../useAuthMedia";

// Mock the api module
vi.mock("../../config/api", () => ({
  default: {
    get: vi.fn(),
  },
}));

import api from "../../config/api";

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();

describe("useAuthMedia", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = mockCreateObjectURL;
    global.URL.revokeObjectURL = mockRevokeObjectURL;
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("initial state", () => {
    it("returns null when mediaUrl is null", () => {
      const { result } = renderHook(() => useAuthMedia(null));

      expect(result.current).toBeNull();
      expect(api.get).not.toHaveBeenCalled();
    });

    it("returns null initially before fetch completes", () => {
      vi.mocked(api.get).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const { result } = renderHook(() => useAuthMedia("/media/image.png"));

      expect(result.current).toBeNull();
    });
  });

  describe("successful media fetch", () => {
    it("fetches media and returns object URL", async () => {
      const mockBlob = new Blob(["test"], { type: "image/png" });
      const mockObjectUrl = "blob:http://localhost/mock-object-url";

      vi.mocked(api.get).mockResolvedValue({ data: mockBlob });
      mockCreateObjectURL.mockReturnValue(mockObjectUrl);

      const { result } = renderHook(() => useAuthMedia("/media/image.png"));

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl);
      });

      expect(api.get).toHaveBeenCalledWith("/media/image.png", {
        responseType: "blob",
      });
      expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob);
    });

    it("fetches media with correct response type", async () => {
      const mockBlob = new Blob(["pdf content"], { type: "application/pdf" });
      const mockObjectUrl = "blob:http://localhost/mock-pdf-url";

      vi.mocked(api.get).mockResolvedValue({ data: mockBlob });
      mockCreateObjectURL.mockReturnValue(mockObjectUrl);

      const { result } = renderHook(() => useAuthMedia("/documents/file.pdf"));

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl);
      });

      expect(api.get).toHaveBeenCalledWith("/documents/file.pdf", {
        responseType: "blob",
      });
    });
  });

  describe("error handling", () => {
    it("returns null when fetch fails", async () => {
      vi.mocked(api.get).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() => useAuthMedia("/media/image.png"));

      // Wait for the async operation to complete
      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      // Should remain null after error
      expect(result.current).toBeNull();
      expect(mockCreateObjectURL).not.toHaveBeenCalled();
    });

    it("returns null when API returns 404", async () => {
      vi.mocked(api.get).mockRejectedValue({
        response: { status: 404 },
      });

      const { result } = renderHook(() => useAuthMedia("/media/missing.png"));

      await waitFor(() => {
        expect(api.get).toHaveBeenCalled();
      });

      expect(result.current).toBeNull();
    });
  });

  describe("cleanup on unmount", () => {
    it("revokes object URL when component unmounts", async () => {
      const mockBlob = new Blob(["test"], { type: "image/png" });
      const mockObjectUrl = "blob:http://localhost/mock-url-to-revoke";

      vi.mocked(api.get).mockResolvedValue({ data: mockBlob });
      mockCreateObjectURL.mockReturnValue(mockObjectUrl);

      const { result, unmount } = renderHook(() =>
        useAuthMedia("/media/image.png")
      );

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl);
      });

      unmount();

      expect(mockRevokeObjectURL).toHaveBeenCalledWith(mockObjectUrl);
    });

    it("does not revoke URL if fetch was cancelled before completion", async () => {
      let resolvePromise: (value: { data: Blob }) => void;
      const pendingPromise = new Promise<{ data: Blob }>((resolve) => {
        resolvePromise = resolve;
      });

      vi.mocked(api.get).mockReturnValue(pendingPromise);

      const { unmount } = renderHook(() => useAuthMedia("/media/image.png"));

      // Unmount before the fetch completes
      unmount();

      // Now resolve the promise after unmount
      const mockBlob = new Blob(["test"], { type: "image/png" });
      await act(async () => {
        resolvePromise!({ data: mockBlob });
      });

      // createObjectURL should not have been called because of the cancelled flag
      expect(mockCreateObjectURL).not.toHaveBeenCalled();
      expect(mockRevokeObjectURL).not.toHaveBeenCalled();
    });
  });

  describe("URL changes", () => {
    it("fetches new media when URL changes", async () => {
      const mockBlob1 = new Blob(["image1"], { type: "image/png" });
      const mockBlob2 = new Blob(["image2"], { type: "image/jpeg" });
      const mockObjectUrl1 = "blob:http://localhost/image1";
      const mockObjectUrl2 = "blob:http://localhost/image2";

      vi.mocked(api.get)
        .mockResolvedValueOnce({ data: mockBlob1 })
        .mockResolvedValueOnce({ data: mockBlob2 });

      mockCreateObjectURL
        .mockReturnValueOnce(mockObjectUrl1)
        .mockReturnValueOnce(mockObjectUrl2);

      const { result, rerender } = renderHook(
        ({ url }) => useAuthMedia(url),
        { initialProps: { url: "/media/image1.png" } }
      );

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl1);
      });

      // Change the URL
      rerender({ url: "/media/image2.jpg" });

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl2);
      });

      expect(api.get).toHaveBeenCalledTimes(2);
      expect(api.get).toHaveBeenNthCalledWith(1, "/media/image1.png", {
        responseType: "blob",
      });
      expect(api.get).toHaveBeenNthCalledWith(2, "/media/image2.jpg", {
        responseType: "blob",
      });
    });

    it("revokes previous object URL when URL changes", async () => {
      const mockBlob1 = new Blob(["image1"], { type: "image/png" });
      const mockBlob2 = new Blob(["image2"], { type: "image/jpeg" });
      const mockObjectUrl1 = "blob:http://localhost/old-url";
      const mockObjectUrl2 = "blob:http://localhost/new-url";

      vi.mocked(api.get)
        .mockResolvedValueOnce({ data: mockBlob1 })
        .mockResolvedValueOnce({ data: mockBlob2 });

      mockCreateObjectURL
        .mockReturnValueOnce(mockObjectUrl1)
        .mockReturnValueOnce(mockObjectUrl2);

      const { result, rerender } = renderHook(
        ({ url }) => useAuthMedia(url),
        { initialProps: { url: "/media/old.png" } }
      );

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl1);
      });

      // Change the URL
      rerender({ url: "/media/new.png" });

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl2);
      });

      // The old URL should have been revoked during cleanup
      expect(mockRevokeObjectURL).toHaveBeenCalledWith(mockObjectUrl1);
    });

    it("sets src to null when URL changes to null", async () => {
      const mockBlob = new Blob(["test"], { type: "image/png" });
      const mockObjectUrl = "blob:http://localhost/test-url";

      vi.mocked(api.get).mockResolvedValue({ data: mockBlob });
      mockCreateObjectURL.mockReturnValue(mockObjectUrl);

      const { result, rerender } = renderHook(
        ({ url }) => useAuthMedia(url),
        { initialProps: { url: "/media/image.png" as string | null } }
      );

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl);
      });

      // Change URL to null
      rerender({ url: null });

      expect(result.current).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("handles empty string URL like null", async () => {
      // The hook checks for !mediaUrl, so empty string should be treated as falsy
      const { result } = renderHook(() => useAuthMedia(""));

      // Wait a tick to ensure no fetch is attempted
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current).toBeNull();
      // Empty string is falsy, so no fetch should occur
      expect(api.get).not.toHaveBeenCalled();
    });

    it("handles relative URL paths", async () => {
      const mockBlob = new Blob(["test"], { type: "image/png" });
      const mockObjectUrl = "blob:http://localhost/relative-url";

      vi.mocked(api.get).mockResolvedValue({ data: mockBlob });
      mockCreateObjectURL.mockReturnValue(mockObjectUrl);

      const { result } = renderHook(() =>
        useAuthMedia("uploads/profile/avatar.png")
      );

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl);
      });

      expect(api.get).toHaveBeenCalledWith("uploads/profile/avatar.png", {
        responseType: "blob",
      });
    });

    it("handles URLs with query parameters", async () => {
      const mockBlob = new Blob(["test"], { type: "image/png" });
      const mockObjectUrl = "blob:http://localhost/query-url";

      vi.mocked(api.get).mockResolvedValue({ data: mockBlob });
      mockCreateObjectURL.mockReturnValue(mockObjectUrl);

      const { result } = renderHook(() =>
        useAuthMedia("/media/image.png?size=large&format=webp")
      );

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl);
      });

      expect(api.get).toHaveBeenCalledWith(
        "/media/image.png?size=large&format=webp",
        { responseType: "blob" }
      );
    });
  });
});

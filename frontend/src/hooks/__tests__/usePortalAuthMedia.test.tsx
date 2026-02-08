import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { usePortalAuthMedia } from "../usePortalAuthMedia";

// Mock the portalApi module
vi.mock("../../config/portalApi", () => ({
  default: {
    get: vi.fn(),
  },
}));

import portalApi from "../../config/portalApi";

// Mock URL.createObjectURL and URL.revokeObjectURL
const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();

describe("usePortalAuthMedia", () => {
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
      const { result } = renderHook(() => usePortalAuthMedia(null));

      expect(result.current).toBeNull();
      expect(portalApi.get).not.toHaveBeenCalled();
    });

    it("returns null initially before fetch completes", () => {
      vi.mocked(portalApi.get).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      const { result } = renderHook(() =>
        usePortalAuthMedia("/portal/media/image.png")
      );

      expect(result.current).toBeNull();
    });
  });

  describe("successful media fetch", () => {
    it("fetches media and returns object URL using portalApi", async () => {
      const mockBlob = new Blob(["test"], { type: "image/png" });
      const mockObjectUrl = "blob:http://localhost/mock-portal-object-url";

      vi.mocked(portalApi.get).mockResolvedValue({ data: mockBlob });
      mockCreateObjectURL.mockReturnValue(mockObjectUrl);

      const { result } = renderHook(() =>
        usePortalAuthMedia("/portal/media/image.png")
      );

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl);
      });

      expect(portalApi.get).toHaveBeenCalledWith("/portal/media/image.png", {
        responseType: "blob",
      });
      expect(mockCreateObjectURL).toHaveBeenCalledWith(mockBlob);
    });

    it("fetches portal media with correct response type", async () => {
      const mockBlob = new Blob(["video content"], { type: "video/mp4" });
      const mockObjectUrl = "blob:http://localhost/mock-video-url";

      vi.mocked(portalApi.get).mockResolvedValue({ data: mockBlob });
      mockCreateObjectURL.mockReturnValue(mockObjectUrl);

      const { result } = renderHook(() =>
        usePortalAuthMedia("/portal/videos/intro.mp4")
      );

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl);
      });

      expect(portalApi.get).toHaveBeenCalledWith("/portal/videos/intro.mp4", {
        responseType: "blob",
      });
    });

    it("handles applicant profile picture URLs", async () => {
      const mockBlob = new Blob(["profile pic"], { type: "image/jpeg" });
      const mockObjectUrl = "blob:http://localhost/profile-pic-url";

      vi.mocked(portalApi.get).mockResolvedValue({ data: mockBlob });
      mockCreateObjectURL.mockReturnValue(mockObjectUrl);

      const { result } = renderHook(() =>
        usePortalAuthMedia("/portal/applicants/123/picture")
      );

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl);
      });

      expect(portalApi.get).toHaveBeenCalledWith(
        "/portal/applicants/123/picture",
        { responseType: "blob" }
      );
    });
  });

  describe("error handling", () => {
    it("returns null when fetch fails", async () => {
      vi.mocked(portalApi.get).mockRejectedValue(new Error("Network error"));

      const { result } = renderHook(() =>
        usePortalAuthMedia("/portal/media/image.png")
      );

      await waitFor(() => {
        expect(portalApi.get).toHaveBeenCalled();
      });

      expect(result.current).toBeNull();
      expect(mockCreateObjectURL).not.toHaveBeenCalled();
    });

    it("returns null when API returns 401 unauthorized", async () => {
      vi.mocked(portalApi.get).mockRejectedValue({
        response: { status: 401 },
      });

      const { result } = renderHook(() =>
        usePortalAuthMedia("/portal/media/protected.png")
      );

      await waitFor(() => {
        expect(portalApi.get).toHaveBeenCalled();
      });

      expect(result.current).toBeNull();
    });

    it("returns null when API returns 404 not found", async () => {
      vi.mocked(portalApi.get).mockRejectedValue({
        response: { status: 404 },
      });

      const { result } = renderHook(() =>
        usePortalAuthMedia("/portal/media/missing.png")
      );

      await waitFor(() => {
        expect(portalApi.get).toHaveBeenCalled();
      });

      expect(result.current).toBeNull();
    });
  });

  describe("cleanup on unmount", () => {
    it("revokes object URL when component unmounts", async () => {
      const mockBlob = new Blob(["test"], { type: "image/png" });
      const mockObjectUrl = "blob:http://localhost/portal-url-to-revoke";

      vi.mocked(portalApi.get).mockResolvedValue({ data: mockBlob });
      mockCreateObjectURL.mockReturnValue(mockObjectUrl);

      const { result, unmount } = renderHook(() =>
        usePortalAuthMedia("/portal/media/image.png")
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

      vi.mocked(portalApi.get).mockReturnValue(pendingPromise);

      const { unmount } = renderHook(() =>
        usePortalAuthMedia("/portal/media/image.png")
      );

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
      const mockObjectUrl1 = "blob:http://localhost/portal-image1";
      const mockObjectUrl2 = "blob:http://localhost/portal-image2";

      vi.mocked(portalApi.get)
        .mockResolvedValueOnce({ data: mockBlob1 })
        .mockResolvedValueOnce({ data: mockBlob2 });

      mockCreateObjectURL
        .mockReturnValueOnce(mockObjectUrl1)
        .mockReturnValueOnce(mockObjectUrl2);

      const { result, rerender } = renderHook(
        ({ url }) => usePortalAuthMedia(url),
        { initialProps: { url: "/portal/media/image1.png" } }
      );

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl1);
      });

      // Change the URL
      rerender({ url: "/portal/media/image2.jpg" });

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl2);
      });

      expect(portalApi.get).toHaveBeenCalledTimes(2);
      expect(portalApi.get).toHaveBeenNthCalledWith(
        1,
        "/portal/media/image1.png",
        { responseType: "blob" }
      );
      expect(portalApi.get).toHaveBeenNthCalledWith(
        2,
        "/portal/media/image2.jpg",
        { responseType: "blob" }
      );
    });

    it("revokes previous object URL when URL changes", async () => {
      const mockBlob1 = new Blob(["image1"], { type: "image/png" });
      const mockBlob2 = new Blob(["image2"], { type: "image/jpeg" });
      const mockObjectUrl1 = "blob:http://localhost/portal-old-url";
      const mockObjectUrl2 = "blob:http://localhost/portal-new-url";

      vi.mocked(portalApi.get)
        .mockResolvedValueOnce({ data: mockBlob1 })
        .mockResolvedValueOnce({ data: mockBlob2 });

      mockCreateObjectURL
        .mockReturnValueOnce(mockObjectUrl1)
        .mockReturnValueOnce(mockObjectUrl2);

      const { result, rerender } = renderHook(
        ({ url }) => usePortalAuthMedia(url),
        { initialProps: { url: "/portal/media/old.png" } }
      );

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl1);
      });

      // Change the URL
      rerender({ url: "/portal/media/new.png" });

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl2);
      });

      // The old URL should have been revoked during cleanup
      expect(mockRevokeObjectURL).toHaveBeenCalledWith(mockObjectUrl1);
    });

    it("sets src to null when URL changes to null", async () => {
      const mockBlob = new Blob(["test"], { type: "image/png" });
      const mockObjectUrl = "blob:http://localhost/portal-test-url";

      vi.mocked(portalApi.get).mockResolvedValue({ data: mockBlob });
      mockCreateObjectURL.mockReturnValue(mockObjectUrl);

      const { result, rerender } = renderHook(
        ({ url }) => usePortalAuthMedia(url),
        { initialProps: { url: "/portal/media/image.png" as string | null } }
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
      const { result } = renderHook(() => usePortalAuthMedia(""));

      // Wait a tick to ensure no fetch is attempted
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });

      expect(result.current).toBeNull();
      expect(portalApi.get).not.toHaveBeenCalled();
    });

    it("handles submission attachment URLs", async () => {
      const mockBlob = new Blob(["attachment"], { type: "application/pdf" });
      const mockObjectUrl = "blob:http://localhost/submission-attachment";

      vi.mocked(portalApi.get).mockResolvedValue({ data: mockBlob });
      mockCreateObjectURL.mockReturnValue(mockObjectUrl);

      const { result } = renderHook(() =>
        usePortalAuthMedia("/portal/submissions/456/attachments/resume.pdf")
      );

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl);
      });

      expect(portalApi.get).toHaveBeenCalledWith(
        "/portal/submissions/456/attachments/resume.pdf",
        { responseType: "blob" }
      );
    });

    it("handles conference media URLs", async () => {
      const mockBlob = new Blob(["banner"], { type: "image/webp" });
      const mockObjectUrl = "blob:http://localhost/conference-banner";

      vi.mocked(portalApi.get).mockResolvedValue({ data: mockBlob });
      mockCreateObjectURL.mockReturnValue(mockObjectUrl);

      const { result } = renderHook(() =>
        usePortalAuthMedia("/portal/conferences/conf-123/banner.webp")
      );

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl);
      });

      expect(portalApi.get).toHaveBeenCalledWith(
        "/portal/conferences/conf-123/banner.webp",
        { responseType: "blob" }
      );
    });

    it("handles URLs with query parameters", async () => {
      const mockBlob = new Blob(["test"], { type: "image/png" });
      const mockObjectUrl = "blob:http://localhost/portal-query-url";

      vi.mocked(portalApi.get).mockResolvedValue({ data: mockBlob });
      mockCreateObjectURL.mockReturnValue(mockObjectUrl);

      const { result } = renderHook(() =>
        usePortalAuthMedia("/portal/media/image.png?thumbnail=true&width=200")
      );

      await waitFor(() => {
        expect(result.current).toBe(mockObjectUrl);
      });

      expect(portalApi.get).toHaveBeenCalledWith(
        "/portal/media/image.png?thumbnail=true&width=200",
        { responseType: "blob" }
      );
    });
  });
});

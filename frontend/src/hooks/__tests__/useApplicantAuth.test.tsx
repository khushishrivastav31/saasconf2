import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useApplicantAuth } from "../useApplicantAuth";
import { ApplicantAuthContext } from "../../contexts/ApplicantAuthContext";
import type { ApplicantProfile } from "../../types/portal";

describe("useApplicantAuth", () => {
  describe("when used outside ApplicantAuthProvider", () => {
    it("throws an error", () => {
      // Suppress console.error for this test since we expect an error
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      expect(() => {
        renderHook(() => useApplicantAuth());
      }).toThrow("useApplicantAuth must be used within an ApplicantAuthProvider");

      consoleSpy.mockRestore();
    });
  });

  describe("when used inside ApplicantAuthProvider", () => {
    const mockApplicant: ApplicantProfile = {
      id: "applicant-123",
      email: "applicant@example.com",
      first_name: "Test",
      last_name: "Applicant",
      pronouns: "they/them",
      phone: "+1234567890",
      title: "Speaker",
      company: "Tech Corp",
      bio: "A test bio",
      social_links: { linkedin: "https://linkedin.com/in/test" },
      needs_accessibility: false,
      accessibility_details: null,
      agrees_to_recording: true,
      picture_url: null,
      video_url: null,
      created_at: "2024-01-01T00:00:00Z",
    };

    const mockContextValue = {
      applicant: mockApplicant,
      isLoading: false,
      tenantSlug: "test-tenant",
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshApplicant: vi.fn(),
    };

    it("returns the context value", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ApplicantAuthContext.Provider value={mockContextValue}>
          {children}
        </ApplicantAuthContext.Provider>
      );

      const { result } = renderHook(() => useApplicantAuth(), { wrapper });

      expect(result.current).toBe(mockContextValue);
    });

    it("returns the applicant from context", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ApplicantAuthContext.Provider value={mockContextValue}>
          {children}
        </ApplicantAuthContext.Provider>
      );

      const { result } = renderHook(() => useApplicantAuth(), { wrapper });

      expect(result.current.applicant).toEqual(mockApplicant);
      expect(result.current.applicant?.email).toBe("applicant@example.com");
      expect(result.current.applicant?.first_name).toBe("Test");
    });

    it("returns isLoading state from context", () => {
      const loadingContext = {
        ...mockContextValue,
        isLoading: true,
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ApplicantAuthContext.Provider value={loadingContext}>
          {children}
        </ApplicantAuthContext.Provider>
      );

      const { result } = renderHook(() => useApplicantAuth(), { wrapper });

      expect(result.current.isLoading).toBe(true);
    });

    it("returns tenantSlug from context", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ApplicantAuthContext.Provider value={mockContextValue}>
          {children}
        </ApplicantAuthContext.Provider>
      );

      const { result } = renderHook(() => useApplicantAuth(), { wrapper });

      expect(result.current.tenantSlug).toBe("test-tenant");
    });

    it("returns login function from context", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ApplicantAuthContext.Provider value={mockContextValue}>
          {children}
        </ApplicantAuthContext.Provider>
      );

      const { result } = renderHook(() => useApplicantAuth(), { wrapper });

      expect(result.current.login).toBe(mockContextValue.login);
      expect(typeof result.current.login).toBe("function");
    });

    it("returns register function from context", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ApplicantAuthContext.Provider value={mockContextValue}>
          {children}
        </ApplicantAuthContext.Provider>
      );

      const { result } = renderHook(() => useApplicantAuth(), { wrapper });

      expect(result.current.register).toBe(mockContextValue.register);
      expect(typeof result.current.register).toBe("function");
    });

    it("returns logout function from context", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ApplicantAuthContext.Provider value={mockContextValue}>
          {children}
        </ApplicantAuthContext.Provider>
      );

      const { result } = renderHook(() => useApplicantAuth(), { wrapper });

      expect(result.current.logout).toBe(mockContextValue.logout);
      expect(typeof result.current.logout).toBe("function");
    });

    it("returns refreshApplicant function from context", () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ApplicantAuthContext.Provider value={mockContextValue}>
          {children}
        </ApplicantAuthContext.Provider>
      );

      const { result } = renderHook(() => useApplicantAuth(), { wrapper });

      expect(result.current.refreshApplicant).toBe(mockContextValue.refreshApplicant);
      expect(typeof result.current.refreshApplicant).toBe("function");
    });

    it("returns null applicant when not authenticated", () => {
      const unauthenticatedContext = {
        ...mockContextValue,
        applicant: null,
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ApplicantAuthContext.Provider value={unauthenticatedContext}>
          {children}
        </ApplicantAuthContext.Provider>
      );

      const { result } = renderHook(() => useApplicantAuth(), { wrapper });

      expect(result.current.applicant).toBeNull();
    });

    it("returns empty tenantSlug when not set", () => {
      const noTenantContext = {
        ...mockContextValue,
        tenantSlug: "",
      };

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ApplicantAuthContext.Provider value={noTenantContext}>
          {children}
        </ApplicantAuthContext.Provider>
      );

      const { result } = renderHook(() => useApplicantAuth(), { wrapper });

      expect(result.current.tenantSlug).toBe("");
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { usePortalBasePath } from '../usePortalBasePath';

// Mock react-router
vi.mock('react-router', () => ({
  useParams: vi.fn(),
}));

import { useParams } from 'react-router';

describe('usePortalBasePath', () => {
  const mockUseParams = vi.mocked(useParams);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('path generation', () => {
    it('returns correct path for a given company slug', () => {
      mockUseParams.mockReturnValue({ companySlug: 'acme-corp' });

      const { result } = renderHook(() => usePortalBasePath());

      expect(result.current).toBe('/acme-corp/portal');
    });

    it('returns correct path for different company slugs', () => {
      mockUseParams.mockReturnValue({ companySlug: 'my-company' });

      const { result } = renderHook(() => usePortalBasePath());

      expect(result.current).toBe('/my-company/portal');
    });

    it('handles slug with numbers', () => {
      mockUseParams.mockReturnValue({ companySlug: 'company-123' });

      const { result } = renderHook(() => usePortalBasePath());

      expect(result.current).toBe('/company-123/portal');
    });

    it('handles slug with underscores', () => {
      mockUseParams.mockReturnValue({ companySlug: 'my_company_name' });

      const { result } = renderHook(() => usePortalBasePath());

      expect(result.current).toBe('/my_company_name/portal');
    });

    it('handles single character slug', () => {
      mockUseParams.mockReturnValue({ companySlug: 'x' });

      const { result } = renderHook(() => usePortalBasePath());

      expect(result.current).toBe('/x/portal');
    });
  });

  describe('error handling', () => {
    it('throws error when companySlug is undefined', () => {
      mockUseParams.mockReturnValue({});

      // Suppress console.error for this test since we expect an error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => usePortalBasePath());
      }).toThrow('usePortalBasePath must be used inside a route with :companySlug');

      consoleSpy.mockRestore();
    });

    it('throws error when companySlug is empty string', () => {
      mockUseParams.mockReturnValue({ companySlug: '' });

      // Suppress console.error for this test since we expect an error
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        renderHook(() => usePortalBasePath());
      }).toThrow('usePortalBasePath must be used inside a route with :companySlug');

      consoleSpy.mockRestore();
    });
  });
});

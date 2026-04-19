/**
 * Shared test utilities for portal page tests.
 *
 * Usage:
 *   import { createTestQueryClient, mockApplicant, makeApplicantAuthContext,
 *            renderWithPortalProviders, render, screen, waitFor, fireEvent }
 *     from '../../../test-utils';
 */

import React from 'react';
import { render as rtlRender } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { ApplicantAuthContext } from './contexts/ApplicantAuthContext';
import type {
  ApplicantProfile,
  ApplicantLoginRequest,
  ApplicantRegisterRequest,
  PortalMe,
} from './types/portal';

// ── Re-exports from @testing-library/react ──────────────────────────────────

export { render, screen, waitFor, fireEvent, act } from '@testing-library/react';

// ── QueryClient factory ──────────────────────────────────────────────────────

/** Returns a QueryClient with retry disabled — suitable for unit tests. */
export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

// ── Canonical applicant fixture ──────────────────────────────────────────────

/** A complete ApplicantProfile fixture usable in any portal test. */
export const mockApplicant: ApplicantProfile = {
  id: 'applicant-1',
  email: 'speaker@example.com',
  first_name: 'Jane',
  last_name: 'Speaker',
  pronouns: null,
  phone: '555-0100',
  title: 'Engineer',
  company: 'Acme Corp',
  address_line_1: null,
  address_line_2: null,
  city: null,
  postal_code: null,
  country: null,
  bio: 'A seasoned conference speaker.',
  social_links: {},
  needs_accessibility: false,
  accessibility_details: null,
  agrees_to_recording: true,
  allow_out_of_timeframe: false,
  message_notifications_enabled: true,
  theme_preference: null,
  picture_url: 'https://example.com/pic.jpg',
  video_url: null,
  created_at: '2025-01-01T00:00:00Z',
};

// ── Auth context builder ─────────────────────────────────────────────────────

/** The shape returned by makeApplicantAuthContext — matches ApplicantAuthContextType. */
export interface ApplicantAuthContextValue {
  applicant: ApplicantProfile | null;
  portalMe: PortalMe | null;
  isLoading: boolean;
  tenantSlug: string;
  login: (credentials: ApplicantLoginRequest) => Promise<PortalMe>;
  register: (data: ApplicantRegisterRequest) => Promise<string>;
  logout: () => void;
  refreshApplicant: () => Promise<void>;
}

/** A PortalMe fixture matching mockApplicant (CFP + training both enabled for tests that care). */
export const mockPortalMe: PortalMe = {
  id: 'portal-user-1',
  email: 'speaker@example.com',
  first_name: 'Jane',
  last_name: 'Speaker',
  phone: '555-0100',
  pronouns: null,
  title: 'Engineer',
  company: 'Acme Corp',
  bio: 'A seasoned conference speaker.',
  social_links: {},
  address_line_1: null,
  address_line_2: null,
  city: null,
  postal_code: null,
  country: null,
  theme_preference: null,
  is_active: true,
  email_verified: true,
  last_login_at: null,
  created_at: '2025-01-01T00:00:00Z',
  has_conference_account: true,
  has_training_account: false,
  cfp_applicant_id: 'applicant-1',
  training_attendee_id: null,
  training_attendee_status: null,
};

/**
 * Builds a full ApplicantAuthContext value with vi.fn() stubs for all methods.
 *
 * @param overrides  Partial overrides applied on top of mockApplicant, or pass
 *                   `null` explicitly to simulate a logged-out state.
 */
export function makeApplicantAuthContext(
  overrides?: Partial<ApplicantProfile> | null
): ApplicantAuthContextValue {
  const applicant = overrides === null ? null : { ...mockApplicant, ...overrides };
  const portalMe = overrides === null ? null : mockPortalMe;
  return {
    applicant,
    portalMe,
    isLoading: false,
    tenantSlug: 'acme',
    login: vi.fn().mockResolvedValue(mockPortalMe) as unknown as (
      credentials: ApplicantLoginRequest
    ) => Promise<PortalMe>,
    register: vi.fn() as unknown as (data: ApplicantRegisterRequest) => Promise<string>,
    logout: vi.fn() as unknown as () => void,
    refreshApplicant: vi.fn().mockResolvedValue(undefined) as unknown as () => Promise<void>,
  };
}

// ── renderWithPortalProviders ────────────────────────────────────────────────

export interface RenderWithPortalProvidersOptions {
  /**
   * Override the full auth context value.
   * Defaults to makeApplicantAuthContext() (logged-in as mockApplicant).
   */
  authContext?: ApplicantAuthContextValue;
  /**
   * The initial URL for MemoryRouter.
   * Defaults to '/acme/portal'.
   */
  route?: string;
  /**
   * A react-router <Route path> to match the `route`.
   * When provided, the UI is rendered inside:
   *   <Routes><Route path={path} element={ui} /></Routes>
   * When omitted, the UI is rendered directly inside MemoryRouter.
   */
  path?: string;
}

/**
 * Renders `ui` wrapped with:
 *   QueryClientProvider → ApplicantAuthContext.Provider → MemoryRouter (→ optional Routes)
 *
 * This is the standard wrapper for portal pages that consume ApplicantAuthContext.
 * For pages that don't need ApplicantAuthContext or a Router, use `render` from
 * @testing-library/react directly (wrapping with QueryClientProvider as needed).
 */
export function renderWithPortalProviders(
  ui: React.ReactElement,
  {
    authContext = makeApplicantAuthContext(),
    route = '/acme/portal',
    path,
  }: RenderWithPortalProvidersOptions = {}
) {
  const queryClient = createTestQueryClient();

  const content = path ? (
    <Routes>
      <Route path={path} element={ui} />
    </Routes>
  ) : (
    ui
  );

  return rtlRender(
    <QueryClientProvider client={queryClient}>
      <ApplicantAuthContext.Provider value={authContext}>
        <MemoryRouter initialEntries={[route]}>{content}</MemoryRouter>
      </ApplicantAuthContext.Provider>
    </QueryClientProvider>
  );
}

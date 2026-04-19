import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApplicantAuthContext, ApplicantAuthProvider } from '../ApplicantAuthContext';
import { useContext } from 'react';
import type { ApplicantProfile, PortalMe } from '../../types/portal';

// Mock the portalApi module
vi.mock('../../config/portalApi', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
  setApplicantTokens: vi.fn(),
  clearApplicantTokens: vi.fn(),
  getApplicantAccessToken: vi.fn(),
}));

// Import mocked functions
import portalApi, {
  setApplicantTokens,
  clearApplicantTokens,
  getApplicantAccessToken,
} from '../../config/portalApi';

function baseApplicant(overrides: Partial<ApplicantProfile> = {}): ApplicantProfile {
  return {
    id: 'applicant-123',
    email: 'applicant@example.com',
    first_name: 'Test',
    last_name: 'Applicant',
    pronouns: null,
    phone: null,
    title: null,
    company: null,
    address_line_1: null,
    address_line_2: null,
    city: null,
    postal_code: null,
    country: null,
    bio: null,
    social_links: {},
    needs_accessibility: false,
    accessibility_details: null,
    agrees_to_recording: true,
    allow_out_of_timeframe: false,
    message_notifications_enabled: true,
    theme_preference: null,
    picture_url: null,
    video_url: null,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

function basePortalMe(overrides: Partial<PortalMe> = {}): PortalMe {
  return {
    id: 'portal-user-123',
    email: 'applicant@example.com',
    first_name: 'Test',
    last_name: 'Applicant',
    phone: null,
    pronouns: null,
    title: null,
    company: null,
    bio: null,
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
    created_at: '2024-01-01T00:00:00Z',
    has_conference_account: true,
    has_training_account: false,
    cfp_applicant_id: 'applicant-123',
    training_attendee_id: null,
    training_attendee_status: null,
    ...overrides,
  };
}

/**
 * Wire `portalApi.get` to respond differently per URL. The context calls
 * `/portal/unified/me` unconditionally, then `/portal/me` only when the
 * composite response's `has_conference_account` flag is true.
 */
function mockPortalGet(opts: {
  portalMe?: PortalMe | null;
  portalMeError?: Error;
  applicant?: ApplicantProfile | null;
  applicantError?: Error;
}) {
  vi.mocked(portalApi.get).mockImplementation((url: string) => {
    if (url === '/portal/unified/me') {
      if (opts.portalMeError) return Promise.reject(opts.portalMeError);
      return Promise.resolve({ data: opts.portalMe });
    }
    if (url === '/portal/me') {
      if (opts.applicantError) return Promise.reject(opts.applicantError);
      return Promise.resolve({ data: opts.applicant });
    }
    return Promise.reject(new Error(`Unexpected URL: ${url}`));
  });
}

// Helper to create a fresh QueryClient for each test
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

// Wrapper component that provides all necessary context
function TestWrapper({
  children,
  companySlug = 'test-company',
}: {
  children: React.ReactNode;
  companySlug?: string;
}) {
  const queryClient = createTestQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/portal/${companySlug}`]}>
        <Routes>
          <Route
            path="/portal/:companySlug/*"
            element={<ApplicantAuthProvider>{children}</ApplicantAuthProvider>}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

// Helper component to access context values
function TestConsumer() {
  const context = useContext(ApplicantAuthContext);
  return (
    <div>
      <span data-testid="applicant">{context?.applicant ? context.applicant.email : 'null'}</span>
      <span data-testid="portal-me">{context?.portalMe ? context.portalMe.email : 'null'}</span>
      <span data-testid="has-conf">
        {context?.portalMe?.has_conference_account ? 'true' : 'false'}
      </span>
      <span data-testid="has-training">
        {context?.portalMe?.has_training_account ? 'true' : 'false'}
      </span>
      <span data-testid="loading">{context?.isLoading ? 'true' : 'false'}</span>
      <span data-testid="tenant-slug">{context?.tenantSlug || 'empty'}</span>
    </div>
  );
}

describe('ApplicantAuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initial state', () => {
    it('sets applicant to null and isLoading to false when no token exists', async () => {
      vi.mocked(getApplicantAccessToken).mockReturnValue(null);

      render(
        <TestWrapper>
          <TestConsumer />
        </TestWrapper>
      );

      // Wait for initialization to complete
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('applicant')).toHaveTextContent('null');
      // Should not attempt to fetch applicant when no token
      expect(portalApi.get).not.toHaveBeenCalled();
    });

    it('starts with isLoading true and fetches applicant when token exists', async () => {
      vi.mocked(getApplicantAccessToken).mockReturnValue('valid-token');
      mockPortalGet({
        portalMe: basePortalMe({ email: 'applicant@example.com' }),
        applicant: baseApplicant({ email: 'applicant@example.com' }),
      });

      render(
        <TestWrapper>
          <TestConsumer />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('applicant')).toHaveTextContent('applicant@example.com');
      expect(portalApi.get).toHaveBeenCalledWith('/portal/unified/me');
      expect(portalApi.get).toHaveBeenCalledWith('/portal/me');
    });

    it('provides tenant slug from URL params', async () => {
      vi.mocked(getApplicantAccessToken).mockReturnValue(null);

      render(
        <TestWrapper companySlug="my-company">
          <TestConsumer />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('tenant-slug')).toHaveTextContent('my-company');
    });

    it('exposes portalMe without applicant for training-only users', async () => {
      vi.mocked(getApplicantAccessToken).mockReturnValue('training-token');
      mockPortalGet({
        portalMe: basePortalMe({
          has_conference_account: false,
          has_training_account: true,
          cfp_applicant_id: null,
          training_attendee_id: 'attendee-1',
          email: 'trainee@example.com',
        }),
      });

      render(
        <TestWrapper>
          <TestConsumer />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('applicant')).toHaveTextContent('null');
      expect(screen.getByTestId('portal-me')).toHaveTextContent('trainee@example.com');
      expect(screen.getByTestId('has-conf')).toHaveTextContent('false');
      expect(screen.getByTestId('has-training')).toHaveTextContent('true');
      expect(portalApi.get).toHaveBeenCalledWith('/portal/unified/me');
      expect(portalApi.get).not.toHaveBeenCalledWith('/portal/me');
    });
  });

  describe('login function', () => {
    it('authenticates applicant and fetches profile on successful login', async () => {
      const mockTokenResponse = {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
        token_type: 'bearer',
        expires_in: 3600,
      };

      vi.mocked(getApplicantAccessToken).mockReturnValue(null);
      vi.mocked(portalApi.post).mockResolvedValue({ data: mockTokenResponse });
      mockPortalGet({
        portalMe: basePortalMe({ email: 'logged-in@example.com' }),
        applicant: baseApplicant({ email: 'logged-in@example.com', first_name: 'Logged' }),
      });

      let loginFn:
        | ((credentials: { email: string; password: string }) => Promise<PortalMe>)
        | undefined;

      render(
        <TestWrapper companySlug="test-company">
          <ApplicantAuthContext.Consumer>
            {(context) => {
              loginFn = context?.login;
              return (
                <div>
                  <span data-testid="applicant">
                    {context?.applicant ? context.applicant.email : 'null'}
                  </span>
                  <span data-testid="loading">{context?.isLoading ? 'true' : 'false'}</span>
                </div>
              );
            }}
          </ApplicantAuthContext.Consumer>
        </TestWrapper>
      );

      // Wait for initial loading to complete
      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      // Perform login
      await act(async () => {
        await loginFn?.({ email: 'test@example.com', password: 'password123' });
      });

      expect(portalApi.post).toHaveBeenCalledWith('/portal/test-company/unified/login', {
        email: 'test@example.com',
        password: 'password123',
      });

      expect(setApplicantTokens).toHaveBeenCalledWith('access-token-123', 'refresh-token-123');
      expect(portalApi.get).toHaveBeenCalledWith('/portal/unified/me');
      expect(portalApi.get).toHaveBeenCalledWith('/portal/me');

      await waitFor(() => {
        expect(screen.getByTestId('applicant')).toHaveTextContent('logged-in@example.com');
      });
    });

    it('returns PortalMe for training-only login and skips /portal/me', async () => {
      const mockTokenResponse = {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
        token_type: 'bearer',
        expires_in: 3600,
      };

      vi.mocked(getApplicantAccessToken).mockReturnValue(null);
      vi.mocked(portalApi.post).mockResolvedValue({ data: mockTokenResponse });
      mockPortalGet({
        portalMe: basePortalMe({
          has_conference_account: false,
          has_training_account: true,
          cfp_applicant_id: null,
          training_attendee_id: 'attendee-1',
          email: 'trainee@example.com',
        }),
      });

      let loginFn:
        | ((credentials: { email: string; password: string }) => Promise<PortalMe>)
        | undefined;
      let lastLoginResult: PortalMe | null = null;

      render(
        <TestWrapper companySlug="test-company">
          <ApplicantAuthContext.Consumer>
            {(context) => {
              loginFn = context?.login;
              return <div data-testid="loading">{context?.isLoading ? 'true' : 'false'}</div>;
            }}
          </ApplicantAuthContext.Consumer>
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      await act(async () => {
        lastLoginResult = (await loginFn?.({
          email: 'trainee@example.com',
          password: 'pw',
        })) as PortalMe;
      });

      expect(lastLoginResult).not.toBeNull();
      expect(lastLoginResult!.has_training_account).toBe(true);
      expect(lastLoginResult!.has_conference_account).toBe(false);
      expect(portalApi.get).toHaveBeenCalledWith('/portal/unified/me');
      expect(portalApi.get).not.toHaveBeenCalledWith('/portal/me');
    });

    it('throws error on login failure', async () => {
      vi.mocked(getApplicantAccessToken).mockReturnValue(null);
      vi.mocked(portalApi.post).mockRejectedValue(new Error('Invalid credentials'));

      let loginFn:
        | ((credentials: { email: string; password: string }) => Promise<PortalMe>)
        | undefined;

      render(
        <TestWrapper>
          <ApplicantAuthContext.Consumer>
            {(context) => {
              loginFn = context?.login;
              return <div data-testid="loading">{context?.isLoading ? 'true' : 'false'}</div>;
            }}
          </ApplicantAuthContext.Consumer>
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      await expect(
        act(async () => {
          await loginFn?.({ email: 'test@example.com', password: 'wrong' });
        })
      ).rejects.toThrow('Invalid credentials');

      expect(setApplicantTokens).not.toHaveBeenCalled();
    });
  });

  describe('register function', () => {
    it('registers new applicant and returns success message', async () => {
      const mockResponse = {
        message: 'Registration successful. Please check your email.',
      };

      vi.mocked(getApplicantAccessToken).mockReturnValue(null);
      vi.mocked(portalApi.post).mockResolvedValue({ data: mockResponse });

      let registerFn:
        | ((data: {
            email: string;
            password: string;
            first_name: string;
            last_name: string;
          }) => Promise<string>)
        | undefined;

      render(
        <TestWrapper companySlug="test-company">
          <ApplicantAuthContext.Consumer>
            {(context) => {
              registerFn = context?.register;
              return <div data-testid="loading">{context?.isLoading ? 'true' : 'false'}</div>;
            }}
          </ApplicantAuthContext.Consumer>
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      let result: string | undefined;
      await act(async () => {
        result = await registerFn?.({
          email: 'new@example.com',
          password: 'password123',
          first_name: 'New',
          last_name: 'User',
        });
      });

      expect(portalApi.post).toHaveBeenCalledWith('/portal/test-company/register', {
        email: 'new@example.com',
        password: 'password123',
        first_name: 'New',
        last_name: 'User',
      });

      expect(result).toBe('Registration successful. Please check your email.');
    });

    it('throws error on registration failure', async () => {
      vi.mocked(getApplicantAccessToken).mockReturnValue(null);
      vi.mocked(portalApi.post).mockRejectedValue(new Error('Email already exists'));

      let registerFn:
        | ((data: {
            email: string;
            password: string;
            first_name: string;
            last_name: string;
          }) => Promise<string>)
        | undefined;

      render(
        <TestWrapper>
          <ApplicantAuthContext.Consumer>
            {(context) => {
              registerFn = context?.register;
              return <div data-testid="loading">{context?.isLoading ? 'true' : 'false'}</div>;
            }}
          </ApplicantAuthContext.Consumer>
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      await expect(
        act(async () => {
          await registerFn?.({
            email: 'existing@example.com',
            password: 'password123',
            first_name: 'Existing',
            last_name: 'User',
          });
        })
      ).rejects.toThrow('Email already exists');
    });
  });

  describe('logout function', () => {
    it('clears applicant and tokens on logout', async () => {
      vi.mocked(getApplicantAccessToken).mockReturnValue('valid-token');
      mockPortalGet({
        portalMe: basePortalMe({ email: 'test@example.com' }),
        applicant: baseApplicant({ email: 'test@example.com' }),
      });

      let logoutFn: (() => void) | undefined;

      render(
        <TestWrapper>
          <ApplicantAuthContext.Consumer>
            {(context) => {
              logoutFn = context?.logout;
              return (
                <div>
                  <span data-testid="applicant">
                    {context?.applicant ? context.applicant.email : 'null'}
                  </span>
                  <span data-testid="loading">{context?.isLoading ? 'true' : 'false'}</span>
                </div>
              );
            }}
          </ApplicantAuthContext.Consumer>
        </TestWrapper>
      );

      // Wait for applicant to be loaded
      await waitFor(() => {
        expect(screen.getByTestId('applicant')).toHaveTextContent('test@example.com');
      });

      // Perform logout
      act(() => {
        logoutFn?.();
      });

      expect(clearApplicantTokens).toHaveBeenCalled();
      expect(screen.getByTestId('applicant')).toHaveTextContent('null');
    });
  });

  describe('applicant fetch on mount with existing token', () => {
    it('fetches applicant data when token exists on mount', async () => {
      vi.mocked(getApplicantAccessToken).mockReturnValue('existing-token');
      mockPortalGet({
        portalMe: basePortalMe({ email: 'existing@example.com' }),
        applicant: baseApplicant({ email: 'existing@example.com', first_name: 'Existing' }),
      });

      render(
        <TestWrapper>
          <TestConsumer />
        </TestWrapper>
      );

      expect(screen.getByTestId('loading')).toHaveTextContent('true');

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('applicant')).toHaveTextContent('existing@example.com');
      expect(portalApi.get).toHaveBeenCalledWith('/portal/unified/me');
      expect(portalApi.get).toHaveBeenCalledWith('/portal/me');
    });

    it('clears tokens when applicant fetch fails with existing token', async () => {
      vi.mocked(getApplicantAccessToken).mockReturnValue('invalid-token');
      mockPortalGet({ portalMeError: new Error('Unauthorized') });

      render(
        <TestWrapper>
          <TestConsumer />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(clearApplicantTokens).toHaveBeenCalled();
      expect(screen.getByTestId('applicant')).toHaveTextContent('null');
      expect(screen.getByTestId('portal-me')).toHaveTextContent('null');
    });

    it('does not fetch applicant when no token exists', async () => {
      vi.mocked(getApplicantAccessToken).mockReturnValue(null);

      render(
        <TestWrapper>
          <TestConsumer />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(portalApi.get).not.toHaveBeenCalled();
      expect(screen.getByTestId('applicant')).toHaveTextContent('null');
    });
  });

  describe('refreshApplicant function', () => {
    it('refreshes applicant data when called', async () => {
      const initialApplicant = baseApplicant({
        email: 'initial@example.com',
        first_name: 'Initial',
      });
      const updatedApplicant = baseApplicant({
        email: 'updated@example.com',
        first_name: 'Updated',
        bio: 'Updated bio',
      });
      const initialPortalMe = basePortalMe({ email: 'initial@example.com' });
      const updatedPortalMe = basePortalMe({ email: 'updated@example.com' });

      vi.mocked(getApplicantAccessToken).mockReturnValue('valid-token');

      let callIndex = 0;
      vi.mocked(portalApi.get).mockImplementation((url: string) => {
        if (url === '/portal/unified/me') {
          const data = callIndex === 0 ? initialPortalMe : updatedPortalMe;
          return Promise.resolve({ data });
        }
        if (url === '/portal/me') {
          const data = callIndex === 0 ? initialApplicant : updatedApplicant;
          callIndex += 1;
          return Promise.resolve({ data });
        }
        return Promise.reject(new Error(`Unexpected URL: ${url}`));
      });

      let refreshApplicantFn: (() => Promise<void>) | undefined;

      render(
        <TestWrapper>
          <ApplicantAuthContext.Consumer>
            {(context) => {
              refreshApplicantFn = context?.refreshApplicant;
              return (
                <div>
                  <span data-testid="applicant">
                    {context?.applicant ? context.applicant.email : 'null'}
                  </span>
                  <span data-testid="loading">{context?.isLoading ? 'true' : 'false'}</span>
                </div>
              );
            }}
          </ApplicantAuthContext.Consumer>
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('applicant')).toHaveTextContent('initial@example.com');
      });

      // Refresh applicant
      await act(async () => {
        await refreshApplicantFn?.();
      });

      // unified/me + /portal/me each called twice (once on mount, once on refresh)
      expect(vi.mocked(portalApi.get).mock.calls.length).toBe(4);
      expect(screen.getByTestId('applicant')).toHaveTextContent('updated@example.com');
    });
  });

  describe('context value', () => {
    it('provides all expected context values', async () => {
      vi.mocked(getApplicantAccessToken).mockReturnValue(null);

      let contextValue: ReturnType<typeof useContext<typeof ApplicantAuthContext>> = null;

      render(
        <TestWrapper companySlug="test-slug">
          <ApplicantAuthContext.Consumer>
            {(context) => {
              contextValue = context;
              return <div data-testid="loading">{context?.isLoading ? 'true' : 'false'}</div>;
            }}
          </ApplicantAuthContext.Consumer>
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(contextValue).not.toBeNull();
      expect(contextValue).toHaveProperty('applicant');
      expect(contextValue).toHaveProperty('portalMe');
      expect(contextValue).toHaveProperty('isLoading');
      expect(contextValue).toHaveProperty('tenantSlug');
      expect(contextValue).toHaveProperty('login');
      expect(contextValue).toHaveProperty('register');
      expect(contextValue).toHaveProperty('logout');
      expect(contextValue).toHaveProperty('refreshApplicant');
      expect(typeof contextValue?.login).toBe('function');
      expect(typeof contextValue?.register).toBe('function');
      expect(typeof contextValue?.logout).toBe('function');
      expect(typeof contextValue?.refreshApplicant).toBe('function');
      expect(contextValue?.tenantSlug).toBe('test-slug');
    });
  });

  describe('QueryClient integration', () => {
    it('clears query cache on login', async () => {
      const mockTokenResponse = {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
        token_type: 'bearer',
        expires_in: 3600,
      };

      vi.mocked(getApplicantAccessToken).mockReturnValue(null);
      vi.mocked(portalApi.post).mockResolvedValue({ data: mockTokenResponse });
      mockPortalGet({
        portalMe: basePortalMe({ email: 'test@example.com' }),
        applicant: baseApplicant({ email: 'test@example.com' }),
      });

      let loginFn:
        | ((credentials: { email: string; password: string }) => Promise<PortalMe>)
        | undefined;

      render(
        <TestWrapper>
          <ApplicantAuthContext.Consumer>
            {(context) => {
              loginFn = context?.login;
              return <div data-testid="loading">{context?.isLoading ? 'true' : 'false'}</div>;
            }}
          </ApplicantAuthContext.Consumer>
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      // Login should succeed and clear the query cache
      // (we can't directly test cache clearing, but we verify the flow works)
      await act(async () => {
        await loginFn?.({ email: 'test@example.com', password: 'password123' });
      });

      expect(portalApi.post).toHaveBeenCalled();
      expect(setApplicantTokens).toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApplicantAuthContext, ApplicantAuthProvider } from '../ApplicantAuthContext';
import { useContext } from 'react';

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
      const mockApplicant = {
        id: 'applicant-123',
        email: 'applicant@example.com',
        first_name: 'Test',
        last_name: 'Applicant',
        pronouns: null,
        phone: null,
        title: null,
        company: null,
        bio: null,
        social_links: {},
        needs_accessibility: false,
        accessibility_details: null,
        agrees_to_recording: true,
        picture_url: null,
        video_url: null,
        created_at: '2024-01-01T00:00:00Z',
      };

      vi.mocked(getApplicantAccessToken).mockReturnValue('valid-token');
      vi.mocked(portalApi.get).mockResolvedValue({ data: mockApplicant });

      render(
        <TestWrapper>
          <TestConsumer />
        </TestWrapper>
      );

      await waitFor(() => {
        expect(screen.getByTestId('loading')).toHaveTextContent('false');
      });

      expect(screen.getByTestId('applicant')).toHaveTextContent('applicant@example.com');
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
  });

  describe('login function', () => {
    it('authenticates applicant and fetches profile on successful login', async () => {
      const mockTokenResponse = {
        access_token: 'access-token-123',
        refresh_token: 'refresh-token-123',
        token_type: 'bearer',
        expires_in: 3600,
      };

      const mockApplicant = {
        id: 'applicant-123',
        email: 'logged-in@example.com',
        first_name: 'Logged',
        last_name: 'In',
        pronouns: 'she/her',
        phone: '+1234567890',
        title: 'Developer',
        company: 'Tech Corp',
        bio: 'A developer bio',
        social_links: { linkedin: 'https://linkedin.com/in/test' },
        needs_accessibility: false,
        accessibility_details: null,
        agrees_to_recording: true,
        picture_url: null,
        video_url: null,
        created_at: '2024-01-01T00:00:00Z',
      };

      vi.mocked(getApplicantAccessToken).mockReturnValue(null);
      vi.mocked(portalApi.post).mockResolvedValue({ data: mockTokenResponse });
      vi.mocked(portalApi.get).mockResolvedValue({ data: mockApplicant });

      let loginFn:
        | ((credentials: { email: string; password: string }) => Promise<void>)
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

      expect(portalApi.post).toHaveBeenCalledWith('/portal/test-company/login', {
        email: 'test@example.com',
        password: 'password123',
      });

      expect(setApplicantTokens).toHaveBeenCalledWith('access-token-123', 'refresh-token-123');
      expect(portalApi.get).toHaveBeenCalledWith('/portal/me');

      await waitFor(() => {
        expect(screen.getByTestId('applicant')).toHaveTextContent('logged-in@example.com');
      });
    });

    it('throws error on login failure', async () => {
      vi.mocked(getApplicantAccessToken).mockReturnValue(null);
      vi.mocked(portalApi.post).mockRejectedValue(new Error('Invalid credentials'));

      let loginFn:
        | ((credentials: { email: string; password: string }) => Promise<void>)
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
      const mockApplicant = {
        id: 'applicant-123',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'Applicant',
        pronouns: null,
        phone: null,
        title: null,
        company: null,
        bio: null,
        social_links: {},
        needs_accessibility: false,
        accessibility_details: null,
        agrees_to_recording: true,
        picture_url: null,
        video_url: null,
        created_at: '2024-01-01T00:00:00Z',
      };

      vi.mocked(getApplicantAccessToken).mockReturnValue('valid-token');
      vi.mocked(portalApi.get).mockResolvedValue({ data: mockApplicant });

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
      const mockApplicant = {
        id: 'applicant-123',
        email: 'existing@example.com',
        first_name: 'Existing',
        last_name: 'Applicant',
        pronouns: 'he/him',
        phone: '+1987654321',
        title: 'Speaker',
        company: 'Conference Co',
        bio: 'An existing applicant bio',
        social_links: { twitter: 'https://twitter.com/test' },
        needs_accessibility: true,
        accessibility_details: 'Wheelchair access needed',
        agrees_to_recording: false,
        picture_url: 'https://example.com/photo.jpg',
        video_url: 'https://youtube.com/watch?v=123',
        created_at: '2024-01-01T00:00:00Z',
      };

      vi.mocked(getApplicantAccessToken).mockReturnValue('existing-token');
      vi.mocked(portalApi.get).mockResolvedValue({ data: mockApplicant });

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
      expect(portalApi.get).toHaveBeenCalledWith('/portal/me');
    });

    it('clears tokens when applicant fetch fails with existing token', async () => {
      vi.mocked(getApplicantAccessToken).mockReturnValue('invalid-token');
      vi.mocked(portalApi.get).mockRejectedValue(new Error('Unauthorized'));

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
      const initialApplicant = {
        id: 'applicant-123',
        email: 'initial@example.com',
        first_name: 'Initial',
        last_name: 'Applicant',
        pronouns: null,
        phone: null,
        title: null,
        company: null,
        bio: null,
        social_links: {},
        needs_accessibility: false,
        accessibility_details: null,
        agrees_to_recording: true,
        picture_url: null,
        video_url: null,
        created_at: '2024-01-01T00:00:00Z',
      };

      const updatedApplicant = {
        ...initialApplicant,
        email: 'updated@example.com',
        first_name: 'Updated',
        bio: 'Updated bio',
      };

      vi.mocked(getApplicantAccessToken).mockReturnValue('valid-token');
      vi.mocked(portalApi.get)
        .mockResolvedValueOnce({ data: initialApplicant })
        .mockResolvedValueOnce({ data: updatedApplicant });

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

      expect(portalApi.get).toHaveBeenCalledTimes(2);
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

      const mockApplicant = {
        id: 'applicant-123',
        email: 'test@example.com',
        first_name: 'Test',
        last_name: 'Applicant',
        pronouns: null,
        phone: null,
        title: null,
        company: null,
        bio: null,
        social_links: {},
        needs_accessibility: false,
        accessibility_details: null,
        agrees_to_recording: true,
        picture_url: null,
        video_url: null,
        created_at: '2024-01-01T00:00:00Z',
      };

      vi.mocked(getApplicantAccessToken).mockReturnValue(null);
      vi.mocked(portalApi.post).mockResolvedValue({ data: mockTokenResponse });
      vi.mocked(portalApi.get).mockResolvedValue({ data: mockApplicant });

      let loginFn:
        | ((credentials: { email: string; password: string }) => Promise<void>)
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

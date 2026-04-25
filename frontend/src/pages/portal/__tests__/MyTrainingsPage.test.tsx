import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router';
import MyTrainingsPage from '../MyTrainingsPage';
import { createTestQueryClient } from '../../../test-utils';

vi.mock('../../../config/portalApi', () => ({
  default: { get: vi.fn() },
}));

import portalApi from '../../../config/portalApi';

const mockPortalApi = vi.mocked(portalApi);

function renderPage() {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/acme/portal/trainings']}>
        <Routes>
          <Route path="/:companySlug/portal/trainings" element={<MyTrainingsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('MyTrainingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // The endpoint contract is `{items: [...]}` — see
  // backend/app/core/portal_training_listing.py and the assertions in
  // backend/tests/trainings/test_portal_my_trainings_offers.py. Locking
  // it here so a future refactor that mistypes the response as a bare
  // array (which silently broke the sidebar before) fails the build.
  it('renders training cards when endpoint returns {items: [...]}', async () => {
    mockPortalApi.get.mockResolvedValueOnce({
      data: {
        items: [
          {
            id: 'reg-1',
            source: 'registration',
            training_name: 'Advanced Testing',
            start_date: '2026-09-15',
            location_name: null,
            location_city: 'Berlin',
            location_country: 'DE',
            trainers: ['Jane Doe'],
            status: 'paid',
          },
        ],
      },
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Advanced Testing')).toBeInTheDocument();
    });
    expect(screen.queryByText(/no training registrations yet/i)).not.toBeInTheDocument();
  });

  it('shows the empty state when items is an empty array', async () => {
    mockPortalApi.get.mockResolvedValueOnce({ data: { items: [] } });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText(/no training registrations yet/i)).toBeInTheDocument();
    });
  });
});

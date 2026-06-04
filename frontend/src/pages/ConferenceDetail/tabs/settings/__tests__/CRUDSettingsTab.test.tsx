import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CRUDSettingsTab from '../CRUDSettingsTab';

vi.mock('../../../../../config/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock('../../../../../components/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
}));

import api from '../../../../../config/api';
const mockedApi = vi.mocked(api);

const CONFERENCE = { id: 'conf-1' };

const COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'slug', label: 'Slug' },
];

function wrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  mockedApi.get.mockResolvedValue({
    data: { items: [{ id: '1', name: 'Keynote', slug: 'keynote' }] },
  });
});

describe('CRUDSettingsTab — sticky actions layout', () => {
  it('wraps the table in an overflow-x-auto container', async () => {
    render(
      <CRUDSettingsTab
        conference={CONFERENCE}
        isAdmin
        endpoint="session-types"
        queryKey="session-types"
        title="Session Types"
        description="Manage session types"
        entityName="Session Type"
        columns={COLUMNS}
      />,
      { wrapper: wrapper() }
    );

    await waitFor(() => screen.getByText('Keynote'));

    const table = screen.getByRole('table');
    const tableContainer = table.parentElement!;
    expect(tableContainer.className).toMatch(/overflow-x-auto/);
  });

  it('applies sticky right-0 to the Actions <th>', async () => {
    render(
      <CRUDSettingsTab
        conference={CONFERENCE}
        isAdmin
        endpoint="session-types"
        queryKey="session-types"
        title="Session Types"
        description="Manage session types"
        entityName="Session Type"
        columns={COLUMNS}
      />,
      { wrapper: wrapper() }
    );

    await waitFor(() => screen.getByText('Keynote'));

    const actionsTh = screen.getByRole('columnheader', { name: /actions/i });
    expect(actionsTh.className).toMatch(/sticky/);
    expect(actionsTh.className).toMatch(/right-0/);
    expect(actionsTh.className).toMatch(/z-\[1\]/);
  });

  it('applies sticky right-0 to every Actions <td>', async () => {
    render(
      <CRUDSettingsTab
        conference={CONFERENCE}
        isAdmin
        endpoint="session-types"
        queryKey="session-types"
        title="Session Types"
        description="Manage session types"
        entityName="Session Type"
        columns={COLUMNS}
      />,
      { wrapper: wrapper() }
    );

    await waitFor(() => screen.getByText('Keynote'));

    const editBtn = screen.getByRole('button', { name: /edit/i });
    const actionsTd = editBtn.closest('td')!;
    expect(actionsTd.className).toMatch(/sticky/);
    expect(actionsTd.className).toMatch(/right-0/);
    expect(actionsTd.className).toMatch(/z-\[1\]/);
  });

  it('does not render an Actions column when isAdmin is false', async () => {
    render(
      <CRUDSettingsTab
        conference={CONFERENCE}
        isAdmin={false}
        endpoint="session-types"
        queryKey="session-types"
        title="Session Types"
        description="Manage session types"
        entityName="Session Type"
        columns={COLUMNS}
      />,
      { wrapper: wrapper() }
    );

    await waitFor(() => screen.getByText('Keynote'));

    expect(screen.queryByRole('columnheader', { name: /actions/i })).toBeNull();
  });
});

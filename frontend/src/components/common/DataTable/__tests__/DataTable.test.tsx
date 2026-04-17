import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DataTable from '../DataTable';
import { useDataTableState } from '../useDataTableState';
import type { Column } from '../DataTable.types';
import { act, renderHook } from '@testing-library/react';

interface Row {
  id: string;
  name: string;
  amount: number;
}

const rows: Row[] = [
  { id: '1', name: 'Alpha', amount: 100 },
  { id: '2', name: 'Beta', amount: 50 },
];

const columns: Column<Row>[] = [
  { key: 'name', header: 'Name', sortable: true },
  {
    key: 'amount',
    header: 'Amount',
    sortable: true,
    render: (r) => `$${r.amount}`,
    align: 'right',
  },
];

describe('DataTable', () => {
  it('renders headers and rows', () => {
    render(<DataTable columns={columns} data={rows} />);
    expect(screen.getByText('Name')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('$100')).toBeInTheDocument();
  });

  it('renders empty state when data is []', () => {
    render(<DataTable columns={columns} data={[]} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
  });

  it('renders a custom empty state node', () => {
    render(<DataTable columns={columns} data={[]} emptyState={<div>Nothing here</div>} />);
    expect(screen.getByText('Nothing here')).toBeInTheDocument();
  });

  it('renders error banner', () => {
    render(<DataTable columns={columns} data={rows} error="boom" />);
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
  });

  it('renders loading skeleton rows when isLoading', () => {
    const { container } = render(<DataTable columns={columns} data={[]} isLoading />);
    expect(container.querySelectorAll('tr.animate-pulse').length).toBe(5);
  });

  it('fires onRowClick with the full row', () => {
    const onRowClick = vi.fn();
    render(<DataTable columns={columns} data={rows} onRowClick={onRowClick} />);
    fireEvent.click(screen.getByText('Alpha'));
    expect(onRowClick).toHaveBeenCalledWith(rows[0]);
  });

  it('highlights the selected row', () => {
    render(<DataTable columns={columns} data={rows} selectedKey="2" onRowClick={() => {}} />);
    const betaRow = screen.getByText('Beta').closest('tr')!;
    expect(betaRow.className).toContain('bg-primary-50');
  });

  it('calls onSortChange when a sortable header is clicked', () => {
    const onSortChange = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={rows}
        sort={{ key: 'name', direction: 'asc' }}
        onSortChange={onSortChange}
      />
    );
    fireEvent.click(screen.getByText('Name'));
    expect(onSortChange).toHaveBeenCalledWith({ key: 'name', direction: 'desc' });
  });
});

describe('useDataTableState', () => {
  it('toggles direction on the same key', () => {
    const { result } = renderHook(() => useDataTableState<Row>({ key: 'name', direction: 'asc' }));
    act(() => result.current.onSortChange({ key: 'name', direction: 'asc' }));
    expect(result.current.sort).toEqual({ key: 'name', direction: 'desc' });
  });

  it('switches to the new key with the provided direction', () => {
    const { result } = renderHook(() => useDataTableState<Row>({ key: 'name', direction: 'asc' }));
    act(() => result.current.onSortChange({ key: 'amount', direction: 'desc' }));
    expect(result.current.sort).toEqual({ key: 'amount', direction: 'desc' });
  });
});

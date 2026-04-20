import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import UserDetailHeader from '../UserDetailHeader';

vi.mock('../../../hooks/useAuthMedia', () => ({
  useAuthMedia: (url: string | null) => (url ? `blob:${url}` : null),
}));

describe('UserDetailHeader', () => {
  it('renders name, email, and initials fallback when no picture', () => {
    render(<UserDetailHeader firstName="Jane" lastName="Doe" email="jane@example.com" />);
    expect(screen.getByRole('heading', { name: /Jane Doe/ })).toBeInTheDocument();
    expect(screen.getByText('jane@example.com')).toBeInTheDocument();
    expect(screen.getByText('JD')).toBeInTheDocument();
  });

  it('renders an <img> instead of initials when pictureUrl is provided', () => {
    render(
      <UserDetailHeader
        firstName="Jane"
        lastName="Doe"
        email="jane@example.com"
        pictureUrl="/media/avatar.jpg"
      />
    );
    const img = screen.getByRole('img', { name: /Jane Doe/ });
    expect(img).toHaveAttribute('src', 'blob:/media/avatar.jpg');
    expect(screen.queryByText('JD')).toBeNull();
  });

  it('falls back to "?" when both names are empty', () => {
    render(<UserDetailHeader firstName="" lastName="" email="noname@example.com" />);
    expect(screen.getByText('?')).toBeInTheDocument();
  });

  it('renders the status chip with the tone-specific class', () => {
    render(
      <UserDetailHeader
        firstName="Jane"
        lastName="Doe"
        email="j@x.com"
        statusLabel="Parked"
        statusTone="parked"
      />
    );
    const chip = screen.getByText('Parked');
    expect(chip.className).toMatch(/bg-amber-100/);
  });

  it('hides the status chip when statusLabel is omitted', () => {
    render(<UserDetailHeader firstName="J" lastName="D" email="j@x.com" />);
    expect(screen.queryByText(/Active|Inactive|Parked/)).toBeNull();
  });

  it('renders a primary action and calls onClick when pressed', () => {
    const onClick = vi.fn();
    render(
      <UserDetailHeader
        firstName="J"
        lastName="D"
        email="j@x.com"
        primaryAction={{ label: 'Reactivate', onClick }}
      />
    );
    const btn = screen.getByRole('button', { name: 'Reactivate' });
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('shows loading label and disables the button when loading', () => {
    render(
      <UserDetailHeader
        firstName="J"
        lastName="D"
        email="j@x.com"
        primaryAction={{
          label: 'Reactivate',
          onClick: () => {},
          loading: true,
          loadingLabel: 'Reactivating...',
        }}
      />
    );
    const btn = screen.getByRole('button', { name: /Reactivating/ });
    expect(btn).toBeDisabled();
  });

  it('falls back to "Label..." when loading without an explicit loadingLabel', () => {
    render(
      <UserDetailHeader
        firstName="J"
        lastName="D"
        email="j@x.com"
        primaryAction={{ label: 'Save', onClick: () => {}, loading: true }}
      />
    );
    expect(screen.getByRole('button', { name: /Save\.{3}/ })).toBeInTheDocument();
  });
});

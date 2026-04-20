import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import BackLink from '../BackLink';

describe('BackLink', () => {
  it('renders the default label and calls onClick when pressed', () => {
    const onClick = vi.fn();
    render(<BackLink onClick={onClick} />);

    const btn = screen.getByRole('button', { name: /Back to users/i });
    expect(btn).toHaveAttribute('type', 'button');
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('respects a custom label', () => {
    render(<BackLink onClick={() => {}} label="Back to list" />);
    expect(screen.getByRole('button', { name: /Back to list/i })).toBeInTheDocument();
  });
});

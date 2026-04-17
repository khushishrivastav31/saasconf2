import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import TextArea from '../TextArea';

describe('TextArea', () => {
  it('renders a textarea with the label', () => {
    render(<TextArea id="bio" label="Bio" />);
    const t = screen.getByLabelText('Bio');
    expect(t.tagName).toBe('TEXTAREA');
  });

  it('defaults to 4 rows and respects override', () => {
    render(<TextArea id="bio" label="Bio" rows={8} />);
    expect(screen.getByLabelText('Bio')).toHaveAttribute('rows', '8');
  });

  it('shows error styling', () => {
    render(<TextArea id="bio" label="Bio" error="Too short" />);
    expect(screen.getByText('Too short')).toBeInTheDocument();
    expect(screen.getByLabelText('Bio').className).toContain('border-red-500');
  });
});

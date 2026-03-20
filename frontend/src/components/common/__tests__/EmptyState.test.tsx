import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../EmptyState';

describe('EmptyState', () => {
  it('renders the title', () => {
    render(<EmptyState title="No items found" />);
    expect(screen.getByText('No items found')).toBeInTheDocument();
  });

  it('renders description when provided', () => {
    render(<EmptyState title="Empty" description="Try adding something" />);
    expect(screen.getByText('Try adding something')).toBeInTheDocument();
  });

  it('does not render description when omitted', () => {
    const { container } = render(<EmptyState title="Empty" />);
    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(0);
  });

  it('renders icon when provided', () => {
    render(<EmptyState title="Empty" icon={<svg data-testid="test-icon" />} />);
    expect(screen.getByTestId('test-icon')).toBeInTheDocument();
  });

  it('renders action slot when provided', () => {
    render(<EmptyState title="Empty" action={<button>Add Item</button>} />);
    expect(screen.getByRole('button', { name: 'Add Item' })).toBeInTheDocument();
  });
});

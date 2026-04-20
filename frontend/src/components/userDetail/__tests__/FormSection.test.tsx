import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import FormSection from '../FormSection';

describe('FormSection', () => {
  it('renders children without a header when no title is given', () => {
    render(
      <FormSection>
        <p>body content</p>
      </FormSection>
    );
    expect(screen.getByText('body content')).toBeInTheDocument();
    expect(screen.queryByRole('heading')).toBeNull();
  });

  it('renders a title + description header when provided', () => {
    render(
      <FormSection title="Identity" description="Who they are">
        <p>body</p>
      </FormSection>
    );
    expect(screen.getByRole('heading', { name: /Identity/ })).toBeInTheDocument();
    expect(screen.getByText('Who they are')).toBeInTheDocument();
  });

  it('omits inner padding when padded=false', () => {
    const { container } = render(
      <FormSection padded={false}>
        <span data-testid="child">x</span>
      </FormSection>
    );
    const child = screen.getByTestId('child');
    const wrapper = child.parentElement!;
    expect(wrapper.className).toBe('');
    expect(container.firstChild).not.toBeNull();
  });
});

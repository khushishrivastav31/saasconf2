import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Checkbox from '../Checkbox';

describe('Checkbox', () => {
  it('renders a label associated with the checkbox', () => {
    render(<Checkbox id="accept" label="I agree" />);
    const cb = screen.getByLabelText('I agree');
    expect(cb).toHaveAttribute('type', 'checkbox');
  });

  it('toggles via onChange', () => {
    const onChange = vi.fn();
    render(<Checkbox id="a" label="Agree" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('Agree'));
    expect(onChange).toHaveBeenCalled();
  });

  it('shows error text when error is set', () => {
    render(<Checkbox id="a" label="Agree" error="You must accept" />);
    expect(screen.getByText('You must accept')).toBeInTheDocument();
    expect(screen.getByLabelText('Agree')).toHaveAttribute('aria-invalid', 'true');
  });

  it('honors disabled', () => {
    render(<Checkbox id="a" label="Agree" disabled />);
    const cb = screen.getByLabelText('Agree') as HTMLInputElement;
    expect(cb.disabled).toBe(true);
  });
});

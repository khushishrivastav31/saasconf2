import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Input from '../Input';

describe('Input', () => {
  it('renders the label and wires it to the input via htmlFor', () => {
    render(<Input id="email" label="Email" />);
    const input = screen.getByLabelText('Email');
    expect(input).toHaveAttribute('id', 'email');
    expect(input).toHaveAttribute('type', 'text');
  });

  it('shows a required marker when required is true', () => {
    render(<Input id="email" label="Email" required />);
    expect(screen.getByLabelText('required')).toBeInTheDocument();
  });

  it('renders helper text when provided', () => {
    render(<Input id="x" label="X" helperText="Pick a good one" />);
    expect(screen.getByText('Pick a good one')).toBeInTheDocument();
  });

  it('renders error text and swaps the border to red', () => {
    render(<Input id="x" label="X" error="Required" />);
    const err = screen.getByText('Required');
    expect(err).toBeInTheDocument();
    const input = screen.getByLabelText('X');
    expect(input.className).toContain('border-red-500');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('includes dark-mode classes by default', () => {
    render(<Input id="x" label="X" />);
    const input = screen.getByLabelText('X');
    expect(input.className).toContain('dark:bg-gray-800');
    expect(input.className).toContain('dark:text-gray-100');
  });

  it('forwards onChange and disabled', () => {
    const onChange = vi.fn();
    render(<Input id="x" label="X" onChange={onChange} disabled />);
    const input = screen.getByLabelText('X') as HTMLInputElement;
    expect(input.disabled).toBe(true);
    fireEvent.change(input, { target: { value: 'hello' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('hides helper text when an error is present', () => {
    render(<Input id="x" label="X" helperText="helper" error="oops" />);
    expect(screen.getByText('oops')).toBeInTheDocument();
    expect(screen.queryByText('helper')).not.toBeInTheDocument();
  });
});

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import Select from '../Select';

describe('Select', () => {
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta' },
  ];

  it('renders options from the options prop', () => {
    render(<Select id="s" label="Pick" options={options} defaultValue="a" />);
    expect(screen.getByRole('option', { name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Beta' })).toBeInTheDocument();
  });

  it('renders a placeholder option when placeholder is set', () => {
    render(<Select id="s" label="Pick" options={options} placeholder="Choose…" defaultValue="" />);
    expect(screen.getByRole('option', { name: 'Choose…' })).toBeInTheDocument();
  });

  it('renders children instead of options when provided', () => {
    render(
      <Select id="s" label="Pick" defaultValue="x">
        <option value="x">Explicit</option>
      </Select>
    );
    expect(screen.getByRole('option', { name: 'Explicit' })).toBeInTheDocument();
  });

  it('applies error styling when error is set', () => {
    render(<Select id="s" label="Pick" options={options} error="Required" defaultValue="a" />);
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(screen.getByLabelText('Pick').className).toContain('border-red-500');
  });
});

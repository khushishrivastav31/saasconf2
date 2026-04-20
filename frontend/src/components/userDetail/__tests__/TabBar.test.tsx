import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import TabBar, { type TabDescriptor } from '../TabBar';

type T = 'a' | 'b' | 'c';

const tabs: TabDescriptor<T>[] = [
  { id: 'a', label: 'Alpha' },
  { id: 'b', label: 'Bravo', count: 3 },
  { id: 'c', label: 'Charlie', count: 0 },
];

describe('TabBar', () => {
  it('renders one button per tab with type="button"', () => {
    render(<TabBar tabs={tabs} active="a" onChange={() => {}} />);
    ['Alpha', 'Bravo', 'Charlie'].forEach((label) => {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toHaveAttribute(
        'type',
        'button'
      );
    });
  });

  it('shows a non-zero count next to the label but hides zero counts', () => {
    render(<TabBar tabs={tabs} active="a" onChange={() => {}} />);
    const bravo = screen.getByRole('button', { name: /Bravo/ });
    expect(bravo.textContent).toMatch(/Bravo\s*\(3\)/);
    const charlie = screen.getByRole('button', { name: /Charlie/ });
    expect(charlie.textContent).not.toMatch(/\(/);
  });

  it('invokes onChange with the clicked tab id', () => {
    const onChange = vi.fn();
    render(<TabBar tabs={tabs} active="a" onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Bravo/ }));
    expect(onChange).toHaveBeenCalledWith('b');
  });

  it('applies the active style only to the active tab', () => {
    render(<TabBar tabs={tabs} active="b" onChange={() => {}} />);
    const bravo = screen.getByRole('button', { name: /Bravo/ });
    const alpha = screen.getByRole('button', { name: /Alpha/ });
    expect(bravo.className).toMatch(/border-primary-600/);
    expect(alpha.className).not.toMatch(/border-primary-600/);
  });
});

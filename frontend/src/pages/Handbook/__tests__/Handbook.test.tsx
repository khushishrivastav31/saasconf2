import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Handbook from '../index';

// jsdom does not implement either — mock globally
window.HTMLElement.prototype.scrollIntoView = vi.fn();
class MockIntersectionObserver {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn().mockReturnValue([]);
  root = null;
  rootMargin = '';
  thresholds = [];
}
(
  globalThis as unknown as { IntersectionObserver: typeof IntersectionObserver }
).IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

describe('Handbook search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters sections when the search matches a single word', async () => {
    const user = userEvent.setup();
    render(<Handbook type="conferences" />);
    const input = screen.getByPlaceholderText(/Search handbook/i);
    await user.type(input, 'privacy');
    // The results counter reads "N result" / "N results"
    expect(screen.getByText(/^\d+ results?$/)).toBeInTheDocument();
    expect(screen.queryByText(/No results/)).not.toBeInTheDocument();
  });

  it('matches sections containing all tokens of a multi-word query (AND)', async () => {
    const user = userEvent.setup();
    render(<Handbook type="conferences" />);
    const input = screen.getByPlaceholderText(/Search handbook/i);
    // Words in this order do not appear adjacent in any section body, but
    // both tokens appear somewhere in the GDPR sections — the old
    // substring-only search would have returned 0 here.
    await user.type(input, 'subject privacy');
    expect(screen.queryByText(/No results/)).not.toBeInTheDocument();
  });

  it('shows "No results" when no section contains all tokens', async () => {
    const user = userEvent.setup();
    render(<Handbook type="conferences" />);
    const input = screen.getByPlaceholderText(/Search handbook/i);
    await user.type(input, 'xyzzynotarealtoken');
    expect(screen.getByText(/No results/i)).toBeInTheDocument();
  });

  it('clears the search and scrolls to the section when a TOC entry is clicked while searching', async () => {
    const scrollSpy = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollSpy;

    const user = userEvent.setup();
    render(<Handbook type="conferences" />);
    const input = screen.getByPlaceholderText(/Search handbook/i);
    await user.type(input, 'privacy');

    // Find the desktop sidebar nav (hidden lg:block, but present in DOM)
    const navs = screen.getAllByRole('navigation', { hidden: true });
    const sidebar = navs.find((n) => within(n).queryByText(/Contents/i)) ?? navs[0];
    // Pick any section button within the sidebar that matched the filter
    const sectionButtons = within(sidebar).getAllByRole('button');
    const target = sectionButtons.find((b) => /privacy/i.test(b.textContent ?? ''));
    expect(target).toBeDefined();

    await user.click(target!);

    // Search cleared
    expect(input).toHaveValue('');
    // Scroll was requested
    expect(scrollSpy).toHaveBeenCalled();
  });
});

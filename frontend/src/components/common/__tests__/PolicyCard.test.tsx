import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PolicyCard from '../PolicyCard';
import type { PolicyEntry } from '../policyConstants';

vi.mock('../RichTextEditor', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea
      data-testid="rich-text-editor"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  ),
}));

const defaultEntry: PolicyEntry = {
  type: 'url',
  url: 'https://example.com/privacy',
  content: null,
  enabled: true,
};

const disabledEntry: PolicyEntry = {
  type: null,
  url: null,
  content: null,
  enabled: false,
};

describe('PolicyCard', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders policy title', () => {
    render(
      <PolicyCard
        policyKey="privacy_policy"
        entry={defaultEntry}
        onChange={mockOnChange}
        disabled={false}
      />
    );
    expect(screen.getByText('Privacy Policy')).toBeInTheDocument();
  });

  it('shows external URL mode when type is url', () => {
    render(
      <PolicyCard
        policyKey="privacy_policy"
        entry={defaultEntry}
        onChange={mockOnChange}
        disabled={false}
      />
    );
    const urlRadio = screen.getByLabelText('External URL');
    expect(urlRadio).toBeChecked();
  });

  it('shows inline content mode when type is content', () => {
    const contentEntry: PolicyEntry = {
      type: 'content',
      url: null,
      content: '<p>Privacy content</p>',
      enabled: true,
    };
    render(
      <PolicyCard
        policyKey="privacy_policy"
        entry={contentEntry}
        onChange={mockOnChange}
        disabled={false}
      />
    );
    const contentRadio = screen.getByLabelText('Inline Content');
    expect(contentRadio).toBeChecked();
  });

  it('toggle between URL and content modes calls onChange', async () => {
    const user = userEvent.setup();
    render(
      <PolicyCard
        policyKey="privacy_policy"
        entry={defaultEntry}
        onChange={mockOnChange}
        disabled={false}
      />
    );
    const contentRadio = screen.getByLabelText('Inline Content');
    await user.click(contentRadio);
    expect(mockOnChange).toHaveBeenCalledWith(
      'privacy_policy',
      expect.objectContaining({ type: 'content' })
    );
  });

  it('shows Visible text when enabled', () => {
    render(
      <PolicyCard
        policyKey="privacy_policy"
        entry={defaultEntry}
        onChange={mockOnChange}
        disabled={false}
      />
    );
    expect(screen.getByText('Visible')).toBeInTheDocument();
  });

  it('shows Hidden text when disabled', () => {
    render(
      <PolicyCard
        policyKey="privacy_policy"
        entry={disabledEntry}
        onChange={mockOnChange}
        disabled={false}
      />
    );
    expect(screen.getByText('Hidden')).toBeInTheDocument();
  });

  it('toggling the enabled checkbox calls onChange', async () => {
    const user = userEvent.setup();
    render(
      <PolicyCard
        policyKey="privacy_policy"
        entry={defaultEntry}
        onChange={mockOnChange}
        disabled={false}
      />
    );
    const toggle = screen.getByRole('checkbox');
    await user.click(toggle);
    expect(mockOnChange).toHaveBeenCalledWith(
      'privacy_policy',
      expect.objectContaining({ enabled: false })
    );
  });

  it('shows URL input when type is url', () => {
    render(
      <PolicyCard
        policyKey="privacy_policy"
        entry={defaultEntry}
        onChange={mockOnChange}
        disabled={false}
      />
    );
    const urlInput = screen.getByPlaceholderText('https://example.com/privacy-policy');
    expect(urlInput).toBeInTheDocument();
    expect(urlInput).toHaveValue('https://example.com/privacy');
  });

  it('shows rich text editor when type is content', () => {
    const contentEntry: PolicyEntry = {
      type: 'content',
      url: null,
      content: '<p>Privacy</p>',
      enabled: true,
    };
    render(
      <PolicyCard
        policyKey="privacy_policy"
        entry={contentEntry}
        onChange={mockOnChange}
        disabled={false}
      />
    );
    expect(screen.getByTestId('rich-text-editor')).toBeInTheDocument();
  });

  it('renders description text', () => {
    render(
      <PolicyCard
        policyKey="privacy_policy"
        entry={defaultEntry}
        onChange={mockOnChange}
        disabled={false}
      />
    );
    expect(
      screen.getByText('Data protection and privacy information for attendees.')
    ).toBeInTheDocument();
  });

  it('renders different policy types', () => {
    render(
      <PolicyCard
        policyKey="terms_and_conditions"
        entry={defaultEntry}
        onChange={mockOnChange}
        disabled={false}
      />
    );
    expect(screen.getByText('Terms and Conditions')).toBeInTheDocument();
  });
});

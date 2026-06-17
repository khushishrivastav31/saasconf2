import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import SpeakerDeleteDialog from '../SpeakerDeleteDialog';
import type { SpeakerDependencyData } from '../SpeakerDeleteDialog';

const deps: SpeakerDependencyData = {
  papers: [{ id: 'p1', title: 'My Talk', status: 'submitted', cfp_title: 'CFP 2026' }],
  cospeaker_count: 0,
  committee_count: 0,
};

const baseProps = {
  open: true,
  speakerName: 'Ada Lovelace',
  dependencies: deps,
  isLoading: false,
  onAnonymize: vi.fn(),
  onCascadeDelete: vi.fn(),
  onCancel: vi.fn(),
};

describe('SpeakerDeleteDialog — confirm-anonymize step', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not call onAnonymize immediately when "Anonymize Speaker" is clicked', async () => {
    const user = userEvent.setup();
    render(<SpeakerDeleteDialog {...baseProps} />);

    await user.click(screen.getByRole('button', { name: /anonymize speaker/i }));

    expect(baseProps.onAnonymize).not.toHaveBeenCalled();
  });

  it('advances to the confirm-anonymize step when "Anonymize Speaker" is clicked', async () => {
    const user = userEvent.setup();
    render(<SpeakerDeleteDialog {...baseProps} />);

    await user.click(screen.getByRole('button', { name: /anonymize speaker/i }));

    expect(screen.getByText(/cannot be undone/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /back/i })).toBeInTheDocument();
  });

  it('shows anonymize summary text in the confirm step', async () => {
    const user = userEvent.setup();
    render(<SpeakerDeleteDialog {...baseProps} />);

    await user.click(screen.getByRole('button', { name: /anonymize speaker/i }));

    expect(screen.getByText(/deleted user/i)).toBeInTheDocument();
  });

  it('calls onAnonymize when the confirm-step "Anonymize Speaker" button is clicked', async () => {
    const user = userEvent.setup();
    render(<SpeakerDeleteDialog {...baseProps} />);

    await user.click(screen.getByRole('button', { name: /anonymize speaker/i }));
    await user.click(screen.getByRole('button', { name: /anonymize speaker/i }));

    expect(baseProps.onAnonymize).toHaveBeenCalledOnce();
  });

  it('returns to the choose step when "Back" is clicked from confirm-anonymize', async () => {
    const user = userEvent.setup();
    render(<SpeakerDeleteDialog {...baseProps} />);

    await user.click(screen.getByRole('button', { name: /anonymize speaker/i }));
    await user.click(screen.getByRole('button', { name: /back/i }));

    expect(screen.getByText(/choose how to handle/i)).toBeInTheDocument();
    expect(baseProps.onAnonymize).not.toHaveBeenCalled();
  });

  it('does not call onAnonymize when Back is clicked', async () => {
    const user = userEvent.setup();
    render(<SpeakerDeleteDialog {...baseProps} />);

    await user.click(screen.getByRole('button', { name: /anonymize speaker/i }));
    await user.click(screen.getByRole('button', { name: /back/i }));

    expect(baseProps.onAnonymize).not.toHaveBeenCalled();
  });
});

describe('SpeakerDeleteDialog — cascade flow (regression guard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('advances to confirm-cascade when "Delete Speaker & Papers" is clicked', async () => {
    const user = userEvent.setup();
    render(<SpeakerDeleteDialog {...baseProps} />);

    await user.click(screen.getByRole('button', { name: /delete speaker & papers/i }));

    expect(screen.getByText(/permanently deleted/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /delete all/i })).toBeInTheDocument();
  });

  it('calls onCascadeDelete when "Delete All" is clicked', async () => {
    const user = userEvent.setup();
    render(<SpeakerDeleteDialog {...baseProps} />);

    await user.click(screen.getByRole('button', { name: /delete speaker & papers/i }));
    await user.click(screen.getByRole('button', { name: /delete all/i }));

    expect(baseProps.onCascadeDelete).toHaveBeenCalledOnce();
  });

  it('returns to choose step when Back is clicked from confirm-cascade', async () => {
    const user = userEvent.setup();
    render(<SpeakerDeleteDialog {...baseProps} />);

    await user.click(screen.getByRole('button', { name: /delete speaker & papers/i }));
    await user.click(screen.getByRole('button', { name: /back/i }));

    expect(screen.getByText(/choose how to handle/i)).toBeInTheDocument();
  });
});

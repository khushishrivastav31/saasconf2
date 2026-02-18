import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DetailPanelWrapper from '../DetailPanelWrapper';
import type { DetailPanelTab } from '../DetailPanelWrapper';

const mockTabs: DetailPanelTab[] = [
  { id: 'details', label: 'Details', content: <div>Details Content</div> },
  { id: 'notes', label: 'Notes', content: <div>Notes Content</div> },
];

describe('DetailPanelWrapper', () => {
  it('renders title and first tab content by default', () => {
    render(<DetailPanelWrapper title="Test Panel" saveStatus="idle" tabs={mockTabs} />);

    expect(screen.getByText('Test Panel')).toBeInTheDocument();
    expect(screen.getByText('Details Content')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText('Notes')).toBeInTheDocument();
  });

  it('renders subtitle when provided', () => {
    render(
      <DetailPanelWrapper
        title="Test Panel"
        subtitle="Some subtitle"
        saveStatus="idle"
        tabs={mockTabs}
      />
    );

    expect(screen.getByText('Some subtitle')).toBeInTheDocument();
  });

  it('switches tab content when clicking a different tab', () => {
    render(<DetailPanelWrapper title="Test Panel" saveStatus="idle" tabs={mockTabs} />);

    fireEvent.click(screen.getByText('Notes'));
    expect(screen.getByText('Notes Content')).toBeInTheDocument();
  });

  it('shows Save Changes button by default', () => {
    render(<DetailPanelWrapper title="Test Panel" saveStatus="idle" tabs={mockTabs} />);

    expect(screen.getByText('Save Changes')).toBeInTheDocument();
  });

  it('shows Saving... state', () => {
    render(<DetailPanelWrapper title="Test Panel" saveStatus="saving" tabs={mockTabs} />);

    expect(screen.getByText('Saving...')).toBeInTheDocument();
  });

  it('shows Saved state', () => {
    render(<DetailPanelWrapper title="Test Panel" saveStatus="saved" tabs={mockTabs} />);

    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('shows Save failed state', () => {
    render(<DetailPanelWrapper title="Test Panel" saveStatus="error" tabs={mockTabs} />);

    expect(screen.getByText('Save failed')).toBeInTheDocument();
  });

  it('hides save button when showSave is false', () => {
    render(
      <DetailPanelWrapper title="Test Panel" saveStatus="idle" tabs={mockTabs} showSave={false} />
    );

    expect(screen.queryByText('Save Changes')).not.toBeInTheDocument();
  });

  it('hides footer when isAdmin is false', () => {
    render(
      <DetailPanelWrapper title="Test Panel" saveStatus="idle" tabs={mockTabs} isAdmin={false} />
    );

    expect(screen.queryByText('Save Changes')).not.toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('shows Delete button when onDelete is provided', () => {
    const onDelete = vi.fn();
    render(
      <DetailPanelWrapper
        title="Test Panel"
        saveStatus="idle"
        tabs={mockTabs}
        onDelete={onDelete}
      />
    );

    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('opens confirm dialog when delete is clicked', () => {
    const onDelete = vi.fn();
    render(
      <DetailPanelWrapper
        title="Test Panel"
        saveStatus="idle"
        tabs={mockTabs}
        onDelete={onDelete}
      />
    );

    // Click Delete to open confirmation
    fireEvent.click(screen.getByText('Delete'));

    // Confirmation dialog should appear with the default message
    expect(screen.getByText(/are you sure you want to delete/i)).toBeInTheDocument();
  });

  it('renders headerActions when provided', () => {
    render(
      <DetailPanelWrapper
        title="Test Panel"
        saveStatus="idle"
        tabs={mockTabs}
        headerActions={<button>Custom Action</button>}
      />
    );

    expect(screen.getByText('Custom Action')).toBeInTheDocument();
  });

  it('disables save button when saveDisabled is true', () => {
    render(
      <DetailPanelWrapper
        title="Test Panel"
        saveStatus="idle"
        tabs={mockTabs}
        saveDisabled={true}
      />
    );

    const saveBtn = screen.getByText('Save Changes');
    expect(saveBtn).toBeDisabled();
  });

  it('sets form attribute on save button when formId is provided', () => {
    render(
      <DetailPanelWrapper title="Test Panel" saveStatus="idle" tabs={mockTabs} formId="my-form" />
    );

    const saveBtn = screen.getByText('Save Changes');
    expect(saveBtn).toHaveAttribute('form', 'my-form');
  });
});

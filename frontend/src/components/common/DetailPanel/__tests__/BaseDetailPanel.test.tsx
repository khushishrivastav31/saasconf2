import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BaseDetailPanel from '../BaseDetailPanel';

function makePanel(overrides: Partial<Parameters<typeof BaseDetailPanel>[0]> = {}) {
  return (
    <BaseDetailPanel
      title="Edit"
      tabs={[{ id: 'a', label: 'Tab A', content: <div>content-a</div> }]}
      saveStatus="idle"
      isDirty={false}
      onClose={vi.fn()}
      {...overrides}
    />
  );
}

describe('BaseDetailPanel', () => {
  it('renders the title and the first tab content', () => {
    render(makePanel());
    expect(screen.getByText('Edit')).toBeInTheDocument();
    expect(screen.getByText('content-a')).toBeInTheDocument();
  });

  it('closes immediately when not dirty', () => {
    const onClose = vi.fn();
    render(makePanel({ onClose, isDirty: false }));
    fireEvent.click(screen.getByLabelText('Close panel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows the unsaved-changes dialog when dirty', () => {
    const onClose = vi.fn();
    render(makePanel({ onClose, isDirty: true }));
    fireEvent.click(screen.getByLabelText('Close panel'));
    expect(screen.getByText('Unsaved Changes')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves when the user confirms discard', () => {
    const onClose = vi.fn();
    render(makePanel({ onClose, isDirty: true }));
    fireEvent.click(screen.getByLabelText('Close panel'));
    fireEvent.click(screen.getByText('Leave'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays open when the user cancels the dialog', () => {
    const onClose = vi.fn();
    render(makePanel({ onClose, isDirty: true }));
    fireEvent.click(screen.getByLabelText('Close panel'));
    fireEvent.click(screen.getByText('Stay'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hides save button in readonly mode', () => {
    render(
      makePanel({
        readonly: true,
        formId: 'f',
      })
    );
    expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
  });
});

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import PaperCustomField from '../PaperCustomFields';
import type { UnifiedFormField } from '../schema';
import type { PaperFormField } from '../../../../../../types';

vi.mock('../../../../../../config/api', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../../../../../../components/common/RichTextEditor', () => ({
  default: ({ value }: { value: string }) => <div data-testid="rich-text">{value}</div>,
}));

function makeFileUploadField(overrides: Partial<PaperFormField> = {}): UnifiedFormField {
  const cf: PaperFormField = {
    id: 'cf-1',
    tenant_id: 't-1',
    schema_id: 's-1',
    field_key: 'upload_key',
    field_type: 'file_upload',
    label: 'Upload Field',
    description: null,
    placeholder: null,
    help_text: null,
    display_order: 1,
    is_visible: true,
    is_required: false,
    validation_rules: { allowed_file_types: ['pdf', 'mp4'] },
    options: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  };
  return {
    type: 'custom',
    key: 'upload_key',
    label: 'Upload Field',
    display_order: 1,
    is_visible: true,
    is_required: false,
    customField: cf,
  };
}

describe('PaperCustomField — file_upload', () => {
  it('renders a file input when canEdit=true', () => {
    render(
      <PaperCustomField
        field={makeFileUploadField()}
        canEdit={true}
        value={undefined}
        onChange={vi.fn()}
        onFileSelect={vi.fn()}
        pendingFileName={null}
      />
    );
    expect(screen.getByTestId('paper-file-input')).toBeInTheDocument();
  });

  it('does NOT render a file input when canEdit=false', () => {
    render(
      <PaperCustomField
        field={makeFileUploadField()}
        canEdit={false}
        value={undefined}
        onChange={vi.fn()}
        onFileSelect={vi.fn()}
        pendingFileName={null}
      />
    );
    expect(screen.queryByTestId('paper-file-input')).not.toBeInTheDocument();
  });

  it('calls onFileSelect with the chosen File on change', () => {
    const onFileSelect = vi.fn();
    render(
      <PaperCustomField
        field={makeFileUploadField()}
        canEdit={true}
        value={undefined}
        onChange={vi.fn()}
        onFileSelect={onFileSelect}
        pendingFileName={null}
      />
    );

    const input = screen.getByTestId('paper-file-input') as HTMLInputElement;
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    fireEvent.change(input, { target: { files: [file] } });

    expect(onFileSelect).toHaveBeenCalledWith(file);
  });

  it('shows the pending filename badge when pendingFileName is set', () => {
    render(
      <PaperCustomField
        field={makeFileUploadField()}
        canEdit={true}
        value={undefined}
        onChange={vi.fn()}
        onFileSelect={vi.fn()}
        pendingFileName="pending-video.mp4"
      />
    );
    expect(screen.getByText('pending-video.mp4')).toBeInTheDocument();
  });

  it('shows "No file uploaded" when canEdit=false and no value', () => {
    render(
      <PaperCustomField
        field={makeFileUploadField()}
        canEdit={false}
        value={undefined}
        onChange={vi.fn()}
        onFileSelect={vi.fn()}
        pendingFileName={null}
      />
    );
    expect(screen.getByText('No file uploaded')).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import CustomFieldFileDownload from '../CustomFieldFileDownload';

vi.mock('../../config/portalApi', () => ({
  default: { get: vi.fn() },
}));

vi.mock('../../utils/downloadFile', () => ({
  downloadViaApi: vi.fn().mockResolvedValue(undefined),
}));

import portalApi from '../../config/portalApi';
import { downloadViaApi } from '../../utils/downloadFile';

describe('CustomFieldFileDownload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the filename', () => {
    render(<CustomFieldFileDownload attachmentId="att-1" filename="slides.png" />);
    expect(screen.getByText(/slides\.png/)).toBeInTheDocument();
  });

  it('downloads the attachment through the portal API on click', () => {
    render(<CustomFieldFileDownload attachmentId="att-1" filename="slides.png" />);

    fireEvent.click(screen.getByRole('button', { name: /download/i }));

    expect(downloadViaApi).toHaveBeenCalledWith(
      portalApi,
      '/portal/attachments/att-1/download',
      'slides.png'
    );
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VideoAttachmentLink from '../VideoAttachmentLink';

// The download helper is exercised in its own unit test; here we only assert
// that clicking "Download" delegates to it with the current blob URL.
vi.mock('../../utils/downloadFile', () => ({
  downloadObjectUrl: vi.fn(),
}));

import { downloadObjectUrl } from '../../utils/downloadFile';

describe('VideoAttachmentLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the video URL as a new-tab hyperlink once the blob is loaded', () => {
    render(<VideoAttachmentLink videoSrc="blob:vid" onPreview={() => {}} />);

    const link = screen.getByRole('link', { name: /open video/i });
    expect(link).toHaveAttribute('href', 'blob:vid');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('downloads the video via the download helper', () => {
    render(<VideoAttachmentLink videoSrc="blob:vid" onPreview={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: /download/i }));

    expect(downloadObjectUrl).toHaveBeenCalledWith('blob:vid', 'paper-video');
  });

  it('uses a custom filename base when provided', () => {
    render(<VideoAttachmentLink videoSrc="blob:vid" onPreview={() => {}} filenameBase="talk" />);

    fireEvent.click(screen.getByRole('button', { name: /download/i }));

    expect(downloadObjectUrl).toHaveBeenCalledWith('blob:vid', 'talk');
  });

  it('opens the in-modal preview when the thumbnail is clicked (no regression)', () => {
    const onPreview = vi.fn();
    render(<VideoAttachmentLink videoSrc="blob:vid" onPreview={onPreview} />);

    fireEvent.click(screen.getByRole('button', { name: /play video/i }));

    expect(onPreview).toHaveBeenCalledTimes(1);
  });

  it('shows a loading state and hides the open/download actions until the blob resolves', () => {
    render(<VideoAttachmentLink videoSrc={null} onPreview={() => {}} />);

    expect(screen.queryByRole('link', { name: /open video/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download/i })).not.toBeInTheDocument();
    // Thumbnail button is present but disabled while loading.
    expect(screen.getByRole('button', { name: /loading video/i })).toBeDisabled();
  });
});

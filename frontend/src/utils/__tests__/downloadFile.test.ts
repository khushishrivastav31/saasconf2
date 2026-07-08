import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AxiosInstance } from 'axios';
import { downloadObjectUrl, downloadViaApi } from '../downloadFile';

describe('downloadObjectUrl', () => {
  let clickSpy: ReturnType<typeof vi.fn>;
  let appendSpy: ReturnType<typeof vi.spyOn>;
  let removeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clickSpy = vi.fn();
    // Intercept anchor creation so we can inspect the download attributes.
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLElement;
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = clickSpy;
      }
      return el;
    });
    appendSpy = vi.spyOn(document.body, 'appendChild');
    removeSpy = vi.spyOn(document.body, 'removeChild');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('clicks an anchor with a filename derived from the blob mime type', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['x'], { type: 'video/mp4' })),
    }) as unknown as typeof fetch;

    await downloadObjectUrl('blob:abc', 'paper-video');

    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBe('blob:abc');
    expect(anchor.getAttribute('download')).toBe('paper-video.mp4');
    expect(removeSpy).toHaveBeenCalledWith(anchor);
  });

  it('maps quicktime to a .mov extension', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['x'], { type: 'video/quicktime' })),
    }) as unknown as typeof fetch;

    await downloadObjectUrl('blob:abc', 'paper-video');

    const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.getAttribute('download')).toBe('paper-video.mov');
  });

  it('falls back to no extension when the mime type is unknown/blank', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      blob: () => Promise.resolve(new Blob(['x'], { type: '' })),
    }) as unknown as typeof fetch;

    await downloadObjectUrl('blob:abc', 'paper-video');

    const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.getAttribute('download')).toBe('paper-video');
  });

  it('still downloads (no extension) when the blob fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('boom')) as unknown as typeof fetch;

    await downloadObjectUrl('blob:abc', 'paper-video');

    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.getAttribute('download')).toBe('paper-video');
  });
});

describe('downloadViaApi', () => {
  let clickSpy: ReturnType<typeof vi.fn>;
  let appendSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    clickSpy = vi.fn();
    const realCreate = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = realCreate(tag) as HTMLElement;
      if (tag === 'a') {
        (el as HTMLAnchorElement).click = clickSpy;
      }
      return el;
    });
    appendSpy = vi.spyOn(document.body, 'appendChild');
    URL.createObjectURL = vi.fn().mockReturnValue('blob:generated');
    URL.revokeObjectURL = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the URL via the axios instance and downloads with the given filename', async () => {
    const blob = new Blob(['data'], { type: 'application/pdf' });
    const apiInstance = { get: vi.fn().mockResolvedValue({ data: blob }) };

    await downloadViaApi(
      apiInstance as unknown as AxiosInstance,
      '/portal/attachments/att-1/download',
      'slides.pdf'
    );

    expect(apiInstance.get).toHaveBeenCalledWith('/portal/attachments/att-1/download', {
      responseType: 'blob',
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBe('blob:generated');
    expect(anchor.getAttribute('download')).toBe('slides.pdf');
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:generated');
  });
});

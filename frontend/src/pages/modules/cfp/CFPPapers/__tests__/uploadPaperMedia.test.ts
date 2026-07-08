import { describe, it, expect, vi } from 'vitest';
import { uploadPaperMedia } from '../uploadPaperMedia';
import type { Paper } from '../../../../../types';

const paper = { id: 'paper-1', custom_field_answers: {} } as unknown as Paper;
const file = new File(['x'], 'clip.mp4', { type: 'video/mp4' });

describe('uploadPaperMedia', () => {
  it('returns no errors when uploads succeed', async () => {
    const deps = {
      uploadVideo: vi.fn().mockResolvedValue(undefined),
      uploadPaperFiles: vi.fn().mockResolvedValue(undefined),
    };

    const errors = await uploadPaperMedia(paper, file, { field1: file }, deps);

    expect(errors).toEqual([]);
    expect(deps.uploadVideo).toHaveBeenCalledWith('paper-1', file);
    expect(deps.uploadPaperFiles).toHaveBeenCalledWith(paper, { field1: file });
  });

  it('collects a message when the video upload fails instead of swallowing it', async () => {
    const deps = {
      uploadVideo: vi.fn().mockRejectedValue({
        response: { data: { detail: 'File content detected as video/x-matroska' } },
      }),
      uploadPaperFiles: vi.fn().mockResolvedValue(undefined),
    };

    const errors = await uploadPaperMedia(paper, file, {}, deps);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/video/i);
    expect(errors[0]).toMatch(/x-matroska/);
  });

  it('collects a message when the custom-field file upload fails', async () => {
    const deps = {
      uploadVideo: vi.fn().mockResolvedValue(undefined),
      uploadPaperFiles: vi.fn().mockRejectedValue(new Error('boom')),
    };

    const errors = await uploadPaperMedia(paper, null, { field1: file }, deps);

    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/file/i);
  });

  it('skips uploads that were not requested', async () => {
    const deps = {
      uploadVideo: vi.fn().mockResolvedValue(undefined),
      uploadPaperFiles: vi.fn().mockResolvedValue(undefined),
    };

    const errors = await uploadPaperMedia(paper, null, {}, deps);

    expect(errors).toEqual([]);
    expect(deps.uploadVideo).not.toHaveBeenCalled();
    expect(deps.uploadPaperFiles).not.toHaveBeenCalled();
  });
});

import type { Paper } from '../../../../types';
import { parseApiError } from '../../../../utils/apiError';

interface UploadPaperMediaDeps {
  uploadVideo: (paperId: string, file: File) => Promise<void>;
  uploadPaperFiles: (paper: Paper, files: Record<string, File>) => Promise<void>;
}

/**
 * Upload a paper's optional video and custom-field files, collecting a
 * human-readable message for each upload that fails rather than aborting the
 * whole save. Returns the list of error messages (empty when everything
 * succeeded) so the caller can surface them to the admin — previously these
 * failures were swallowed silently, leaving "nothing happened" as the only
 * signal that an upload was rejected.
 */
export async function uploadPaperMedia(
  paper: Paper,
  videoFile: File | null,
  customFieldFiles: Record<string, File>,
  deps: UploadPaperMediaDeps
): Promise<string[]> {
  const errors: string[] = [];

  if (videoFile) {
    try {
      await deps.uploadVideo(paper.id, videoFile);
    } catch (e) {
      errors.push(`Video upload failed: ${parseApiError(e)}`);
    }
  }

  if (Object.keys(customFieldFiles).length > 0) {
    try {
      await deps.uploadPaperFiles(paper, customFieldFiles);
    } catch (e) {
      errors.push(`File upload failed: ${parseApiError(e)}`);
    }
  }

  return errors;
}

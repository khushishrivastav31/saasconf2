import { useEffect, useState } from 'react';
import { validateVideo } from '../../../../../utils/mediaValidation';

export interface MediaPreviewState {
  open: boolean;
  src: string | null;
}

export function usePaperVideoState(paperId: string | null) {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [mediaPreview, setMediaPreview] = useState<MediaPreviewState>({
    open: false,
    src: null,
  });

  // Reset video state whenever the paper changes
  useEffect(() => {
    setVideoFile(null);
    setVideoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setVideoError(null);
  }, [paperId]);

  // Clean up blob URLs on unmount
  useEffect(() => {
    return () => {
      if (videoPreview) URL.revokeObjectURL(videoPreview);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVideoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    setVideoError(null);

    if (videoPreview) {
      URL.revokeObjectURL(videoPreview);
      setVideoPreview(null);
    }

    if (!file) {
      setVideoFile(null);
      return;
    }

    const validationError = validateVideo(file, 50);
    if (validationError) {
      setVideoError(validationError);
      setVideoFile(null);
      e.target.value = '';
      return;
    }

    setVideoFile(file);
    setVideoPreview(URL.createObjectURL(file));
  };

  return {
    videoFile,
    videoPreview,
    videoError,
    mediaPreview,
    setMediaPreview,
    handleVideoChange,
  };
}

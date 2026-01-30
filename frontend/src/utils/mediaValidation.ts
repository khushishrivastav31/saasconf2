export const ACCEPTED_IMAGE_FORMATS = ".jpg,.jpeg,.png,.webp,.tiff,.bmp";
export const ACCEPTED_VIDEO_FORMATS = ".mp4,.mov,.webm,.avi,.mkv";
export const MIN_IMAGE_DIMENSION = 600; // pixels — equivalent to 2″ at 300 DPI

export function validateImage(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.width < MIN_IMAGE_DIMENSION || img.height < MIN_IMAGE_DIMENSION) {
        resolve(
          `Image must be at least ${MIN_IMAGE_DIMENSION}×${MIN_IMAGE_DIMENSION}px (300 DPI). Current: ${img.width}×${img.height}px.`,
        );
      } else {
        resolve(null);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(
        "Could not read image file. Please use a JPEG, PNG, WebP, TIFF, or BMP file.",
      );
    };
    img.src = url;
  });
}

export function validateVideo(file: File, maxSizeMB: number): string | null {
  const sizeMB = file.size / (1024 * 1024);
  if (sizeMB > maxSizeMB) {
    return `Video must be no larger than ${maxSizeMB}MB. Current: ${sizeMB.toFixed(1)}MB.`;
  }
  return null;
}

import { useEffect, useRef } from "react";

interface MediaPreviewModalProps {
  open: boolean;
  onClose: () => void;
  src: string | null;
  type: "image" | "video";
  alt?: string;
}

export default function MediaPreviewModal({
  open,
  onClose,
  src,
  type,
  alt = "Preview",
}: MediaPreviewModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      // Prevent body scroll when modal is open
      document.body.style.overflow = "hidden";
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Auto-pause video when modal closes
  useEffect(() => {
    if (!open && videoRef.current) {
      videoRef.current.pause();
    }
  }, [open]);

  if (!open || !src) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
        title="Close (Esc)"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>

      {/* Media container */}
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {type === "image" ? (
          <img
            src={src}
            alt={alt}
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
        ) : (
          <video
            ref={videoRef}
            src={src}
            controls
            autoPlay
            className="max-w-full max-h-[90vh] rounded-lg shadow-2xl"
          >
            Your browser does not support the video tag.
          </video>
        )}
      </div>

      {/* Instructions hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-sm">
        Press Esc or click outside to close
      </div>
    </div>
  );
}

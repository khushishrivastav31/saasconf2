import { useState, useEffect } from 'react';
import api from '../../../../../config/api';

/** Small component that fetches an image through the authenticated API and displays it. */
export function AuthImage({
  url,
  alt,
  className,
}: {
  url: string;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let revoke: string | null = null;
    api
      .get(url, { responseType: 'blob' })
      .then((res) => {
        const objectUrl = URL.createObjectURL(res.data as Blob);
        revoke = objectUrl;
        setSrc(objectUrl);
      })
      .catch(() => setSrc(null));
    return () => {
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [url]);
  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-gray-200 dark:bg-gray-700 rounded text-gray-400 dark:text-gray-500 ${className ?? ''}`}
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
    );
  }
  return <img src={src} alt={alt} className={className} />;
}

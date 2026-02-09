import { useState, useEffect } from "react";
import type { AxiosInstance } from "axios";
import api from "../config/api";

interface ConferenceLogoProps {
  logoUrl: string | null;
  alt?: string;
  className?: string;
  placeholderClassName?: string;
  showPlaceholder?: boolean;
  /** Optional axios instance to use (defaults to main api) */
  apiInstance?: AxiosInstance;
}

/**
 * Displays a conference logo, fetching it as a blob to bypass CSP restrictions.
 */
export default function ConferenceLogo({
  logoUrl,
  alt = "Conference logo",
  className = "max-w-full max-h-full object-contain",
  placeholderClassName = "text-gray-400 text-xs",
  showPlaceholder = true,
  apiInstance = api,
}: ConferenceLogoProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!logoUrl) {
      setBlobUrl(null);
      return;
    }

    let revoked = false;
    setLoading(true);

    apiInstance.get(logoUrl, { responseType: "blob" })
      .then((res) => {
        if (!revoked) {
          const url = URL.createObjectURL(res.data);
          setBlobUrl(url);
        }
      })
      .catch(() => {
        if (!revoked) {
          setBlobUrl(null);
        }
      })
      .finally(() => {
        if (!revoked) {
          setLoading(false);
        }
      });

    return () => {
      revoked = true;
    };
  }, [logoUrl, apiInstance]);

  // Clean up blob URL when component unmounts or URL changes
  useEffect(() => {
    return () => {
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [blobUrl]);

  if (blobUrl) {
    return <img src={blobUrl} alt={alt} className={className} />;
  }

  if (loading) {
    return showPlaceholder ? (
      <span className={placeholderClassName}>Loading...</span>
    ) : null;
  }

  if (!logoUrl && showPlaceholder) {
    return <span className={placeholderClassName}>No logo</span>;
  }

  return null;
}

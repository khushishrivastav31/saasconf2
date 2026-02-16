import { useState, useEffect } from "react";
import type { AxiosInstance } from "axios";
import api from "../config/api";

interface ConferenceLogoProps {
  logoUrl: string | null;
  alt?: string;
  className?: string;
  placeholderClassName?: string;
  showPlaceholder?: boolean;
  /** Optional axios instance — only used to derive the base URL */
  apiInstance?: AxiosInstance;
}

/**
 * Displays a logo, fetching it as a blob to bypass CSP restrictions.
 *
 * Uses native fetch() (no custom headers) so logo GET requests are
 * "simple" CORS requests — no preflight needed, no auth headers sent.
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

  const baseURL = apiInstance.defaults.baseURL || "";

  useEffect(() => {
    if (!logoUrl) {
      setBlobUrl(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const fullUrl = `${baseURL.replace(/\/+$/, "")}/${logoUrl.replace(/^\/+/, "")}`;

    fetch(fullUrl)
      .then((res) => {
        if (!res.ok) throw new Error(`Logo fetch failed: ${res.status} ${res.statusText}`);
        return res.blob();
      })
      .then((blob) => {
        if (!cancelled) {
          setBlobUrl(URL.createObjectURL(blob));
        }
      })
      .catch(() => {
        // Silently handle logo load failures (expected on unauthenticated pages)
        if (!cancelled) {
          setBlobUrl(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [logoUrl, baseURL]);

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

import { useState, useEffect } from "react";
import api from "../config/api";

export function useAuthMedia(mediaUrl: string | null): string | null {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!mediaUrl) {
      setSrc(null);
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;

    api
      .get(mediaUrl, { responseType: "blob" })
      .then((res) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(res.data);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [mediaUrl]);

  return src;
}

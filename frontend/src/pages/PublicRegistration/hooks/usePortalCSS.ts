/**
 * Custom CSS Loading Hook
 *
 * Loads conference-specific custom CSS for public registration portal branding.
 */
import { useEffect } from 'react';

const STYLE_ID = 'portal-custom-css';

export function usePortalCSS(tenantSlug: string, conferenceSlug: string): void {
  useEffect(() => {
    if (!tenantSlug || !conferenceSlug) return;

    // Add timestamp for cache busting (force fresh CSS on page load)
    const timestamp = Date.now();
    const cssUrl = `${import.meta.env.VITE_API_URL || ''}/api/v1/portal/${tenantSlug}/conferences/${conferenceSlug}/custom-css?t=${timestamp}`;

    // Fetch custom CSS
    fetch(cssUrl)
      .then((res) => {
        if (!res.ok) {
          console.warn(`Failed to load custom CSS: ${res.status}`);
          return '';
        }
        return res.text();
      })
      .then((css) => {
        if (!css) return;

        // Create or update style element
        let styleElement = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

        if (!styleElement) {
          styleElement = document.createElement('style');
          styleElement.id = STYLE_ID;
          document.head.appendChild(styleElement);
        }

        styleElement.textContent = css;
        console.log('[Portal CSS] Loaded custom styles');
      })
      .catch((error) => {
        console.error('[Portal CSS] Failed to load:', error);
      });

    // Cleanup: remove style element on unmount
    return () => {
      const styleElement = document.getElementById(STYLE_ID);
      if (styleElement) {
        styleElement.remove();
        console.log('[Portal CSS] Cleaned up custom styles');
      }
    };
  }, [tenantSlug, conferenceSlug]);
}

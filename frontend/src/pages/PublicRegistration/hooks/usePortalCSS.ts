/**
 * Custom CSS Loading Hook
 *
 * Loads conference-specific custom CSS for public registration portal branding.
 * CSS custom properties are applied as inline styles on documentElement to
 * guarantee they override Tailwind v4's @theme layer (Vite HMR can re-inject
 * layered styles after our <style> tag, but inline styles always win).
 */
import { useEffect } from 'react';

const STYLE_ID = 'portal-custom-css';
const CSS_VAR_REGEX = /--(color-primary-\d+):\s*([^;!]+)/g;

export function usePortalCSS(tenantSlug: string, conferenceSlug: string): void {
  useEffect(() => {
    if (!tenantSlug || !conferenceSlug) return;

    const appliedVars: string[] = [];

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

        // Extract --color-primary-* variables and apply as inline styles
        // on documentElement (inline styles beat any stylesheet declaration)
        let match;
        while ((match = CSS_VAR_REGEX.exec(css)) !== null) {
          const varName = `--${match[1]}`;
          const varValue = match[2].trim();
          document.documentElement.style.setProperty(varName, varValue);
          appliedVars.push(varName);
        }

        // Inject the rest of the CSS (class overrides, etc.) via <style> tag
        let styleElement = document.getElementById(STYLE_ID) as HTMLStyleElement | null;

        if (!styleElement) {
          styleElement = document.createElement('style');
          styleElement.id = STYLE_ID;
        }

        styleElement.textContent = css;
        // Always append last so it has highest source-order priority
        document.head.appendChild(styleElement);

        console.log('[Portal CSS] Loaded custom styles');
      })
      .catch((error) => {
        console.error('[Portal CSS] Failed to load:', error);
      });

    // Cleanup: remove style element and inline CSS variables on unmount
    return () => {
      const styleElement = document.getElementById(STYLE_ID);
      if (styleElement) {
        styleElement.remove();
      }
      for (const varName of appliedVars) {
        document.documentElement.style.removeProperty(varName);
      }
      console.log('[Portal CSS] Cleaned up custom styles');
    };
  }, [tenantSlug, conferenceSlug]);
}

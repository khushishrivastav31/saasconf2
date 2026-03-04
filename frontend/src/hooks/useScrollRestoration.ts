import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';

/**
 * Hook to save and restore scroll position on page refresh.
 * Uses sessionStorage to persist scroll position per-tab.
 */
export function useScrollRestoration() {
  const location = useLocation();
  const scrollKey = `scroll-position-${location.pathname}`;
  const restoredRef = useRef(false);

  useEffect(() => {
    // Restore scroll position after mount (only once)
    if (!restoredRef.current) {
      const savedPosition = sessionStorage.getItem(scrollKey);
      if (savedPosition) {
        const position = parseInt(savedPosition, 10);
        // Use double rAF to ensure DOM is fully painted and content is loaded
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            window.scrollTo({
              top: position,
              left: 0,
              behavior: 'auto', // Instant scroll, no smooth animation
            });
          });
        });
      }
      restoredRef.current = true;
    }

    // Save scroll position on scroll (debounced)
    let timeoutId: number;
    const handleScroll = () => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        sessionStorage.setItem(scrollKey, window.scrollY.toString());
      }, 100);
    };

    // Save scroll position before unload
    const handleBeforeUnload = () => {
      sessionStorage.setItem(scrollKey, window.scrollY.toString());
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [scrollKey]);

  // Reset restoration flag when route changes
  useEffect(() => {
    restoredRef.current = false;
  }, [location.pathname]);
}

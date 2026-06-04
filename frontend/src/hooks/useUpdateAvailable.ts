import { useEffect, useRef, useState } from 'react';

async function fetchVersionFingerprint(): Promise<string> {
  try {
    const res = await fetch('/index.html', { cache: 'no-store' });
    const html = await res.text();
    // Vite hashes the main entry bundle filename — if it changes, a new version is live.
    const match = html.match(/\/assets\/index-[^"']+\.js/);
    return match?.[0] ?? '';
  } catch {
    return '';
  }
}

export function useUpdateAvailable(): boolean {
  const baseline = useRef<string>('');
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    fetchVersionFingerprint().then((fp) => {
      baseline.current = fp;
    });

    async function check() {
      if (updateAvailable) return;
      const current = await fetchVersionFingerprint();
      if (baseline.current && current && current !== baseline.current) {
        setUpdateAvailable(true);
      }
    }

    function onVisibilityChange() {
      if (document.visibilityState === 'visible') check();
    }

    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [updateAvailable]);

  return updateAvailable;
}

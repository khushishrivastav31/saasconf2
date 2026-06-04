import { useUpdateAvailable } from '../hooks/useUpdateAvailable';

export default function UpdateBanner() {
  const updateAvailable = useUpdateAvailable();

  if (!updateAvailable) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-full shadow-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium">
      <span>A new version is available</span>
      <button
        onClick={() => window.location.reload()}
        className="px-3 py-1 rounded-full bg-primary-500 hover:bg-primary-600 text-white text-xs font-semibold transition-colors"
      >
        Refresh
      </button>
    </div>
  );
}

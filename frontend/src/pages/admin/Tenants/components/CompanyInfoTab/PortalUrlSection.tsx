import { useState } from 'react';

interface Props {
  portalUrl: string;
}

export default function PortalUrlSection({ portalUrl }: Props) {
  const [portalUrlCopied, setPortalUrlCopied] = useState(false);

  const copyPortalUrl = async () => {
    try {
      await navigator.clipboard.writeText(portalUrl);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = portalUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    setPortalUrlCopied(true);
    setTimeout(() => setPortalUrlCopied(false), 2000);
  };

  return (
    <div className="border-t dark:border-gray-700 pt-4">
      <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Portal URL</h5>
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={portalUrl}
          className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm py-2 px-3 text-sm text-gray-600 dark:text-gray-300 cursor-default"
        />
        <button
          type="button"
          onClick={copyPortalUrl}
          className={`inline-flex items-center px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
            portalUrlCopied
              ? 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 border-green-300'
              : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
          title="Copy URL"
        >
          {portalUrlCopied ? (
            <>
              <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              Copy
            </>
          )}
        </button>
        <a
          href={portalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          title="Open in new tab"
        >
          <svg className="h-4 w-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
          Open
        </a>
      </div>
      <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
        Share this URL with applicants to access the speaker portal for this company.
      </p>
    </div>
  );
}

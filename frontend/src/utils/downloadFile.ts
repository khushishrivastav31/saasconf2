/**
 * Trigger a browser download for an already-fetched object URL (blob).
 *
 * Media in this app is served from auth-gated endpoints that require a Bearer
 * token header, so a plain `<a href={endpoint} download>` cannot authenticate.
 * Callers fetch the file via the authenticated API into an in-memory blob and
 * pass its `URL.createObjectURL(...)` value here. Reading the object URL back
 * with `fetch` is a local memory read (no network round-trip) that lets us
 * recover the blob's MIME type and give the saved file a sensible extension.
 */

import type { AxiosInstance } from 'axios';

// MIME types whose extension can't be derived by splitting on '/'.
const VIDEO_MIME_EXTENSIONS: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-msvideo': 'avi',
  'video/x-matroska': 'mkv',
  'video/ogg': 'ogv',
};

function extensionForMime(mimeType: string): string {
  const type = mimeType.split(';')[0].trim();
  if (!type) return '';
  if (VIDEO_MIME_EXTENSIONS[type]) return VIDEO_MIME_EXTENSIONS[type];
  const subtype = type.split('/')[1];
  // Only trust a bare, alphanumeric subtype (e.g. mp4, webm) as an extension.
  return subtype && /^[a-z0-9]+$/i.test(subtype) ? subtype : '';
}

/** Programmatically click a download anchor for `objectUrl` saved as `filename`. */
function triggerAnchorDownload(objectUrl: string, filename: string): void {
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
}

/**
 * Download the blob behind `objectUrl`, naming the file `<filenameBase>.<ext>`
 * where the extension is inferred from the blob's MIME type. If the type can't
 * be resolved, the file is saved as `filenameBase` with no extension.
 */
export async function downloadObjectUrl(objectUrl: string, filenameBase: string): Promise<void> {
  let ext = '';
  try {
    const resp = await fetch(objectUrl);
    const blob = await resp.blob();
    ext = extensionForMime(blob.type);
  } catch {
    // Fall through with no extension — the download still proceeds.
  }

  triggerAnchorDownload(objectUrl, ext ? `${filenameBase}.${ext}` : filenameBase);
}

/**
 * Fetch an auth-gated attachment via the given axios instance and download it
 * with the supplied filename. Used for endpoints that require a Bearer token
 * header (so a plain `<a href>` can't reach them). The temporary object URL is
 * always revoked afterward.
 */
export async function downloadViaApi(
  apiInstance: AxiosInstance,
  url: string,
  filename: string
): Promise<void> {
  const res = await apiInstance.get(url, { responseType: 'blob' });
  const objectUrl = URL.createObjectURL(res.data as Blob);
  try {
    triggerAnchorDownload(objectUrl, filename);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

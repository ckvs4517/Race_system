/** Deliver an exported file using iOS Web Share when supported, then desktop download. */
export async function deliverBlob(blob, filename, { title = filename } = {}) {
  const navigatorObject = globalThis.navigator;
  const FileConstructor = globalThis.File;
  if (FileConstructor && navigatorObject?.share) {
    const file = new FileConstructor([blob], filename, { type: blob.type || 'application/octet-stream' });
    let canShareFiles = false;
    try {
      // Some iOS WebViews expose share() but omit canShare(). In that case,
      // attempt file sharing and use the normal download only if it fails.
      canShareFiles = typeof navigatorObject.canShare !== 'function'
        ? true
        : Boolean(navigatorObject.canShare({ files: [file] }));
    } catch { canShareFiles = false; }
    if (canShareFiles) {
      try {
        await navigatorObject.share({ files: [file], title });
        return { method: 'share' };
      } catch (error) {
        if (error?.name === 'AbortError') return { method: 'cancelled' };
      }
    }
  }
  return downloadBlob(blob, filename);
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { method: 'download' };
}

/**
 * Rendered giving-statement PDF storage (§2.15). Uses Vercel Blob when a
 * BLOB_READ_WRITE_TOKEN is configured; otherwise returns an `inline:` sentinel
 * and the download route re-renders on demand so the feature still works in
 * local/preview environments without Blob provisioned.
 */

export async function storeStatementPdf(
  pathname: string,
  buffer: Buffer,
): Promise<string> {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return `inline:${pathname}`;
  const { put } = await import('@vercel/blob');
  const res = await put(pathname, buffer, {
    access: 'public',
    token,
    contentType: 'application/pdf',
    addRandomSuffix: true,
  });
  return res.url;
}

export function isStoredBlobUrl(url: string): boolean {
  return url.startsWith('http://') || url.startsWith('https://');
}

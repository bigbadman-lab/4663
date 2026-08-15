/**
 * Client-only PNG download from an already-captured Blob.
 * Does not upload.
 */

export function downloadSnapshotBlob(
  blob: Blob,
  filename: string,
  doc: Document = document,
): void {
  const url = URL.createObjectURL(blob);
  const anchor = doc.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  doc.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  globalThis.setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 0);
}

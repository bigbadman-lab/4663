/**
 * Local download filename: 4663-snapshot-YYYY-MM-DD-HHMMSS.png
 */

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatSnapshotFilename(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = pad2(date.getMonth() + 1);
  const day = pad2(date.getDate());
  const hours = pad2(date.getHours());
  const minutes = pad2(date.getMinutes());
  const seconds = pad2(date.getSeconds());
  return `4663-snapshot-${year}-${month}-${day}-${hours}${minutes}${seconds}.png`;
}

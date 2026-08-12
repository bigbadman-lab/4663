/**
 * Quiet clipboard write for canvas objects. Never throws to UI.
 */

export async function copyTextQuiet(
  text: string,
  writeText?: (value: string) => Promise<void>,
): Promise<boolean> {
  const writer =
    writeText ??
    (typeof navigator !== "undefined" && navigator.clipboard?.writeText
      ? (value: string) => navigator.clipboard.writeText(value)
      : undefined);

  if (!writer) return false;

  try {
    await writer(text);
    return true;
  } catch {
    return false;
  }
}

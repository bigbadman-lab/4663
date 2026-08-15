/**
 * Deterministic SNAPSHOT capture exclusions.
 * Mark transient / application chrome — never match on button labels.
 */

export const SNAPSHOT_EXCLUDE_ATTR = "data-4663-snapshot-exclude" as const;

export const SNAPSHOT_EXCLUDE_SELECTOR =
  `[${SNAPSHOT_EXCLUDE_ATTR}]` as const;

/** Capture root: visible canvas viewport (world clip), not the app shell. */
export const SNAPSHOT_CAPTURE_ROOT_SELECTOR =
  "[data-4663-canvas-viewport]" as const;

export function isSnapshotCaptureIncludedNode(node: Node): boolean {
  if (node.nodeType !== 1) return true;
  const element = node as Element;
  if (typeof element.closest !== "function") return true;
  return !element.closest(SNAPSHOT_EXCLUDE_SELECTOR);
}

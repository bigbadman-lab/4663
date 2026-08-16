/**
 * Lab BOARD child-source fan-out — ownership writes stay on each module's
 * page-data. Not a generic parent/child host.
 */

import type { LabBoardAdoptableModuleId } from "@/lib/modules/lab-board-containment";

export type LabBoardChildSource = {
  kind: LabBoardAdoptableModuleId;
  ownedIds: (boardId: string) => string[];
  setBoardId: (instanceId: string, boardId: string | null) => void;
  shiftOrigin: (
    instanceId: string,
    deltaLeftPct: number,
    deltaTopPct: number,
  ) => void;
};

const sources = new Set<LabBoardChildSource>();

export function registerLabBoardChildSource(
  source: LabBoardChildSource,
): () => void {
  sources.add(source);
  return () => {
    sources.delete(source);
  };
}

export function setLabBoardChildOwnership(
  instanceId: string,
  boardId: string | null,
): void {
  for (const source of sources) {
    source.setBoardId(instanceId, boardId);
  }
}

export function shiftOwnedLabBoardChildren(
  boardId: string,
  deltaLeftPct: number,
  deltaTopPct: number,
): void {
  if (deltaLeftPct === 0 && deltaTopPct === 0) return;
  for (const source of sources) {
    for (const id of source.ownedIds(boardId)) {
      source.shiftOrigin(id, deltaLeftPct, deltaTopPct);
    }
  }
}

export function shiftLabBoardChildOrigin(
  instanceId: string,
  deltaLeftPct: number,
  deltaTopPct: number,
): void {
  if (deltaLeftPct === 0 && deltaTopPct === 0) return;
  for (const source of sources) {
    source.shiftOrigin(instanceId, deltaLeftPct, deltaTopPct);
  }
}

export function detachLabBoardChildren(boardId: string): void {
  for (const source of sources) {
    for (const id of source.ownedIds(boardId)) {
      source.setBoardId(id, null);
    }
  }
}

export function listOwnedLabBoardChildIds(boardId: string): string[] {
  const ids: string[] = [];
  for (const source of sources) {
    ids.push(...source.ownedIds(boardId));
  }
  return ids;
}

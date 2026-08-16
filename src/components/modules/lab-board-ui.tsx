"use client";

/**
 * Session-only BOARD highlight + carry. Not persisted. Not PlayHTML state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { getCanvasPlacementSnapshot } from "@/components/canvas/use-canvas-camera";
import { isInteractiveCanvasTarget } from "@/lib/canvas/interactive-control";
import {
  CANVAS_PAN_DRAG_THRESHOLD_PX,
  screenPointToWorldPoint,
} from "@/lib/canvas/world-camera";
import {
  setLabBoardChildOwnership,
  shiftLabBoardChildOrigin,
} from "@/lib/modules/lab-board-bridge";
import {
  boardContentRectFromChrome,
  childDeltaToClearContentTop,
  resolveBoardDrop,
  selectAcceptingBoardId,
  worldDeltaPxToOriginPct,
  type BoardCandidate,
  type WorldRect,
} from "@/lib/modules/lab-board-containment";

export type LabBoardCarryDelta = {
  x: number;
  y: number;
};

type LabBoardUiValue = {
  acceptingBoardId: string | null;
  setAcceptingBoardId: (boardId: string | null) => void;
  carryByBoardId: Readonly<Record<string, LabBoardCarryDelta>>;
  setBoardCarry: (boardId: string, delta: LabBoardCarryDelta | null) => void;
};

const LabBoardUiContext = createContext<LabBoardUiValue | null>(null);

export function LabBoardUiProvider({ children }: { children: ReactNode }) {
  const [acceptingBoardId, setAcceptingBoardId] = useState<string | null>(null);
  const [carryByBoardId, setCarryByBoardId] = useState<
    Record<string, LabBoardCarryDelta>
  >({});

  const setBoardCarry = useCallback(
    (boardId: string, delta: LabBoardCarryDelta | null) => {
      setCarryByBoardId((current) => {
        if (delta == null) {
          if (!(boardId in current)) return current;
          const next = { ...current };
          delete next[boardId];
          return next;
        }
        const prev = current[boardId];
        if (prev && prev.x === delta.x && prev.y === delta.y) return current;
        return { ...current, [boardId]: delta };
      });
    },
    [],
  );

  const value = useMemo(
    () => ({
      acceptingBoardId,
      setAcceptingBoardId,
      carryByBoardId,
      setBoardCarry,
    }),
    [acceptingBoardId, carryByBoardId, setBoardCarry],
  );

  return (
    <LabBoardUiContext.Provider value={value}>
      {children}
    </LabBoardUiContext.Provider>
  );
}

function useLabBoardUi(): LabBoardUiValue {
  const value = useContext(LabBoardUiContext);
  if (value == null) {
    return {
      acceptingBoardId: null,
      setAcceptingBoardId: () => {},
      carryByBoardId: {},
      setBoardCarry: () => {},
    };
  }
  return value;
}

export function useLabBoardAccepting(boardId: string): boolean {
  return useLabBoardUi().acceptingBoardId === boardId;
}

export function useLabBoardCarry(
  boardId: string | null,
): LabBoardCarryDelta | null {
  const { carryByBoardId } = useLabBoardUi();
  if (boardId == null) return null;
  return carryByBoardId[boardId] ?? null;
}

export function useLabBoardCarryApi() {
  return useLabBoardUi();
}

export function LabBoardCarryFrame({
  boardId,
  children,
}: {
  boardId: string | null;
  children: ReactNode;
}) {
  const carry = useLabBoardCarry(boardId);
  return (
    <div
      className="pointer-events-none absolute inset-0"
      data-4663-board-carry={boardId ?? undefined}
      style={
        carry
          ? { transform: `translate(${carry.x}px, ${carry.y}px)` }
          : undefined
      }
    >
      {children}
    </div>
  );
}

export function clientRectToWorldRect(
  rect: DOMRectReadOnly,
): WorldRect | null {
  const snapshot = getCanvasPlacementSnapshot();
  if (snapshot == null) return null;
  const tl = screenPointToWorldPoint(
    rect.left,
    rect.top,
    snapshot.viewport,
    snapshot.camera,
  );
  const br = screenPointToWorldPoint(
    rect.right,
    rect.bottom,
    snapshot.viewport,
    snapshot.camera,
  );
  return {
    left: tl.x,
    top: tl.y,
    width: br.x - tl.x,
    height: br.y - tl.y,
  };
}

export function readLabBoardCandidates(): BoardCandidate[] {
  const nodes = document.querySelectorAll("[data-4663-board]");
  const boards: BoardCandidate[] = [];
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue;
    const id = node.getAttribute("data-4663-board");
    if (!id) continue;
    const rect = clientRectToWorldRect(node.getBoundingClientRect());
    if (rect == null) continue;
    const chromeNode = node.querySelector("[data-4663-board-chrome]");
    let contentRect = rect;
    if (chromeNode instanceof HTMLElement) {
      const chrome = clientRectToWorldRect(chromeNode.getBoundingClientRect());
      if (chrome != null) {
        contentRect = boardContentRectFromChrome(rect, chrome);
      }
    }
    boards.push({ id, rect, contentRect });
  }
  return boards;
}

function readAdoptableHostId(host: HTMLElement): string | null {
  return (
    host.getAttribute("data-4663-note") ??
    host.getAttribute("data-4663-checklist") ??
    host.getAttribute("data-4663-countdown")
  );
}

export function clampHostBelowBoardChrome(
  host: HTMLElement,
  instanceId: string,
  boardId: string,
): void {
  const child = clientRectToWorldRect(host.getBoundingClientRect());
  if (child == null) return;
  const boards = readLabBoardCandidates();
  const board = boards.find((row) => row.id === boardId);
  if (board == null) return;
  const content = board.contentRect ?? board.rect;
  const delta = childDeltaToClearContentTop(child, content);
  if (delta.y === 0) return;
  const origin = worldDeltaPxToOriginPct(delta.x, delta.y);
  shiftLabBoardChildOrigin(
    instanceId,
    origin.deltaLeftPct,
    origin.deltaTopPct,
  );
}

export function nudgeOwnedChildrenBelowBoardChrome(boardId: string): void {
  const hosts = document.querySelectorAll(
    `[data-4663-owned-by="${boardId}"]`,
  );
  for (const node of hosts) {
    if (!(node instanceof HTMLElement)) continue;
    const instanceId = readAdoptableHostId(node);
    if (instanceId == null) continue;
    clampHostBelowBoardChrome(node, instanceId, boardId);
  }
}

export function readAcceptingBoardIdForHost(
  host: HTMLElement,
): string | null {
  const child = clientRectToWorldRect(host.getBoundingClientRect());
  if (child == null) return null;
  return selectAcceptingBoardId(child, readLabBoardCandidates());
}

type MoveHandlers<T extends HTMLElement> = {
  onPointerDown: (event: ReactPointerEvent<T>) => void;
  onPointerUp: (event: ReactPointerEvent<T>) => void;
  onPointerCancel: (event: ReactPointerEvent<T>) => void;
};

type AdoptionGesture = {
  pointerId: number;
  startX: number;
  startY: number;
  dragged: boolean;
  host: HTMLElement;
};

/**
 * Keep world-space PlayHTML movement during the gesture.
 * Ownership is resolved on pointerup after a real drag.
 * Window listeners — PlayHTML drag can leave the host.
 */
export function useLabBoardAdoption<T extends HTMLElement>(
  instanceId: string,
  currentBoardId: string | null,
  move: MoveHandlers<T>,
): MoveHandlers<T> {
  const { setAcceptingBoardId } = useLabBoardUi();
  const gestureRef = useRef<AdoptionGesture | null>(null);
  const instanceIdRef = useRef(instanceId);
  const currentBoardIdRef = useRef(currentBoardId);
  const setAcceptingBoardIdRef = useRef(setAcceptingBoardId);

  useEffect(() => {
    instanceIdRef.current = instanceId;
    currentBoardIdRef.current = currentBoardId;
    setAcceptingBoardIdRef.current = setAcceptingBoardId;
  }, [instanceId, currentBoardId, setAcceptingBoardId]);

  const detachWindow = useRef<(() => void) | null>(null);

  const stopWindowListeners = useCallback(() => {
    detachWindow.current?.();
    detachWindow.current = null;
  }, []);

  const endGesture = useCallback(
    (commit: boolean) => {
      const gesture = gestureRef.current;
      gestureRef.current = null;
      stopWindowListeners();
      if (!commit || !gesture?.dragged) {
        setAcceptingBoardIdRef.current(null);
        return;
      }
      const host = gesture.host;
      const instanceId = instanceIdRef.current;
      const currentBoardId = currentBoardIdRef.current;
      requestAnimationFrame(() => {
        const child = clientRectToWorldRect(host.getBoundingClientRect());
        setAcceptingBoardIdRef.current(null);
        if (child == null) return;
        const resolution = resolveBoardDrop(
          currentBoardId,
          child,
          readLabBoardCandidates(),
        );
        if (resolution.nextBoardId !== currentBoardId) {
          setLabBoardChildOwnership(instanceId, resolution.nextBoardId);
        }
        if (resolution.clampBoardId != null) {
          clampHostBelowBoardChrome(
            host,
            instanceId,
            resolution.clampBoardId,
          );
        }
      });
    },
    [stopWindowListeners],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<T>) => {
      move.onPointerDown(event);
      if (isInteractiveCanvasTarget(event.target)) return;
      if (event.button !== 0 && event.pointerType === "mouse") return;
      stopWindowListeners();
      const host = event.currentTarget;
      const pointerId = event.pointerId;
      gestureRef.current = {
        pointerId,
        startX: event.clientX,
        startY: event.clientY,
        dragged: false,
        host,
      };

      const onMove = (native: PointerEvent) => {
        const gesture = gestureRef.current;
        if (gesture == null || gesture.pointerId !== native.pointerId) return;
        if (!gesture.dragged) {
          const dx = native.clientX - gesture.startX;
          const dy = native.clientY - gesture.startY;
          if (dx * dx + dy * dy < CANVAS_PAN_DRAG_THRESHOLD_PX ** 2) return;
          gesture.dragged = true;
        }
        setAcceptingBoardIdRef.current(readAcceptingBoardIdForHost(gesture.host));
      };
      const onUp = (native: PointerEvent) => {
        const gesture = gestureRef.current;
        if (gesture == null || gesture.pointerId !== native.pointerId) return;
        endGesture(true);
      };
      const onCancel = (native: PointerEvent) => {
        const gesture = gestureRef.current;
        if (gesture == null || gesture.pointerId !== native.pointerId) return;
        endGesture(false);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onCancel);
      detachWindow.current = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onCancel);
      };
    },
    [endGesture, move, stopWindowListeners],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<T>) => {
      move.onPointerUp(event);
    },
    [move],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<T>) => {
      move.onPointerCancel(event);
    },
    [move],
  );

  useEffect(() => {
    return () => {
      stopWindowListeners();
      gestureRef.current = null;
    };
  }, [stopWindowListeners]);

  return {
    onPointerDown,
    onPointerUp,
    onPointerCancel,
  };
}

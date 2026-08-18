/**
 * Coalesce pointer-driven camera writes to at most one transform per frame.
 * Camera ref remains the source of truth; this only delays DOM application.
 * No inertia / momentum — flush() applies the latest sample immediately.
 */

export type CanvasPanFrameSample = {
  dx: number;
  dy: number;
};

export type CanvasPanFrameSink = {
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
};

export type CanvasPanFrameCoalescer = {
  push(sample: CanvasPanFrameSample): void;
  /** Apply `sample` (or the pending sample) now; drop the scheduled frame. */
  flush(sample?: CanvasPanFrameSample): void;
  cancel(): void;
  pending(): CanvasPanFrameSample | null;
};

function defaultSink(): CanvasPanFrameSink {
  const g = globalThis as typeof globalThis & {
    requestAnimationFrame?: (callback: FrameRequestCallback) => number;
    cancelAnimationFrame?: (handle: number) => void;
  };
  if (
    typeof g.requestAnimationFrame === "function" &&
    typeof g.cancelAnimationFrame === "function"
  ) {
    return {
      requestAnimationFrame: (cb) => g.requestAnimationFrame!(cb),
      cancelAnimationFrame: (id) => g.cancelAnimationFrame!(id),
    };
  }
  return {
    requestAnimationFrame: (cb) => {
      cb(0);
      return 0;
    },
    cancelAnimationFrame: () => {},
  };
}

export function createCanvasPanFrameCoalescer(
  apply: (sample: CanvasPanFrameSample) => void,
  sink: CanvasPanFrameSink = defaultSink(),
): CanvasPanFrameCoalescer {
  let raf = 0;
  let next: CanvasPanFrameSample | null = null;

  const run = () => {
    raf = 0;
    const sample = next;
    next = null;
    if (sample) apply(sample);
  };

  return {
    push(sample) {
      next = sample;
      if (raf) return;
      raf = sink.requestAnimationFrame(run);
    },
    flush(sample) {
      if (raf) {
        sink.cancelAnimationFrame(raf);
        raf = 0;
      }
      const resolved = sample ?? next;
      next = null;
      if (resolved) apply(resolved);
    },
    cancel() {
      if (raf) {
        sink.cancelAnimationFrame(raf);
        raf = 0;
      }
      next = null;
    },
    pending() {
      return next;
    },
  };
}

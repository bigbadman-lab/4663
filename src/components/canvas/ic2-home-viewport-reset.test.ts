/**
 * Stage IC2.1 — HOME as explicit local viewport reset.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
  HOME_VIEW_ARIA_LABEL,
  getLiveControlDockItems,
} from "@/lib/canvas/control-palette";
import {
  HOME_REGION_LEFT_PX,
  HOME_REGION_TOP_PX,
  homeCameraForViewport,
  WORLD_HEIGHT_PX,
  WORLD_WIDTH_PX,
} from "@/lib/canvas/world-camera";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function readSrc(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

describe("Stage IC2.1 HOME viewport reset", () => {
  it("1–3. HOME uses homeCameraForViewport with current viewport size", () => {
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("homeCameraForViewport(vw, vh)"));
    assert.ok(cam.includes("viewport?.clientWidth"));
    assert.ok(cam.includes("viewport?.clientHeight"));
    assert.ok(cam.includes("cancelActivePan"));
    // Not a hardcoded single camera for every device.
    assert.equal(cam.includes("applyCamera({ x: 1680"), false);
    assert.equal(cam.includes("applyCamera({ x: HOME_REGION_LEFT_PX"), false);

    const boot = homeCameraForViewport(1440, 900);
    assert.equal(boot.x, HOME_REGION_LEFT_PX);
    assert.equal(boot.y, HOME_REGION_TOP_PX);

    // After resize, canonical HOME differs from boot HOME.
    const resized = homeCameraForViewport(800, 600);
    assert.notDeepEqual(resized, boot);
    assert.ok(resized.x >= 0 && resized.x <= WORLD_WIDTH_PX - 800);
    assert.ok(resized.y >= 0 && resized.y <= WORLD_HEIGHT_PX - 600);

    // Resize observer clamps only — does not auto-HOME.
    assert.ok(
      cam.includes("do not auto-HOME on resize") ||
        cam.includes("do not reapply fitted scale"),
    );
    assert.ok(cam.includes("applyCamera(cameraRef.current)"));
  });

  it("4–5. HOME clears active pan + grabbing/panning flag", () => {
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("cancelActivePan"));
    // cancel runs before apply inside goHome.
    const goHomeIdx = cam.indexOf("const goHome = useCallback");
    const cancelIdx = cam.indexOf("cancelActivePan()", goHomeIdx);
    const applyIdx = cam.indexOf(
      "applyCamera(homeCameraForViewport(vw, vh))",
      goHomeIdx,
    );
    assert.ok(goHomeIdx > 0);
    assert.ok(cancelIdx > goHomeIdx);
    assert.ok(applyIdx > cancelIdx);

    const cancelBody = cam.slice(
      cam.indexOf("const cancelActivePan"),
      cam.indexOf("const goHome"),
    );
    assert.ok(cancelBody.includes("panRef.current = null"));
    assert.ok(cancelBody.includes('removeAttribute("data-4663-panning")'));
    assert.ok(cancelBody.includes("suppressEmptyCanvasClick = false"));
    assert.ok(cancelBody.includes("releasePointerCapture"));
  });

  it("6–10. HOME does not mutate shared / network / session RESET state", () => {
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.equal(cam.includes("usePageData"), false);
    assert.equal(cam.includes("setData"), false);
    assert.equal(cam.includes("fetch("), false);
    assert.equal(cam.includes("Broadcast"), false);
    assert.equal(cam.includes("supabase"), false);
    assert.equal(cam.includes("resetContent"), false);
    assert.equal(cam.includes("EPHEMERAL"), false);
    assert.equal(cam.includes("summon"), false);

    const surface = readSrc("src/components/canvas/canvas-surface.tsx");
    const onHome = surface.slice(
      surface.indexOf("const onHome = "),
      surface.indexOf("return ("),
    );
    assert.ok(onHome.includes("goHome()"));
    assert.equal(onHome.includes("onReset"), false);
    assert.equal(onHome.includes("resetContent"), false);
    assert.equal(onHome.includes("setPageData"), false);

    const palette = readSrc("src/components/canvas/canvas-control-palette.tsx");
    // HOME and RESET remain separate click handlers.
    assert.ok(palette.includes('item.id === "home"'));
    assert.ok(palette.includes('item.id === "reset"'));
    assert.ok(palette.includes("onHome?.()"));
    assert.ok(palette.includes("onReset?.()"));
  });

  it("11. subsequent pan wiring remains after HOME cancel", () => {
    const cam = readSrc("src/components/canvas/use-canvas-camera.ts");
    assert.ok(cam.includes("onViewportPointerDown"));
    assert.ok(cam.includes("panRef.current = {"));
    assert.ok(cam.includes("shouldTrackCanvasPan"));
    // Live dock still exposes HOME as local control.
    assert.ok(getLiveControlDockItems().some((i) => i.id === "home"));
  });

  it("accessibility: Restore home view; visible label stays HOME", () => {
    assert.equal(HOME_VIEW_ARIA_LABEL, "Restore home view");
    const palette = readSrc("src/components/canvas/canvas-control-palette.tsx");
    assert.ok(palette.includes("HOME_VIEW_ARIA_LABEL"));
    assert.ok(palette.includes("title={a11yLabel}"));
    assert.ok(palette.includes("aria-label={a11yLabel}"));
    // Visible dock text still uses item.label (HOME).
    assert.ok(palette.includes("{item.label}"));
    assert.ok(
      getLiveControlDockItems().find((i) => i.id === "home")?.label === "HOME",
    );
  });
});

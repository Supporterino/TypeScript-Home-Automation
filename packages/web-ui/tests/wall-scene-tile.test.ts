import { describe, expect, it } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { WALL_MIN_TOUCH_TARGET } from "../src/app/wall/registry.js";
import { wallTileMetrics } from "../src/app/wall/scale.js";

/**
 * Structural assertions for the wall scene button (design.md D11, D14;
 * specs/wall-display "Scene Buttons Trigger Automations"). There is no DOM
 * harness here, so the render decisions — the full-bleed pressable tile, the
 * leading scene glyph + label anatomy, the explicit pressed/busy states, and the
 * unchanged trigger and error-surfacing path — are asserted against the
 * widget's source, the same style as `wall-card-archetypes.test.ts` /
 * `cover-transport.test.ts`. The pure trigger-request decision stays covered by
 * `wall-scene.test.ts`.
 *
 * Re-pointed at the shared Hearth card vocabulary (design.md D11, D14); each
 * assertion's intent is unchanged.
 */
const APP_DIR = join(import.meta.dir, "..", "src/app");
const SCENE = join(APP_DIR, "wall/widgets/SceneWidget.tsx");

/** Removes block and line comments so prose is not mistaken for code. */
function stripComments(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

async function sceneSource(): Promise<string> {
  return stripComments(await readFile(SCENE, "utf8"));
}

describe("scene button is a full-bleed pressable tile", () => {
  it("fills its widget area with a pressable element", async () => {
    const source = await sceneSource();
    expect(source).toContain("<button");
    expect(source).toContain('height: "100%"');
    expect(source).toContain('width: "100%"');
    expect(source).toContain("onClick={() => void handleTrigger()}");
  });

  it("presents a leading scene glyph beside the label", async () => {
    const source = await sceneSource();
    expect(source).toContain('from "lucide-react"');
    expect(source).toContain("<Play size={SCENE_GLYPH_SIZE}");
    expect(source).toContain("{label}");
    // The glyph leads the label on the shared card vocabulary row.
    expect(source).toContain("WallCardLabel");
    expect(source).toContain('flexDirection: "row"');
  });

  it("meets the wall's minimum touch target", () => {
    expect(wallTileMetrics("wall").control).toBeGreaterThanOrEqual(WALL_MIN_TOUCH_TARGET);
  });

  it("is keyboard-operable and never hover-only", async () => {
    const source = await sceneSource();
    expect(source).toContain("onPointerDown");
    expect(source).toContain("onKeyDown");
    expect(source).not.toMatch(/onMouseEnter|onMouseOver|onPointerEnter|onPointerOver/);
  });
});

describe("scene button state presentation", () => {
  it("exposes an explicit, token-driven pressed/active state", async () => {
    const source = await sceneSource();
    expect(source).toContain("data-pressed");
    expect(source).toContain("const [pressed, setPressed] = useState(false)");
    expect(source).toContain('"var(--hearth-surface-raised)"');
    expect(source).toContain('"var(--hearth-e2)"');
  });

  it("exposes a busy state while triggering", async () => {
    const source = await sceneSource();
    expect(source).toContain("data-busy");
    expect(source).toContain("aria-busy={busy}");
    expect(source).toContain("<Spinner");
  });

  it("reserves the geometry so states change paint, not layout", async () => {
    const source = await sceneSource();
    // The busy indicator overlays the glyph rather than displacing it.
    expect(source).toContain('className="absolute"');
    // States toggle opacity/background/shadow only — never width or height.
    expect(source).toContain("opacity: busy ? 0 : 1");
    expect(source).toContain(
      'background: pressed ? "var(--hearth-surface-raised)" : "transparent"',
    );
  });

  it("uses Hearth tokens rather than literal colors", async () => {
    const source = await sceneSource();
    expect(source).toContain("var(--hearth-");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe("scene button keeps its trigger and error path", () => {
  it("still builds its request through sceneTriggerRequest", async () => {
    const source = await sceneSource();
    expect(source).toContain("sceneTriggerRequest(automationName, automations)");
    expect(source).toContain("triggerAutomation(request.name, manualTriggerContext(request.type))");
  });

  it("surfaces a failure on the widget", async () => {
    const source = await sceneSource();
    expect(source).toContain("var(--hearth-danger)");
    expect(source).toContain('"Could not trigger this automation"');
  });
});

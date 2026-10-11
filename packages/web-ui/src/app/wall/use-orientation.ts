/**
 * Resolves the wall's current orientation (design.md D4; specs/wall-display "A
 * profile reflows for orientation"). Thin glue over `matchMedia` so `WallGrid`
 * stays a single decision; the grid's actual placement rule is the pure
 * {@link resolveLayout}.
 */
import type { WallOrientation } from "@ts-ha/shared";
import { useEffect, useState } from "react";

const PORTRAIT_QUERY = "(orientation: portrait)";

function currentOrientation(): WallOrientation {
  if (typeof window === "undefined") return "landscape";
  return window.matchMedia(PORTRAIT_QUERY).matches ? "portrait" : "landscape";
}

/** The live orientation, defaulting to landscape before/without a matchMedia result. */
export function useOrientation(): WallOrientation {
  const [orientation, setOrientation] = useState<WallOrientation>(currentOrientation);

  useEffect(() => {
    const media = window.matchMedia(PORTRAIT_QUERY);
    const update = () => setOrientation(media.matches ? "portrait" : "landscape");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return orientation;
}

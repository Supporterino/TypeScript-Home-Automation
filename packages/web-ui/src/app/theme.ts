/**
 * Ambient Glass Mantine theme (design.md D1). Maps the design-system palette
 * and rhythm into Mantine so component defaults are on-system and never fall
 * back to Mantine's stock blue. Color values not expressible as Mantine theme
 * keys (elevation, hairlines, glass tints) live in `./styles/tokens.css`.
 */
import { createTheme } from "@mantine/core";
import {
  AMBIENT_COLORS,
  AMBIENT_ELEVATION,
  AMBIENT_RADII,
  BODY_FONT_FAMILY,
  DISPLAY_FONT_FAMILY,
  MONO_FONT_FAMILY,
} from "./tokens.js";

export const ambientTheme = createTheme({
  // The interactive accent is the sky scale; dark uses index 4 (#38BDF8),
  // light uses index 6 (#0284C7) — the `--info` values in each scheme.
  primaryColor: "ambient",
  primaryShade: { light: 6, dark: 4 },
  autoContrast: true,
  colors: { ambient: AMBIENT_COLORS },

  fontFamily: BODY_FONT_FAMILY,
  fontFamilyMonospace: MONO_FONT_FAMILY,
  headings: {
    fontFamily: DISPLAY_FONT_FAMILY,
    fontWeight: "700",
    sizes: {
      h1: { fontSize: "24px", lineHeight: "1.2" },
      h2: { fontSize: "20px", lineHeight: "1.25" },
      h3: { fontSize: "16px", lineHeight: "1.3" },
      h4: { fontSize: "14px", lineHeight: "1.35" },
      h5: { fontSize: "12px", lineHeight: "1.4" },
      h6: { fontSize: "12px", lineHeight: "1.4" },
    },
  },

  fontSizes: { xs: "12px", sm: "14px", md: "16px", lg: "20px", xl: "24px" },
  spacing: { xs: "4px", sm: "8px", md: "12px", lg: "16px", xl: "24px" },

  radius: { ...AMBIENT_RADII },
  defaultRadius: "md",

  shadows: {
    xs: AMBIENT_ELEVATION.e1,
    sm: AMBIENT_ELEVATION.e1,
    md: AMBIENT_ELEVATION.e2,
    lg: AMBIENT_ELEVATION.e2,
    xl: AMBIENT_ELEVATION.e2,
  },

  // Mantine transitions honor prefers-reduced-motion at the theme level too.
  respectReducedMotion: true,
  cursorType: "pointer",

  components: {
    // Tiles and cards: opaque surface with a 14px tile radius.
    Paper: { defaultProps: { radius: "lg" } },
    Card: { defaultProps: { radius: "lg" } },
    Badge: { defaultProps: { radius: "999px" } },
    Tooltip: { defaultProps: { withArrow: true } },
    ActionIcon: { defaultProps: { radius: "md" } },
    Button: { defaultProps: { radius: "md" } },
  },
});

export default ambientTheme;

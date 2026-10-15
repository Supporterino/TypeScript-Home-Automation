/**
 * Zod validation for the wall-display profile contract (design.md D10;
 * specs/wall-display "Wall Configuration Editor", specs/http-server "Wall
 * Profile Endpoints").
 *
 * Kept out of the root barrel — and out of `wall.ts` — so a first-paint
 * module importing the barrel never pulls `zod` into the entry bundle
 * (design.md D24). Consumers reach it through the
 * `@ts-ha/shared/wall-schema` subpath, which is imported only by the server
 * and by the wall's own lazy chunk.
 *
 * Annotating each schema with `z.ZodType<...>` makes the validator and the
 * wire types mutually checked at compile time, so neither can drift.
 */

import { z } from "zod";
import {
  WALL_DEVICE_LAYOUTS,
  WALL_GRID_COLUMNS,
  WALL_GRID_MAX_ROWS,
  WALL_PROFILE_VERSION,
  WALL_V1_PROFILE_VERSION,
  WALL_V1_WIDGET_TYPES,
  WALL_WIDGET_TYPES,
  WALL_ZONE_MAX_LENGTH,
  type WallDeviceGridWidgetConfig,
  type WallDeviceWidgetConfig,
  type WallFavoritesWidgetConfig,
  type WallLinkWidgetConfig,
  type WallProfile,
  type WallProfileConfig,
  type WallRoomWidgetConfig,
  type WallSceneWidgetConfig,
  type WallTemperatureWidgetConfig,
  type WallTitledWidgetConfig,
  type WallTypedDeviceWidgetConfig,
  type WallV1Profile,
  type WallV1ProfileConfig,
  type WallV1Widget,
  type WallV1WidgetType,
  type WallWidget,
  type WallWidgetType,
} from "./wall.js";

/** The config shared by the clock, weather, energy, and status widgets. */
export const wallTitledWidgetConfigSchema: z.ZodType<WallTitledWidgetConfig> = z.object({
  title: z.string().optional(),
});

/** The room widget's config: a required room and an optional title. */
export const wallRoomWidgetConfigSchema: z.ZodType<WallRoomWidgetConfig> = z.object({
  roomId: z.string().min(1),
  title: z.string().optional(),
});

/**
 * The version-1 single-device widget's config, read by the migration
 * (design.md D8). Built from the retired generic `device` widget's shape.
 */
export const wallDeviceWidgetConfigSchema: z.ZodType<WallDeviceWidgetConfig> = z.object({
  qualifiedId: z.string().min(1),
  title: z.string().optional(),
});

/**
 * A typed device widget's config, shared by every device widget type
 * (design.md D6): its bound device plus the card's layout and inactive-controls
 * setting.
 */
export const wallTypedDeviceWidgetConfigSchema: z.ZodType<WallTypedDeviceWidgetConfig> = z.object({
  qualifiedId: z.string().min(1),
  layout: z.enum(WALL_DEVICE_LAYOUTS).optional(),
  collapsible_controls: z.boolean().optional(),
});

/** A scene button's config: a required automation and an optional label. */
export const wallSceneWidgetConfigSchema: z.ZodType<WallSceneWidgetConfig> = z.object({
  automation: z.string().min(1),
  label: z.string().optional(),
});

/** The temperature widget's config: a required sensor device and an optional title. */
export const wallTemperatureWidgetConfigSchema: z.ZodType<WallTemperatureWidgetConfig> = z.object({
  qualifiedId: z.string().min(1),
  title: z.string().optional(),
});

/** The favorites widget's config: no required options. */
export const wallFavoritesWidgetConfigSchema: z.ZodType<WallFavoritesWidgetConfig> = z.record(
  z.string(),
  z.unknown(),
);

/** A link widget's config: a required target profile and an optional label. */
export const wallLinkWidgetConfigSchema: z.ZodType<WallLinkWidgetConfig> = z.object({
  target: z.string().min(1),
  label: z.string().optional(),
});

/** A device grid's config: at least one selected device and an optional title. */
export const wallDeviceGridWidgetConfigSchema: z.ZodType<WallDeviceGridWidgetConfig> = z.object({
  qualifiedIds: z.array(z.string().min(1)).min(1),
  title: z.string().optional(),
});

/**
 * Each widget type's config schema — the single definition site shared by the
 * profile schema below, the server's write validation, and the editor's widget
 * registry (design.md D10). Typed as a total record so a new widget type
 * without a schema is a compile error.
 */
export const WALL_WIDGET_CONFIG_SCHEMAS: Readonly<Record<WallWidgetType, z.ZodTypeAny>> = {
  clock: wallTitledWidgetConfigSchema,
  weather: wallTitledWidgetConfigSchema,
  energy: wallTitledWidgetConfigSchema,
  status: wallTitledWidgetConfigSchema,
  room: wallRoomWidgetConfigSchema,
  temperature: wallTemperatureWidgetConfigSchema,
  scene: wallSceneWidgetConfigSchema,
  favorites: wallFavoritesWidgetConfigSchema,
  link: wallLinkWidgetConfigSchema,
  devices: wallDeviceGridWidgetConfigSchema,
  light: wallTypedDeviceWidgetConfigSchema,
  cover: wallTypedDeviceWidgetConfigSchema,
  fan: wallTypedDeviceWidgetConfigSchema,
  climate: wallTypedDeviceWidgetConfigSchema,
  lock: wallTypedDeviceWidgetConfigSchema,
  number: wallTypedDeviceWidgetConfigSchema,
  select: wallTypedDeviceWidgetConfigSchema,
  entity: wallTypedDeviceWidgetConfigSchema,
};

/**
 * Each version-1 widget type's config schema, read by the migration (design.md
 * D8). It reuses the current schemas — every version-1 type but `device` still
 * exists — and adds the retired generic `device` widget's config, so a stored
 * version-1 profile validates before it is migrated.
 */
const WALL_V1_WIDGET_CONFIG_SCHEMAS: Readonly<Record<WallV1WidgetType, z.ZodTypeAny>> = {
  ...WALL_WIDGET_CONFIG_SCHEMAS,
  device: wallDeviceWidgetConfigSchema,
};

/** A widget's grid placement — the fields overlap detection needs. */
interface WallWidgetPlacement {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** Whether two widgets occupy at least one grid cell in common. */
function widgetsOverlap(a: WallWidgetPlacement, b: WallWidgetPlacement): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Builds a widget schema for a widget-type list and its per-type config schemas:
 * bounds-checked against the fixed grid, with its `config` validated against its
 * own type's schema. Shared by the version-2 write schema and the version-1 read
 * schema so the two cannot drift in structure (design.md D8).
 *
 * `zone` is trimmed and bounded so a band caption cannot be blank or absurdly
 * long (wall-zones-and-fit D1; specs/wall-display "Wall Zones"); omitting it
 * leaves the widget unzoned and an existing profile parses unchanged.
 */
function wallWidgetSchemaFor<TType extends string>(
  types: readonly [TType, ...TType[]],
  configSchemas: Readonly<Record<TType, z.ZodTypeAny>>,
) {
  return z
    .object({
      id: z.string().min(1),
      type: z.enum(types),
      config: z.record(z.string(), z.unknown()).default({}),
      x: z.number().int().min(0),
      y: z.number().int().min(0),
      w: z.number().int().min(1),
      h: z.number().int().min(1),
      zone: z.string().trim().min(1).max(WALL_ZONE_MAX_LENGTH).optional(),
    })
    .superRefine((widget, ctx) => {
      if (widget.x + widget.w > WALL_GRID_COLUMNS) {
        ctx.addIssue({
          code: "custom",
          message: `Widget exceeds the ${WALL_GRID_COLUMNS}-column grid (x + w must be ≤ ${WALL_GRID_COLUMNS})`,
          path: ["x"],
        });
      }

      if (widget.y + widget.h > WALL_GRID_MAX_ROWS) {
        ctx.addIssue({
          code: "custom",
          message: `Widget exceeds the ${WALL_GRID_MAX_ROWS}-row grid (y + h must be ≤ ${WALL_GRID_MAX_ROWS})`,
          path: ["y"],
        });
      }

      const configResult = configSchemas[widget.type].safeParse(widget.config);
      if (!configResult.success) {
        for (const issue of configResult.error.issues) {
          ctx.addIssue({
            code: "custom",
            message: issue.message,
            path: ["config", ...issue.path],
          });
        }
      }
    });
}

/**
 * One version-2 widget: bounds-checked against the fixed grid, with its `config`
 * validated against its own type's schema. Annotating the schema with
 * `z.ZodType<WallWidget>` keeps the validator and the wire type mutually
 * checked.
 */
export const wallWidgetSchema: z.ZodType<WallWidget> = wallWidgetSchemaFor(
  WALL_WIDGET_TYPES,
  WALL_WIDGET_CONFIG_SCHEMAS,
);

/** One version-1 widget, validated before migration (design.md D8). */
const wallV1WidgetSchema: z.ZodType<WallV1Widget> = wallWidgetSchemaFor(
  WALL_V1_WIDGET_TYPES,
  WALL_V1_WIDGET_CONFIG_SCHEMAS,
);

/**
 * Builds a widget list whose widgets are well-formed, uniquely identified, and
 * non-overlapping. Non-overlap is enforced because the grid places widgets by
 * absolute cell rather than by flow (design.md D4). Shared by the version-2 and
 * version-1 lists (design.md D8).
 */
function wallWidgetListSchemaFor<TWidget extends WallWidgetPlacement & { readonly id: string }>(
  widgetSchema: z.ZodType<TWidget>,
) {
  return z.array(widgetSchema).superRefine((widgets, ctx) => {
    const seen = new Set<string>();
    for (let i = 0; i < widgets.length; i += 1) {
      const widget = widgets[i];
      if (!widget) continue;
      if (seen.has(widget.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate widget id "${widget.id}"`,
          path: [i, "id"],
        });
      }
      seen.add(widget.id);
      for (let j = i + 1; j < widgets.length; j += 1) {
        const other = widgets[j];
        if (other && widgetsOverlap(widget, other)) {
          ctx.addIssue({
            code: "custom",
            message: `Widgets "${widget.id}" and "${other.id}" overlap on the grid`,
            path: [j],
          });
        }
      }
    }
  });
}

/** A version-2 widget list, validated on the write path. */
const wallWidgetListSchema = wallWidgetListSchemaFor(wallWidgetSchema);

/** A version-1 widget list, validated before migration (design.md D8). */
const wallV1WidgetListSchema = wallWidgetListSchemaFor(wallV1WidgetSchema);

/** A profile's composition: a base layout and optional per-orientation overrides (design.md D4). */
export const wallProfileConfigSchema: z.ZodType<WallProfileConfig> = z.object({
  widgets: wallWidgetListSchema,
  orientations: z
    .object({
      portrait: wallWidgetListSchema.optional(),
      landscape: wallWidgetListSchema.optional(),
    })
    .optional(),
});

/** A version-1 profile's composition, validated before migration (design.md D8). */
const wallV1ProfileConfigSchema: z.ZodType<WallV1ProfileConfig> = z.object({
  widgets: wallV1WidgetListSchema,
  orientations: z
    .object({
      portrait: wallV1WidgetListSchema.optional(),
      landscape: wallV1WidgetListSchema.optional(),
    })
    .optional(),
});

/**
 * The wall-profile schema validated on write by the server and reused by the
 * editor (design.md D10). `version` is pinned to {@link WALL_PROFILE_VERSION}
 * so an unknown future shape is rejected rather than silently misread — the
 * editor writes the current version, so a version-1 profile is rejected here and
 * accepted only by {@link wallV1ProfileSchema} for migration (design.md D8).
 */
export const wallProfileSchema: z.ZodType<WallProfile> = z.object({
  name: z.string().min(1),
  version: z.literal(WALL_PROFILE_VERSION),
  config: wallProfileConfigSchema,
});

/**
 * The version-1 profile schema — read by the migration, not the write boundary
 * (design.md D8; specs/wall-display "Wall Profile Version and Migration"). It
 * pins `version` to {@link WALL_V1_PROFILE_VERSION} and accepts the retired
 * generic `device` widget, so a stored version-1 profile parses and can be
 * migrated to the current version instead of being rejected.
 */
export const wallV1ProfileSchema: z.ZodType<WallV1Profile> = z.object({
  name: z.string().min(1),
  version: z.literal(WALL_V1_PROFILE_VERSION),
  config: wallV1ProfileConfigSchema,
});

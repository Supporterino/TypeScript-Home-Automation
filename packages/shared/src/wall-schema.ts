/** Zod validation for the wall-display profile contract; kept off the root barrel. */

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

/** The version-1 single-device widget's config, read by the migration. */
export const wallDeviceWidgetConfigSchema: z.ZodType<WallDeviceWidgetConfig> = z.object({
  qualifiedId: z.string().min(1),
  title: z.string().optional(),
});

/** A typed device widget's config, shared by every device widget type. */
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

/** Each widget type's config schema, typed as a total record. */
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

/** Each version-1 widget type's config schema, read by the migration. */
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

/** Builds a grid-bounds-checked widget schema with its `config` validated by type. */
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

/** One version-2 widget, bounds-checked on the grid and validated by type. */
export const wallWidgetSchema: z.ZodType<WallWidget> = wallWidgetSchemaFor(
  WALL_WIDGET_TYPES,
  WALL_WIDGET_CONFIG_SCHEMAS,
);

/** One version-1 widget, validated before migration. */
const wallV1WidgetSchema: z.ZodType<WallV1Widget> = wallWidgetSchemaFor(
  WALL_V1_WIDGET_TYPES,
  WALL_V1_WIDGET_CONFIG_SCHEMAS,
);

/** Builds a widget list requiring unique ids and no overlap. */
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

/** A version-1 widget list, validated before migration. */
const wallV1WidgetListSchema = wallWidgetListSchemaFor(wallV1WidgetSchema);

/** A profile's composition: a base layout and optional per-orientation overrides. */
export const wallProfileConfigSchema: z.ZodType<WallProfileConfig> = z.object({
  widgets: wallWidgetListSchema,
  orientations: z
    .object({
      portrait: wallWidgetListSchema.optional(),
      landscape: wallWidgetListSchema.optional(),
    })
    .optional(),
});

/** A version-1 profile's composition, validated before migration. */
const wallV1ProfileConfigSchema: z.ZodType<WallV1ProfileConfig> = z.object({
  widgets: wallV1WidgetListSchema,
  orientations: z
    .object({
      portrait: wallV1WidgetListSchema.optional(),
      landscape: wallV1WidgetListSchema.optional(),
    })
    .optional(),
});

/** The wall-profile schema validated on write and reused by the editor. */
export const wallProfileSchema: z.ZodType<WallProfile> = z.object({
  name: z.string().min(1),
  version: z.literal(WALL_PROFILE_VERSION),
  config: wallProfileConfigSchema,
});

/** The version-1 profile schema, read by the migration. */
export const wallV1ProfileSchema: z.ZodType<WallV1Profile> = z.object({
  name: z.string().min(1),
  version: z.literal(WALL_V1_PROFILE_VERSION),
  config: wallV1ProfileConfigSchema,
});

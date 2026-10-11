---
"@ts-ha/core": minor
"@ts-ha/shared": minor
"@ts-ha/web-ui": minor
---

Add named wall displays: full-bleed, profile-addressed panels for wall-mounted
tablets.

- `@ts-ha/shared`: wall-profile contracts (`WallProfile`, `WallWidget`,
  `WallProfileConfig`, `WallChangeKind`), a bounds-checked Zod schema exposed as
  the `wall-schema` subpath, the typed `wall` stream event, and `zod` as its
  first — pure, browser-safe — runtime dependency
- `@ts-ha/core`: `WallManager` persisting profiles under `$internal:wall:<name>`
  with create/list/read/update/delete, schema validation, `wall` event emission
  (never a raw state event), and `GET/POST/PUT/DELETE /api/walls[/:name]` behind
  the existing `/api/*` auth
- `@ts-ha/web-ui`: a full-bleed `/wall/:name` surface and a `/walls` editor — a
  12-column widget grid, a widget catalog (clock, weather, energy, room,
  favorites, device, status, scene), a scaled device tile, and live re-render on
  the `wall` event, all in one lazy chunk off first paint

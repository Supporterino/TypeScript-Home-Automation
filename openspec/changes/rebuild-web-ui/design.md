## Context

See proposal.md — Why. This section records only the constraints that shape the
approach.

**The frontend is not the problem.** `src/core/web-ui/app/` is already ~1500
lines of React 19 + Mantine 9 across six tabs, with dark mode, log filtering,
and full state CRUD. Both headline features — device controls and automation
management — are blocked on server capability, not UI quality.

**Load-bearing constraints discovered during exploration:**

1. `web-ui/index.ts:79-81` documents why the UI does not use `app.use("/")`:
   at `WEB_UI_PATH="/"` it would shadow `/healthz`, `/readyz`, and every
   user-registered webhook. Any SPA catch-all route reintroduces that bug.
2. HomeKit accessory UUIDs derive from `device.ieee_address`
   (`homekit-accessory-factory.ts:371`); the bridge UUID derives from the
   configured username (`homekit-service.ts:308`). Perturbing either forces
   every user to re-pair.
3. `StateManager.save()` (`state-manager.ts:266-295`) serializes the entire map
   and performs tmp + fsync + backup + rename. It is not safe to call on every
   `set()`.
4. MQTT topic subscriptions are ref-counted (`mqtt-service.ts:150-151`), so
   unsubscribing one automation cannot break another sharing the same topic.
5. Cron job IDs are index-based, `` `${name}:cron:${i}` ``
   (`automation-manager.ts:175`), so restart must reproduce trigger ordering.
6. Webhook paths live in a global map keyed by path
   (`http-server.ts:129`) with no per-automation ownership check.

**Two capabilities already exist but are trapped in the wrong subsystem:**

- `detectCapabilities()` (`homekit-accessory-factory.ts:55`) already parses the
  z2m `exposes` schema and is already exported.
- `ShellySource` (`homekit-sources/shelly-source.ts`) already solves Shelly
  liveness completely: MQTT push via `<topicPrefix>/events/rpc`, LWT presence
  via `<topicPrefix>/online`, and an HTTP poll loop scoped to HTTP-transport
  devices only. It is reachable solely through the HAP sink.

The second point is the single strongest argument for the shared-source
decision below: the hard part is written and tested, just not reusable.

**Nothing records automation activity.** `prometheus-metrics` covers devices
only — device info gauges and device state gauges. There is no execution count,
no last-run timestamp, no error counter, and no attribution of state writes to
the automation that performed them. Every automation-observability feature is
new capability, not exposure of existing data.

**Zigbee2MQTT supplies no room or area data.** Any grouping is UI-local and
user-authored, and is the first user-authored data the engine holds.

## Goals / Non-Goals

**Goals:**
- One device abstraction serving two sinks (HomeKit and the web UI) without the
  web UI inheriting HomeKit's lossy HAP projection.
- An honest off switch for automations — triggers deregistered, `onStop()` run,
  internal timers dead.
- Sub-second perceived latency between actuating a control and seeing it
  confirmed.
- Frontend changes that do not require a rebuild-and-restart cycle.
- Preserve the property that the package ships with no external asset
  directory: compiled assets remain embedded in the module graph.
- A first paint that stays within a stated transferred-bytes budget, so the
  mobile-first claim is measured rather than asserted — D24.

**Non-Goals:**
- Editing automations from the browser. Source is read-only.
- Static analysis of automation source. Relationships are either declared
  (triggers, required services) or observed at runtime, never inferred by
  parsing code.
- Persisting execution history. It is in-memory and lost on restart, like the
  log buffer.
- Automatic room inference from naming conventions. Rooms are explicit.
- Hot reload of automations on file change. It becomes nearly free once file
  paths are retained and restart exists, but it is not in scope here.
- Changing observable HomeKit behaviour. The source refactor is
  behaviour-preserving.
- Replacing Mantine or React. The component library is not the problem, and
  measured against transferred bytes it is not the weight either — D24.
- Introducing a browser-DOM test harness. Component rendering stays unverified
  by automated test; the response is to keep logic out of components — D23.
- Multi-user auth, roles, or per-device permissions. The existing single shared
  token model is unchanged.

## Decisions

### D1. Sequence the work as six phases, not one big-bang rewrite

Although this is scoped as a single change, it decomposes into phases with a
strict dependency order. Nothing is verifiable until its phase lands, so the
phases are the natural review and rollback boundaries.

```
 ① DELIVERY ─────────────┐        ② CONTROL-PLANE API
   hashed cached assets  │           filePath retention
   code splitting        │           unwire extraction
   dev watch script      │           stop/restart
                         │           debounced flush + defaults
                         │           typed + unstripped exposes
                         │           source endpoint
                          │                    │
                          │        ③ SSE ──────┤
                          │           event stream
                          │           state · log · automation · readiness
                          │                    │
                          │        ④ DEVICE SOURCES
                          │           shared abstraction
                          │           zigbee · shelly · nanoleaf · state
                          │           nanoleaf enumeration
                          │           stable device identity
                          │           command validation + routes
                          │           homekit narrows
                          │           SSE device categories
                          │                    │
                         │        ⑤ OBSERVABILITY & ROOMS
                         │           execution context
                         │           execution history
                         │           state write attribution
                         │           room model + assignment
                         │                    │
                         └────────► ⑥ UI REBUILD
                                       routing, IA, controls
                                       rooms, tiles
                                       automation management
                                       source viewer
```

① and ② are independent and may proceed in parallel. ⑤ depends on ④ for stable
device identity; ⑥ depends on ②③④⑤. A seventh phase — automation hot reload —
is deliberately left out of scope but is unlocked by ②.

The stream's **device** event categories sit in ④ rather than ③, even though the
stream itself lands in ③. Device reachability, observation freshness, and
source-qualified identity are all introduced by ④; emitting device events in ③
would mean emitting them against the Zigbee registry model and re-expressing
them one phase later over the unified descriptor. Phase ③ therefore ships the
stream carrying state, log, automation, and readiness categories, and ④ adds the
device categories alongside the sources that define them. The stream's value in
③ — replacing the five-endpoint poll for everything except devices — does not
depend on the device categories.

Device command validation and the command endpoints sit in ④ rather than ②,
even though the typed capability schema they validate against lands in ②. The
validation requirement belongs to `device-sources`, which owns command dispatch
for every family; building it in ② would mean writing it once against the Zigbee
schema and again against the shared descriptor, and shipping a command endpoint
addressed by friendly name that ④ then re-addresses by qualified identifier.
Phase ② retains ample standalone value without it.

Alternative considered: ship the UI rebuild first against the existing API.
Rejected — the UI would have nothing new to display, since every headline
feature is server-blocked.

### D2. Shared device source with a rich payload; HomeKit narrows it

The web UI wants the full `exposes` schema so it can render any device. HomeKit
wants a curated set of HAP characteristics. These pull in opposite directions,
so the shared interface carries the **rich** payload and HomeKit projects down
to HAP at its own boundary.

```
  ┌──────────────────────────────────────────────────┐
  │  DeviceSource                                    │
  │    list()      → rich device descriptors         │
  │                  (incl. typed exposes schema)    │
  │    command()   → actuate                         │
  │    subscribe() → state + reachability deltas     │
  └────────────┬──────────────────────┬──────────────┘
               │                      │
      ┌────────▼────────┐    ┌────────▼─────────┐
      │  HAP sink       │    │  Web UI sink     │
      │  narrows to     │    │  consumes the    │
      │  characteristics│    │  full payload    │
      └─────────────────┘    └──────────────────┘
               ▲
   zigbee-source · shelly-source · nanoleaf-source · state-source
```

Rationale: `ShellySource` already implements MQTT push status, LWT presence,
and HTTP polling. Duplicating that for the UI would mean two poll loops against
the same hardware and two divergent implementations of the same normalization.

Alternatives considered:
- *Separate parallel interfaces, reuse the pattern not the code.* Cleaner
  isolation, zero regression risk to HomeKit — but duplicates the Shelly
  liveness machinery, which is the most intricate part of the whole subsystem.
- *Three concrete adapters with no abstraction, extract later.* Fastest, but
  guarantees the duplication above and leaves HomeKit and the UI to drift.

Trade-off accepted: this refactors working, physically-paired code. See R1.

### D3. Device liveness is push-first, poll-only where unavoidable

| Source | Enumerate | Command | Liveness |
|---|---|---|---|
| Zigbee | `getDevices()` | `publishToDevice()` → `<prefix>/<name>/set` | MQTT push, free |
| Shelly (MQTT transport) | `getDevices()` | JSON-RPC over `<prefix>/rpc` | MQTT push + LWT presence |
| Shelly (HTTP transport) | `getDevices()` | HTTP JSON-RPC | HTTP poll loop |
| Nanoleaf | **to add** | HTTP | HTTP poll |

Where a Shelly is registered with `transport: "mqtt"`, push is used and the
device is excluded from the poll loop — the behaviour `ShellySource` already
implements. Only HTTP-transport Shellys and Nanoleaf are polled.

The UI surfaces freshness rather than pretending all sources are equivalent: a
push-backed device is "live", a polled device shows its last-seen age.

### D4. Disable means full stop, not a guard flag

Three levels were considered:

| | Mechanism | Honest about |
|---|---|---|
| ① Guard | `Set<string>` checked in each handler | nothing — cron still ticks, `onStart` timers still fire |
| ② Unwire | deregister all triggers | triggers only — `onStart` timers still fire |
| ③ Full stop | unwire + `onStop()` + re-import on enable | everything |

Level ③ is chosen. It is also cheaper than it first appears: the unwire half
already exists verbatim as the onStart-failure rollback at
`automation-manager.ts:341-359` and only needs extracting into a reusable
method. Enabling re-imports the module with a cache-busting query suffix and
constructs a fresh instance, because automation-internal state and timers are
instance-scoped.

Level ① was rejected outright: any automation that starts a timer in `onStart()`
would continue acting on the house while the UI reports it as disabled. That is
worse than having no switch at all.

### D5. Retaining the discovery file path is the keystone

`automation-manager.ts:86` computes `filePath`, passes it to `import()`, and
discards it. Retaining it in a `name → { filePath, ctor }` map unlocks three
otherwise-unrelated features at once:

```
              retain filePath
                     │
     ┌───────────────┼───────────────┐
     ▼               ▼               ▼
 source view    restart on      hot reload
 (read by       enable          (out of scope,
  name, never   (cache-busted   nearly free)
  by path)      re-import)
```

The source endpoint keys strictly on automation **name** and resolves the path
from this map. A client-supplied path is never accepted, eliminating traversal
as a category.

### D6. Debounced, tunable state persistence

Writing through on every `set()` is not viable: state keys are written on
routine sensor traffic, and `save()` rewrites the whole map with an fsync. A
debounce coalesces bursts into one write shortly after the last mutation.

The interval is configurable so SD-card-backed hosts can raise it and fast
storage can lower it. The trade-off is an explicit bounded loss window on
abrupt termination, rather than today's unbounded loss of everything since
boot.

This benefits every persisted key, not just the automation enabled flag — it is
a general upgrade to `STATE_PERSIST`, which today only survives a graceful
shutdown.

Alternatives considered: a dedicated flag store (rejected — a second
persistence mechanism for one boolean); opt-in `durable: true` per key
(rejected — awkward API, and the general debounce is strictly more useful);
synchronous write-through (rejected — flash wear and hot-path I/O).

**Persistence becomes the default.** `STATE_PERSIST` defaults to `false` today
(`config.ts:47`), which was defensible while the state store held only automation
scratch data. It is not defensible once the store holds rooms and automation
enabled flags: `device-rooms` and `automation-control` both require those to
survive a restart, and on a default install they would not. Making the guarantee
conditional on an opt-in flag would mean weakening those requirements to
"sometimes"; carving out a second always-persist path for exactly those two keys
is the dedicated flag store this decision already rejected. So the default flips.

`DEVICE_REGISTRY_PERSIST` (`device-registry.ts:129`) flips with it. Leaving them
divergent would be an arbitrary distinction for an operator to discover, and a
persisted registry means the device list — and, per the `device-registry` delta,
the capability schema — is available immediately on boot rather than after the
bridge republishes.

The cost is that a default deployment now writes to disk where it previously did
not. A save failure is already logged and non-fatal, so a read-only filesystem
degrades rather than breaks.

**Rooms and enabled flags must not become state toggles.** Both are stored
through the state store, and D19 makes configured state keys controllable as
devices. That is only safe because state toggles are allowlist-driven: a key
becomes a device solely by being listed in configuration. Auto-discovering
toggles from the state store would surface room membership and automation enabled
flags as user-facing switches, which is why it is prohibited rather than merely
not implemented.

That prohibition closes one door into the store. It is not the only one — the
operator state view already offers full CRUD over every key, and automations can
write any key they like. D20 closes the rest.

### D7. History routing via an explicit segment allowlist

Deep links are wanted, which rules out hash routing. But a catch-all
`GET ${basePath}/*` reintroduces the exact bug that `web-ui/index.ts:79-81`
guards against when `basePath` is `/`.

Resolution: register each known top-level UI segment explicitly rather than a
wildcard. Adding a new page costs one registration, and no unknown path is ever
swallowed. Health probes, webhooks, and the API remain reachable at any mount
path, including `/`.

Alternatives: hash routing (safe but ugly URLs, and no real deep links);
wildcard plus forbidding `basePath="/"` (simplest server code, but drops a
currently supported configuration).

### D8. Assets move out of the HTML document, but stay inside the module

Today `html-shell.ts` inlines ~1 MB from `assets/app-js.ts` and
`assets/style-css.ts` into every response, with a workaround for `</script>`
appearing inside React's minified internals (`build-web-ui.ts:78`).

The assets stay embedded as generated module constants — that property is what
lets the package ship without a static file directory — but are served from
content-hashed routes with immutable caching instead of being inlined. The HTML
shell becomes small and the bundle is fetched once.

This also resolves the tension between wanting a syntax highlighter and wanting
a smaller payload: once assets are cached and splittable, the highlighter is
loaded on demand when a source view is first opened, and costs nothing on first
paint.

The `</script>` escaping workaround disappears with inlining.

**The manifest carries pre-compressed bodies.** Nothing in the server compresses
anything today — no `compress` middleware, no `Content-Encoding`, nowhere in
`src/` or `scripts/`. Every dashboard load ships the full uncompressed text:

```
                     on disk       compressed     ratio
  app-js.ts          ~640 KB   →     ~206 KB       3.1x
  style-css.ts       ~300 KB   →      ~35 KB       8.6x
  ─────────────────────────────────────────────────────
  first paint        ~940 KB   →     ~241 KB       3.9x
```

Compression belongs in the manifest rather than in request-time middleware.
The manifest entry already carries name, content type, hash, and body; it gains
a compressed body computed once at build time and served with the matching
`Content-Encoding` when the client accepts it. This costs no per-request CPU,
adds no external files, and introduces no branch between environments — the same
three properties this decision already exists to protect. Assets are immutable
and content-addressed, so compressing them once at build time is strictly better
than compressing them on every response.

The HTML shell, which is small and served uncacheable, is not worth compressing
and is left alone.

**Content hashing also delivers the dev workflow, with no dev mode.** The
requirement is that a frontend edit be visible without a rebuild-and-restart
cycle. Content-hashed assets supply the missing half for free: a rebuild changes
the bundle, which changes its hash, which changes its URL, so the browser fetches
the new bundle without any cache-busting special case. The remaining half is a
watcher, and `bun run dev` already runs the engine with `--hot`:

```
  edit component → watcher rebuilds → asset manifest module changes
        → bun --hot reloads the server graph → new hash → new URL
                    (the engine never knows it is "dev")
```

The watcher therefore belongs in the `dev` script, not in the engine. There is no
`WEB_UI_DEV` setting, no branch in the server between development and production
asset serving, and consequently no possibility of a development mode relaxing
authorisation — a hazard that only exists if such a mode exists. The engine
serves whatever the generated manifest currently contains, in every environment.

Alternatives considered: a separate dev server with hot module replacement
proxying `/api` to the engine (better DX, but the frontend then runs outside the
engine in development, and the session cookie is `SameSite=Strict`, so
cross-origin auth becomes a problem to solve for no functional gain); serving
assets from disk when a dev flag is set (rejected — it introduces the external
asset directory that the packaging goal exists to avoid, and a code path that
only runs in development is a code path that is never tested).

The trade-off accepted is that this is rebuild-and-reload, not true hot module
replacement: component state is lost on each edit. Given the frontend's size,
the rebuild is fast, and avoiding a second process and a second serving path is
worth more than preserving component state across edits.

### D9. SSE, not WebSocket

Updates are server-to-client only; commands travel over ordinary
`POST`/`PUT` requests. SSE is unidirectional, runs over plain HTTP, reconnects
automatically in the browser, and passes through reverse proxies with less
configuration. WebSocket would add a second protocol for no capability gain.

The stream carries deltas for state, devices, logs, and automations, replacing
the current five-endpoint full refetch every five seconds. Polling is retained
as a fallback when the stream cannot be established.

### D10. The source endpoint is not additionally gated

The automation source endpoint is available wherever the dashboard is, with no
extra token requirement or opt-in flag, on the basis that it carries the same
trust level as the rest of the dashboard. See R4 — this is a deliberate
acceptance, not an oversight.

### D11. The execution context is the second keystone

Automations only ever run inside the manager's handler closures. Establishing a
context around each `execute()` call means everything happening during that
window can be attributed to the automation that caused it:

```
        ┌──────────────────────────────────────────┐
        │  execution context around execute()      │
        └────────────────────┬─────────────────────┘
                             │
      ┌──────────────┬───────┴───────┬──────────────┐
      ▼              ▼               ▼              ▼
   last run      observed        observed       observed
   duration      state reads     state writes   device commands
   trigger
   outcome
```

The context MUST survive `await`, because automations are asynchronous and
frequently write state after awaiting a service call. A plain "currently
executing" field would mis-attribute under concurrency; asynchronous context
propagation is the correct mechanism.

This resolves the problem that observed *writes* would otherwise require parsing
automation source. Runtime attribution is precise where static analysis would be
imprecise.

The complementary weakness is that runtime attribution is incomplete: a
rarely-triggered automation shows nothing until it fires. The design therefore
takes relationships from whichever source is authoritative:

| Relationship | Source | Completeness |
|---|---|---|
| Required services | declared on the class | complete |
| Related devices | declared MQTT / device triggers | complete |
| State keys read | declared state triggers | complete |
| State keys written | runtime attribution | grows with use |
| Last run, duration, outcome | runtime attribution | exact |

Three of the five are already declared and cost nothing but exposure. Only the
last two need the context, and they share it — one mechanism, two features.

Alternatives considered: static analysis of source (rejected — imprecise,
brittle, and a parser is a large dependency for a sidebar panel); explicitly
passing an attribution token into every service call (rejected — changes every
automation-facing API and burdens automation authors).

### D12. Generic controls in detail, curated primary on tiles

D2 established that the shared descriptor is deliberately rich and that consumers
narrow it themselves. A device *tile* is the sharpest case: it has room for one
action and one readout, while the capability schema supplies an unranked set.

```
┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐
│ Kitchen Lamp      │  │ Hallway           │  │ TV Plug           │
│      ● ON         │  │     21.4 °C       │  │      ○ OFF        │
│      72 %         │  │     48 % RH       │  │      14 W         │
│ live              │  │ live · 2m         │  │ polled · 8s       │
└───────────────────┘  └───────────────────┘  └───────────────────┘
  toggle + dim          read-only, tap        toggle + readout
```

The tile therefore applies a curated ranking over the generic schema to pick a
primary actuatable property and a primary readout property. The ranking is
purely presentational: a device whose capabilities match no rank degrades to a
read-only tile that opens the detail view, rather than failing to render.

Detail views remain fully generic. Nothing in the server-side model encodes
tile ranking.

Alternative considered: per-model tile definitions. Rejected — it reintroduces
exactly the per-device-family knowledge that D2 exists to eliminate.

### D13. One information architecture, two navigation components

The interface is split by audience — a control-oriented HOME section and an
operator-oriented ENGINE section — and navigation is grouped by that split.

Mobile-first and a sidebar are in tension: a sidebar is a desktop pattern, and
putting a frequently-used control surface behind a hamburger defeats the point.
The resolution is one IA rendered by two navigation components.

```
DESKTOP — sidebar, collapsible groups     MOBILE — bottom bar, 3 slots
┌─────────────────┬─────────────────┐     ┌──────────────────┐
│ ▼ HOME          │                 │     │                  │
│   Dashboard     │                 │     │     content      │
│   Kitchen    3  │    content      │     │                  │
│   Living Rm  7  │                 │     ├──────────────────┤
│   Unassigned 2  │                 │     │ Home Devices Auto│
│   All devices   │                 │     └──────────────────┘
│                 │                 │
│ ▶ ENGINE        │                 │     ENGINE section is
│   Automations   │                 │     desktop-only
│   State         │                 │
│   Logs          │                 │
│   HomeKit       │                 │
└─────────────────┴─────────────────┘
```

Rooms appear as first-class navigation entries under HOME, which is what makes
the interface read as a home-automation product rather than a framework
dashboard. The landing view is HOME → Dashboard, a device control surface;
engine health is demoted to a status indicator.

The mobile bar carries three slots and deliberately omits the ENGINE section.
This is an explicit statement that the phone is a control surface, not a
debugger — rather than cramming operator tools into a "More" menu that would be
poor on a phone anyway. Every ENGINE view remains reachable on mobile by URL, so
nothing is unreachable; it is simply not promoted.

### D14. Room model

- **One room per device.** A device has zero or one room. Assigning it to a new
  room removes it from the old one. Chosen over tag-style multi-membership
  because navigation counts, "move device", and the unassigned bucket all stay
  unambiguous.
- **Assignments key on a stable per-source hardware identifier** — the IEEE
  address for Zigbee, the registered name for Shelly and Nanoleaf — not on the
  display name. Zigbee friendly names are renameable in Zigbee2MQTT, and keying
  on them would silently orphan assignments on rename. This requires the device
  descriptor from D2 to carry a stable key distinct from its display name.
- **Assignments are retained when a device is absent.** A device that has been
  unpaired, or whose source is unconfigured, remains in its room and is shown as
  unavailable. Re-pairing or reconfiguring restores it with no user action. This
  is the common case — a service being temporarily down — and dropping the
  assignment would punish it.
- **Rooms span sources.** One room holds Zigbee, Shelly, and Nanoleaf devices
  alike, which is only coherent because D2 gives them a single addressing scheme.
- **Rooms persist through the state store**, benefiting from the write-behind
  durability of D6.

### D15. Syntax highlighting: Prism, trimmed, lazily loaded

Prism with grammars limited to TypeScript and JavaScript, loaded via dynamic
import when a source view is first opened. Roughly 30 KB, paid once, never on
first paint.

Shiki was rejected: it produces better output but costs over a megabyte, which
would undo the delivery work in D8 for a sidebar panel. Plain `<pre>` was
rejected as a false economy once code splitting exists — the cost is genuinely
deferred rather than merely small.

Only the two grammars the project can actually produce are bundled. Automations
are TypeScript in development and compiled JavaScript in a built package; no
other language can appear.

### D16. Tile capability ranking

D12 established that a tile needs one primary action and one primary readout
chosen from an unranked capability set. The ranking is:

**Primary action**, first match wins:

```
  1. on/off state
  2. position          (covers, blinds)
  3. brightness        (lights with no on/off — unusual but valid)
  4. temperature setpoint
  5. any other writable enumerated property
  6. any other writable numeric property
  → no match: read-only tile
```

**Primary readout**, first match wins:

```
  when the device HAS a primary action:
    brightness % · position % · power W · setpoint
    (the property that best qualifies the action)

  when the device has NO primary action:
    1. temperature      5. illuminance
    2. humidity         6. water leak
    3. occupancy        7. battery
    4. contact          8. any other readable numeric
    → no match: display name only
```

On/off leads because it is the action a person reaches for most, and because
almost every actuatable device has it. Covers rank above brightness because a
cover's on/off, where present, is usually a stop rather than a meaningful
toggle. Battery ranks last: it is nearly universal and almost never the thing
you opened the room to see.

This lives in one presentational function with no server-side representation, so
it can be re-tuned against real hardware without touching specs.

### D17. Nanoleaf effects are a capability, not a bespoke panel

An effect list is an enumerated writable property: the permitted values are the
effect names the device reports. Described that way, the generic renderer from
D2 produces a select control with no Nanoleaf-specific code, and the tile
ranking treats it as "any other writable enumerated property".

A bespoke Nanoleaf panel was rejected because it would reintroduce per-family UI
knowledge — the thing D2 and D12 both exist to avoid — for a control that the
generic path already handles correctly.

Consequence: the Nanoleaf source must populate the effect list as the permitted
values of an enumerated capability, refreshing it when the device's effect list
changes.

### D18. Execution counters feed the existing metrics service

The in-memory execution history (D11) is bounded and lost on restart, which is
right for a UI panel and wrong for alerting. Monotonic per-automation counters
for executions and failures are therefore also exported through the existing
Prometheus metrics service, alongside the device gauges already there.

The two are complementary: history answers "what just happened to this
automation", counters answer "has this automation been failing for a week".
Both derive from the same execution context, so the marginal cost is a counter
increment.

Counters are labelled per automation. Cardinality is bounded by the number of
automation files, which is small and operator-controlled.

Note that the metrics service mounts `/metrics` outside `/api/*` and is
therefore unauthenticated, so these labels expose automation names to any
scraper that can reach the port. This matches the existing device gauges, which
already label by device name, so it introduces no new class of disclosure — but
it is recorded here rather than left implicit, since it widens what an
unauthenticated endpoint reveals about the installation.

### D19. State toggles are a device source, not a HomeKit peculiarity

`StateSource` (`homekit-sources/state-source.ts`) already turns configured state
keys into HomeKit switches: it seeds from `state.get()`, pushes updates from
`state.onChange`, and writes back with `state.set()`. It is an `AccessorySource`
like the other three, and the consolidation in D2 has no principled reason to
exclude it.

Promoting it makes a state toggle an ordinary device — controllable from the web
UI, placeable in a room, rendered by the generic control path with no special
case. It is in fact the best-behaved source in the set:

| | identity | capability | liveness |
|---|---|---|---|
| state toggle | the state key | one writable boolean | push, in-process, always reachable |

One writable boolean is exactly what D16 ranks first for a primary action, so a
toggle produces a well-formed tile with no ranking work. And a source with no
hardware at all, rendering through the same path as a Zigbee colour light, is
what demonstrates that the D2 abstraction is real rather than asserted.

Two consequences follow.

**The configuration moves.** `stateToggles` is currently a `HomekitService`
option (`homekit-service.ts:42-47`). A source consumed by two sinks cannot be
configured inside one of them, or state toggles would disappear from the web UI
whenever HomeKit is disabled. It becomes engine-level configuration that the
source reads and both sinks observe. This is breaking for any deployment passing
it under the HomeKit service options; a forwarding shim was considered and
rejected as carrying a compatibility path indefinitely for a young setting with a
one-line migration.

**It stays allowlist-driven.** A state key becomes a device only by appearing in
configuration. Auto-discovery is prohibited, not merely unimplemented — see D6:
rooms and automation enabled flags live in the same store, and discovering
toggles from it would present them as user-facing switches.

Alternative considered: leave `StateSource` as a HomeKit-private accessory source
alongside the shared ones. Rejected — it leaves HomeKit maintaining a parallel
source implementation, which is precisely what this consolidation exists to end,
and it withholds from the web UI the one device family the engine fully owns.

### D20. Internal state lives in a reserved namespace the public API cannot reach

D6 makes the state store hold two kinds of data that it has never held before:
room definitions and assignments, and automation enabled flags. D6 then closes
exactly one route by which they could be misused — auto-discovery as state
toggles. Three routes remain open, and two of them are worse than the one that
was closed.

```
                    room + enabled-flag keys
                              │
   ┌──────────┬───────────────┼──────────────┬──────────────┐
   ▼          ▼               ▼              ▼              ▼
 state     operator        SSE raw        automation     GET /api/state
 toggle    state view      state delta    state.set()    list + count
 source    full CRUD       category
   │          │               │              │              │
 closed    a DELETE        emitted a      writes the      internal keys
 by D6     wipes every     second time,   flag without    visible to every
           room            untyped        stop()/start()  API consumer
```

The operator state view (`StateTab.tsx:134`, `api.ts:93`) can delete any key, so
one deletion discards every room assignment. Worse, writing an enabled flag
directly as a raw value sets the flag without running `stop()` or `start()`: the
UI then reports an automation as disabled while its triggers remain wired and its
`onStart()` timers keep firing. That is precisely the dishonest off switch D4
rejected as "worse than having no switch at all", reached through the state view
instead of through a guard flag.

Internal keys therefore live under a **reserved namespace**, and the reservation
is enforced rather than conventional.

**The namespace is a sigil prefix, `$internal:`.** State keys already use a colon
for scoping — automation-scoped keys are `<automation-name>:<key>`, as in
`motion-light:lights_on`. A reserved plain word such as `system:` would be
spoofable by an automation of that name, and would need automation names
validated against a reserved list to stay safe. Automation names derive from
kebab-case filenames and cannot begin with `$`, so the sigil is unspoofable
without adding a validation rule anywhere else.

**Enforcement is in `StateManager`, not at the HTTP layer.** Guarding only the
endpoints would leave automations able to write internal keys through
`state.set()`, which reopens the enabled-flag hazard through a different caller.
`set()` and `delete()` reject reserved keys from public callers; the room and
enabled-flag writers use an internal path that bypasses the check. Everything
else about those writes — debounced persistence, change notification, attribution
— is unchanged, so internal keys are ordinary state in every respect except who
may write them.

**Rejection throws.** The repository's convention is to throw `Error` for
programmer mistakes and to log-and-continue for non-critical runtime errors.
Writing a reserved key is the former: it is never a legitimate thing for an
automation to attempt, and the alternative — logging and silently discarding the
write — produces an automation that appears to work while storing nothing. From
phase ⑤ onward the throw is attributed by the execution context and appears in
the automation's execution history, so it is discoverable rather than buried in a
log. Before ⑤ it surfaces as an ordinary automation execution failure.

**Reads are filtered at every surface that enumerates keys.** Enforcement on
write is not sufficient, because internal keys still exist and are still
readable:

| Surface | Treatment |
|---|---|
| `GET /api/state` | reserved keys omitted from both the map **and** the count |
| SSE raw state delta category | reserved keys never emitted |
| Operator state view (web and CLI) | nothing to hide — it renders the filtered endpoint |
| `stateToggles` allowlist | a reserved key is a configuration error |

The count matters because `http-server.ts:378-385` builds the map from `keys()`
and separately reports `keys().length`; filtering one and not the other leaves
`count` disagreeing with the map it accompanies.

The SSE exclusion matters more than it first appears. Room membership changes are
already emitted as their own typed event category, and automation enabled changes
as theirs. Without the exclusion, every room assignment goes out **twice** — once
properly typed, once as an untyped raw state delta carrying the internal key and
its full previous and new values. The typed categories are the interface; the raw
category must not shadow them.

Alternative considered: leave the namespace as a convention and hide internal
keys in the UI without rejecting writes. Rejected — the UI is not the only
client, and the hazard being guarded is a silent, plausible-looking wrong state
rather than a crash.

### D21. The optimistic revert deadline comes from the device, not from the client

D3 established that liveness is push-first and polled only where unavoidable.
That makes confirmation latency vary by an order of magnitude across devices in
the same room:

```
  zigbee · mqtt shelly · state toggle  ──▶ confirmed in milliseconds
  http shelly                          ──▶ up to SHELLY_POLL_MS
  nanoleaf                             ──▶ up to NANOLEAF_POLL_MS
```

Optimistic actuation reverts when reported state fails to confirm the command,
which requires a deadline. A single deadline for all devices is wrong at both
ends: short enough to be useful on a Zigbee light, it reverts a working Nanoleaf
before its poll lands; long enough for the Nanoleaf, it leaves a failed Zigbee
command looking successful for seconds.

The deadline is therefore derived from the device's own observation mode. A
push-backed device gets a short fixed deadline; a polled device gets its source's
refresh interval plus a margin.

This requires the descriptor from D2 to carry the **expected refresh interval**,
not merely a push-versus-polled flag. Without it the client would have to know
that Nanoleaf is governed by `NANOLEAF_POLL_MS` and Shelly by `SHELLY_POLL_MS` —
reintroducing exactly the per-family knowledge D2, D12, and D17 all exist to
eliminate. Carrying the interval on the descriptor keeps the client generic: it
reads a number, it does not know which source produced it.

Alternative considered: no deadline, reverting only on an explicit error
response. Rejected — a command that is accepted by the transport and then dropped
by the device leaves the control showing the wrong value indefinitely, which for
a light switch is worse than a spurious revert.

### D22. The capability vocabulary is source-neutral, not Zigbee's

D2 has the shared source carry a rich payload including a typed capability
schema. That schema was going to land in `src/types/zigbee/bridge.ts`, replacing
`exposes: unknown[]` where it stands. But four sources describe themselves with
it, not one: Nanoleaf effects become an enumerated capability (D17), Shelly gets
an authored description per device type since it publishes none (D3), a state
toggle is a single writable boolean (D19), and the generic renderer (D12)
consumes all four through one path. A Zigbee-namespaced type would have
`shelly-source.ts` importing from `types/zigbee/`.

The capability type therefore lives in its own source-neutral module. The
Zigbee2MQTT `exposes` description is *mapped into* that vocabulary by the device
registry; it is no longer the vocabulary itself. The registry still retains what
the bridge publishes, expressed in the shared terms.

```
   z2m exposes ──┐
   shelly (authored) ──┼──► capability vocabulary ──┬──► HAP projection
   nanoleaf effects ───┤    (source-neutral)        └──► generic renderer
   state toggle ───────┘
```

This is settled in phase ② rather than deferred to ④, and that ordering matters
beyond tidiness. Phase ④ requires `HomekitService` to hold no direct reference to
`ZigbeeDevice` or `exposes` — the hardest part of the riskiest phase, the one
touching paired hardware (R1). Refactoring the accessory factory onto the neutral
vocabulary in ② severs that coupling two phases early, under no time pressure,
guarded by the existing HomeKit tests. By the time ④ begins, the constraint it
has to satisfy is already half met.

Alternative considered: adopt the z2m `exposes` shape as the universal format and
have every source emit it. One format, no mapping layer — but it bakes Zigbee
naming into Shelly and Nanoleaf permanently, and z2m's shape carries Zigbee
concepts (endpoints, clusters) that mean nothing to an HTTP light panel.

### D23. No browser test harness; keep the logic out of the components

This repository has never rendered a React component in a test. There is no
`happy-dom`, no `jsdom`, no `@testing-library`; all thirty test files exercise
the server, and the closest thing to a frontend test drives `registerWebUiRoutes`
through `app.fetch`. Introducing a DOM harness for this change was considered and
rejected: it is a new dependency, a new preload, and a new category of test to
maintain, in a codebase whose testing discipline is otherwise uniform.

The consequence is accepted directly: **component rendering is verified by hand.**
The error boundary, the state view's key filtering, the tile's rendered output,
and the revert behaviour as seen on screen are all manual verification.

What makes that tolerable is a design rule rather than a hope. Every decision the
UI makes lives in a pure module that `bun test` can reach without a DOM:

| Logic | Module, not component |
|---|---|
| Primary-capability ranking (D16) | pure function over a descriptor |
| Revert deadline (D21) | pure function over observation mode |
| Reserved-key filtering (D20) | already server-side; client re-filters via a pure predicate |
| Unrecognised-payload normalisation | pure normaliser, tested with malformed input |
| First-paint budget (D24) | asserted against the build manifest |

Components become thin: they receive a decided value and render it. This is worth
stating as a decision because the failure mode is gradual — a conditional creeps
into JSX, and it is not that it is untested, it is that it is *unreachable* by
test. Anything that cannot be expressed as a pure module and must live in a
component is, by that fact, accepted as manually verified.

The sharpest cost is R16: the error boundary is the blast-radius cap for phases
④ and ⑥, and it ships without a regression test in the change that rewrites the
frontend around it.

### D24. A first-paint budget in transferred bytes

The problem statement opens with roughly 1 MB per page load. Measured over the
wire that figure is right, but it is not made of what it looks like: it is
940 KB because **nothing is compressed** (D8), not because the dependencies are
heavy. Compressed, the same bundle is ~241 KB, and the 300 KB Mantine stylesheet
— the obvious target — is 35 KB of it.

Two things follow. Tree-shaking Mantine's CSS into per-component imports is not
worth doing: it is fiddly, it risks silently missing styles, and it saves perhaps
20 KB transferred. And a budget stated in disk bytes would drive exactly that
wrong work, so the budget is stated in **transferred bytes**.

**The budget is 250 KB transferred for first paint** — JS plus CSS, compressed,
excluding anything behind a dynamic import. Today's payload compresses to ~241 KB,
so the budget is not a reduction target. It is a ratchet: compression captures the
4x win, and the budget holds the line while phase ⑥ adds routing, rooms, device
detail, and the operator views. It is what stops Prism from drifting out of its
lazy chunk (D15) and catches an accidental heavy import at build time rather than
on a phone.

The assertion runs in `bun test` against the generated manifest, so it needs no
DOM and survives D23 intact.

### D25. Operator views are rebuilt, not carried across

Phase ⑥ replaces the tab shell with the audience-split IA of D13, where the
operator group holds automations, state, logs, and HomeKit. Automations are
rebuilt outright — list plus detail is most of the phase. The other three could
in principle be lifted from the existing tabs into the new shell.

They are not. Two reasons decide it. The data layer changes underneath them
regardless: every existing tab reads `useApiPoller`'s six-endpoint shape, and
phase ⑥ removes that poll in favour of snapshot-then-stream, so each view is
rewired whether or not it is redesigned. And a ported tab inside the rebuilt
shell is a visibly two-generation interface — the thing R8's branch discipline
exists to avoid on the mainline, reintroduced permanently instead of temporarily.

This grows phase ⑥, which was already the phase with no partial value. It also
means these views need requirements: the `web-ui` delta today constrains the
state view only by prohibition (D20 — what must *not* appear), and says nothing
about what a logs or HomeKit view does. Rebuilding to no specification is the
failure this would otherwise walk into, so the delta gains requirements for all
three.

### D26. The stored encoding is gzip, and the budget is measured against it

D8 has the build manifest carry a pre-compressed body; D24 states the budget in
transferred bytes. Neither names an encoding, and the choice is not neutral.

```
  the deployment is       http://raspberrypi:8080
                          ^^^^
  browsers advertise `br` only on secure origins

  brotli-only manifest, plain-HTTP LAN install:
    request  Accept-Encoding: gzip, deflate
    stored   br
    served   the raw 940 KB
    asserted 241 KB, against a body no browser here negotiates
```

Storing brotli alone would leave the compression work inert on the deployment
this project actually targets, while the D24 budget test passes against a
representation nobody receives — a green assertion over a 4x miss. gzip is
offered by every browser on every origin, is what the HTTP-served dashboard will
negotiate, and gives up roughly 30 KB against brotli on a 250 KB budget.

**One encoding, and it is gzip.** A second brotli body was considered and left
optional: it would help only an installation behind a TLS-terminating proxy,
which is not the common case, and it doubles the manifest's compressed payload in
a module that is imported into the server graph.

The budget therefore measures the gzip body. If a brotli body is ever added, the
budget still measures gzip, because gzip remains what the worst realistic client
receives — a budget should be asserted against the largest representation a real
deployment negotiates, not the smallest one that exists.

### D27. Disabling is honest on the manual path too

D4 rejected the guard-flag disable because an automation whose `onStart()` timer
keeps firing while the UI reports it as off is "worse than having no switch at
all". `POST /api/automations/:name/trigger` already exists and reaches
`execute()` directly, bypassing triggers entirely — so the same dishonesty is
reachable through a route D4 never considered.

D25's automation detail view puts an enable toggle and a manual run control on
the same page, which makes it not merely reachable but adjacent.

```
   disable ──▶ triggers deregistered, onStop() run, instance discarded
                              │
                  POST .../trigger   ◀── what should this do?
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
    run it anyway         404 not found         409 conflict
    "off" automation      indistinguishable     switched off,
    acts on the house     from deleted          still exists
        ✗ D4                  ✗ confusing           ✓
```

409 is chosen: a disabled automation exists and is listed, so 404 would conflate
"switched off" with "gone", and an operator debugging a missing automation needs
those to be different answers. The detail view hides the run control while the
automation is disabled, so the 409 is a guard rather than an expected response.

Rejected: treating manual execution as an operator override that bypasses the
disabled state. It reads reasonable — a human asked for it explicitly — but it
requires a live instance to run, which D4 discarded on stop, and it means the
answer to "can this automation act on my house right now" depends on which
control you use.

### D28. The stream is bounded per connection, and falling behind is a re-snapshot

D9 chose SSE and D9's requirement covers a *failing* client: a write error closes
the connection. That does not cover a *slow* client, which accepts writes and
never errors, so nothing detects it and nothing bounds what accumulates for it.

The volume profile changes qualitatively with this change, which is what makes
this worth a decision rather than an implementation detail:

```
              before                          after
  logs    GET /api/logs?limit=50         every entry, as written
          every 5s, bounded buffer       (LOG_LEVEL=debug on busy MQTT)

  devices GET /api/devices               every state change, as reported
          every 5s, whole list           (a power meter reports each second)
```

The poll was self-limiting: a slow client simply issued its next request later,
and the bounded log buffer discarded old entries server-side whether anyone was
reading or not. Push removes both limits at once.

Resolution: a fixed per-connection buffer, drop-oldest on overflow, and a signal
to that client that it fell behind. The client responds by re-reading the
snapshot — which is exactly what it already does on reconnection, per the
existing recovery requirement. Falling behind is a disconnection that did not
disconnect, so it reuses that path rather than adding a second one.

Alternatives considered: coalescing high-frequency categories on a short interval
(rejected as the primary mechanism — it adds latency to the sub-second
confirmation goal in Goals, and it does not bound anything on its own; a client
slow enough still accumulates coalesced events); client-declared category
subscription, so the log firehose only flows when the logs view is open (rejected
for now — real protocol surface, and it optimises volume rather than bounding
memory, so the bound would still be needed underneath it).

### D29. The qualified identifier is one segment, split on its first delimiter

Q1 settled that enumeration is source-scoped and single-device addressing uses a
qualified identifier that already names its source. What it did not settle is how
that identifier is written down, and D19 makes that non-obvious:

```
  zigbee  + 0x00124b0022a1b2c3     →  zigbee:0x00124b0022a1b2c3
  shelly  + office_plug            →  shelly:office_plug
  state   + motion-light:lights_on →  state:motion-light:lights_on
                     ▲                            ▲
            the identity IS a state key,   naive split(':') yields
            already colon-scoped           ["state","motion-light","lights_on"]
```

A state toggle's stable identity is a state key (D19), and state keys are
`<automation-name>:<key>` by the naming convention that D20 relies on for its
sigil argument. So the device identifier legitimately contains the delimiter, and
the identifier also has to survive a URL path segment.

Two rules settle it: split on the **first** delimiter only, everything after it
belonging to the device identifier; and carry the whole identifier in **one**
percent-encoded path segment. A source identifier may not contain the delimiter,
which is what makes the first-occurrence split total rather than heuristic.

Alternatives considered: two path segments `/devices/:source/:deviceId`
(sidesteps parsing, but the `http-server` delta forbids restating the source in a
path that already carries it in the identifier, and the state key still contains
a slash-free colon that must not be split); a delimiter no state key can contain
(unambiguous, but introduces a second scoping convention alongside the colon the
state store already uses, and the state store's convention is load-bearing for
D20).

### D30. Stale enabled flags are reaped, and the reaper is guarded against an empty scan

D20 puts enabled flags in a namespace hidden from the state listing and closed to
public writes. That is correct for the hazard it addresses and it has a
consequence D20 did not follow through: a flag whose automation file is deleted
is now unreachable by every operator surface. It cannot be seen in the state
view, cannot be deleted through the state API, and has no automation to address
it through. Rooms have `unassign` for exactly this; enabled flags had nothing.

Reaping at discovery is the natural fix, and it has a sharp edge:

```
  discovery finds no automation named "foo"
                    │
        ┌───────────┴────────────┐
        ▼                        ▼
  foo.ts was deleted       AUTOMATIONS_DIR unreadable,
  (reap is correct)        unmounted, or empty
                           (reap clears EVERYTHING)
                                  │
                                  ▼
                    next boot: every deliberately disabled
                    automation is enabled and acting on the house
```

The two are indistinguishable from a per-file view, so the guard is at the scan
level: **never reap when discovery yielded no automations at all**. An empty scan
is treated as no information rather than as total deletion. Each reap is
additionally logged at warning level naming the automation, because discarding a
deliberate operator decision should be findable weeks later.

The asymmetry decides the default in every ambiguous case: a flag wrongly
retained is invisible cruft, while a flag wrongly discarded silently re-enables
an automation. Retention is the safe error.

Rejected: retaining silently and documenting the prefix (leaves a permanent leak
that only someone reading the state file could find); surfacing orphaned flags in
the UI like absent room members (defensible, and it mirrors D14 — but a room
membership is user-authored data with lasting meaning, while an enabled flag for a
file that no longer exists is bookkeeping, and it would need list entries and a
clear action for something an operator never asked to see).

### D31. One outstanding command per device and property

D21 derives a revert deadline from the device's observation mode. It reasons
about a single command in isolation, and a slider does not produce one command.

```
  drag brightness 20 → 80

  without coalescing:
    cmd(23) cmd(31) cmd(44) cmd(58) cmd(71) cmd(80)
      │       │                                 │
      │       └── each starts its own D21 deadline
      └── confirmation for 23 arrives after the drag ends
                    │
                    ▼
          control snaps to 23 — a value the user
          passed through half a second ago
```

Out-of-order confirmation is not an edge case here; it is the normal result of
issuing commands faster than a device confirms them. And each intermediate
command arms a deadline that outlives the value it belongs to, so the deadline
mechanism from D21 misfires against superseded state.

Resolution: coalesce per device and property to at most one outstanding command,
issuing the latest requested value once the previous settles, and let only the
most recent outstanding command own the deadline and the reconciliation.
Coalescing is keyed per device and property so one device's drag never delays
another device's toggle.

This lives in the client, in a pure module per D23, because it is a property of
how a human operates a control rather than of any device family. Server-side
coalescing was considered — it would also protect the transport from a burst —
but it puts a latency policy in the source layer, and it cannot fix the display
problem, which is about which optimistic value the control shows.

Commit-on-release was rejected: it fully avoids the ordering problem and is much
simpler, but live dimming while dragging is most of the reason to have a slider
rather than a number field.

### D32. The log category feeds itself, and it takes two fixes

The stream's log category delivers every entry as it is written (D28). The
delivery path logs — 5.6 isolates a failing client, 5.6b signals one that fell
behind, and the codebase convention is to log and continue. So a log produces an
event, the event's delivery fails, the failure is logged, and that log produces
an event:

```
  logger.error() ──► pino sink ──► LogBuffer.write() ──► emit "log"
        ▲                                                    │
        │                                                    ▼
        │                                          fan-out to N clients
        │                                                    │
        └──────────── "sse write failed" ◄───── a client write throws
```

This is not hypothetical. `LogBuffer` (`log-buffer.ts`) is a pino multistream
destination with `write()` and `query()` and nothing else, so adding the
subscription the log category needs puts the emit directly inside the sink that
every `logger.*` call in the engine reaches.

Two separate problems live here, and the obvious fix for each does not fix the
other.

**Deferring the emit.** Emitting inside `write()` runs fan-out — including
network writes to every connected client — synchronously inside pino's sink, on
every log call in the engine. R9 treats exactly this concern as a blocker for the
automation execution context; there is no reason the log path deserves less. So
notification moves off the write call onto a later turn.

But deferral only breaks the *stack*. The cycle survives it, spread across turns:
log, next turn, emit, write fails, log, next turn, emit. No stack overflow, no
crash — a hot spin at full CPU that never terminates and never reports itself.
That is a worse failure than the one it replaced.

**Cutting the cycle.** The delivery path must log somewhere that is not the
buffer. A pino child inherits its parent's destination set, so
`logger.child({ service: "sse" })` still writes to `LogBuffer`; this requires a
second, independently constructed pino instance writing to stdout only.

Resolution: both. Notification is deferred past the write call, and the delivery
path logs through a stdout-only instance. Neither is redundant and neither
substitutes for the other.

The scope of the second logger is deliberately narrow. Only the delivery path
uses it — fan-out, per-connection overflow and the fell-behind signal, payload
serialisation, failing-client isolation. Stream lifecycle logging that no
delivery can reach (a connection accepted or closed, a subscription registered or
released) stays on the primary logger. The wider alternative — the whole event
stream module on the stdout-only logger — is easier to keep correct, and was
rejected because it makes the log view blind to the one subsystem whose failure
also breaks the log view. An operator asking "why has my dashboard stopped
updating" should not have to reach for stdout to find out.

Narrowing it makes the boundary load-bearing, which is why it is asserted rather
than reviewed — see R21.

Alternatives rejected: excluding the stream's own log entries from the log
category by tagging them (works, but the tag has to be applied at every call site
and a missed one silently reopens the cycle — the same distributed-correctness
problem, without the enforceable assertion); rate-limiting the log category
(bounds the spin without removing it, and discards real entries under exactly the
conditions an operator most needs them); dropping the log category from the
stream and keeping the existing poll for logs alone (defensible, but leaves the
UI with two data mechanisms and forfeits live log tailing, which is one of the
better arguments for the stream).

## Risks / Trade-offs

**R1. HomeKit re-pairing.** Accessory UUIDs derive from `ieee_address`
(`homekit-accessory-factory.ts:371`) and the bridge UUID from the username
(`homekit-service.ts:308`). A refactor that perturbs either silently forces
every user to delete and re-add the bridge in the Home app, losing scenes and
automations. → Treat UUID derivation and the namespaced accessory ID scheme as
frozen inputs to the refactor. Cover them with explicit tests before touching
the sources, and verify against a real paired bridge before release.

**R2. Automation restart is not perfectly transparent.** Cron job IDs are
index-based (`automation-manager.ts:175`), so re-registration must reproduce
trigger ordering. Webhook paths are globally keyed with no ownership check
(`http-server.ts:129`), so a disabled automation frees a path another could
claim. → Rebuild triggers from the same declaration order; on enable, fail
loudly if a webhook path has been taken rather than silently overwriting.

**R3. Debounced persistence has a bounded loss window.** An abrupt kill loses
mutations from the current debounce interval. → Make the interval configurable
and document the trade-off. Net improvement over today, where an abrupt kill
loses everything since boot.

**R4. Automation source is readable without authentication.** `HTTP_TOKEN`
(`config.httpServer.token`, the single shared secret behind both the
`Authorization: Bearer` header and the `ts-ha-session` cookie) may be empty,
which is a supported deployment, and automation source routinely
contains device names, hostnames, notification topics, and API keys. This is
accepted per D10, but it is a categorical escalation from exposing state keys to
exposing code. → Document it prominently in the web UI capability and in the
operator-facing configuration docs, so the decision is visible to anyone
deploying the package rather than only to this repository's author.

**R5. Device commands are a new write path to physical hardware.** Until now the
HTTP API could mutate state keys and trigger automations, but never actuate a
device directly. → Validate commands against the device's declared `exposes`
schema rather than forwarding arbitrary payloads to `publishToDevice()`.

**R6. Exposing `exposes` enlarges the API payload.** The devices endpoint
currently strips `exposes` and `options` (`http-server.ts:464-470`); a large
Zigbee network will make the unstripped response substantially bigger. → SSE
deltas remove the need to refetch the full device list on an interval, so the
full payload is fetched once per session rather than every five seconds.

**R7. Assets are no longer a single self-contained response.** Splitting the
bundle out of the document means the dashboard requires more than one request.
→ Acceptable: the assets are still served by the same server from the same
module, with no external network access and no static directory.

**R8. Phase ⑥ is large and has no partial value.** A half-rebuilt UI is worse
than either endpoint. → The cutover is a branch-level one, not a runtime one:
the existing tabbed UI stays on the mainline and the rebuilt UI replaces it in a
single merge once it reaches parity, so the mainline never carries a
half-rebuilt interface. Shipping both UIs behind a selector was considered and
rejected — it doubles the frontend surface for the duration of the phase to
guard against a risk that branch discipline already handles.

Branch discipline covers the *frontend* cutover, and does not cover phase ④.
Phase ④ is a server change that must merge for ⑤ and ⑥ to build on it, and it
removes the device endpoints the old UI reads. Phases ①②③⑤ are additive and leave
the old UI fully functional; ④ is not, and the mainline therefore carries an old
UI whose devices and HomeKit tabs report devices unavailable from ④ until the ⑥
cutover. That degradation is deliberate and bounded — see R13, which is what
makes it tolerable rather than merely accepted.

Rollback for ⑥ remains reverting the frontend entry point. Rollback for ④ is not
a frontend concern at all, and is bounded by ④ being additive at every level
except device addressing.

**R9. The execution context sits on a hot path.** Every automation run passes
through it, and asynchronous context propagation is not free. A leak between
concurrent runs would mis-attribute writes, which is worse than not attributing
them at all. → Benchmark execution overhead against the current path and treat a
measurable regression as a blocker. Cover concurrent overlapping runs with an
explicit test asserting writes are attributed to the correct automation.

**R10. Execution history is unbounded input into bounded memory.** A
high-frequency automation could churn the buffer, and per-automation buffers
multiply across a large installation. → Fix the per-automation retention at a
small constant and cap total records, mirroring the existing log buffer rather
than inventing a second policy.

**R11. Room assignments can be orphaned by an external rename.** Keying on a
stable hardware identifier prevents the common Zigbee2MQTT rename case, but a
device replaced with new hardware under the same name will not inherit its room,
and a genuinely removed device leaves a permanent unavailable entry. → Retain
by design (D14) and surface unavailable devices explicitly in the room so the
state is visible and can be corrected by reassigning.

**R12. Runtime attribution shows an incomplete picture.** An automation that has
not run since startup will show no observed writes, which could be misread as
"writes nothing". → Present observed relationships as observations with a
"since startup" framing, distinct from declared relationships which are
presented as facts.

**R13. Both existing clients break when device addressing changes.** `src/cli/`
reads `/api/devices` and `/api/devices/:name` (`client.ts:103-108`) and keys on
`friendly_name` (`devices-tab.tsx`). The existing web UI reads the same two
endpoints (`api.ts:52`) and its devices and HomeKit tabs key on the same fields.
Phase ④ re-addresses devices by source-qualified identifier, which breaks both.

Both clients already tolerate a *failed* device fetch and degrade to reporting
devices unavailable rather than crashing — the CLI at `dashboard.tsx:66`, the web
UI at `api.ts:52-60`, where the device fetch carries its own catch while the
other five endpoints do not. That tolerance is the entire basis on which the
break is acceptable, and it only holds for an error response.

→ **Phase ④ therefore removes `/api/devices` and `/api/devices/:name` rather than
repurposing them**, serving the unified device API from new source-scoped paths.
Repurposing the same paths would return `200` with a changed shape: the catch
would never fire, both clients would report themselves healthy, and both would
render rows with undefined names and badges. A silent success carrying garbage is
worse than an error, and it is worse specifically because it defeats handling
that both clients already have.

The CLI's other tabs — automations, state, logs, HomeKit — are unaffected, as are
the web UI's. Realigning the CLI is left to a follow-up change; the web UI is
realigned by ⑥. This is recorded as an explicit out-of-scope item in the proposal
rather than discovered during implementation.

A related weakness surfaced while confirming the above: there is no error
boundary anywhere in `src/core/web-ui/app/`. `DevicesTab`'s field accesses happen
to be null-guarded, so the degraded render does not throw — but the margin is one
unguarded dereference, and a throw in any tab takes the whole dashboard down
including state, logs, and automations. A boundary is added in phase ① rather
than ⑥, since it is independent of every other phase and caps the blast radius of
both the ④ device change and the ⑥ rebuild.

**R14. Enabling persistence by default changes existing installations.** An
operator who never set `STATE_PERSIST` gets state surviving restart after
upgrading, and a state file written where none was before. → Document as a
breaking default change. The direction of the surprise is benign — data is kept
rather than lost — and a save failure is already logged and non-fatal, so a
read-only filesystem degrades rather than breaks.

**R15. Observed state writes are unbounded input into bounded memory.** R10 fixes
retention for execution history, but the observed-writes set has no equivalent
bound. An automation writing a key derived from a device name accumulates one key
per device permanently; one writing a key derived from a timestamp or a payload
field grows without limit — on the hot path, in memory, to populate a sidebar
panel. This is the same failure mode R10 exists to prevent, arriving through the
other half of the same mechanism. → Cap the distinct observed keys retained per
automation at a small fixed number, evicting least-recently-written, and surface
in the UI when the set has been truncated so it is not misread as complete. This
compounds with R12: an observed-write list that is both incomplete-since-startup
and truncated must not be presented as authoritative.

**R16. The blast-radius cap is itself unguarded.** The error boundary exists to
contain a render failure in one view (R13), and per D23 it ships with no
automated test, in the change that rewrites every view around it. A regression
that silently removes or misplaces the boundary would be discovered only by the
failure it was added to prevent. → Verify it by hand at the end of ① and again
after the ⑥ cutover, and keep the boundary's placement structural — wrapping the
route outlet once, not each view individually — so that there is a single place
for it to be wrong rather than one per view.

**R17. Phase ⑥ grew.** D25 adds the state, logs, and HomeKit views to a phase
that already had no partial value (R8) and around twenty tasks. Combined with
D23, the largest phase of the change is also the one with the least automated
verification. → The mitigations already exist and are load-bearing here rather
than incidental: branch-level cutover means the mainline never carries it
half-done, the D23 rule keeps the decision logic testable even though the views
are not, and phases ①–⑤ leave the old UI functional so ⑥ can take the time it
needs. What this rules out is slipping operator views in late — they are specced
and costed up front or they are cut to a follow-up, not discovered mid-phase.

**R18. Group 3 cannot precede group 2.** Persisting an automation's enabled flag
writes through the reserved namespace, and the assertion that the flag cannot be
changed by a raw state write requires stop and start to exist. The two groups
were listed as parallel. → Group 3 depends on group 2, and the raw-write
assertion moves to the end of group 3 where both halves are present. Merging
either half alone would ship a real defect: an enabled flag stored as an ordinary
public key is editable and deletable from the operator state view, which is
precisely the disagreement between a flag and its wiring that D4 and D20 exist to
make impossible.

**R19. The enabled-flag reaper can silently re-enable automations.** D30 deletes
stored preferences naming no discovered automation, and "no automation of that
name was discovered" is also what an unreadable, unmounted, or misconfigured
automations directory produces. An unguarded reaper turns a transient
infrastructure fault into every disabled automation switching itself back on and
acting on the house — the D4 hazard inverted, arriving from the mechanism added
to tidy up after D20. → Never reap on a scan that yielded no automations at all;
log every reap at warning level naming the automation; prefer retention in any
ambiguous case, since a retained flag is invisible cruft and a discarded one
changes behaviour. A ceiling on reaps per pass is available as a second guard if
the first proves insufficient.

**R20. The first-paint budget can pass against bytes nobody receives.** D24
asserts the budget over the build manifest, and D26 notes that browsers restrict
some encodings to secure origins. If the stored representation and the measured
representation ever diverge from what a plain-HTTP LAN client negotiates, the
assertion goes green while the real first paint is up to 4x over. → Store gzip,
which is negotiated everywhere, and measure the budget against the same body that
is served. If a second encoding is added later, the budget stays on gzip.

**R21. The log-cycle guard is a boundary, and boundaries drift.** D32 confines the
stdout-only logger to the event stream's delivery path. That boundary is not a
function — it is everything reachable from a notification, which includes the
per-connection overflow eviction and fell-behind signal (D28), payload
serialisation, and failing-client isolation. Every one of those is a place where
a contributor reaches for `this.logger` out of habit, and a single such call
reopens the cycle with no visible symptom until a client happens to fail. Review
discipline at each call site is the weakest available guarantee. → Assert the
invariant once, at the boundary, rather than policing its members: install a
counting `LogBuffer`, register a client whose write always throws, emit an event,
run the notification, and assert the buffer received nothing. This catches the
whole reachable set including code not yet written, and follows the same argument
R16 makes for putting the error boundary in exactly one structural place. If the
narrow scope proves too costly to hold, the fallback is D32's rejected wider
alternative — the entire stream module on the stdout-only logger — paired with a
stream-health indicator in the UI, not a return to unguarded logging.

**R22. Three capabilities were touched without a delta spec.** `cli`, `engine`,
and `logging` are all altered by this change and none was listed in the original
capability inventory. `logging` was implementation-blocking: `LogBuffer` has no
subscription mechanism and group 5 depends on one existing. `engine` was
structurally missing: D19 relocates `stateToggles` to engine level and group 6
builds four sources and an aggregate accessor, but nothing said who constructs
them or in what order relative to automation discovery. `cli` was a truth
problem rather than a build problem — `specs/cli/spec.md` documents
`getDevices()`/`getDevice(name)` against endpoints 6.14 removes, so archiving
this change would leave a main spec asserting behaviour that no longer works. →
All three have delta specs. The `cli` delta records the degradation in place
rather than deleting the requirements, so the follow-up change has something to
restore against. Out of scope for implementation is not out of scope for
specification.

## Migration Plan

Phases ①②③⑤ are additive and independently deployable. Phase ④ is additive at
every level except device addressing, where it removes two endpoints and breaks
both existing clients' device views. Phase ⑥ is the only wholesale user-visible
cutover.

- ① changes the `prebuild` contract — `build:web-ui` emits hashed assets rather
  than the two string constants. `.gitignore` and any packaging manifest need
  updating together.
- ② is additive at the API level — un-stripping `exposes` grows a response but
  removes no field — but changes two configuration defaults. See R14.
- ③ adds an endpoint carrying state, log, automation, and readiness categories;
  the existing poll remains as fallback and is only removed in ⑥. The device
  categories arrive in ④.
- ④ is the only phase touching working paired hardware integration (see R1), and
  the only one that breaks an existing consumer. `/api/devices` and
  `/api/devices/:name` are **removed**, not repurposed, and the unified device
  API is served from new source-scoped paths (see R13). Both the CLI dashboard's
  and the old web UI's device views degrade to reporting devices unavailable.
  `stateToggles` also moves out of the HomeKit service options here (see D19).
- ⑤ is additive. It introduces the first reserved-namespace keys (see D20); an
  upgrade from an installation predating this change has none, so no data
  migration is required.
- ⑥ replaces the tab shell. Rollback is reverting the frontend entry point, which
  restores the old UI in the state phase ④ left it: functional except for its
  device and HomeKit tabs, which report devices unavailable because the endpoints
  they read are gone. Reverting ⑥ alone does not restore those tabs, and is not
  meant to — recovering them means reverting ④ as well, or completing ⑥. Earlier
  drafts of this plan claimed phases ①–⑤ leave the old UI wholly functional; that
  contradicted the ④ entry above and is corrected here.

## Open Questions

None outstanding.

**Q1 — where the source-scoped path scheme ends and qualified identifiers begin —
is closed.** Source-scoped nouns cover enumeration and source availability;
qualified identifiers address a single device, and a path carrying one does not
restate the source. The identifier's own written form, which Q1 did not reach, is
settled by D29: one percent-encoded path segment, split on its first delimiter
only, because a state toggle's identifier is itself a colon-scoped state key.

Resolved during design:

| Question | Resolution |
|---|---|
| Device grouping | User-defined rooms — D14 |
| Syntax highlighter | Prism, TS/JS grammars only, lazily loaded — D15 |
| Tile capability ranking | Fixed ranking, presentational only — D16 |
| Nanoleaf effects | Enumerated capability, generic renderer — D17 |
| Prometheus execution counters | Yes, alongside the in-memory history — D18 |
| Fate of `StateSource` | Promoted to a fourth device source — D19 |
| `stateToggles` configuration | Moves to engine level, breaking — D19 |
| Persistence defaults | `STATE_PERSIST` and `DEVICE_REGISTRY_PERSIST` default on — D6 |
| Development workflow | Watcher in the dev script, no server-side flag — D8 |
| Command endpoint phasing | Deferred from ② to ④, built once — D1 |
| CLI dashboard realignment | Out of scope, follow-up change — R13 |
| Phase ⑥ cutover | Branch-level, no runtime coexistence — R8 |
| Old device endpoints in ④ | Removed, not repurposed; unified API on new source-scoped paths — R13 |
| Old UI during ④ | Devices and HomeKit tabs degrade to unavailable; R8 corrected |
| Error boundary | Added in ① rather than ⑥, independent of other phases — R13 |
| SSE device categories | Deferred from ③ to ④, built once — D1 |
| Internal state keys | Reserved `$internal:` namespace, enforced in `StateManager` — D20 |
| Reserved-key write by an automation | Throws, attributed by the execution context — D20 |
| Optimistic revert deadline | Derived from observation mode; descriptor carries the refresh interval — D21 |
| Observed-writes growth | Fixed per-automation cap, least-recently-written evicted — R15 |
| Capability schema location | Source-neutral module; z2m `exposes` mapped into it — D22 |
| Frontend test harness | None added; logic moved into pure modules, views verified by hand — D23 |
| Asset compression | Pre-compressed bodies in the build manifest, not request-time middleware — D8 |
| First-paint budget | 250 KB transferred, asserted against the manifest — D24 |
| Mantine CSS tree-shaking | Not done; 35 KB compressed, not the weight — D24 |
| State, logs, HomeKit views | Rebuilt in ⑥ with their own requirements, not ported — D25 |
| Group 2 / group 3 ordering | 3 depends on 2; the raw-write assertion moves to the end of 3 — R18 |
| Asset encoding | gzip only; brotli optional and never the sole body — D26 |
| What the budget measures | The gzip body, the one a plain-HTTP client negotiates — D26, R20 |
| Manual trigger of a disabled automation | Refused with 409; run control hidden while disabled — D27 |
| Slow SSE client | Bounded per-connection buffer, drop-oldest, client re-snapshots — D28 |
| Qualified identifier form | One percent-encoded segment, split on first delimiter — D29 |
| Orphaned enabled flags | Reaped at discovery, never on an empty scan, each reap logged — D30, R19 |
| Slider command bursts | One outstanding command per device and property, latest owns the deadline — D31 |
| `exposes` passthrough on the removed endpoints | Not done; passthrough attaches to the unified endpoints only |
| Session cookie name in the spec | Corrected to `ts-ha-session`, matching `src/core/http/utils.ts` |
| Log category feeding itself | Deferred emit **and** a stdout-only logger; both required — D32 |
| Scope of the stdout-only logger | Delivery path only; lifecycle logging stays visible in the log view — D32 |
| Holding the log-cycle boundary | Asserted once at the boundary, not reviewed per call site — R21 |
| `LogBuffer` subscription | Added; the log category cannot be built on `query()` alone — R22 |
| Missing `cli` / `engine` / `logging` deltas | All three added; `cli` records degradation in place — R22 |
| Device source lifecycle | Engine-constructed, started after the registry and before discovery, stopped after automations — engine delta |
| Custom device sources | Not supported; the source set is fixed at four — engine delta |
| Device sources for automations | Out of scope; `AutomationContext` keeps `deviceRegistry` and the per-family service APIs |
| Rollback after phase ⑥ | Restores the old UI as ④ left it, device and HomeKit tabs still degraded |

The tile ranking (D16) is the most likely of these to want adjustment once real
devices are in front of it. It is deliberately confined to one function with no
server-side representation so that tuning it costs nothing.

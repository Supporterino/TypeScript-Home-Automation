/**
 * The harness control panel (design.md D2, D3, D7; tasks 5.1-5.3, 6.1, 6.2).
 *
 * The harness owns exactly two things beyond the wall itself (D2): this panel and
 * the stage's viewport geometry. Every composition decision the panel shows or
 * makes is the wall's own — the draft mutations are `wall/editor/model.ts`'s
 * (its clamping, its free-position search, its refusal rules), and the values it
 * displays are the wall's pure resolvers' (see `computed.ts`) — so the panel can
 * never disagree with the wall it drives.
 *
 * The panel edits whichever widget list the panel in front of it renders: the
 * base layout, or the current panel's orientation override when the draft
 * carries one. Both are edited by the same operations (see `draft.ts`'s
 * `editActiveList`), and the header says which list is live.
 *
 * Both stylesheets are exercised here on purpose (task 3.2): this chrome is Lumen
 * utilities from `styles/app.css`, and the stage's mat is painted from the Hearth
 * tokens `wall/hearth.css` declares for a wall root.
 */
import {
  WALL_WIDGET_TYPES,
  type WallProfileConfig,
  type WallWidget,
  type WallWidgetType,
} from "@ts-ha/shared";
import { type ReactNode, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import {
  addWidget,
  removeWidget,
  updateWidgetConfig,
  updateWidgetPlacement,
  updateWidgetZone,
  validateProfileDraft,
} from "../editor/model.js";
import type { WallCardForm, WallWidgetTier } from "../span.js";
import {
  type HarnessBenchOverrides,
  NO_BENCH_OVERRIDES,
  panelFitSummary,
  panelHeightPx,
  panelRowUnit,
  reachableRendererHeights,
  resolveBenchControls,
  widgetValues,
} from "./computed.js";
import {
  activeTarget,
  clearOrientationOverride,
  DEFAULT_DRAFT,
  editActiveList,
  shownWidgets,
} from "./draft.js";
import { WALL_HARNESS_MARKER } from "./marker.js";
import {
  DEFAULT_FIXTURE_CONTROLS,
  HARNESS_CARD_FORMS,
  HARNESS_DEVICE_KEYS,
  HARNESS_MODES,
  HARNESS_PANEL_SIZES,
  HARNESS_THEMES,
  HARNESS_TIERS,
  HARNESS_UPDATE,
  type HarnessFixtureControls,
  type HarnessMode,
  type HarnessPanel,
  type HarnessTheme,
  isHarnessReady,
  sendHarnessUpdate,
} from "./messages.js";

/** The name the panel validates its draft under; the harness never persists it. */
const PROFILE_NAME = "harness";

/** Capitalises a control's value for its label (`{"stage"}` → `Stage`). */
const labelled = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

// ── Small field primitives, panel-local ─────────────────────────────────────

const FIELD_CLASS = "text-xs text-muted";
const CONTROL_CLASS =
  "rounded-input border border-hairline bg-surface-3 px-2 py-1 text-xs text-ink outline-none";

function Section({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 border-b border-hairline pb-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-sm font-bold">{title}</h2>
        {detail}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className={FIELD_CLASS}>{label}</span>
      {children}
    </label>
  );
}

/**
 * A field row whose control is not a single labelable element — a segmented
 * control, say — so the label text does not activate the first of its buttons.
 */
function FieldRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className={FIELD_CLASS}>{label}</span>
      {children}
    </div>
  );
}

function Note({ children, tone }: { children: ReactNode; tone?: "danger" | "stale" }) {
  const color = tone === "danger" ? "text-danger" : tone === "stale" ? "text-stale" : "text-muted";
  return <p className={`text-xs ${color}`}>{children}</p>;
}

/** A segmented control: the panel's one shape for every either/or choice. */
function ChoiceGroup<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (next: T) => void;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label={label}>
      {options.map(([option, text]) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={
            value === option
              ? "rounded-input bg-surface-3 px-2 py-1 text-xs font-medium text-ink"
              : "rounded-input px-2 py-1 text-xs text-muted hover:text-ink"
          }
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  step = 1,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <input
      type="number"
      className={`${CONTROL_CLASS} w-20`}
      value={value}
      min={min}
      step={step}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(next);
      }}
    />
  );
}

function CheckInput({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      className="h-4 w-4 accent-[var(--accent)]"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
  );
}

function TextInput({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <input
      type="text"
      className={`${CONTROL_CLASS} w-40`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function Slider({
  value,
  onChange,
  max = 100,
  step = 1,
}: {
  value: number;
  onChange: (next: number) => void;
  max?: number;
  step?: number;
}) {
  return (
    <input
      type="range"
      className="w-40 accent-[var(--accent)]"
      value={value}
      min={0}
      max={max}
      step={step}
      onChange={(event) => onChange(Number(event.target.value))}
    />
  );
}

// ── The stage frame (task 4.2, unchanged) ───────────────────────────────────

/**
 * The stage frame: the panel-sized iframe, scaled to fit the space available.
 *
 * The iframe's layout size is always the panel's, so the wall inside measures
 * the panel — the scale is a paint-time transform on top, never a resize. That
 * distinction is the whole point of D3: a `transform`ed `<div>` in this document
 * would report this window's viewport and the type ramp's floor instead.
 */
function StageFrame({
  panel,
  iframeRef,
}: {
  panel: HarnessPanel;
  iframeRef: RefObject<HTMLIFrameElement | null>;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;
    const measure = () => {
      const rect = element.getBoundingClientRect();
      setHost({ width: rect.width, height: rect.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const size = HARNESS_PANEL_SIZES[panel];
  // Never above 1: the panel is shown at or below its own size, so type sizes
  // read as they will on the panel rather than magnified.
  const scale =
    host.width === 0 || host.height === 0
      ? 0
      : Math.min(1, host.width / size.width, host.height / size.height);

  return (
    <div
      ref={hostRef}
      data-wall-chunk
      className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden"
      style={{ background: "var(--hearth-canvas)" }}
    >
      <iframe
        // Reloaded for a panel change — the panel's size *is* the stage's
        // viewport, so a different panel is a different document (D3). A config,
        // fixture, mode, or scheme change reaches the stage as a message.
        key={panel}
        ref={iframeRef}
        title={`Wall stage, ${panel} panel`}
        src="/stage.html"
        width={size.width}
        height={size.height}
        style={{
          border: 0,
          flex: "none",
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      />
      <span
        className="pointer-events-none absolute right-2 bottom-2 text-xs"
        style={{ color: "var(--hearth-text-muted)" }}
      >
        {size.width} × {size.height} · {Math.round(scale * 100)}%
      </span>
    </div>
  );
}

// ── The panel ───────────────────────────────────────────────────────────────

export function HarnessPanel() {
  const [panel, setPanel] = useState<HarnessPanel>("landscape");
  const [mode, setMode] = useState<HarnessMode>("stage");
  const [theme, setTheme] = useState<HarnessTheme>("dark");
  const [draft, setDraft] = useState<WallProfileConfig>(DEFAULT_DRAFT);
  const [controls, setControls] = useState<HarnessFixtureControls>(DEFAULT_FIXTURE_CONTROLS);
  const [overrides, setOverrides] = useState<HarnessBenchOverrides>(NO_BENCH_OVERRIDES);
  const [selectedId, setSelectedId] = useState(DEFAULT_DRAFT.widgets[0]?.id ?? "");
  // Bumped by every readiness announcement, so the draft is (re)sent to a stage
  // document that has just mounted — including after a panel change reloads it.
  const [readyAt, setReadyAt] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (!isHarnessReady(event.data)) return;
      setReadyAt((count) => count + 1);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // The list this panel renders — and therefore the list the panel edits.
  const shown = shownWidgets(draft, panel);
  const target = activeTarget(draft, panel);
  const selected = shown.find((widget) => widget.id === selectedId) ?? shown[0] ?? null;
  const rowUnit = panelRowUnit(shown, panelHeightPx(panel));
  const values = useMemo(
    () => (selected === null ? null : widgetValues(selected, rowUnit)),
    [selected, rowUnit],
  );
  const bench = useMemo(
    () => resolveBenchControls(selected, values, rowUnit, overrides),
    [selected, values, rowUnit, overrides],
  );
  const reachable = useMemo(
    () => (selected === null ? [] : reachableRendererHeights(selected, rowUnit)),
    [selected, rowUnit],
  );
  const validation = validateProfileDraft(PROFILE_NAME, draft);
  const errors = validation.ok ? [] : validation.errors;
  const fit = panelFitSummary(shown, panel);

  useEffect(() => {
    sendHarnessUpdate(iframeRef.current?.contentWindow, {
      type: HARNESS_UPDATE,
      mode,
      theme,
      config: draft,
      fixtures: controls,
      bench,
    });
  }, [mode, theme, draft, controls, bench, panel, readyAt]);

  /** Applies one of the editor's mutations to the list this panel edits. */
  function edit(mutate: (config: WallProfileConfig) => WallProfileConfig): void {
    setDraft((previous) => editActiveList(previous, panel, mutate));
  }

  function handleAddWidget(type: WallWidgetType): void {
    const known = new Set(shown.map((widget) => widget.id));
    const next = editActiveList(draft, panel, (config) => addWidget(config, type));
    setDraft(next);
    const added = shownWidgets(next, panel).find((widget) => !known.has(widget.id));
    if (added) setSelectedId(added.id);
  }

  function handlePlacement(widget: WallWidget, patch: Partial<WallWidget>): void {
    // The editor's own resize: it clamps the span to the type's min/max (with the
    // raised floor a configured title costs) and the position to the grid.
    edit((config) =>
      updateWidgetPlacement(config, widget.id, {
        x: patch.x ?? widget.x,
        y: patch.y ?? widget.y,
        w: patch.w ?? widget.w,
        h: patch.h ?? widget.h,
      }),
    );
  }

  return (
    // `data-harness` carries WALL_HARNESS_MARKER, the string the asset test
    // asserts appears in no shipped asset (design.md D9) — so this document is
    // only guarded while this root keeps rendering it.
    <div data-harness={WALL_HARNESS_MARKER} className="flex h-dvh flex-col bg-canvas text-ink">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline bg-surface px-4 py-3">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-base font-bold">Wall harness</span>
          <Note>
            {shown.length} widget{shown.length === 1 ? "" : "s"} ·{" "}
            {target === "override" ? `${panel} override` : "base layout"}
          </Note>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <ChoiceGroup
            label="Surface"
            value={mode}
            options={HARNESS_MODES.map((value): readonly [HarnessMode, string] => [
              value,
              labelled(value),
            ])}
            onChange={setMode}
          />
          <ChoiceGroup
            label="Panel"
            value={panel}
            options={[
              ["landscape", "Landscape"],
              ["portrait", "Portrait"],
            ]}
            onChange={setPanel}
          />
          <ChoiceGroup
            label="Scheme"
            value={theme}
            options={HARNESS_THEMES.map((value): readonly [HarnessTheme, string] => [
              value,
              labelled(value),
            ])}
            onChange={setTheme}
          />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-[24rem] shrink-0 flex-col gap-3 overflow-y-auto border-r border-hairline bg-surface px-4 py-3">
          <Section
            title="Draft"
            detail={
              target === "override" ? (
                <button
                  type="button"
                  className="rounded-input border border-hairline px-2 py-1 text-xs text-muted hover:text-ink"
                  onClick={() => setDraft(clearOrientationOverride(draft, panel))}
                >
                  Clear {panel} override
                </button>
              ) : undefined
            }
          >
            <Note>
              Editing the {target === "override" ? `${panel} override` : "base layout"} — the list
              this panel renders.
            </Note>
            <ul className="flex flex-col gap-1">
              {shown.map((widget) => (
                <li key={widget.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={selected?.id === widget.id}
                    onClick={() => setSelectedId(widget.id)}
                    className={
                      selected?.id === widget.id
                        ? "flex flex-1 items-baseline gap-2 rounded-input bg-surface-3 px-2 py-1 text-left text-xs text-ink"
                        : "flex flex-1 items-baseline gap-2 rounded-input px-2 py-1 text-left text-xs text-muted hover:text-ink"
                    }
                  >
                    <span className="font-medium">{widget.type}</span>
                    <span className="text-muted">
                      {widget.id} · {widget.w}×{widget.h}
                      {widget.zone ? ` · ${widget.zone}` : ""}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${widget.id}`}
                    className="rounded-input px-2 py-1 text-xs text-muted hover:text-danger"
                    onClick={() => edit((config) => removeWidget(config, widget.id))}
                  >
                    Remove
                  </button>
                </li>
              ))}
              {shown.length === 0 && <Note>No widgets in this list.</Note>}
            </ul>
            <Field label="Add widget">
              <select
                className={CONTROL_CLASS}
                value=""
                onChange={(event) => {
                  const type = event.target.value as WallWidgetType;
                  if (WALL_WIDGET_TYPES.includes(type)) handleAddWidget(type);
                }}
              >
                <option value="">Choose a type…</option>
                {WALL_WIDGET_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </Field>
            {fit !== null && <Note tone="stale">{fit}</Note>}
            {errors.map((error) => (
              <Note key={error} tone="danger">
                {error}
              </Note>
            ))}
          </Section>

          <Section title="Placement">
            {selected === null || values === null ? (
              <Note>Select a widget.</Note>
            ) : (
              <>
                <Note>
                  {labelled(selected.type)} · editor allows {values.min.w}×{values.min.h} to{" "}
                  {values.max.w}×{values.max.h}; out-of-range edits are clamped by the editor's own
                  rule.
                </Note>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="x">
                    <NumberInput
                      value={selected.x}
                      min={0}
                      onChange={(next) => handlePlacement(selected, { x: next })}
                    />
                  </Field>
                  <Field label="y">
                    <NumberInput
                      value={selected.y}
                      min={0}
                      onChange={(next) => handlePlacement(selected, { y: next })}
                    />
                  </Field>
                  <Field label="w">
                    <NumberInput
                      value={selected.w}
                      min={1}
                      onChange={(next) => handlePlacement(selected, { w: next })}
                    />
                  </Field>
                  <Field label="h">
                    <NumberInput
                      value={selected.h}
                      min={1}
                      onChange={(next) => handlePlacement(selected, { h: next })}
                    />
                  </Field>
                </div>
                <Field label="Zone">
                  <TextInput
                    value={selected.zone ?? ""}
                    onChange={(next) =>
                      edit((config) => updateWidgetZone(config, selected.id, next))
                    }
                  />
                </Field>
                <Field label="Title">
                  <TextInput
                    value={typeof selected.config.title === "string" ? selected.config.title : ""}
                    onChange={(next) =>
                      edit((config) => updateWidgetConfig(config, selected.id, { title: next }))
                    }
                  />
                </Field>
              </>
            )}
          </Section>

          <Section title="Stage-computed values">
            {values === null ? (
              <Note>Select a widget.</Note>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                  <dt className="text-muted">tier</dt>
                  <dd>{values.tier}</dd>
                  <dt className="text-muted">cardForm</dt>
                  <dd>{values.cardForm}</dd>
                  <dt className="text-muted">rendererHeightPx</dt>
                  <dd>{values.rendererHeightPx}px</dd>
                  <dt className="text-muted">cellHeightPx</dt>
                  <dd>{values.cellHeightPx}px</dd>
                  <dt className="text-muted">contained</dt>
                  <dd>{String(values.framed)}</dd>
                  <dt className="text-muted">titled</dt>
                  <dd>{String(values.titled)}</dd>
                  <dt className="text-muted">minimum box</dt>
                  <dd>{values.minimumRendererHeightPx}px</dd>
                  <dt className="text-muted">row unit</dt>
                  <dd>{rowUnit}px</dd>
                </dl>
                {values.tooSmall && (
                  <Note tone="danger">
                    This placement is below what its type's minimum span guarantees — the wall
                    explains it rather than rendering a card.
                  </Note>
                )}
                <Note>
                  From the wall's own resolveSpanTier, cardHeightPx, rendererBoxHeightPx,
                  resolveCardFormForHeight, and wallGridMetrics at this panel.
                </Note>
              </>
            )}
          </Section>

          {mode === "bench" && (
            <Section title="Bench overrides">
              {selected === null || values === null ? (
                <Note>Select a widget to bench.</Note>
              ) : (
                <>
                  <Note>
                    The bench renders <code>{selected.type}</code>’s renderer directly, with no
                    widget frame in the path — the one place the harness bypasses production code
                    (design D7).
                  </Note>
                  <Field label="contained">
                    <CheckInput
                      checked={bench.contained}
                      onChange={(next) => setOverrides({ ...overrides, contained: next })}
                    />
                  </Field>
                  <FieldRow label="tier">
                    <ChoiceGroup
                      label="tier"
                      value={bench.tier}
                      options={HARNESS_TIERS.map((value): readonly [WallWidgetTier, string] => [
                        value,
                        value,
                      ])}
                      onChange={(next) => setOverrides({ ...overrides, tier: next })}
                    />
                  </FieldRow>
                  <FieldRow label="cardForm">
                    <ChoiceGroup
                      label="cardForm"
                      value={bench.cardForm}
                      options={HARNESS_CARD_FORMS.map((value): readonly [WallCardForm, string] => [
                        value,
                        value,
                      ])}
                      onChange={(next) => setOverrides({ ...overrides, cardForm: next })}
                    />
                  </FieldRow>
                  <Field label="rendererHeightPx">
                    <NumberInput
                      value={bench.rendererHeightPx}
                      min={0}
                      onChange={(next) => setOverrides({ ...overrides, rendererHeightPx: next })}
                    />
                  </Field>
                  <Field label="rowUnit">
                    <NumberInput
                      value={bench.rowUnit}
                      min={1}
                      onChange={(next) => setOverrides({ ...overrides, rowUnit: next })}
                    />
                  </Field>
                  <Note>
                    Stage computes {values.rendererHeightPx}px for {selected.w}×{selected.h} at{" "}
                    {rowUnit}px rows.
                  </Note>
                  {reachable.includes(bench.rendererHeightPx) ? (
                    <Note>This height is one a legal {selected.type} span produces here.</Note>
                  ) : (
                    <Note tone="danger">
                      Unreachable: no legal {selected.type} span produces {bench.rendererHeightPx}px
                      at this panel — a hand-set override, not a wall behaviour.
                    </Note>
                  )}
                  <button
                    type="button"
                    className="rounded-input border border-hairline px-2 py-1 text-xs text-muted hover:text-ink"
                    onClick={() => setOverrides(NO_BENCH_OVERRIDES)}
                  >
                    Use the Stage-computed values
                  </button>
                </>
              )}
            </Section>
          )}

          <Section title="Fixtures" detail={<Note>No engine: these are handed to the store.</Note>}>
            <Field label="Device">
              <select
                className={CONTROL_CLASS}
                value={controls.device}
                onChange={(event) =>
                  setControls({
                    ...controls,
                    device: event.target.value as HarnessFixtureControls["device"],
                  })
                }
              >
                {HARNESS_DEVICE_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Present">
              <CheckInput
                checked={controls.devicePresent}
                onChange={(next) => setControls({ ...controls, devicePresent: next })}
              />
            </Field>
            <Field label="Switch on">
              <CheckInput
                checked={controls.on}
                onChange={(next) => setControls({ ...controls, on: next })}
              />
            </Field>
            <Field label="Brightness %">
              <Slider
                value={controls.brightnessPercent}
                onChange={(next) => setControls({ ...controls, brightnessPercent: next })}
              />
            </Field>
            <Field label="Colour temp %">
              <Slider
                value={controls.colorTempPercent}
                onChange={(next) => setControls({ ...controls, colorTempPercent: next })}
              />
            </Field>
            <Field label="Temperature °C">
              <NumberInput
                value={controls.temperature}
                step={0.5}
                onChange={(next) => setControls({ ...controls, temperature: next })}
              />
            </Field>
            <Field label="Weather reading">
              <CheckInput
                checked={controls.weather}
                onChange={(next) => setControls({ ...controls, weather: next })}
              />
            </Field>
            <Field label="Energy reading">
              <CheckInput
                checked={controls.energy}
                onChange={(next) => setControls({ ...controls, energy: next })}
              />
            </Field>
            <Note>
              Off reaches the widgets' own fetch path, which has no engine behind it here. The
              scheme toggle sets <code>data-theme</code> on the stage document, where Hearth scopes
              its light palette.
            </Note>
          </Section>
        </aside>

        <StageFrame panel={panel} iframeRef={iframeRef} />
      </div>
    </div>
  );
}

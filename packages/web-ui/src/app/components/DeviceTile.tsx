/**
 * A device tile: one dominant primary action or readout from the curated
 * capability ranking, plus an affordance opening the device's detail view.
 */
import {
  ChevronRight,
  Clock,
  Eye,
  EyeOff,
  Power,
  Star,
  Unplug,
  UsersRound,
  Wifi,
  WifiOff,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { flattenCapabilities, rankDeviceTile } from "../lib/capability-ranking.js";
import { useDataStore } from "../lib/data-store.js";
import {
  type DeviceTileObservationIcon,
  type DeviceTileObservationState,
  type DeviceTileOnOffIcon,
  type DeviceTileOnOffState,
  deviceTileOnOffFromCapabilityValue,
  deviceTileState,
  deviceTileToggledValue,
} from "../lib/device-tile-state.js";
import { humanizeDeviceName } from "../lib/humanize-name.js";
import { deviceDetailPath } from "../lib/router.js";
import { useRouter } from "../lib/router-context.js";
import { useNow } from "../lib/use-now.js";
import { useOptimisticDeviceProperty } from "../lib/use-optimistic-property.js";
import type { DeviceDescriptor } from "../types.js";
import { Badge, Button, Card, cn, IconButton, Row, Stack, Tooltip } from "../ui/index.js";
import { CapabilityControl, formatReadoutValue } from "./CapabilityControl.js";

/**
 * Renders a state glyph from the symbolic icon name the pure state helper
 * produces, coloured by a design token.
 */
function StateGlyph({
  icon,
  size,
  token,
}: {
  icon: DeviceTileOnOffIcon | DeviceTileObservationIcon;
  size: number;
  token: string;
}) {
  const style = { color: `var(${token})` };
  switch (icon) {
    case "power-filled":
      return <Power size={size} fill="currentColor" style={style} aria-hidden />;
    case "power-outline":
      return <Power size={size} style={style} aria-hidden />;
    case "plug-off":
      return <Unplug size={size} style={style} aria-hidden />;
    case "wifi":
      return <Wifi size={size} style={style} aria-hidden />;
    case "wifi-off":
      return <WifiOff size={size} style={style} aria-hidden />;
    case "clock":
      return <Clock size={size} style={style} aria-hidden />;
  }
}

/** The "Hidden" marker badge. */
function HiddenMarker() {
  return <Badge tone="neutral">Hidden</Badge>;
}

/** The on/off label + filled/outline power glyph — the non-colour on/off channel. */
function OnOffChip({ state, fontSize }: { state: DeviceTileOnOffState; fontSize: string }) {
  return (
    <Row gap={1} align="center" wrap={false}>
      <StateGlyph icon={state.icon} size={15} token={state.token} />
      <span className="font-semibold" style={{ fontSize, color: `var(${state.token})` }}>
        {state.label}
      </span>
    </Row>
  );
}

/**
 * The observation state: glyph shape and token distinguish push, polled/stale,
 * and unreachable without colour, and the label carries the state as text.
 */
function ObservationIndicator({
  observation,
  size,
  fontSize,
}: {
  observation: DeviceTileObservationState;
  size: number;
  fontSize: string;
}) {
  const glyph = <StateGlyph icon={observation.icon} size={size} token={observation.token} />;
  return (
    <Row gap={1} align="center" wrap={false}>
      {glyph}
      <span
        className="truncate"
        style={{ fontSize, color: `var(${observation.token})` }}
        title={observation.label}
      >
        {observation.label}
      </span>
    </Row>
  );
}

/** The group-of-devices marker: a non-colour users-group glyph with an accessible name. */
function GroupMarker() {
  return (
    <Tooltip label="Group of devices">
      <span role="img" aria-label="Group of devices" className="flex text-muted">
        <UsersRound size={14} aria-hidden />
      </span>
    </Tooltip>
  );
}

/**
 * The tile's corner action slot: favorite, visibility, and any caller-supplied
 * action, in normal flow so it never overlays the name.
 */
function ActionSlot({ action }: { action: ReactNode }) {
  return (
    <Row
      gap={1}
      wrap={false}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {action}
    </Row>
  );
}

/**
 * A favorite star toggle, using the store's optimistic write and stream
 * reconciliation.
 */
function FavoriteToggle({ device }: { device: DeviceDescriptor }) {
  const { isFavorite, toggleFavorite } = useDataStore();
  const favorite = isFavorite(device.qualifiedId);
  const [error, setError] = useState<string | null>(null);

  const button = (
    <IconButton
      size="sm"
      label={favorite ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={favorite}
      className={cn(error ? "text-danger" : favorite ? "text-stale" : "text-muted")}
      onClick={async () => {
        setError(null);
        try {
          await toggleFavorite(device.qualifiedId);
        } catch {
          setError("Could not update favorites");
        }
      }}
    >
      {favorite ? <Star size={14} fill="currentColor" /> : <Star size={14} />}
    </IconButton>
  );

  return error ? <Tooltip label={error}>{button}</Tooltip> : button;
}

/**
 * A hide/unhide toggle reading the identifier off the descriptor, composed
 * alongside any caller-supplied `action` in the corner slot.
 */
function VisibilityToggle({ device }: { device: DeviceDescriptor }) {
  const { hideDevice, unhideDevice } = useDataStore();
  return (
    <IconButton
      size="sm"
      label={device.hidden ? "Unhide device" : "Hide device"}
      className="text-muted"
      onClick={() => {
        void (device.hidden ? unhideDevice(device.qualifiedId) : hideDevice(device.qualifiedId));
      }}
    >
      {device.hidden ? <Eye size={14} /> : <EyeOff size={14} />}
    </IconButton>
  );
}

interface AvailableProps {
  device: DeviceDescriptor;
  /** Rendered in the tile's corner slot, e.g. a room's unassign control in edit mode. */
  action?: ReactNode;
}

interface UnavailableProps {
  /** Marks this tile as an unavailable room member: no live descriptor exists for it. */
  unavailable: true;
  qualifiedId: string;
  action?: ReactNode;
}

type Props = AvailableProps | UnavailableProps;

/**
 * The unavailable variant: qualified identifier and an unavailable marker, with
 * no control, state readout, or detail affordance.
 */
function UnavailableTile({ qualifiedId, action }: UnavailableProps) {
  const inner = (
    <>
      <Row justify="between" align="start" gap={2} wrap={false}>
        <span
          className="truncate font-mono text-muted"
          style={{ flex: 1, minWidth: 0, fontSize: "var(--text-sm)" }}
        >
          {qualifiedId}
        </span>
        {action && <ActionSlot action={action} />}
      </Row>
      <Row gap={1} align="center" wrap={false} className="mt-1.5">
        <Unplug size={13} className="text-danger" aria-hidden />
        <Badge tone="neutral">Unavailable</Badge>
      </Row>
    </>
  );

  return (
    <Card padding={false} elevation="flat" className={cn("p-3", "border-dashed opacity-60")}>
      {inner}
    </Card>
  );
}

export function DeviceTile(props: Props) {
  if ("unavailable" in props) {
    return <UnavailableTile {...props} />;
  }

  return <AvailableTile {...props} />;
}

function AvailableTile({ device, action }: AvailableProps) {
  const { navigate, basePath } = useRouter();
  const now = useNow();
  const deviceLabel = humanizeDeviceName(device.displayName);
  const ranking = rankDeviceTile(device.capabilities);
  const flat = flattenCapabilities(device.capabilities);

  const actionCapability = ranking.action
    ? flat.find((c) => c.property === ranking.action?.capability.property)
    : undefined;
  const readoutCapability = ranking.readout
    ? flat.find((c) => c.property === ranking.readout?.capability.property)
    : undefined;

  // A tile with no ranked action is read-only and the whole tile opens detail; a
  // tile with a control opens detail only through its explicit affordance.
  const readOnly = !actionCapability;
  const state = deviceTileState(device, now);

  // One optimistic resolution shared by the embedded control and the on/off chip,
  // so they agree while a command is in flight.
  const actionControl = useOptimisticDeviceProperty(
    device.qualifiedId,
    actionCapability?.property ?? "",
    actionCapability ? device.state[actionCapability.property] : undefined,
    device.observation,
  );

  const onOff =
    actionCapability && ranking.action?.kind === "on_off"
      ? deviceTileOnOffFromCapabilityValue(actionCapability, actionControl.value)
      : state.onOff;

  const chipFontSize = "var(--text-xs)";
  const bodyFontSize = "var(--text-sm)";

  function openDetail() {
    navigate(deviceDetailPath(basePath, device.qualifiedId));
  }

  const cardAction = readOnly ? openDetail : null;
  // A read-only card takes role="button"; a tile with a control does not.
  const cardKeyboardAction = cardAction;

  const observation = (
    <ObservationIndicator observation={state.observation} size={11} fontSize={chipFontSize} />
  );

  const header = (
    <Row justify="between" align="start" gap={2} wrap={false}>
      <Row gap={1} align="center" wrap={false} className="min-w-0 flex-1">
        {device.source === "zigbee-group" && <GroupMarker />}
        <span
          className="truncate font-semibold"
          title={deviceLabel}
          style={{ fontSize: "var(--text-sm)" }}
        >
          {deviceLabel}
        </span>
      </Row>
      <ActionSlot
        action={
          <>
            {action}
            <FavoriteToggle device={device} />
            <VisibilityToggle device={device} />
          </>
        }
      />
    </Row>
  );

  const stop = (event: { stopPropagation: () => void }) => event.stopPropagation();

  // The ranked primary action, a bare readout, or an empty-state line.
  let controls: ReactNode;
  if (actionCapability) {
    controls = (
      <Row gap={2} align="center" wrap={false}>
        <div
          className="flex items-center"
          style={{ flex: 1, minWidth: 0 }}
          onClick={stop}
          onKeyDown={stop}
        >
          <CapabilityControl
            device={device}
            capability={actionCapability}
            compact
            value={actionControl.value}
            onChange={actionControl.setValue}
            error={actionControl.error}
          />
        </div>
        {onOff && <OnOffChip state={onOff} fontSize={chipFontSize} />}
      </Row>
    );
  } else if (readoutCapability) {
    controls = (
      <span
        className="font-bold"
        style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)" }}
      >
        {formatReadoutValue(device.state[readoutCapability.property], readoutCapability.unit)}
      </span>
    );
  } else {
    controls = (
      <span className="text-muted" style={{ fontSize: bodyFontSize }}>
        No controls
      </span>
    );
  }

  const readoutLine =
    actionCapability && readoutCapability ? (
      <span className="text-muted" style={{ fontSize: bodyFontSize }}>
        {formatReadoutValue(device.state[readoutCapability.property], readoutCapability.unit)}
      </span>
    ) : null;

  const footer = (
    <Row justify="between" align="center" gap={2} wrap={false}>
      <Row gap={1} align="center" wrap={false} className="min-w-0">
        {device.hidden && <HiddenMarker />}
        {observation}
      </Row>

      <Button
        variant="soft"
        size="sm"
        aria-label={`Open ${deviceLabel} details`}
        onClick={(event) => {
          event.stopPropagation();
          openDetail();
        }}
      >
        Details
        <ChevronRight size={12} aria-hidden />
      </Button>
    </Row>
  );

  return (
    <Card
      padding={false}
      elevation="raised"
      className={cn(
        "p-3",
        "relative",
        device.hidden && "border-dashed opacity-70",
        cardAction && "cursor-pointer",
      )}
      onClick={cardAction ?? undefined}
      role={cardKeyboardAction ? "button" : undefined}
      tabIndex={cardKeyboardAction ? 0 : undefined}
      onKeyDown={
        cardKeyboardAction
          ? (event) => {
              if (event.key === " ") event.preventDefault();
              if (event.key === "Enter" || event.key === " ") cardKeyboardAction();
            }
          : undefined
      }
    >
      <Stack gap={2}>
        {header}
        {controls}
        {readoutLine}
        {footer}
      </Stack>
    </Card>
  );
}

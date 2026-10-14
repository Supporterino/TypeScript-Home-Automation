/**
 * The wall device tile (design.md D7; wall-zones-and-fit D3, D4;
 * specs/wall-display "Touch Operation"). There is no second device presentation:
 * this renders the shared {@link DeviceTile} with the wall size token, which
 * enlarges the tile's padding and interactive controls to the wall's minimum
 * touch target. Every wall device widget — favorites, room, single-device, and
 * the device grid — renders through this component so all wall device controls
 * meet the minimum and behave exactly as the tile does elsewhere.
 *
 * The card's span tier and form are passed through to the shared tile, which
 * composes its *form* for them (wall-zones-and-fit D3, D4) while the capability
 * ranking, optimistic override, state encoding, and actuation semantics stay the
 * single shared implementation. A caller that shows a tile at the wall's
 * minimum-span tile cell passes the tier and form that cell resolves — which is
 * always `compact`, at every panel — so a paged tile composes for its own cell
 * rather than for the widget that surrounds it.
 */
import type { ReactNode } from "react";
import { DeviceTile } from "../../components/DeviceTile.js";
import type { DeviceDescriptor } from "../../types.js";
import type { WallCardForm, WallWidgetTier } from "../span.js";

type Props =
  | {
      device: DeviceDescriptor;
      action?: ReactNode;
      contained?: boolean;
      tier: WallWidgetTier;
      cardForm: WallCardForm;
    }
  | {
      unavailable: true;
      qualifiedId: string;
      action?: ReactNode;
      contained?: boolean;
      tier: WallWidgetTier;
      cardForm: WallCardForm;
    };

export function WallDeviceTile(props: Props) {
  if ("unavailable" in props) {
    return (
      <DeviceTile
        unavailable
        qualifiedId={props.qualifiedId}
        action={props.action}
        contained={props.contained}
        size="wall"
        wallTier={props.tier}
        wallCardForm={props.cardForm}
      />
    );
  }

  return (
    <DeviceTile
      device={props.device}
      action={props.action}
      contained={props.contained}
      size="wall"
      wallTier={props.tier}
      wallCardForm={props.cardForm}
    />
  );
}

/**
 * The wall device tile (design.md D7; specs/wall-display "Touch Operation").
 *
 * There is no second device presentation: this renders the shared
 * {@link DeviceTile} with the wall size token, which enlarges the tile's
 * padding and interactive controls to the wall's minimum touch target. Every
 * wall device widget — favorites, room, and single-device — renders through
 * this component so all wall device controls meet the minimum and behave
 * exactly as the tile does elsewhere.
 */
import type { ReactNode } from "react";
import { DeviceTile } from "../../components/DeviceTile.js";
import type { DeviceDescriptor } from "../../types.js";

type Props =
  | { device: DeviceDescriptor; action?: ReactNode }
  | { unavailable: true; qualifiedId: string; action?: ReactNode };

export function WallDeviceTile(props: Props) {
  if ("unavailable" in props) {
    return (
      <DeviceTile unavailable qualifiedId={props.qualifiedId} action={props.action} size="wall" />
    );
  }

  return <DeviceTile device={props.device} action={props.action} size="wall" />;
}

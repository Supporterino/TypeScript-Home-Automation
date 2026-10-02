/**
 * Optimistic actuation for one device property (design.md D12, D21, D31;
 * task 10.12). Shared by the device tile's primary control and the device
 * detail view's generic controls — both are thin renderers over this hook.
 *
 * The decided behaviour lives in the pure modules this hook wires together:
 * {@link computeRevertDeadlineMs} (design.md D21) for how long an
 * unconfirmed command may stand, and the app-wide `CommandCoalescer`
 * (design.md D31) for collapsing a burst of intermediate values into the
 * one that is actually sent. This hook itself is the manually-verified glue
 * between those and React state (design.md D23).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DeviceObservation } from "../types.js";
import { coalescingKey } from "./command-coalescing.js";
import { useDataStore } from "./data-store.js";
import { computeRevertDeadlineMs } from "./revert-deadline.js";

export interface OptimisticProperty<T> {
  /** The optimistic value while a command is outstanding, else the last confirmed value. */
  value: T | undefined;
  /** Whether an optimistic override is currently standing in for the confirmed value. */
  pending: boolean;
  /** The error from the most recently rejected/failed command, if any. */
  error: string | null;
  /** Requests `next` be actuated — reflected immediately, reconciled or reverted per design.md D12/D21/D31. */
  setValue: (next: T) => void;
}

interface Override<T> {
  value: T;
  token: symbol;
}

export function useOptimisticDeviceProperty<T = unknown>(
  qualifiedId: string,
  property: string,
  confirmedValue: T | undefined,
  observation: DeviceObservation,
): OptimisticProperty<T> {
  const { subscribe, commandCoalescer } = useDataStore();
  const [override, setOverride] = useState<Override<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = coalescingKey(qualifiedId, property);

  // Track the latest observation in a ref so a deadline timer armed against
  // an earlier render's observation object still reads current data if it
  // needs to (it doesn't today, but avoids a stale-closure trap either way).
  const observationRef = useRef(observation);
  observationRef.current = observation;

  // Reconciliation: a device_state event confirming this property clears
  // the override — but only if this override's token is still the latest
  // for this key, so a confirmation for a superseded intermediate value
  // (already replaced by a newer request) is ignored rather than snapping
  // the control backwards (design.md D31 "A superseded confirmation does
  // not move the control").
  useEffect(() => {
    return subscribe((event) => {
      if (event.category !== "device_state") return;
      if (event.qualifiedId !== qualifiedId) return;
      if (!(property in event.properties)) return;
      setOverride((current) => {
        if (!current) return current;
        if (!commandCoalescer.isLatest(key, current.token)) return current;
        return null;
      });
    });
  }, [subscribe, commandCoalescer, qualifiedId, property, key]);

  const setValue = useCallback(
    (next: T) => {
      const token = commandCoalescer.request(
        key,
        { qualifiedId, property, value: next },
        (outcome) => {
          if (outcome.status === "sent_error") {
            const message =
              outcome.error instanceof Error ? outcome.error.message : "Command failed";
            setError(message);
            setOverride((current) => (current && current.token === token ? null : current));
          }
          // "sent" (200 OK) and "superseded" both leave reconciliation to
          // the device_state listener above or the deadline below — an
          // accepted response is not itself a confirmation of physical
          // device state (design.md D21).
        },
      );

      setError(null);
      setOverride({ value: next, token });

      const deadlineMs = computeRevertDeadlineMs(observationRef.current);
      setTimeout(() => {
        setOverride((current) => {
          if (!current || current.token !== token) return current;
          if (!commandCoalescer.isLatest(key, token)) return current;
          return null; // Neither confirmed nor rejected within the deadline — revert.
        });
      }, deadlineMs);
    },
    [commandCoalescer, key, qualifiedId, property],
  );

  return {
    value: override ? override.value : confirmedValue,
    pending: override !== null,
    error,
    setValue,
  };
}

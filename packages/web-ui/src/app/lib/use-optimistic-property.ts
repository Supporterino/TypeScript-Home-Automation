/**
 * Optimistic actuation for one device property, shared by the device tile's
 * primary control and the device detail view's generic controls.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DeviceObservation } from "../types.js";
import { coalescingKey } from "./command-coalescing.js";
import { useDataStore } from "./data-store.js";
import { reportedValueConfirms } from "./reconcile-report.js";
import { computeRevertDeadlineMs } from "./revert-deadline.js";

export interface OptimisticProperty<T> {
  /** The optimistic value while a command is outstanding, else the last confirmed value. */
  value: T | undefined;
  /** Whether an optimistic override is currently standing in for the confirmed value. */
  pending: boolean;
  /** The error from the most recently rejected/failed command, if any. */
  error: string | null;
  /** Requests `next` be actuated — reflected immediately, then reconciled or reverted. */
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
  const { subscribe, commandCoalescer, optimisticOverrides, revertOptimisticOverride } =
    useDataStore();
  const [override, setOverride] = useState<Override<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = coalescingKey(qualifiedId, property);

  // A store-level override (a room batch command) outranks this component's own,
  // so every mounted control reflects the room-wide command.
  const storeOverride = optimisticOverrides.get(key);

  // A ref avoids the deadline timer reading a stale observation from an earlier
  // render's closure.
  const observationRef = useRef(observation);
  observationRef.current = observation;

  // A device_state event carries no request token, so a report confirms the
  // override only when its value equals the newest request's value.
  useEffect(() => {
    return subscribe((event) => {
      if (event.category !== "device_state") return;
      if (event.qualifiedId !== qualifiedId) return;
      if (!(property in event.properties)) return;
      setOverride((current) => {
        if (!current) return current;
        if (!reportedValueConfirms(current.value, event.properties[property])) return current;
        return null;
      });
    });
  }, [subscribe, qualifiedId, property]);

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
          // "sent" and "superseded" leave reconciliation to the listener above
          // or the deadline below; a 200 is not a confirmation of device state.
        },
      );

      setError(null);
      // A direct edit supersedes any room-level optimistic value for this key.
      revertOptimisticOverride(qualifiedId, property);
      setOverride({ value: next, token });

      const deadlineMs = computeRevertDeadlineMs(observationRef.current);
      setTimeout(() => {
        setOverride((current) => {
          if (!current || current.token !== token) return current;
          if (commandCoalescer.isSuperseded(key, token)) return current;
          return null; // Neither confirmed nor rejected within the deadline — revert.
        });
      }, deadlineMs);
    },
    [commandCoalescer, key, qualifiedId, property, revertOptimisticOverride],
  );

  return {
    value: storeOverride ? (storeOverride.value as T) : override ? override.value : confirmedValue,
    pending: storeOverride !== undefined || override !== null,
    error,
    setValue,
  };
}

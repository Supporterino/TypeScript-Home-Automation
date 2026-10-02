/**
 * Automation relationship contracts (design.md D11, R12; task 8.5), delivered
 * over the wire and consumed by the web UI detail views.
 */

/**
 * A declared required service and whether it is currently registered.
 */
export interface RequiredServiceStatus {
  name: string;
  registered: boolean;
}

/**
 * An automation's relationships, split into what is declared (and therefore
 * complete, without ever having run) and what has been observed at runtime
 * (and is therefore partial, growing only with use — design.md D11, R12;
 * task 8.5).
 */
export interface AutomationRelationships {
  declared: {
    requiredServices: RequiredServiceStatus[];
    /** Device names referenced by device and MQTT triggers. */
    relatedDevices: string[];
    /** State keys watched by state triggers. */
    watchedStateKeys: string[];
  };
  observed: {
    /** State keys observed being written, oldest-retained first. */
    writtenStateKeys: string[];
    /** `true` once the retained set has ever exceeded its bound (design.md R15). */
    truncated: boolean;
  };
}

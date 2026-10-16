/** Automation relationship contracts, consumed by the web UI detail views. */

/**
 * A declared required service and whether it is currently registered.
 */
export interface RequiredServiceStatus {
  name: string;
  registered: boolean;
}

/**
 * An automation's relationships, split into declared and observed.
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
    /** `true` once the retained set has ever exceeded its bound. */
    truncated: boolean;
  };
}

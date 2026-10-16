/**
 * Server-sent-events frame parsing: a frame is a run of lines terminated by a
 * blank line, with `data:` lines joined by newlines; pure and stream-agnostic.
 */

export interface SseFrameParseResult {
  /** Complete `data:` payloads (one per frame), in arrival order. */
  events: string[];
  /** The trailing bytes that do not yet form a complete frame. */
  rest: string;
}

/** Parse every complete SSE frame in `buffer`, returning the incomplete remainder. */
export function parseSseFrames(buffer: string): SseFrameParseResult {
  const events: string[] = [];
  let rest = buffer;

  let boundary = rest.indexOf("\n\n");
  while (boundary !== -1) {
    const frame = rest.slice(0, boundary);
    rest = rest.slice(boundary + 2);

    const data = extractData(frame);
    if (data !== null) events.push(data);

    boundary = rest.indexOf("\n\n");
  }

  return { events, rest };
}

/**
 * Join a frame's `data:` lines, ignoring comment lines and other fields.
 * Returns `null` when the frame carries no data.
 */
function extractData(frame: string): string | null {
  const dataLines: string[] = [];
  for (const line of frame.split("\n")) {
    if (!line.startsWith("data:")) continue;
    // A single optional space after the colon is stripped per the SSE spec.
    dataLines.push(line.slice(5).replace(/^ /, ""));
  }
  return dataLines.length > 0 ? dataLines.join("\n") : null;
}

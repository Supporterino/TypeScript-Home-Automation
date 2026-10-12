/**
 * Server-sent-events frame parsing (specs/cli "Realtime Dashboard Updates";
 * design.md D3).
 *
 * The engine's hub emits only `data: {json}\n\n` frames and `: keep-alive\n\n`
 * comments (`event-stream.ts`), but this parses the general SSE framing — a
 * frame is a run of lines terminated by a blank line, and `data:` lines are
 * concatenated with newlines. Kept pure and stream-agnostic so a caller can
 * feed it successive decoded chunks (a frame may be split mid-chunk) without a
 * network.
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
 * Join a frame's `data:` lines (SSE spec), ignoring comment lines and any
 * other field. Returns `null` when the frame carries no data — a keep-alive
 * comment, or a blank frame.
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

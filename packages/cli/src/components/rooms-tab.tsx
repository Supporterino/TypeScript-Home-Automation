import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import type { RoomCommandResult } from "@ts-ha/shared";
import { useCallback, useEffect, useState } from "react";
import type { DebugClient } from "../client.js";
import { parseRoomCommandInput, projectRoomRows, summarizeOutcomes } from "../room-model.js";
import { COLORS } from "./theme.js";
import type { RoomsData } from "./types.js";

type CommandMode = { type: "none" } | { type: "command"; roomId: string; value: string };

// ---------------------------------------------------------------------------
// RoomsTab
// ---------------------------------------------------------------------------

export function RoomsTab({
  data,
  client,
  onRefresh,
  onInputActiveChange,
}: {
  data: RoomsData;
  client: DebugClient;
  onRefresh: () => void;
  /** Notifies the dashboard that a free-text input is capturing keystrokes. */
  onInputActiveChange: (active: boolean) => void;
}) {
  const { width } = useTerminalDimensions();
  const nameWidth = Math.max(20, Math.floor(width * 0.35));

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [commandMode, setCommandMode] = useState<CommandMode>({ type: "none" });
  const [lastResults, setLastResults] = useState<{
    roomId: string;
    results: RoomCommandResult[];
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // The batch-command input captures raw keystrokes; tell the dashboard so its
  // global shortcuts stand down while it is open.
  useEffect(() => {
    onInputActiveChange(commandMode.type === "command");
  }, [commandMode.type, onInputActiveChange]);

  useEffect(() => () => onInputActiveChange(false), [onInputActiveChange]);

  const rows = projectRoomRows(data.rooms);
  const selected = data.rooms[selectedIdx] ?? null;

  const submitCommand = useCallback(
    async (roomId: string, input: string) => {
      const parsed = parseRoomCommandInput(input);
      if (!parsed) {
        setMessage("Usage: <property> <value>");
        return;
      }
      try {
        const results = await client.sendRoomCommand(roomId, parsed.properties);
        setLastResults({ roomId, results });
        setCommandMode({ type: "none" });
        setMessage(`Sent ${parsed.property}`);
        onRefresh();
      } catch (err) {
        setMessage(`Error: ${(err as Error).message}`);
      }
    },
    [client, onRefresh],
  );

  useKeyboard((key) => {
    if (message) setMessage(null);

    // ── Batch command input ────────────────────────────────────────────────
    if (commandMode.type === "command") {
      if (key.name === "escape") {
        setCommandMode({ type: "none" });
      } else if (key.name === "enter" || key.name === "return") {
        void submitCommand(commandMode.roomId, commandMode.value);
      } else if (key.name === "backspace") {
        setCommandMode((m) => (m.type === "command" ? { ...m, value: m.value.slice(0, -1) } : m));
      } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        setCommandMode((m) => (m.type === "command" ? { ...m, value: m.value + key.sequence } : m));
      }
      return;
    }

    if (data.rooms.length === 0) return;

    if (key.name === "up" || key.name === "k") {
      setSelectedIdx((i) => Math.max(0, i - 1));
    } else if (key.name === "down" || key.name === "j") {
      setSelectedIdx((i) => Math.min(data.rooms.length - 1, i + 1));
    } else if (key.name === "escape") {
      setExpandedId(null);
    } else if (key.name === "enter" || key.name === "return") {
      if (selected) setExpandedId((id) => (id === selected.id ? null : selected.id));
    } else if (key.name === "c" && selected) {
      setExpandedId(selected.id);
      setCommandMode({ type: "command", roomId: selected.id, value: "" });
    }
  });

  if (data.rooms.length === 0) {
    return (
      <box flexDirection="column" flexGrow={1} paddingLeft={1} paddingTop={1}>
        <text fg={COLORS.comment}>No rooms defined.</text>
      </box>
    );
  }

  return (
    <box flexDirection="column" flexGrow={1} paddingLeft={1}>
      <scrollbox
        height={data.rooms.length + (expandedId ? 12 : 0) + 2}
        focused={commandMode.type === "none"}
      >
        {data.rooms.map((room, i) => {
          const row = rows[i];
          const isSelected = i === selectedIdx;
          const isExpanded = room.id === expandedId;
          const results = lastResults?.roomId === room.id ? lastResults.results : null;

          return (
            <box key={room.id} flexDirection="column">
              <box flexDirection="row" backgroundColor={isSelected ? COLORS.bgLight : undefined}>
                <text fg={COLORS.purple} width={2}>
                  {isSelected ? ">" : " "}
                </text>
                <text fg={COLORS.cyan} width={nameWidth}>
                  {row.name}
                </text>
                <text fg={COLORS.comment} width={20}>
                  {row.id}
                </text>
                <text fg={COLORS.comment}>
                  {row.memberCount} member{row.memberCount === 1 ? "" : "s"}
                </text>
              </box>

              {isExpanded && (
                <box flexDirection="column" paddingLeft={4} marginBottom={1}>
                  {row.members.length === 0 ? (
                    <text fg={COLORS.comment}>(no members)</text>
                  ) : (
                    row.members.map((member) => (
                      <box key={member.qualifiedId} flexDirection="row" paddingLeft={2}>
                        <text fg={COLORS.yellow} width={26}>
                          {member.qualifiedId}
                        </text>
                        <text fg={COLORS.fg} width={nameWidth}>
                          {member.displayName}
                        </text>
                        <text fg={member.available ? COLORS.green : COLORS.red}>
                          {member.available ? "available" : "unavailable"}
                        </text>
                      </box>
                    ))
                  )}

                  {results && (
                    <box flexDirection="column" marginTop={1}>
                      <text fg={COLORS.comment}>
                        <em>Last batch:</em>
                      </text>
                      {results.map((result) => (
                        <box key={result.qualifiedId} flexDirection="row" paddingLeft={2}>
                          <text fg={COLORS.comment} width={26}>
                            {result.qualifiedId}
                          </text>
                          <text
                            fg={
                              result.outcome === "applied"
                                ? COLORS.green
                                : result.outcome === "failed"
                                  ? COLORS.red
                                  : COLORS.comment
                            }
                          >
                            {result.outcome}
                          </text>
                        </box>
                      ))}
                      <text fg={COLORS.comment}>
                        {(() => {
                          const counts = summarizeOutcomes(results);
                          return `${counts.applied} applied, ${counts.skipped} skipped, ${counts.failed} failed`;
                        })()}
                      </text>
                    </box>
                  )}
                </box>
              )}
            </box>
          );
        })}
      </scrollbox>

      {/* Batch command input */}
      {commandMode.type === "command" && (
        <box border borderColor={COLORS.purple} padding={1} marginTop={1}>
          <box flexDirection="column">
            <text>
              <strong>Batch command: </strong>
              <span fg={COLORS.cyan}>
                {data.rooms.find((room) => room.id === commandMode.roomId)?.name ??
                  commandMode.roomId}
              </span>
            </text>
            <box flexDirection="row" marginTop={1}>
              <text fg={COLORS.yellow}>
                {commandMode.value}
                <span fg={COLORS.green}>▌</span>
              </text>
            </box>
            <text fg={COLORS.comment} marginTop={1}>
              {"<property> <value>"} · Enter send · Esc cancel
            </text>
          </box>
        </box>
      )}

      {/* Feedback */}
      {message && (
        <box marginTop={1} paddingLeft={1}>
          <text
            fg={
              message.startsWith("Error") || message.startsWith("Usage") ? COLORS.red : COLORS.green
            }
          >
            {message}
          </text>
        </box>
      )}

      {/* Hints */}
      {commandMode.type === "none" && (
        <box marginTop={1} paddingLeft={1}>
          <text fg={COLORS.comment}>↑↓ navigate · Enter expand · c batch command</text>
        </box>
      )}
    </box>
  );
}

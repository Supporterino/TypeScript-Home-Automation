import { useKeyboard } from "@opentui/react";
import { useCallback, useState } from "react";
import type { DebugClient } from "../client.js";
import { COLORS, formatValue, valueColor } from "./theme.js";
import type { StateData } from "./types.js";

type EditMode =
  | { type: "none" }
  | { type: "edit"; key: string; value: string }
  | { type: "new"; key: string; value: string };

export function StateTab({
  data,
  client,
  onRefresh,
}: {
  data: StateData;
  client: DebugClient;
  onRefresh: () => void;
}) {
  const entries = Object.entries(data.state);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [editMode, setEditMode] = useState<EditMode>({ type: "none" });
  const [message, setMessage] = useState<string | null>(null);

  const selectedEntry = entries[selectedIdx];

  const submitEdit = useCallback(
    async (key: string, rawValue: string) => {
      let value: unknown;
      try {
        value = JSON.parse(rawValue);
      } catch {
        value = rawValue;
      }
      try {
        await client.setState(key, value);
        setMessage(`Set ${key} = ${formatValue(value)}`);
        setEditMode({ type: "none" });
        onRefresh();
      } catch (err) {
        setMessage(`Error: ${(err as Error).message}`);
      }
    },
    [client, onRefresh],
  );

  const deleteKey = useCallback(
    async (key: string) => {
      try {
        await client.deleteState(key);
        setMessage(`Deleted ${key}`);
        setSelectedIdx((i) => Math.min(i, entries.length - 2));
        onRefresh();
      } catch (err) {
        setMessage(`Error: ${(err as Error).message}`);
      }
    },
    [client, onRefresh, entries.length],
  );

  useKeyboard((key) => {
    if (message) setMessage(null);

    if (editMode.type !== "none") {
      if (key.name === "escape") {
        setEditMode({ type: "none" });
      } else if (key.name === "enter" || key.name === "return") {
        submitEdit(editMode.key, editMode.value);
      } else if (key.name === "backspace") {
        setEditMode((m) => (m.type !== "none" ? { ...m, value: m.value.slice(0, -1) } : m));
      } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
        setEditMode((m) => (m.type !== "none" ? { ...m, value: m.value + key.sequence } : m));
      }
      return;
    }

    if (key.name === "up" || key.name === "k") {
      setSelectedIdx((i) => Math.max(0, i - 1));
    } else if (key.name === "down" || key.name === "j") {
      setSelectedIdx((i) => Math.min(entries.length - 1, i + 1));
    } else if ((key.name === "enter" || key.name === "return") && selectedEntry) {
      setEditMode({
        type: "edit",
        key: selectedEntry[0],
        value: JSON.stringify(selectedEntry[1]),
      });
    } else if (key.name === "d" && selectedEntry) {
      deleteKey(selectedEntry[0]);
    } else if (key.name === "n") {
      setEditMode({ type: "new", key: "", value: "" });
    }
  });

  return (
    <box flexDirection="column" flexGrow={1} paddingLeft={1}>
      {/* State list */}
      <scrollbox height={entries.length + 2} focused={editMode.type === "none"}>
        {entries.length === 0 ? (
          <text fg={COLORS.comment}>(no state entries)</text>
        ) : (
          entries.map(([key, value], i) => {
            const isSelected = i === selectedIdx;
            return (
              <box
                key={key}
                flexDirection="row"
                backgroundColor={isSelected ? COLORS.bgLight : undefined}
              >
                <text fg={COLORS.purple} width={2}>
                  {isSelected ? ">" : " "}
                </text>
                <text width={34}>{key}</text>
                <text fg={valueColor(value)}>{formatValue(value)}</text>
              </box>
            );
          })
        )}
      </scrollbox>

      {/* Edit/New mode */}
      {editMode.type !== "none" && (
        <box border borderColor={COLORS.purple} padding={1} marginTop={1}>
          <box flexDirection="column">
            <text>
              <strong>{editMode.type === "new" ? "New State Key" : `Edit: ${editMode.key}`}</strong>
            </text>
            {editMode.type === "new" && (
              <box flexDirection="row" marginTop={1}>
                <text fg={COLORS.comment} width={8}>
                  Key:{" "}
                </text>
                <text fg={COLORS.cyan}>{editMode.key || "…"}</text>
              </box>
            )}
            <box flexDirection="row" marginTop={editMode.type === "new" ? 0 : 1}>
              <text fg={COLORS.comment} width={8}>
                Value:{" "}
              </text>
              <text fg={COLORS.yellow}>
                {editMode.value}
                <span fg={COLORS.green}>▌</span>
              </text>
            </box>
            <text fg={COLORS.comment} marginTop={1}>
              Enter submit · Esc cancel
            </text>
          </box>
        </box>
      )}

      {/* Feedback */}
      {message && (
        <box marginTop={1} paddingLeft={1}>
          <text fg={message.startsWith("Error") ? COLORS.red : COLORS.green}>{message}</text>
        </box>
      )}

      {/* Hints */}
      {editMode.type === "none" && (
        <box marginTop={1} paddingLeft={1}>
          <text fg={COLORS.comment}>↑↓ navigate · Enter edit · n new · d delete</text>
        </box>
      )}
    </box>
  );
}

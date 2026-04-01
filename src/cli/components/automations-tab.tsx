import { useKeyboard, useTerminalDimensions } from "@opentui/react";
import { useCallback, useState } from "react";
import type { DebugClient } from "../client.js";
import { formatTrigger, summarizeTriggers } from "../format.js";
import { COLORS } from "./theme.js";
import type { AutomationsData } from "./types.js";

const TRIGGER_TYPES = ["mqtt", "cron", "state", "webhook"] as const;

export function AutomationsTab({
  data,
  client,
  onRefresh,
}: {
  data: AutomationsData;
  client: DebugClient;
  onRefresh: () => void;
}) {
  const { width } = useTerminalDimensions();
  const nameWidth = Math.max(20, Math.floor(width * 0.35));
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [expandedName, setExpandedName] = useState<string | null>(null);
  const [triggerMode, setTriggerMode] = useState(false);
  const [triggerTypeIdx, setTriggerTypeIdx] = useState(0);
  const [triggerPayload, setTriggerPayload] = useState("");
  const [triggerMsg, setTriggerMsg] = useState<string | null>(null);

  const selectedAuto = data.automations[selectedIdx] ?? null;

  const doTrigger = useCallback(async () => {
    if (!selectedAuto) return;
    const type = TRIGGER_TYPES[triggerTypeIdx];
    let context: Record<string, unknown> = { type };
    if (triggerPayload.trim()) {
      try {
        const extra = JSON.parse(triggerPayload) as Record<string, unknown>;
        context = { ...context, ...extra };
      } catch {
        setTriggerMsg("Invalid JSON payload");
        return;
      }
    }
    try {
      await client.triggerAutomation(
        selectedAuto.name,
        context as { type: string; [key: string]: unknown },
      );
      setTriggerMsg(`Triggered ${selectedAuto.name} (${type})`);
      setTriggerMode(false);
      setTriggerPayload("");
      onRefresh();
    } catch (err) {
      setTriggerMsg(`Error: ${(err as Error).message}`);
    }
  }, [selectedAuto, triggerTypeIdx, triggerPayload, client, onRefresh]);

  useKeyboard((key) => {
    // Clear message on any key
    if (triggerMsg && !triggerMode) setTriggerMsg(null);

    if (triggerMode) {
      if (key.name === "escape") {
        setTriggerMode(false);
        setTriggerPayload("");
      } else if (key.name === "up" || key.name === "left") {
        setTriggerTypeIdx((i) => (i - 1 + TRIGGER_TYPES.length) % TRIGGER_TYPES.length);
      } else if (key.name === "down" || key.name === "right") {
        setTriggerTypeIdx((i) => (i + 1) % TRIGGER_TYPES.length);
      } else if (key.name === "enter" || key.name === "return") {
        doTrigger();
      }
      return;
    }

    if (key.name === "up" || key.name === "k") {
      setSelectedIdx((i) => Math.max(0, i - 1));
    } else if (key.name === "down" || key.name === "j") {
      setSelectedIdx((i) => Math.min(data.count - 1, i + 1));
    } else if (key.name === "enter" || key.name === "return") {
      if (selectedAuto) {
        setExpandedName((n) => (n === selectedAuto.name ? null : selectedAuto.name));
      }
    } else if (key.name === "t" && selectedAuto) {
      setTriggerMode(true);
      setTriggerTypeIdx(0);
    }
  });

  return (
    <box flexDirection="column" flexGrow={1} paddingLeft={1}>
      {/* Automation list */}
      <scrollbox height={data.count + (expandedName ? 8 : 0) + 2} focused={!triggerMode}>
        {data.automations.map((auto, i) => {
          const isSelected = i === selectedIdx;
          const isExpanded = auto.name === expandedName;
          return (
            <box key={auto.name} flexDirection="column">
              <box flexDirection="row" backgroundColor={isSelected ? COLORS.bgLight : undefined}>
                <text fg={COLORS.purple} width={2}>
                  {isSelected ? ">" : " "}
                </text>
                <text fg={COLORS.cyan} width={nameWidth}>
                  {auto.name}
                </text>
                <text fg={COLORS.comment}>{summarizeTriggers(auto.triggers)}</text>
              </box>
              {isExpanded && (
                <box flexDirection="column" paddingLeft={4} marginBottom={1}>
                  <text fg={COLORS.comment}>
                    <em>Triggers:</em>
                  </text>
                  {auto.triggers.map((trigger) => (
                    <text
                      key={`${auto.name}-${trigger.type}-${(trigger as Record<string, unknown>).topic ?? (trigger as Record<string, unknown>).key ?? (trigger as Record<string, unknown>).expression ?? (trigger as Record<string, unknown>).path ?? ""}`}
                      fg={COLORS.fg}
                    >
                      {"  "}
                      {formatTrigger(trigger)}
                    </text>
                  ))}
                </box>
              )}
            </box>
          );
        })}
      </scrollbox>

      {/* Trigger mode */}
      {triggerMode && selectedAuto && (
        <box border borderColor={COLORS.purple} padding={1} marginTop={1}>
          <box flexDirection="column">
            <text>
              <strong>Trigger: </strong>
              <span fg={COLORS.cyan}>{selectedAuto.name}</span>
            </text>
            <box flexDirection="row" gap={2} marginTop={1}>
              <text fg={COLORS.comment}>Type:</text>
              {TRIGGER_TYPES.map((type, i) => (
                <text key={type} fg={i === triggerTypeIdx ? COLORS.green : COLORS.comment}>
                  {i === triggerTypeIdx ? `[${type}]` : ` ${type} `}
                </text>
              ))}
            </box>
            <text fg={COLORS.comment} marginTop={1}>
              ↑↓ select type · Enter trigger · Esc cancel
            </text>
          </box>
        </box>
      )}

      {/* Feedback message */}
      {triggerMsg && (
        <box marginTop={1} paddingLeft={1}>
          <text fg={triggerMsg.startsWith("Error") ? COLORS.red : COLORS.green}>{triggerMsg}</text>
        </box>
      )}

      {/* Hints */}
      {!triggerMode && (
        <box marginTop={1} paddingLeft={1}>
          <text fg={COLORS.comment}>↑↓ navigate · Enter expand · t trigger</text>
        </box>
      )}
    </box>
  );
}

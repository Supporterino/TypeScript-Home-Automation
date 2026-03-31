import { useKeyboard } from "@opentui/react";
import { COLORS } from "./theme.js";

const SHORTCUTS = [
  {
    section: "Navigation",
    items: [
      { key: "1-4", desc: "Switch tabs" },
      { key: "↑/↓ or j/k", desc: "Navigate lists / scroll" },
      { key: "r", desc: "Force refresh" },
      { key: "?", desc: "Toggle this help" },
      { key: "q / Esc", desc: "Quit (or close modal)" },
    ],
  },
  {
    section: "Automations Tab",
    items: [
      { key: "Enter", desc: "Expand/collapse automation details" },
      { key: "t", desc: "Trigger selected automation" },
    ],
  },
  {
    section: "State Tab",
    items: [
      { key: "Enter", desc: "Edit selected state value" },
      { key: "n", desc: "Add new state key" },
      { key: "d", desc: "Delete selected state key" },
      { key: "Esc", desc: "Cancel editing" },
    ],
  },
  { section: "Logs Tab", items: [{ key: "↑/↓", desc: "Scroll through log entries" }] },
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  useKeyboard((key) => {
    if (key.name === "escape" || key.name === "?") {
      onClose();
    }
  });

  return (
    <box
      position="absolute"
      top={2}
      left={4}
      right={4}
      zIndex={10}
      border
      borderStyle="rounded"
      borderColor={COLORS.purple}
      backgroundColor={COLORS.bg}
      padding={1}
    >
      <box flexDirection="column">
        <box flexDirection="row" justifyContent="space-between" marginBottom={1}>
          <text>
            <strong>Keyboard Shortcuts</strong>
          </text>
          <text fg={COLORS.comment}>Press ? or Esc to close</text>
        </box>

        {SHORTCUTS.map((section) => (
          <box key={section.section} flexDirection="column" marginTop={1}>
            <text fg={COLORS.pink}>
              <strong>{section.section}</strong>
            </text>
            {section.items.map((item) => (
              <box key={item.key} flexDirection="row" paddingLeft={2}>
                <text fg={COLORS.cyan} width={16}>
                  {item.key}
                </text>
                <text fg={COLORS.fg}>{item.desc}</text>
              </box>
            ))}
          </box>
        ))}
      </box>
    </box>
  );
}

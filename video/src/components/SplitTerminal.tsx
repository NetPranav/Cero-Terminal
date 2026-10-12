import React from "react";
import { TOKENS } from "../styles/tokens";

interface SplitTerminalProps {
  leftTitle?: string;
  rightTitle?: string;
  dividerPosition?: number; // percent (0 to 100)
  leftContent: React.ReactNode;
  rightContent: React.ReactNode;
}

export const SplitTerminal: React.FC<SplitTerminalProps> = ({
  leftTitle = "pane 1 — server",
  rightTitle = "pane 2 — system telemetry",
  dividerPosition = 50,
  leftContent,
  rightContent,
}) => {
  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Left Pane */}
      <div
        style={{
          width: `${dividerPosition}%`,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          borderRight: `1px solid ${TOKENS.colors.borderCard}`,
          backgroundColor: "#0C0D12",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 24,
            backgroundColor: "rgba(255, 255, 255, 0.02)",
            borderBottom: `1px solid ${TOKENS.colors.borderSubtle}`,
            padding: "0 10px",
            display: "flex",
            alignItems: "center",
            fontFamily: TOKENS.fonts.mono,
            fontSize: 10,
            color: TOKENS.colors.textMuted,
          }}
        >
          {leftTitle}
        </div>
        <div style={{ flex: 1, padding: "12px 14px", overflow: "hidden" }}>
          {leftContent}
        </div>
      </div>

      {/* Right Pane */}
      <div
        style={{
          width: `${100 - dividerPosition}%`,
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0A0B0E",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: 24,
            backgroundColor: "rgba(255, 255, 255, 0.02)",
            borderBottom: `1px solid ${TOKENS.colors.borderSubtle}`,
            padding: "0 10px",
            display: "flex",
            alignItems: "center",
            fontFamily: TOKENS.fonts.mono,
            fontSize: 10,
            color: TOKENS.colors.textMuted,
          }}
        >
          {rightTitle}
        </div>
        <div style={{ flex: 1, padding: "12px 14px", overflow: "hidden" }}>
          {rightContent}
        </div>
      </div>
    </div>
  );
};

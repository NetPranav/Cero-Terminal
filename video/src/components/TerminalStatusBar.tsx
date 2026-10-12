import React from "react";
import { TOKENS } from "../styles/tokens";

interface TerminalStatusBarProps {
  shell?: string;
  cwd?: string;
  aiStatus?: string;
  isAiActive?: boolean;
  cpu?: string;
  ram?: string;
  showVisualModeButtons?: boolean;
}

export const TerminalStatusBar: React.FC<TerminalStatusBarProps> = ({
  shell = "bash",
  cwd = "~/projects/sentinal",
  aiStatus = "AI: Ready (Qwen 3B)",
  isAiActive = true,
  cpu = "14%",
  ram = "1.2 GB",
  showVisualModeButtons = true,
}) => {
  return (
    <div
      style={{
        height: 30,
        backgroundColor: TOKENS.colors.surfaceStatus,
        borderTop: `1px solid ${TOKENS.colors.borderSubtle}`,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 14px",
        fontFamily: TOKENS.fonts.mono,
        fontSize: 11,
        color: TOKENS.colors.textMuted,
        userSelect: "none",
        flexShrink: 0,
      }}
    >
      {/* Left cluster */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            color: TOKENS.colors.textPrimary,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span>❯_</span>
          <span>{shell}</span>
        </span>
        <span style={{ color: TOKENS.colors.borderActive }}>|</span>
        <span style={{ color: TOKENS.colors.textSecondary }}>{cwd}</span>
      </div>

      {/* Right cluster */}
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {showVisualModeButtons && (
          <div style={{ display: "flex", gap: 6, marginRight: 6 }}>
            <span
              style={{
                backgroundColor: TOKENS.colors.surfacePill,
                border: `1px solid ${TOKENS.colors.borderSubtle}`,
                padding: "1px 6px",
                borderRadius: 3,
                fontSize: 10,
                color: TOKENS.colors.textSecondary,
              }}
            >
              [Projects]
            </span>
            <span
              style={{
                backgroundColor: TOKENS.colors.surfacePill,
                border: `1px solid ${TOKENS.colors.borderSubtle}`,
                padding: "1px 6px",
                borderRadius: 3,
                fontSize: 10,
                color: TOKENS.colors.textSecondary,
              }}
            >
              [Ports]
            </span>
            <span
              style={{
                backgroundColor: TOKENS.colors.surfacePill,
                border: `1px solid ${TOKENS.colors.borderSubtle}`,
                padding: "1px 6px",
                borderRadius: 3,
                fontSize: 10,
                color: TOKENS.colors.textSecondary,
              }}
            >
              [Workflows]
            </span>
          </div>
        )}

        {/* AI status pill */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 5,
            padding: "2px 8px",
            borderRadius: 10,
            backgroundColor: isAiActive
              ? "rgba(255, 255, 255, 0.08)"
              : "rgba(255, 255, 255, 0.03)",
            border: `1px solid ${
              isAiActive ? TOKENS.colors.borderInteractive : TOKENS.colors.borderSubtle
            }`,
            color: isAiActive
              ? TOKENS.colors.textPrimary
              : TOKENS.colors.textMuted,
            fontSize: 10,
            fontWeight: 500,
          }}
        >
          <span
            style={{
              width: 5,
              height: 5,
              borderRadius: "50%",
              backgroundColor: isAiActive
                ? TOKENS.colors.textPrimary
                : TOKENS.colors.textSubtle,
              boxShadow: isAiActive ? "0 0 6px rgba(255, 255, 255, 0.8)" : "none",
            }}
          />
          <span>{aiStatus}</span>
        </div>

        {/* Telemetry */}
        <span style={{ fontVariantNumeric: "tabular-nums" }}>CPU {cpu}</span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>{ram}</span>
        <span style={{ color: TOKENS.colors.textSubtle }}>UTF-8</span>
      </div>
    </div>
  );
};

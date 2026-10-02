import React from "react";
import { TOKENS } from "../styles/tokens";
import { TerminalStatusBar } from "./TerminalStatusBar";

interface TerminalWindowProps {
  title?: string;
  tabs?: { id: string; name: string; active?: boolean }[];
  children: React.ReactNode;
  width?: number | string;
  height?: number | string;
  style?: React.CSSProperties;
  showStatusBar?: boolean;
  statusShell?: string;
  statusCwd?: string;
  statusAi?: string;
  isAiActive?: boolean;
  opacity?: number;
  scale?: number;
}

export const TerminalWindow: React.FC<TerminalWindowProps> = ({
  title = "sentinel",
  tabs = [
    { id: "1", name: "terminal — bash", active: true },
    { id: "2", name: "logs", active: false },
  ],
  children,
  width = "100%",
  height = "100%",
  style = {},
  showStatusBar = true,
  statusShell = "bash",
  statusCwd = "~/projects/sentinal",
  statusAi = "AI: Ready (Qwen 3B)",
  isAiActive = true,
  opacity = 1,
  scale = 1,
}) => {
  return (
    <div
      style={{
        width,
        height,
        backgroundColor: TOKENS.colors.surfaceApp,
        border: `1px solid ${TOKENS.colors.borderCard}`,
        borderRadius: 10,
        boxShadow: "0 24px 70px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.04)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        opacity,
        scale,
        ...style,
      }}
    >
      {/* Top chrome / Tab bar (36px) */}
      <div
        style={{
          height: 36,
          backgroundColor: TOKENS.colors.surfaceTabs,
          borderBottom: `1px solid ${TOKENS.colors.borderSubtle}`,
          display: "flex",
          alignItems: "center",
          padding: "0 14px",
          gap: 16,
          userSelect: "none",
          flexShrink: 0,
        }}
      >
        {/* Grayscale traffic light dots */}
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: "rgba(255, 255, 255, 0.22)",
            }}
          />
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: "rgba(255, 255, 255, 0.14)",
            }}
          />
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: "50%",
              backgroundColor: "rgba(255, 255, 255, 0.14)",
            }}
          />
        </div>

        {/* Tab pills */}
        <div style={{ display: "flex", gap: 6, flex: 1, alignItems: "center" }}>
          {tabs.map((tab) => (
            <div
              key={tab.id}
              style={{
                padding: "3px 12px",
                borderRadius: 4,
                fontSize: 11,
                fontFamily: TOKENS.fonts.sans,
                color: tab.active
                  ? TOKENS.colors.textPrimary
                  : TOKENS.colors.textMuted,
                backgroundColor: tab.active
                  ? "rgba(255, 255, 255, 0.08)"
                  : "transparent",
                border: tab.active
                  ? `1px solid ${TOKENS.colors.borderInteractive}`
                  : "1px solid transparent",
                fontWeight: tab.active ? 500 : 400,
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <span>{tab.name}</span>
            </div>
          ))}
          <span
            style={{
              color: TOKENS.colors.textSubtle,
              fontSize: 14,
              padding: "0 4px",
            }}
          >
            +
          </span>
        </div>

        {/* Center / Right subtle branding */}
        <div
          style={{
            fontFamily: TOKENS.fonts.sans,
            fontSize: 10,
            letterSpacing: "0.1em",
            fontWeight: 600,
            color: TOKENS.colors.textSubtle,
            textTransform: "uppercase",
          }}
        >
          {title}
        </div>
      </div>

      {/* Main Terminal Buffer / Content Area */}
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#0C0D12",
        }}
      >
        {children}
      </div>

      {/* Persistent Status Bar */}
      {showStatusBar && (
        <TerminalStatusBar
          shell={statusShell}
          cwd={statusCwd}
          aiStatus={statusAi}
          isAiActive={isAiActive}
        />
      )}
    </div>
  );
};

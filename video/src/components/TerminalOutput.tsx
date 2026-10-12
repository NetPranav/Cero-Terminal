import React from "react";
import { TOKENS } from "../styles/tokens";

export interface OutputLine {
  text: string;
  type?: "default" | "error" | "success" | "warning" | "muted" | "highlight" | "command";
  prefix?: string;
  delayFrames?: number; // relative frame to appear
}

interface TerminalOutputProps {
  lines: OutputLine[];
  currentRelativeFrame: number;
  fontSize?: number;
}

export const TerminalOutput: React.FC<TerminalOutputProps> = ({
  lines,
  currentRelativeFrame,
  fontSize = 14,
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        fontFamily: TOKENS.fonts.mono,
        fontSize,
        lineHeight: 1.45,
      }}
    >
      {lines.map((line, idx) => {
        const lineDelay = line.delayFrames ?? idx * 6;
        if (currentRelativeFrame < lineDelay) {
          return null;
        }

        let textColor = TOKENS.colors.textSecondary;
        let fontWeight = 400;
        let bg = "transparent";

        if (line.type === "error") {
          textColor = TOKENS.colors.statusError;
          fontWeight = 500;
        } else if (line.type === "success") {
          textColor = TOKENS.colors.statusSuccess;
          fontWeight = 500;
        } else if (line.type === "warning") {
          textColor = TOKENS.colors.statusWarning;
          fontWeight = 500;
        } else if (line.type === "muted") {
          textColor = TOKENS.colors.textMuted;
        } else if (line.type === "highlight") {
          textColor = TOKENS.colors.textPrimary;
          fontWeight = 600;
          bg = "rgba(255, 255, 255, 0.06)";
        } else if (line.type === "command") {
          textColor = TOKENS.colors.textPrimary;
          fontWeight = 500;
        }

        return (
          <div
            key={idx}
            style={{
              color: textColor,
              fontWeight,
              backgroundColor: bg,
              padding: bg !== "transparent" ? "2px 6px" : 0,
              borderRadius: 3,
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {line.prefix && (
              <span
                style={{
                  color: TOKENS.colors.textSubtle,
                  userSelect: "none",
                  flexShrink: 0,
                }}
              >
                {line.prefix}
              </span>
            )}
            <span>{line.text}</span>
          </div>
        );
      })}
    </div>
  );
};

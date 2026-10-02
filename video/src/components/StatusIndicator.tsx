import React from "react";
import { interpolate, useCurrentFrame } from "remotion";
import { TOKENS } from "../styles/tokens";

interface StatusIndicatorProps {
  status: string;
  variant?: "neutral" | "active" | "error" | "success" | "warning";
  subtext?: string;
  progressPercent?: number;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  status,
  variant = "active",
  subtext,
  progressPercent,
}) => {
  const frame = useCurrentFrame();

  const pulse = interpolate(frame % 45, [0, 22, 45], [0.5, 1, 0.5], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  let dotColor = TOKENS.colors.textPrimary;
  let borderColor = TOKENS.colors.borderInteractive;
  let bg = "rgba(255, 255, 255, 0.05)";

  if (variant === "error") {
    dotColor = TOKENS.colors.statusError;
    borderColor = "rgba(248, 113, 113, 0.35)";
    bg = "rgba(248, 113, 113, 0.08)";
  } else if (variant === "success") {
    dotColor = TOKENS.colors.statusSuccess;
    borderColor = "rgba(134, 239, 172, 0.35)";
    bg = "rgba(134, 239, 172, 0.08)";
  } else if (variant === "warning") {
    dotColor = TOKENS.colors.statusWarning;
    borderColor = "rgba(253, 224, 71, 0.35)";
    bg = "rgba(253, 224, 71, 0.08)";
  } else if (variant === "neutral") {
    dotColor = TOKENS.colors.textMuted;
    borderColor = TOKENS.colors.borderSubtle;
    bg = "rgba(255, 255, 255, 0.02)";
  }

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 14px",
        borderRadius: 6,
        backgroundColor: bg,
        border: `1px solid ${borderColor}`,
        fontFamily: TOKENS.fonts.mono,
        fontSize: 12,
        letterSpacing: "0.04em",
        color: TOKENS.colors.textPrimary,
        backdropFilter: "blur(12px)",
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          backgroundColor: dotColor,
          opacity: variant === "active" ? pulse : 1,
          boxShadow: `0 0 8px ${dotColor}`,
        }}
      />
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontWeight: 600, textTransform: "uppercase" }}>
          {status}
        </span>
        {subtext && (
          <span style={{ fontSize: 10, color: TOKENS.colors.textMuted }}>
            {subtext}
          </span>
        )}
      </div>

      {progressPercent !== undefined && (
        <span
          style={{
            marginLeft: 8,
            fontSize: 11,
            color: TOKENS.colors.textSecondary,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {Math.round(progressPercent)}%
        </span>
      )}
    </div>
  );
};

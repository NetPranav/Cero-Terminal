import React from "react";
import { useCurrentFrame } from "remotion";
import { TOKENS } from "../styles/tokens";

interface TerminalCursorProps {
  blinkRate?: number; // frames per half cycle
  width?: number;
  height?: number;
  color?: string;
}

export const TerminalCursor: React.FC<TerminalCursorProps> = ({
  blinkRate = 14,
  width = 9,
  height = 18,
  color = TOKENS.colors.textPrimary,
}) => {
  const frame = useCurrentFrame();
  const isVisible = Math.floor(frame / blinkRate) % 2 === 0;

  return (
    <span
      style={{
        display: "inline-block",
        width,
        height,
        backgroundColor: color,
        opacity: isVisible ? 0.95 : 0,
        verticalAlign: "text-bottom",
        marginLeft: 2,
        borderRadius: 1,
      }}
    />
  );
};

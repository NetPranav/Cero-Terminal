import React from "react";
import { useCurrentFrame } from "remotion";
import { TOKENS } from "../styles/tokens";
import { TerminalCursor } from "./TerminalCursor";

interface TerminalPromptProps {
  prefix?: string;
  command: string;
  startFrame?: number;
  charsPerFrame?: number;
  isAiPrompt?: boolean;
  showCursor?: boolean;
  color?: string;
  fontSize?: number;
}

export const TerminalPrompt: React.FC<TerminalPromptProps> = ({
  prefix = "~/projects/sentinal ❯",
  command,
  startFrame = 0,
  charsPerFrame = 0.7,
  isAiPrompt = false,
  showCursor = true,
  color = TOKENS.colors.textPrimary,
  fontSize = 15,
}) => {
  const frame = useCurrentFrame();
  const relativeFrame = Math.max(0, frame - startFrame);

  const totalChars = command.length;
  const typedCount = Math.min(
    totalChars,
    Math.floor(relativeFrame * charsPerFrame)
  );
  const displayedCommand = command.slice(0, typedCount);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        fontFamily: TOKENS.fonts.mono,
        fontSize,
        lineHeight: 1.5,
        color,
        letterSpacing: "-0.01em",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
      }}
    >
      {prefix && (
        <span
          style={{
            color: isAiPrompt ? TOKENS.colors.textPrimary : TOKENS.colors.textMuted,
            marginRight: 10,
            userSelect: "none",
            fontWeight: isAiPrompt ? 600 : 400,
          }}
        >
          {prefix}
        </span>
      )}
      <span
        style={{
          color: isAiPrompt ? TOKENS.colors.textPrimary : TOKENS.colors.textSecondary,
          fontWeight: isAiPrompt ? 500 : 400,
        }}
      >
        {displayedCommand}
      </span>
      {showCursor && (
        <TerminalCursor
          color={isAiPrompt ? TOKENS.colors.textPrimary : TOKENS.colors.textMuted}
          height={fontSize * 1.15}
          width={fontSize * 0.55}
        />
      )}
    </div>
  );
};

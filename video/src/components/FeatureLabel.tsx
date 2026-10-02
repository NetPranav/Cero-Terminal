import React from "react";
import { TOKENS } from "../styles/tokens";

interface FeatureLabelProps {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center" | "right";
  opacity?: number;
  translateY?: number;
}

export const FeatureLabel: React.FC<FeatureLabelProps> = ({
  eyebrow,
  title,
  description,
  align = "left",
  opacity = 1,
  translateY = 0,
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        textAlign: align,
        alignItems:
          align === "center"
            ? "center"
            : align === "right"
            ? "flex-end"
            : "flex-start",
        opacity,
        transform: `translateY(${translateY}px)`,
        pointerEvents: "none",
      }}
    >
      {eyebrow && (
        <span
          style={{
            fontFamily: TOKENS.fonts.mono,
            fontSize: 11,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: TOKENS.colors.textMuted,
            fontWeight: 500,
          }}
        >
          {eyebrow}
        </span>
      )}
      <h2
        style={{
          margin: 0,
          fontFamily: TOKENS.fonts.sans,
          fontSize: 28,
          fontWeight: 600,
          letterSpacing: "-0.02em",
          color: TOKENS.colors.textPrimary,
          lineHeight: 1.2,
        }}
      >
        {title}
      </h2>
      {description && (
        <p
          style={{
            margin: 0,
            fontFamily: TOKENS.fonts.sans,
            fontSize: 15,
            fontWeight: 400,
            color: TOKENS.colors.textSecondary,
            lineHeight: 1.45,
            maxWidth: 580,
          }}
        >
          {description}
        </p>
      )}
    </div>
  );
};

import React from "react";
import { TOKENS } from "../styles/tokens";
import { CeroLogo } from "./CeroLogo";

interface CeroClosingHeroProps {
  opacity?: number;
  scale?: number;
}

export const CeroClosingHero: React.FC<CeroClosingHeroProps> = ({
  opacity = 1,
  scale = 1,
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 16,
        opacity,
        transform: `scale(${scale})`,
        fontFamily: TOKENS.fonts.sans,
        zIndex: 50,
      }}
    >
      {/* Real CERO Logo mark */}
      <CeroLogo size={76} opacity={opacity} />

      {/* Main Wordmark */}
      <h1
        style={{
          margin: 0,
          fontSize: 56,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          color: "#FFFFFF",
          lineHeight: 1,
        }}
      >
        CERO
      </h1>

      {/* Tagline */}
      <div
        style={{
          fontSize: 22,
          fontWeight: 400,
          color: "rgba(255, 255, 255, 0.8)",
          letterSpacing: "-0.01em",
          maxWidth: 600,
        }}
      >
        A terminal you can talk to.
      </div>

      {/* Supporting Positioning */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 400,
          color: "rgba(255, 255, 255, 0.45)",
          maxWidth: 500,
        }}
      >
        AI-native terminal and workflow automation for developers.
      </div>

      {/* Platform Badges */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginTop: 6,
          fontFamily: TOKENS.fonts.mono,
          fontSize: 11,
          letterSpacing: "0.08em",
          color: "rgba(255, 255, 255, 0.4)",
        }}
      >
        <span>MACOS</span>
        <span>•</span>
        <span>LINUX</span>
        <span>•</span>
        <span>WINDOWS</span>
      </div>

      {/* Verified GitHub URL Pill */}
      <div
        style={{
          marginTop: 10,
          padding: "8px 20px",
          borderRadius: 6,
          backgroundColor: "rgba(255, 255, 255, 0.04)",
          border: `1px solid ${TOKENS.colors.borderInteractive}`,
          fontFamily: TOKENS.fonts.mono,
          fontSize: 13,
          color: TOKENS.colors.textPrimary,
          letterSpacing: "0.02em",
        }}
      >
        github.com/NetPranav/Sentinal-Terminal
      </div>
    </div>
  );
};

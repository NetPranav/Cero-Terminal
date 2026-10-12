import React from "react";
import { TOKENS } from "../styles/tokens";
import { CeroLogo } from "./CeroLogo";

interface ProductLockupProps {
  opacity?: number;
  scale?: number;
}

export const ProductLockup: React.FC<ProductLockupProps> = ({
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
        gap: 14,
        opacity,
        transform: `scale(${scale})`,
        fontFamily: TOKENS.fonts.sans,
      }}
    >
      {/* Genuine CERO logo from video/assets/ */}
      <CeroLogo size={56} opacity={opacity} />

      {/* Main Wordmark */}
      <h1
        style={{
          margin: 0,
          fontSize: 52,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          color: TOKENS.colors.textPrimary,
          lineHeight: 1,
        }}
      >
        CERO
      </h1>

      {/* Tagline */}
      <div
        style={{
          fontSize: 20,
          fontWeight: 400,
          color: TOKENS.colors.textSecondary,
          letterSpacing: "-0.01em",
          maxWidth: 600,
        }}
      >
        A terminal you can talk to.
      </div>

      {/* Badges / Platforms */}
      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginTop: 6,
          fontFamily: TOKENS.fonts.mono,
          fontSize: 11,
          letterSpacing: "0.08em",
          color: TOKENS.colors.textMuted,
        }}
      >
        <span>AI-NATIVE TERMINAL</span>
        <span>•</span>
        <span>MACOS</span>
        <span>•</span>
        <span>LINUX</span>
        <span>•</span>
        <span>WINDOWS</span>
      </div>

      {/* Verified GitHub URL */}
      <div
        style={{
          marginTop: 14,
          padding: "8px 18px",
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

import React from "react";
import { TOKENS } from "../styles/tokens";
import { PRODUCT } from "../data/product";

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
      {/* Brand icon / subtle typography mark */}
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 10,
          border: `1px solid ${TOKENS.colors.borderActive}`,
          backgroundColor: "rgba(255, 255, 255, 0.05)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: TOKENS.fonts.mono,
          fontSize: 22,
          fontWeight: 700,
          color: TOKENS.colors.textPrimary,
          boxShadow: "0 0 30px rgba(255, 255, 255, 0.05)",
        }}
      >
        <span>❯_</span>
      </div>

      {/* Main Wordmark */}
      <h1
        style={{
          margin: 0,
          fontSize: 54,
          fontWeight: 700,
          letterSpacing: "-0.03em",
          color: TOKENS.colors.textPrimary,
          lineHeight: 1,
        }}
      >
        {PRODUCT.wordmark}
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
        {PRODUCT.tagline}
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
        {PRODUCT.githubUrl}
      </div>
    </div>
  );
};

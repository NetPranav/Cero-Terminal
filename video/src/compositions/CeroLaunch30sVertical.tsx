import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { CeroLaunch30s } from "./CeroLaunch30s";
import { GridBackground } from "../components/GridBackground";
import { TOKENS } from "../styles/tokens";
import { CeroLogo } from "../components/CeroLogo";

export const CeroLaunch30sVertical: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill
      style={{
        backgroundColor: TOKENS.colors.canvas,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <GridBackground intensity={0.65} />

      {/* Top Header Safe Zone Pill for Vertical Mobile Feed */}
      <div
        style={{
          position: "absolute",
          top: 140,
          fontFamily: TOKENS.fonts.mono,
          fontSize: 18,
          letterSpacing: "0.14em",
          color: TOKENS.colors.textMuted,
          zIndex: 40,
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <CeroLogo size={24} />
        <span style={{ color: TOKENS.colors.textPrimary, fontWeight: 700 }}>
          CERO
        </span>
        <span>•</span>
        <span>AI-NATIVE TERMINAL</span>
      </div>

      {/* Main 16:9 Master Presentation Scaled for Vertical Mobile Viewport */}
      <div
        style={{
          width: 1920,
          height: 1080,
          transform: "scale(0.92)",
          transformOrigin: "center center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 20,
        }}
      >
        <CeroLaunch30s />
      </div>

      {/* Bottom Safe Zone Destination Card (Hides during final hero) */}
      {frame < 795 && (
        <div
          style={{
            position: "absolute",
            bottom: 160,
            fontFamily: TOKENS.fonts.mono,
            fontSize: 15,
            color: TOKENS.colors.textSecondary,
            zIndex: 40,
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "center",
          }}
        >
          <div
            style={{
              padding: "8px 22px",
              borderRadius: 6,
              backgroundColor: "rgba(255, 255, 255, 0.05)",
              border: `1px solid ${TOKENS.colors.borderInteractive}`,
              color: TOKENS.colors.textPrimary,
            }}
          >
            github.com/NetPranav/Sentinal-Terminal
          </div>
          <div style={{ fontSize: 13, color: TOKENS.colors.textMuted }}>
            macOS • Linux • Windows
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};

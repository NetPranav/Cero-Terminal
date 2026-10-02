import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { SentinelLaunch30sPremium } from "./SentinelLaunch30sPremium";
import { GridBackground } from "../components/GridBackground";
import { TOKENS } from "../styles/tokens";

export const SentinelLaunch30sPremiumVertical: React.FC = () => {
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
      <GridBackground intensity={0.7} />

      {/* Top Header Safe Zone Pill for Vertical Feed */}
      <div
        style={{
          position: "absolute",
          top: 130,
          fontFamily: TOKENS.fonts.mono,
          fontSize: 18,
          letterSpacing: "0.14em",
          color: TOKENS.colors.textMuted,
          zIndex: 40,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <span style={{ color: TOKENS.colors.textPrimary, fontWeight: 700 }}>
          SENTINEL TERMINAL
        </span>
        <span>•</span>
        <span>AI-NATIVE</span>
      </div>

      {/* Main 16:9 Presentation Scaled for Mobile Portrait Viewport */}
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
        <SentinelLaunch30sPremium />
      </div>

      {/* Bottom Safe Zone Destination Card (Active during demo beats, hides during final hero) */}
      {frame < 780 && (
        <div
          style={{
            position: "absolute",
            bottom: 160,
            fontFamily: TOKENS.fonts.mono,
            fontSize: 16,
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

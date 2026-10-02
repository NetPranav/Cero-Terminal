import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { TOKENS } from "../styles/tokens";
import { TerminalCursor } from "../components/TerminalCursor";
import { GridBackground } from "../components/GridBackground";

export const Scene01ColdOpen: React.FC = () => {
  const frame = useCurrentFrame();

  // Slow 1.0 -> 1.02 scale camera movement
  const cameraScale = interpolate(frame, [0, 135], [1.0, 1.02], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // Text 1: fades in over 12 frames starting at frame 25
  const line1Opacity = interpolate(frame, [25, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  // Text 2: slides upward 18px over 18 frames starting at frame 65
  const line2Opacity = interpolate(frame, [65, 85], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const line2TranslateY = interpolate(frame, [65, 88], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // Hairline width animation
  const hairlineScaleX = interpolate(frame, [85, 120], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: TOKENS.colors.canvas,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: `scale(${cameraScale})`,
      }}
    >
      <GridBackground intensity={0.5} />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          zIndex: 10,
        }}
      >
        {/* Isolated blinking cursor initially */}
        <div style={{ marginBottom: 12 }}>
          <TerminalCursor width={12} height={26} blinkRate={14} />
        </div>

        {/* First statement */}
        <div
          style={{
            fontFamily: TOKENS.fonts.sans,
            fontSize: 34,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            color: TOKENS.colors.textPrimary,
            opacity: line1Opacity,
            textAlign: "center",
          }}
        >
          Your terminal shouldn't fight you.
        </div>

        {/* Second statement */}
        <div
          style={{
            fontFamily: TOKENS.fonts.sans,
            fontSize: 30,
            fontWeight: 400,
            letterSpacing: "-0.01em",
            color: TOKENS.colors.textSecondary,
            opacity: line2Opacity,
            transform: `translateY(${line2TranslateY}px)`,
            textAlign: "center",
          }}
        >
          Neither should your tools.
        </div>

        {/* Precision hairline */}
        <div
          style={{
            width: 280,
            height: 1,
            backgroundColor: "rgba(255, 255, 255, 0.14)",
            marginTop: 20,
            transform: `scaleX(${hairlineScaleX})`,
            transformOrigin: "center",
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

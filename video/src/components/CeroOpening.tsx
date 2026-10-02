import React from "react";
import { interpolate, useCurrentFrame, Easing } from "remotion";
import { CeroLogo } from "./CeroLogo";
import { TOKENS } from "../styles/tokens";

interface CeroOpeningProps {
  opacity?: number;
}

export const CeroOpening: React.FC<CeroOpeningProps> = ({ opacity = 1 }) => {
  const frame = useCurrentFrame();

  // Frames 0 to 75
  const logoScale = interpolate(frame, [0, 45], [0.94, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const logoOpacity = interpolate(frame, [0, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const textOpacity = interpolate(frame, [15, 38], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const sublineOpacity = interpolate(frame, [25, 48], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Dissolve out into terminal frame between frame 58 and 75
  const sceneDissolve = interpolate(frame, [58, 74], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        opacity: opacity * sceneDissolve,
        pointerEvents: "none",
        zIndex: 50,
      }}
    >
      {/* Subtle Terminal Wireframe Geometry Background */}
      <div
        style={{
          position: "absolute",
          width: 960,
          height: 520,
          borderRadius: 12,
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow: "0 0 100px rgba(0, 0, 0, 0.9)",
          backgroundColor: "rgba(10, 11, 15, 0.4)",
          transform: `scale(${logoScale})`,
        }}
      />

      {/* Brand Identity Center Lockup */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 16,
          transform: `scale(${logoScale})`,
        }}
      >
        <CeroLogo size={88} opacity={logoOpacity} />

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 8,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontFamily: TOKENS.fonts.sans,
              fontSize: 48,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              color: "#FFFFFF",
              opacity: textOpacity,
              lineHeight: 1,
            }}
          >
            CERO
          </h1>

          <p
            style={{
              margin: 0,
              fontFamily: TOKENS.fonts.sans,
              fontSize: 19,
              fontWeight: 400,
              color: "rgba(255, 255, 255, 0.7)",
              letterSpacing: "-0.01em",
              opacity: sublineOpacity,
            }}
          >
            A terminal you can talk to.
          </p>
        </div>
      </div>
    </div>
  );
};

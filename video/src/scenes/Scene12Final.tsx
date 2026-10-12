import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { TOKENS } from "../styles/tokens";
import { GridBackground } from "../components/GridBackground";
import { ProductLockup } from "../components/ProductLockup";

export const Scene12Final: React.FC = () => {
  const frame = useCurrentFrame();

  // Entrance fade
  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Very subtle slow scale stabilization
  const scale = interpolate(frame, [0, 150], [0.98, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // Fade to black in last 20 frames
  const fadeToBlack = interpolate(frame, [185, 210], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: TOKENS.colors.canvas,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 80px",
        overflow: "hidden",
      }}
    >
      <GridBackground intensity={0.6} />

      <div style={{ zIndex: 10 }}>
        <ProductLockup opacity={opacity} scale={scale} />
      </div>

      {/* Fade to black overlay for final cut */}
      {fadeToBlack > 0 && (
        <AbsoluteFill
          style={{
            backgroundColor: "#000000",
            opacity: fadeToBlack,
            zIndex: 100,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

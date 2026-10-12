import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { TOKENS } from "../styles/tokens";

interface GridBackgroundProps {
  intensity?: number;
  highlightCenter?: boolean;
}

export const GridBackground: React.FC<GridBackgroundProps> = ({
  intensity = 1,
  highlightCenter = true,
}) => {
  const frame = useCurrentFrame();

  const glowOpacity = interpolate(
    frame % 120,
    [0, 60, 120],
    [0.03 * intensity, 0.06 * intensity, 0.03 * intensity],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill
      style={{
        backgroundColor: TOKENS.colors.canvas,
        overflow: "hidden",
      }}
    >
      {/* Subtle radial center light */}
      {highlightCenter && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background:
              "radial-gradient(ellipse at 50% 40%, rgba(255, 255, 255, 0.035) 0%, rgba(10, 10, 12, 0) 70%)",
            opacity: glowOpacity + 0.9,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Ultra-subtle engineering grid */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.015) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.015) 1px, transparent 1px)
          `,
          backgroundSize: "60px 60px",
          maskImage: "radial-gradient(ellipse at center, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 80%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, rgba(0,0,0,1) 30%, rgba(0,0,0,0) 80%)",
          opacity: 0.8 * intensity,
        }}
      />
    </AbsoluteFill>
  );
};

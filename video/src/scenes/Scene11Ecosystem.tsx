import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import { TOKENS } from "../styles/tokens";
import { GridBackground } from "../components/GridBackground";
import { PRODUCT } from "../data/product";
import { FeatureLabel } from "../components/FeatureLabel";

export const Scene11Ecosystem: React.FC = () => {
  const frame = useCurrentFrame();

  // 5 items across 240 frames (~48 frames each)
  const itemDuration = 48;
  const activeIndex = Math.min(4, Math.floor(frame / itemDuration));
  const activeItem = PRODUCT.scenes.ecosystemItems[activeIndex];

  // Local frame within current item
  const localFrame = frame % itemDuration;
  const enterProgress = interpolate(localFrame, [0, 12], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const exitProgress = interpolate(localFrame, [itemDuration - 8, itemDuration], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cardOpacity = Math.min(enterProgress, exitProgress);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: TOKENS.colors.canvas,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "40px 80px",
        overflow: "hidden",
      }}
    >
      <GridBackground intensity={0.5} />

      {/* Feature label */}
      <div style={{ position: "absolute", top: 60, zIndex: 20 }}>
        <FeatureLabel
          eyebrow="08 / COMPLETE CAPABILITY SYSTEM"
          title="The terminal, unified."
          description="Built for modern engineering workflows from command line to multi-machine automation."
          align="center"
        />
      </div>

      {/* Montage capability cards container */}
      <div
        style={{
          width: "100%",
          maxWidth: 900,
          marginTop: 60,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 20,
          zIndex: 10,
        }}
      >
        {/* Progress pills for the 5 capabilities */}
        <div style={{ display: "flex", gap: 8 }}>
          {PRODUCT.scenes.ecosystemItems.map((item, i) => (
            <div
              key={i}
              style={{
                width: 140,
                height: 4,
                borderRadius: 2,
                backgroundColor:
                  i === activeIndex
                    ? TOKENS.colors.textPrimary
                    : i < activeIndex
                    ? TOKENS.colors.borderActive
                    : "rgba(255, 255, 255, 0.08)",
                transition: "none",
              }}
            />
          ))}
        </div>

        {/* Active capability showcase card */}
        <div
          style={{
            width: "100%",
            backgroundColor: "rgba(16, 18, 24, 0.94)",
            border: `1px solid ${TOKENS.colors.borderFocus}`,
            borderRadius: 10,
            padding: "36px 44px",
            boxShadow: "0 24px 60px rgba(0, 0, 0, 0.8)",
            opacity: cardOpacity,
            display: "flex",
            flexDirection: "column",
            gap: 14,
            backdropFilter: "blur(20px)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: `1px solid ${TOKENS.colors.borderSubtle}`,
              paddingBottom: 10,
            }}
          >
            <span
              style={{
                fontFamily: TOKENS.fonts.mono,
                fontSize: 12,
                color: TOKENS.colors.textMuted,
                letterSpacing: "0.12em",
              }}
            >
              MODULE 0{activeIndex + 1} OF 05
            </span>
            <span
              style={{
                fontFamily: TOKENS.fonts.mono,
                fontSize: 11,
                color: TOKENS.colors.statusSuccess,
              }}
            >
              ✓ ACTIVE IN V2.1.0
            </span>
          </div>

          <div
            style={{
              fontFamily: TOKENS.fonts.sans,
              fontSize: 26,
              fontWeight: 700,
              color: TOKENS.colors.textPrimary,
              letterSpacing: "-0.01em",
            }}
          >
            {activeItem.title}
          </div>

          <div
            style={{
              fontFamily: TOKENS.fonts.sans,
              fontSize: 15,
              color: TOKENS.colors.textSecondary,
              lineHeight: 1.4,
            }}
          >
            {activeItem.subtitle}
          </div>

          <div
            style={{
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              border: `1px solid ${TOKENS.colors.borderSubtle}`,
              borderRadius: 6,
              padding: "14px 18px",
              fontFamily: TOKENS.fonts.mono,
              fontSize: 14,
              color: TOKENS.colors.textPrimary,
              marginTop: 6,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <span style={{ color: TOKENS.colors.textSubtle }}>❯</span>
            <span>{activeItem.code}</span>
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

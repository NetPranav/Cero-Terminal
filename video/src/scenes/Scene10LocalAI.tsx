import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { TOKENS } from "../styles/tokens";
import { GridBackground } from "../components/GridBackground";
import { FeatureLabel } from "../components/FeatureLabel";

export const Scene10LocalAI: React.FC = () => {
  const frame = useCurrentFrame();

  const perimeterOpacity = interpolate(frame, [5, 25], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const perimeterScale = interpolate(frame, [5, 30], [0.97, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  const node1Opacity = interpolate(frame, [15, 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const node2Opacity = interpolate(frame, [30, 45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const node3Opacity = interpolate(frame, [45, 60], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const node4Opacity = interpolate(frame, [60, 75], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

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
      <GridBackground intensity={0.6} />

      {/* Feature label */}
      <div style={{ position: "absolute", top: 60, zIndex: 20 }}>
        <FeatureLabel
          eyebrow="07 / ARCHITECTURE & PRIVACY"
          title="Your terminal. Your context. Your machine."
          description="Runs on your own computer with embedded inference (Qwen2.5-Coder 3B on llama.cpp) or Ollama. Zero account required."
          align="center"
        />
      </div>

      {/* Architecture diagram bounded by local machine perimeter */}
      <div
        style={{
          width: "100%",
          maxWidth: 960,
          marginTop: 80,
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          zIndex: 10,
        }}
      >
        {/* Local machine boundary box */}
        <div
          style={{
            width: "100%",
            border: `1px dashed ${TOKENS.colors.borderFocus}`,
            borderRadius: 12,
            backgroundColor: "rgba(16, 18, 24, 0.7)",
            backdropFilter: "blur(16px)",
            padding: "36px 40px",
            boxShadow: "0 24px 70px rgba(0, 0, 0, 0.8)",
            opacity: perimeterOpacity,
            transform: `scale(${perimeterScale})`,
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          {/* Header pill */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              borderBottom: `1px solid ${TOKENS.colors.borderSubtle}`,
              paddingBottom: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: TOKENS.colors.statusSuccess,
                  boxShadow: "0 0 10px rgba(134, 239, 172, 0.7)",
                }}
              />
              <span
                style={{
                  fontFamily: TOKENS.fonts.mono,
                  fontSize: 12,
                  fontWeight: 600,
                  color: TOKENS.colors.textPrimary,
                  letterSpacing: "0.08em",
                }}
              >
                LOCAL MACHINE PERIMETER (OFFLINE ISOLATION)
              </span>
            </div>
            <span
              style={{
                fontFamily: TOKENS.fonts.mono,
                fontSize: 11,
                color: TOKENS.colors.textMuted,
              }}
            >
              Zero telemetry • Token masking
            </span>
          </div>

          {/* Node progression: USER -> SENTINEL -> LOCAL AI -> TERMINAL PTY */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr auto 1fr auto 1fr",
              alignItems: "center",
              gap: 12,
              fontFamily: TOKENS.fonts.mono,
            }}
          >
            {/* Node 1: Developer */}
            <div
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.04)",
                border: `1px solid ${TOKENS.colors.borderInteractive}`,
                borderRadius: 8,
                padding: "20px 14px",
                textAlign: "center",
                opacity: node1Opacity,
              }}
            >
              <div style={{ fontSize: 11, color: TOKENS.colors.textMuted }}>ORIGIN</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#FFF", marginTop: 4 }}>
                DEVELOPER
              </div>
              <div style={{ fontSize: 10, color: TOKENS.colors.textSubtle, marginTop: 4 }}>
                Plain language intent
              </div>
            </div>

            <span style={{ color: TOKENS.colors.borderFocus, fontSize: 18 }}>→</span>

            {/* Node 2: Sentinel Core */}
            <div
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                border: `1px solid ${TOKENS.colors.borderActive}`,
                borderRadius: 8,
                padding: "20px 14px",
                textAlign: "center",
                opacity: node2Opacity,
              }}
            >
              <div style={{ fontSize: 11, color: TOKENS.colors.textMuted }}>COORDINATOR</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#FFF", marginTop: 4 }}>
                SENTINEL CORE
              </div>
              <div style={{ fontSize: 10, color: TOKENS.colors.textSubtle, marginTop: 4 }}>
                Safety & AST Router
              </div>
            </div>

            <span style={{ color: TOKENS.colors.borderFocus, fontSize: 18 }}>→</span>

            {/* Node 3: Local AI Engine */}
            <div
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.08)",
                border: `1px solid ${TOKENS.colors.borderActive}`,
                borderRadius: 8,
                padding: "20px 14px",
                textAlign: "center",
                opacity: node3Opacity,
                boxShadow: "0 0 20px rgba(255, 255, 255, 0.04)",
              }}
            >
              <div style={{ fontSize: 11, color: TOKENS.colors.statusSuccess }}>
                ● EMBEDDED
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#FFF", marginTop: 4 }}>
                QWEN 2.5 3B
              </div>
              <div style={{ fontSize: 10, color: TOKENS.colors.textMuted, marginTop: 4 }}>
                llama.cpp / Ollama
              </div>
            </div>

            <span style={{ color: TOKENS.colors.borderFocus, fontSize: 18 }}>→</span>

            {/* Node 4: Rust PTY */}
            <div
              style={{
                backgroundColor: "rgba(255, 255, 255, 0.04)",
                border: `1px solid ${TOKENS.colors.borderInteractive}`,
                borderRadius: 8,
                padding: "20px 14px",
                textAlign: "center",
                opacity: node4Opacity,
              }}
            >
              <div style={{ fontSize: 11, color: TOKENS.colors.textMuted }}>TARGET</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#FFF", marginTop: 4 }}>
                RUST PTY
              </div>
              <div style={{ fontSize: 10, color: TOKENS.colors.textSubtle, marginTop: 4 }}>
                Native OS shell execution
              </div>
            </div>
          </div>

          <div
            style={{
              fontSize: 11,
              fontFamily: TOKENS.fonts.mono,
              color: TOKENS.colors.textMuted,
              textAlign: "center",
              borderTop: `1px solid ${TOKENS.colors.borderSubtle}`,
              paddingTop: 10,
            }}
          >
            Credential masking filters API tokens and SSH private keys before inference.
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

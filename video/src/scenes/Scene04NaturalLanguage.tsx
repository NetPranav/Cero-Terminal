import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { TOKENS } from "../styles/tokens";
import { GridBackground } from "../components/GridBackground";
import { TerminalWindow } from "../components/TerminalWindow";
import { TerminalPrompt } from "../components/TerminalPrompt";
import { StatusIndicator } from "../components/StatusIndicator";
import { FeatureLabel } from "../components/FeatureLabel";

export const Scene04NaturalLanguage: React.FC = () => {
  const frame = useCurrentFrame();

  // Status progression
  let statusState = "STANDBY";
  let statusVariant: "neutral" | "active" | "success" = "neutral";
  let statusSubtext = "";

  if (frame >= 45 && frame < 80) {
    statusState = "ANALYZING INTENT";
    statusVariant = "active";
    statusSubtext = "Local Qwen parser";
  } else if (frame >= 80 && frame < 115) {
    statusState = "INSPECTING SYSTEM (RECIPE)";
    statusVariant = "active";
    statusSubtext = "Zero-cloud roundtrip";
  } else if (frame >= 115) {
    statusState = "PORT IDENTIFIED";
    statusVariant = "success";
    statusSubtext = "PID 4190 (node)";
  }

  // Camera scale bridge at the very end
  const cameraScale = interpolate(frame, [180, 210], [1.0, 1.08], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
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
        transform: `scale(${cameraScale})`,
        overflow: "hidden",
      }}
    >
      <GridBackground intensity={0.5} />

      {/* Top Feature Label */}
      <div style={{ position: "absolute", top: 60, zIndex: 20 }}>
        <FeatureLabel
          eyebrow="01 / NATURAL LANGUAGE INTERACTION"
          title="Describe the task."
          description="Type > to ask anything in plain language. Sentinel translates intent into native execution."
          align="center"
        />
      </div>

      {/* Terminal Window */}
      <div
        style={{
          width: "100%",
          maxWidth: 1100,
          height: 520,
          marginTop: 70,
          zIndex: 10,
        }}
      >
        <TerminalWindow
          title="SENTINEL TERMINAL — ACTIVE SESSION"
          tabs={[{ id: "1", name: "terminal — bash", active: true }]}
          statusShell="bash"
          statusCwd="~/projects/sentinal"
          statusAi="AI: Ready (Local 3B)"
        >
          <div style={{ padding: 26, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Prompt with typed natural language command */}
            <TerminalPrompt
              prefix="~/projects/sentinal ❯"
              command=">find what is using port 3000"
              startFrame={5}
              charsPerFrame={0.85}
              isAiPrompt={true}
              fontSize={16}
            />

            {/* AI Status line appearing when typing finishes */}
            {frame >= 45 && (
              <div style={{ marginTop: 8 }}>
                <StatusIndicator
                  status={statusState}
                  variant={statusVariant}
                  subtext={statusSubtext}
                  progressPercent={
                    frame >= 80 && frame < 115
                      ? ((frame - 80) / 35) * 100
                      : frame >= 115
                      ? 100
                      : undefined
                  }
                />
              </div>
            )}

            {/* Formatted Result Panel */}
            {frame >= 115 && (
              <div
                style={{
                  marginTop: 12,
                  backgroundColor: "rgba(255, 255, 255, 0.03)",
                  border: `1px solid ${TOKENS.colors.borderCard}`,
                  borderRadius: 6,
                  padding: "16px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  fontFamily: TOKENS.fonts.mono,
                  maxWidth: 620,
                  boxShadow: "0 10px 30px rgba(0,0,0,0.5)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    borderBottom: `1px solid ${TOKENS.colors.borderSubtle}`,
                    paddingBottom: 8,
                    fontSize: 11,
                    color: TOKENS.colors.textMuted,
                  }}
                >
                  <span>TARGET INSPECTION</span>
                  <span style={{ color: TOKENS.colors.statusSuccess }}>
                    ✓ MATCH FOUND
                  </span>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr 1fr",
                    gap: 12,
                    fontSize: 14,
                    color: TOKENS.colors.textPrimary,
                    padding: "6px 0",
                  }}
                >
                  <div>
                    <span style={{ fontSize: 10, color: TOKENS.colors.textMuted, display: "block" }}>
                      PORT
                    </span>
                    <strong style={{ fontSize: 18, color: "#FFFFFF" }}>3000</strong>
                  </div>
                  <div>
                    <span style={{ fontSize: 10, color: TOKENS.colors.textMuted, display: "block" }}>
                      PID
                    </span>
                    <strong style={{ fontSize: 18, color: TOKENS.colors.textSecondary }}>
                      4190
                    </strong>
                  </div>
                  <div>
                    <span style={{ fontSize: 10, color: TOKENS.colors.textMuted, display: "block" }}>
                      PROCESS
                    </span>
                    <strong style={{ fontSize: 18, color: TOKENS.colors.textSecondary }}>
                      node
                    </strong>
                  </div>
                </div>

                <div
                  style={{
                    fontSize: 12,
                    color: TOKENS.colors.textSecondary,
                    borderTop: `1px solid ${TOKENS.colors.borderSubtle}`,
                    paddingTop: 8,
                  }}
                >
                  Next action: Type <code style={{ color: "#FFF" }}>&gt;close port 3000</code> to terminate safely.
                </div>
              </div>
            )}
          </div>
        </TerminalWindow>
      </div>
    </AbsoluteFill>
  );
};

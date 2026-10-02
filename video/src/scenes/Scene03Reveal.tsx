import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import { TOKENS } from "../styles/tokens";
import { GridBackground } from "../components/GridBackground";
import { TerminalWindow } from "../components/TerminalWindow";
import { TerminalPrompt } from "../components/TerminalPrompt";
import { FeatureLabel } from "../components/FeatureLabel";

export const Scene03Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Precision spring assembly
  const windowSpring = spring({
    frame,
    fps,
    config: { damping: 20, mass: 0.8, stiffness: 90 },
  });

  const headerOpacity = interpolate(frame, [15, 35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const paneOpacity = interpolate(frame, [30, 50], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const titleOpacity = interpolate(frame, [70, 95], [0, 1], {
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

      {/* Intro Headline */}
      <div
        style={{
          position: "absolute",
          top: 70,
          opacity: titleOpacity,
          zIndex: 20,
        }}
      >
        <FeatureLabel
          eyebrow="INTRODUCING"
          title="SENTINEL"
          description="An AI-native terminal for developers."
          align="center"
        />
      </div>

      {/* Sentinel Window Materialization */}
      <div
        style={{
          width: "100%",
          maxWidth: 1100,
          height: 520,
          marginTop: 60,
          opacity: headerOpacity,
          transform: `scale(${0.96 + 0.04 * windowSpring})`,
          zIndex: 10,
        }}
      >
        <TerminalWindow
          title="SENTINEL TERMINAL v2.1.0"
          tabs={[
            { id: "1", name: "terminal — bash", active: true },
            { id: "2", name: "flow: dev-setup", active: false },
          ]}
          showStatusBar={frame >= 50}
          statusShell="bash"
          statusCwd="~/projects/sentinal"
          statusAi="AI: Ready (Qwen 3B Local)"
        >
          <div
            style={{
              padding: 28,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              opacity: paneOpacity,
            }}
          >
            <div style={{ color: TOKENS.colors.textMuted, fontSize: 13, fontFamily: TOKENS.fonts.mono }}>
              Sentinel Terminal v2.1.0 (x86_64-linux-gnu / PTY connected)
            </div>
            <div style={{ color: TOKENS.colors.textSubtle, fontSize: 12, fontFamily: TOKENS.fonts.mono }}>
              Type commands normally, or start with &gt; to issue a plain language request.
            </div>

            <div style={{ marginTop: 20 }}>
              <TerminalPrompt
                prefix="~/projects/sentinal ❯"
                command="> "
                startFrame={75}
                charsPerFrame={0.3}
                isAiPrompt={true}
              />
            </div>
          </div>
        </TerminalWindow>
      </div>
    </AbsoluteFill>
  );
};

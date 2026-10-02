import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { TOKENS } from "../styles/tokens";
import { GridBackground } from "../components/GridBackground";
import { TerminalWindow } from "../components/TerminalWindow";
import { TerminalPrompt } from "../components/TerminalPrompt";
import { ProjectDiscovery } from "../components/ProjectDiscovery";
import { FeatureLabel } from "../components/FeatureLabel";

export const Scene05Context: React.FC = () => {
  const frame = useCurrentFrame();

  const selectedIndex = frame >= 95 ? 0 : 0;
  const isResolved = frame >= 120;

  // Expanding path transition at end
  const pathExpand = interpolate(frame, [155, 180], [1.0, 1.05], {
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
        transform: `scale(${pathExpand})`,
        overflow: "hidden",
      }}
    >
      <GridBackground intensity={0.5} />

      {/* Feature label */}
      <div style={{ position: "absolute", top: 60, zIndex: 20 }}>
        <FeatureLabel
          eyebrow="02 / CONTEXT AWARENESS"
          title="Find the project. Resolve the context."
          description="Sentinel indexes your repositories and workspaces so you never get lost in directory trees."
          align="center"
        />
      </div>

      {/* Terminal window */}
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
          title="SENTINEL TERMINAL — WORKSPACE RESOLVER"
          tabs={[{ id: "1", name: "terminal — zsh", active: true }]}
          statusShell="zsh"
          statusCwd={isResolved ? "~/projects/app" : "~"}
          statusAi="AI: Ready (Local)"
        >
          <div style={{ padding: 26, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Natural language request */}
            <TerminalPrompt
              prefix="~ ❯"
              command=">run my project"
              startFrame={5}
              charsPerFrame={0.9}
              isAiPrompt={true}
              fontSize={16}
            />

            {/* Scan animation feedback */}
            {frame >= 35 && frame < 65 && (
              <div
                style={{
                  fontFamily: TOKENS.fonts.mono,
                  fontSize: 12,
                  color: TOKENS.colors.textMuted,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ color: TOKENS.colors.textPrimary }}>›</span>
                <span>Searching local directories and Git repositories...</span>
              </div>
            )}

            {/* Discovered workspace selection box */}
            {frame >= 65 && (
              <div style={{ marginTop: 8 }}>
                <ProjectDiscovery
                  selectedIndex={selectedIndex}
                  resolved={isResolved}
                />
              </div>
            )}

            {/* Resolution output */}
            {isResolved && (
              <div
                style={{
                  marginTop: 6,
                  fontFamily: TOKENS.fonts.mono,
                  fontSize: 13,
                  color: TOKENS.colors.textSecondary,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div>
                  <span style={{ color: TOKENS.colors.textSubtle }}>❯</span> cd ~/projects/app
                </div>
                <div style={{ color: TOKENS.colors.statusSuccess }}>
                  ✓ Environment initialized (Node v20.12.0 / npm 10.5.0)
                </div>
              </div>
            )}
          </div>
        </TerminalWindow>
      </div>
    </AbsoluteFill>
  );
};

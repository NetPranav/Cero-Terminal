import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { TOKENS } from "../styles/tokens";
import { GridBackground } from "../components/GridBackground";
import { TerminalWindow } from "../components/TerminalWindow";
import { SplitTerminal } from "../components/SplitTerminal";
import { FeatureLabel } from "../components/FeatureLabel";

export const Scene08Workspace: React.FC = () => {
  const frame = useCurrentFrame();

  // Split divider moves into position smoothly
  const dividerPosition = interpolate(frame, [0, 45], [100, 52], {
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
        overflow: "hidden",
      }}
    >
      <GridBackground intensity={0.5} />

      {/* Feature Label */}
      <div style={{ position: "absolute", top: 60, zIndex: 20 }}>
        <FeatureLabel
          eyebrow="05 / DEVELOPER WORKSPACE"
          title="A serious terminal for serious engineering."
          description="High-performance xterm.js WebGL canvas with binary split panes, tab management, and real PTY concurrency."
          align="center"
        />
      </div>

      {/* Terminal window with split panes */}
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
          title="SENTINEL TERMINAL — MULTI-PANE WORKSPACE"
          tabs={[
            { id: "1", name: "terminal — split (2)", active: true },
            { id: "2", name: "logs", active: false },
          ]}
          statusShell="bash"
          statusCwd="~/projects/sentinal"
          statusAi="AI: Ready"
          showStatusBar={true}
        >
          <SplitTerminal
            leftTitle="pane 1 — server (Vite)"
            rightTitle="pane 2 — system telemetry & resources"
            dividerPosition={dividerPosition}
            leftContent={
              <div
                style={{
                  fontFamily: TOKENS.fonts.mono,
                  fontSize: 12,
                  color: TOKENS.colors.textSecondary,
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  lineHeight: 1.4,
                }}
              >
                <div style={{ color: TOKENS.colors.textPrimary }}>
                  ➜ [vite] dev server running at:
                </div>
                <div style={{ color: TOKENS.colors.statusSuccess }}>
                  ➜ Local: http://localhost:5173/
                </div>
                <div style={{ color: TOKENS.colors.textMuted }}>
                  ➜ Network: use --host to expose
                </div>
                <div style={{ color: TOKENS.colors.textSubtle, marginTop: 10 }}>
                  [ready in 182ms] watching for file changes...
                </div>
                <div style={{ color: TOKENS.colors.textSecondary, marginTop: 6 }}>
                  [hmr] update /src/ui/components/StatusBar.tsx
                </div>
              </div>
            }
            rightContent={
              <div
                style={{
                  fontFamily: TOKENS.fonts.mono,
                  fontSize: 11,
                  color: TOKENS.colors.textMuted,
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ color: TOKENS.colors.textPrimary, fontWeight: 600 }}>
                  PROCESS TABLE & PTY TELEMETRY:
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "60px 100px 70px 70px",
                    gap: 6,
                    borderBottom: `1px solid ${TOKENS.colors.borderSubtle}`,
                    paddingBottom: 4,
                  }}
                >
                  <span>PID</span>
                  <span>COMMAND</span>
                  <span>CPU%</span>
                  <span>MEM</span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "60px 100px 70px 70px",
                    gap: 6,
                    color: TOKENS.colors.textPrimary,
                  }}
                >
                  <span>4190</span>
                  <span>node</span>
                  <span style={{ color: TOKENS.colors.statusSuccess }}>4.2%</span>
                  <span>142M</span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "60px 100px 70px 70px",
                    gap: 6,
                    color: TOKENS.colors.textSecondary,
                  }}
                >
                  <span>1082</span>
                  <span>llama-server</span>
                  <span>1.1%</span>
                  <span>1.8G</span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "60px 100px 70px 70px",
                    gap: 6,
                    color: TOKENS.colors.textMuted,
                  }}
                >
                  <span>7821</span>
                  <span>sentinel-pty</span>
                  <span>0.3%</span>
                  <span>45M</span>
                </div>
              </div>
            }
          />
        </TerminalWindow>
      </div>
    </AbsoluteFill>
  );
};

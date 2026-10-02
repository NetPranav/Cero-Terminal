import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { TOKENS } from "../styles/tokens";
import { GridBackground } from "../components/GridBackground";
import { TerminalWindow } from "../components/TerminalWindow";
import { TerminalPrompt } from "../components/TerminalPrompt";
import { TerminalOutput, OutputLine } from "../components/TerminalOutput";
import { StatusIndicator } from "../components/StatusIndicator";
import { FeatureLabel } from "../components/FeatureLabel";

export const Scene06SelfHealing: React.FC = () => {
  const frame = useCurrentFrame();

  const outputLines: OutputLine[] = [
    { text: "$ npm run dev", type: "command", prefix: "❯", delayFrames: 25 },
    { text: "> vite dev --port 3000", type: "muted", delayFrames: 35 },
    { text: "Error: Port 3000 is already in use (EADDRINUSE)", type: "error", delayFrames: 45 },
  ];

  // Self healing status states
  let healStatus = "FAILURE DETECTED";
  let healVariant: "error" | "warning" | "active" | "success" = "error";
  let healSubtext = "Inspecting terminal error stream";

  if (frame >= 75 && frame < 105) {
    healStatus = "CLASSIFYING ERROR";
    healVariant = "active";
    healSubtext = "Rule: PortConflictDetector";
  } else if (frame >= 105 && frame < 140) {
    healStatus = "RECOVERABLE CONFLICT";
    healVariant = "warning";
    healSubtext = "Remedy: Free port 3000 (PID 4190)";
  } else if (frame >= 140 && frame < 175) {
    healStatus = "EXECUTING REMEDIATION";
    healVariant = "active";
    healSubtext = "Closing port 3000 & restarting dev server";
  } else if (frame >= 175) {
    healStatus = "SERVER RUNNING";
    healVariant = "success";
    healSubtext = "http://localhost:3000 (Vite v5.2)";
  }

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

      {/* Feature Label */}
      <div style={{ position: "absolute", top: 60, zIndex: 20 }}>
        <FeatureLabel
          eyebrow="03 / SELF-HEALING & DIAGNOSTICS"
          title="Errors become part of the workflow."
          description="Sentinel intercepts actionable failures, identifies the root cause, and applies safe remediation without leaving your terminal."
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
          title="SENTINEL TERMINAL — AUTO-HEALING ENGINE"
          tabs={[{ id: "1", name: "terminal — server", active: true }]}
          statusShell="bash"
          statusCwd="~/projects/app"
          statusAi={frame >= 175 ? "AI: Auto-Recovered ✓" : "AI: Diagnosing..."}
        >
          <div style={{ padding: 26, display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Natural language invocation */}
            <TerminalPrompt
              prefix="~/projects/app ❯"
              command=">start the development server"
              startFrame={4}
              charsPerFrame={0.85}
              isAiPrompt={true}
              fontSize={15}
            />

            {/* Standard execution and error output */}
            <TerminalOutput
              lines={outputLines}
              currentRelativeFrame={frame}
              fontSize={13}
            />

            {/* Diagnostic remediation banner */}
            {frame >= 55 && (
              <div style={{ marginTop: 8 }}>
                <StatusIndicator
                  status={healStatus}
                  variant={healVariant}
                  subtext={healSubtext}
                  progressPercent={
                    frame >= 140 && frame < 175
                      ? ((frame - 140) / 35) * 100
                      : frame >= 175
                      ? 100
                      : undefined
                  }
                />
              </div>
            )}

            {/* Remediation Action Card */}
            {frame >= 115 && frame < 175 && (
              <div
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.04)",
                  border: `1px solid ${TOKENS.colors.borderCard}`,
                  borderRadius: 6,
                  padding: "12px 16px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontFamily: TOKENS.fonts.mono,
                  fontSize: 12,
                  maxWidth: 620,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: TOKENS.colors.statusWarning }}>[!]</span>
                  <span style={{ color: TOKENS.colors.textPrimary }}>
                    Identified PID 4190 listening on :3000
                  </span>
                </div>
                <span
                  style={{
                    backgroundColor: "rgba(255, 255, 255, 0.08)",
                    border: `1px solid ${TOKENS.colors.borderInteractive}`,
                    color: TOKENS.colors.textPrimary,
                    padding: "3px 8px",
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 500,
                  }}
                >
                  AUTO-RETRY WITH FREE PORT
                </span>
              </div>
            )}

            {/* Successful Recovery Resolution */}
            {frame >= 175 && (
              <div
                style={{
                  backgroundColor: "rgba(134, 239, 172, 0.05)",
                  border: `1px solid rgba(134, 239, 172, 0.25)`,
                  borderRadius: 6,
                  padding: "16px 20px",
                  display: "flex",
                  flexDirection: "column",
                  gap: 6,
                  fontFamily: TOKENS.fonts.mono,
                  fontSize: 13,
                  maxWidth: 640,
                }}
              >
                <div style={{ color: TOKENS.colors.statusSuccess, fontWeight: 600 }}>
                  ✓ Port 3000 released • Development server restarted
                </div>
                <div style={{ color: TOKENS.colors.textSecondary, fontSize: 12 }}>
                  ➜ Local: <span style={{ color: "#FFF" }}>http://localhost:3000/</span>
                </div>
                <div style={{ color: TOKENS.colors.textMuted, fontSize: 11 }}>
                  Ready in 284ms. Zero manual kill commands needed.
                </div>
              </div>
            )}
          </div>
        </TerminalWindow>
      </div>
    </AbsoluteFill>
  );
};

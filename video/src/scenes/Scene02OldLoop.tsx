import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { TOKENS } from "../styles/tokens";
import { GridBackground } from "../components/GridBackground";
import { TerminalWindow } from "../components/TerminalWindow";
import { TerminalPrompt } from "../components/TerminalPrompt";
import { TerminalOutput, OutputLine } from "../components/TerminalOutput";
import { FeatureLabel } from "../components/FeatureLabel";

export const Scene02OldLoop: React.FC = () => {
  const frame = useCurrentFrame();

  // Terminal window enter
  const termOpacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Output lines appearing sequentially
  const outputLines: OutputLine[] = [
    { text: "> starting development server...", type: "muted", delayFrames: 25 },
    { text: "Error: listen EADDRINUSE: address already in use :::3000", type: "error", delayFrames: 35 },
    { text: "    at Server.setupListenHandle [as _listen2] (node:net:1872:16)", type: "muted", delayFrames: 42 },
    { text: "$ lsof -i :3000", type: "command", prefix: "❯", delayFrames: 55 },
    { text: "COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME", type: "muted", delayFrames: 68 },
    { text: "node     4190 dev    22u  IPv6 0x1928      0t0  TCP *:3000 (LISTEN)", type: "highlight", delayFrames: 74 },
  ];

  // Browser / Doc panel enters from right at frame 85
  const docPanelTranslateX = interpolate(frame, [85, 110], [400, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });
  const docPanelOpacity = interpolate(frame, [85, 100], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Copy paste feedback
  const copiedNotification = frame > 115 && frame < 140;

  // Bottom friction text: frames 125 to 165
  const textOpacity = interpolate(frame, [125, 145], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: TOKENS.colors.canvas,
        padding: "50px 80px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        overflow: "hidden",
      }}
    >
      <GridBackground intensity={0.4} />

      <div
        style={{
          width: "100%",
          maxWidth: 1200,
          height: 600,
          position: "relative",
          display: "flex",
          gap: 24,
          alignItems: "stretch",
          opacity: termOpacity,
          zIndex: 10,
        }}
      >
        {/* Main standard terminal pane */}
        <div style={{ flex: 1, display: "flex" }}>
          <TerminalWindow
            title="legacy terminal — bash"
            tabs={[{ id: "1", name: "bash", active: true }]}
            showStatusBar={false}
          >
            <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 12 }}>
              <TerminalPrompt
                prefix="~/workspace ❯"
                command="npm run dev"
                startFrame={4}
                charsPerFrame={0.8}
              />
              <TerminalOutput
                lines={outputLines}
                currentRelativeFrame={frame}
                fontSize={13}
              />

              {frame > 130 && (
                <div style={{ marginTop: 8 }}>
                  <TerminalPrompt
                    prefix="~/workspace ❯"
                    command="kill -9 4190 && npm run dev"
                    startFrame={130}
                    charsPerFrame={1}
                  />
                </div>
              )}
            </div>
          </TerminalWindow>
        </div>

        {/* Browser / Search friction card sliding from right */}
        {frame >= 85 && (
          <div
            style={{
              width: 380,
              backgroundColor: "rgba(18, 20, 26, 0.95)",
              border: `1px solid ${TOKENS.colors.borderCard}`,
              borderRadius: 8,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              gap: 14,
              fontFamily: TOKENS.fonts.sans,
              transform: `translateX(${docPanelTranslateX}px)`,
              opacity: docPanelOpacity,
              boxShadow: "0 20px 50px rgba(0,0,0,0.8)",
              backdropFilter: "blur(16px)",
            }}
          >
            <div
              style={{
                fontSize: 11,
                fontFamily: TOKENS.fonts.mono,
                color: TOKENS.colors.textMuted,
                display: "flex",
                justifyContent: "space-between",
                borderBottom: `1px solid ${TOKENS.colors.borderSubtle}`,
                paddingBottom: 8,
              }}
            >
              <span>BROWSER SEARCH</span>
              <span>duckduckgo.com</span>
            </div>

            <div style={{ fontSize: 13, color: TOKENS.colors.textSecondary, fontWeight: 500 }}>
              "How to kill process listening on port 3000 macos linux"
            </div>

            <div
              style={{
                backgroundColor: "rgba(0,0,0,0.5)",
                border: `1px solid ${TOKENS.colors.borderSubtle}`,
                borderRadius: 4,
                padding: "10px 12px",
                fontFamily: TOKENS.fonts.mono,
                fontSize: 12,
                color: TOKENS.colors.textPrimary,
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <code>kill -9 &lt;PID&gt;</code>
              <span
                style={{
                  fontSize: 10,
                  color: copiedNotification
                    ? TOKENS.colors.statusSuccess
                    : TOKENS.colors.textMuted,
                  border: `1px solid ${
                    copiedNotification
                      ? TOKENS.colors.statusSuccess
                      : TOKENS.colors.borderSubtle
                  }`,
                  padding: "2px 6px",
                  borderRadius: 3,
                }}
              >
                {copiedNotification ? "COPIED" : "COPY"}
              </span>
            </div>

            <div style={{ fontSize: 11, color: TOKENS.colors.textMuted, lineHeight: 1.4 }}>
              Switch apps, find PID, craft kill command, return to shell, re-execute.
            </div>
          </div>
        )}
      </div>

      {/* Friction summary text */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          opacity: textOpacity,
          zIndex: 20,
        }}
      >
        <FeatureLabel
          eyebrow="THE CURRENT REALITY"
          title="Context switching."
          description="Copy. Search. Paste. Retry."
          align="center"
        />
      </div>
    </AbsoluteFill>
  );
};

import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import { TOKENS } from "../styles/tokens";
import { MOTION } from "../styles/motion";
import { GridBackground } from "../components/GridBackground";
import { TerminalWindow } from "../components/TerminalWindow";
import { TerminalPrompt } from "../components/TerminalPrompt";
import { TerminalOutput, OutputLine } from "../components/TerminalOutput";
import { StatusIndicator } from "../components/StatusIndicator";
import { SafetyModal } from "../components/SafetyModal";
import { SplitTerminal } from "../components/SplitTerminal";
import { ProductLockup } from "../components/ProductLockup";
import { FeatureLabel } from "../components/FeatureLabel";

export const SentinelLaunch30sPremium: React.FC = () => {
  const frame = useCurrentFrame();

  // -------------------------------------------------------------
  // 1. CONTINUOUS VIRTUAL CAMERA
  // -------------------------------------------------------------
  // Camera gracefully navigates across the 30-second arc:
  // 0-90: 1.04x (focused on the error friction)
  // 90-210: pulls back smoothly to 1.0x as Sentinel transforms
  // 210-450: subtle push to 1.02x during diagnosis & consent gate
  // 450-660: rests at 1.0x for the split-pane payoff
  // 660-780: pulls back to 0.96x for full product hero rest
  // 780-900: stabilizes at 1.0x for final product lockup
  const cameraScale = interpolate(
    frame,
    [0, 80, 150, 300, 450, 660, 750, 810],
    [1.04, 1.04, 1.0, 1.02, 1.0, 0.96, 0.96, 1.0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: MOTION.easings.standard,
    }
  );

  const cameraTranslateY = interpolate(
    frame,
    [0, 120, 300, 660, 780],
    [-8, 0, 0, 10, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: MOTION.easings.standard,
    }
  );

  // -------------------------------------------------------------
  // 2. THE TRANSFORMATION OF THE TERMINAL (BEAT 2: frames 90-210)
  // -------------------------------------------------------------
  // The chrome transforms from generic shell into Sentinel Terminal
  const isSentinelRevealed = frame >= 130;

  // -------------------------------------------------------------
  // 3. OBSERVABLE EXECUTION STATES (BEAT 3: frames 210-450)
  // -------------------------------------------------------------
  const isAnalyzing = frame >= 220 && frame < 275;
  const isConsentShown = frame >= 315 && frame < 450;
  const isConsentApproved = frame >= 390;

  // -------------------------------------------------------------
  // 4. SPLIT PANE PAYOFF (BEAT 4: frames 450-780)
  // -------------------------------------------------------------
  const isPayoffActive = frame >= 450;
  const splitDivider = interpolate(frame, [465, 510], [100, 52], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: MOTION.easings.standard,
  });

  // -------------------------------------------------------------
  // 5. PRODUCT HERO & FINAL LOCKUP (BEATS 5 & 6: frames 780-900)
  // -------------------------------------------------------------
  // Terminal remains visible in the background at 0.35 opacity with
  // a subtle 3px blur so the product is NEVER replaced by a pure logo.
  const terminalOpacity = interpolate(frame, [765, 805], [1, 0.35], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const terminalBlur = interpolate(frame, [765, 805], [0, 3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lockupOpacity = interpolate(frame, [780, 810], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const fadeToBlack = interpolate(frame, [885, 900], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Output lines for initial friction (Beat 1)
  const frictionOutputLines: OutputLine[] = [
    { text: "> vite dev --port 3000", type: "muted", delayFrames: 18 },
    {
      text: "Error: listen EADDRINUSE: address already in use :::3000",
      type: "error",
      delayFrames: 28,
    },
  ];

  // Output lines after consent approval (Beat 4)
  const recoveryLines: OutputLine[] = [
    { text: "✓ Process node (PID 4190) gracefully terminated", type: "success", delayFrames: 410 },
    { text: "✓ Port 3000 released", type: "success", delayFrames: 425 },
  ];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: TOKENS.colors.canvas,
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <GridBackground intensity={0.6} />

      {/* --------------------------------------------------------- */}
      {/* PERSISTENT RUNNING CONTEXTUAL HEADLINES */}
      {/* --------------------------------------------------------- */}
      <div
        style={{
          position: "absolute",
          top: 65,
          zIndex: 40,
          pointerEvents: "none",
          textAlign: "center",
        }}
      >
        {/* Beat 1: Hook / Problem */}
        {frame < 115 && (
          <FeatureLabel
            eyebrow="THE CURRENT REALITY"
            title="Still fighting your terminal?"
            description="Port conflicts, stalled daemons, and manual PID hunting interrupt deep work."
            align="center"
            opacity={interpolate(frame, [0, 15, 95, 115], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          />
        )}

        {/* Beat 2: Sentinel Transformation */}
        {frame >= 115 && frame < 225 && (
          <FeatureLabel
            eyebrow="ANNOUNCING SENTINEL v2.1.0"
            title="An AI-native terminal for developers."
            description="Type > to ask in plain language. Built on Tauri v2, Rust PTY, and local inference."
            align="center"
            opacity={interpolate(frame, [115, 135, 205, 225], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          />
        )}

        {/* Beat 3: Observable Execution & Safety Gate */}
        {frame >= 225 && frame < 455 && (
          <FeatureLabel
            eyebrow="LOCAL AST REASONING & SAFETY"
            title="Intent into execution. Always in control."
            description="Offline Qwen 3B sidecar inspects system state and enforces explicit consent before execution."
            align="center"
            opacity={interpolate(frame, [225, 245, 435, 455], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          />
        )}

        {/* Beat 4 & 5: Payoff & Product Hero */}
        {frame >= 455 && frame < 775 && (
          <FeatureLabel
            eyebrow="THE RESULT"
            title="Errors become part of the workflow."
            description="Conflict resolved and dev server restarted in 300ms without leaving the shell."
            align="center"
            opacity={interpolate(frame, [455, 475, 750, 770], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          />
        )}
      </div>

      {/* --------------------------------------------------------- */}
      {/* VIRTUAL CAMERA WRAPPER */}
      {/* --------------------------------------------------------- */}
      <div
        style={{
          width: "100%",
          maxWidth: 1140,
          height: 540,
          marginTop: 65,
          transform: `scale(${cameraScale}) translateY(${cameraTranslateY}px)`,
          transformOrigin: "center center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 20,
        }}
      >
        {/* ======================================================= */}
        {/* TRANSFORMING TERMINAL WINDOW (BEATS 1 TO 5 & HERO) */}
        {/* ======================================================= */}
        {terminalOpacity > 0 && (
          <div
            style={{
              width: "100%",
              height: "100%",
              opacity: terminalOpacity,
              filter: terminalBlur > 0 ? `blur(${terminalBlur}px)` : undefined,
              transition: "filter 0.2s ease",
            }}
          >
            <TerminalWindow
              title={
                isSentinelRevealed
                  ? "SENTINEL TERMINAL v2.1.0"
                  : "terminal — bash"
              }
              tabs={
                isSentinelRevealed
                  ? [
                      { id: "1", name: "terminal — server", active: true },
                      { id: "2", name: "logs", active: false },
                    ]
                  : [{ id: "1", name: "bash", active: true }]
              }
              showStatusBar={frame >= 140}
              statusShell="bash"
              statusCwd={isSentinelRevealed ? "~/projects/sentinal" : "~/workspace"}
              statusAi={
                isConsentApproved
                  ? "AI: Auto-Recovered ✓"
                  : isSentinelRevealed
                  ? "AI: Ready (Local 3B)"
                  : "AI: Off"
              }
              isAiActive={isSentinelRevealed}
            >
              {/* Terminal Inner Content */}
              {!isPayoffActive ? (
                // Single Pane View (Beats 1, 2, 3)
                <div
                  style={{
                    padding: "24px 28px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    height: "100%",
                    overflow: "hidden",
                  }}
                >
                  {/* Beat 1: Initial Command & Friction */}
                  <TerminalPrompt
                    prefix={isSentinelRevealed ? "~/projects/sentinal ❯" : "~/workspace ❯"}
                    command="npm run dev"
                    startFrame={4}
                    charsPerFrame={0.9}
                    isAiPrompt={false}
                    fontSize={14}
                  />

                  {/* Initial Error Output */}
                  <TerminalOutput
                    lines={frictionOutputLines}
                    currentRelativeFrame={frame}
                    fontSize={13}
                  />

                  {/* Beat 2: Natural Language Prompt Transition */}
                  {frame >= 85 && (
                    <div style={{ marginTop: 8 }}>
                      <TerminalPrompt
                        prefix={
                          isSentinelRevealed
                            ? "~/projects/sentinal ❯"
                            : "~/workspace ❯"
                        }
                        command=">start dev server and free port 3000"
                        startFrame={88}
                        charsPerFrame={0.95}
                        isAiPrompt={true}
                        fontSize={15}
                      />
                    </div>
                  )}

                  {/* Beat 3: Observable Analysis Status */}
                  {frame >= 220 && (
                    <div style={{ marginTop: 4 }}>
                      <StatusIndicator
                        status={
                          isAnalyzing
                            ? "ANALYZING INTENT (LOCAL QWEN 3B)"
                            : "PORT CONFLICT IDENTIFIED"
                        }
                        variant={isAnalyzing ? "active" : "warning"}
                        subtext={
                          isAnalyzing
                            ? "Parsing natural language into safe shell recipe"
                            : "PID 4190 listening on :3000"
                        }
                        progressPercent={
                          isAnalyzing
                            ? ((frame - 220) / 55) * 100
                            : 100
                        }
                      />
                    </div>
                  )}

                  {/* Beat 3: Consent Gate Card */}
                  {isConsentShown && (
                    <div style={{ marginTop: 4 }}>
                      <SafetyModal
                        actionDescription="stop conflicting process and restart dev server"
                        commands={[
                          "lsof -ti :3000 | xargs kill -15",
                          "npm run dev -- --port 3000",
                        ]}
                        isConfirmed={isConsentApproved}
                        isUndoShown={frame >= 415}
                      />
                    </div>
                  )}

                  {/* Terminal Recovery logs after approval */}
                  {isConsentApproved && (
                    <TerminalOutput
                      lines={recoveryLines}
                      currentRelativeFrame={frame}
                      fontSize={12}
                    />
                  )}
                </div>
              ) : (
                // Beat 4 & 5: Split Pane Payoff (Live server + PTY Process Table)
                <SplitTerminal
                  leftTitle="pane 1 — server (Vite v5.2)"
                  rightTitle="pane 2 — pty telemetry & resources"
                  dividerPosition={splitDivider}
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
                      <div style={{ color: TOKENS.colors.statusSuccess, fontWeight: 600 }}>
                        ✓ Port 3000 released • Server restarted
                      </div>
                      <div style={{ color: TOKENS.colors.textPrimary, marginTop: 4 }}>
                        ➜ [vite] dev server running at:
                      </div>
                      <div style={{ color: "#FFF", fontWeight: 600, fontSize: 13 }}>
                        ➜ Local: http://localhost:3000/
                      </div>
                      <div style={{ color: TOKENS.colors.textMuted }}>
                        ➜ Network: use --host to expose
                      </div>
                      <div style={{ color: TOKENS.colors.textSubtle, marginTop: 10 }}>
                        [ready in 182ms] watching for file changes...
                      </div>
                      <div style={{ color: TOKENS.colors.textSecondary, marginTop: 4 }}>
                        [hmr] update /src/ui/components/StatusBar.tsx (3ms)
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
                        <span style={{ color: TOKENS.colors.statusSuccess }}>3.8%</span>
                        <span>128M</span>
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
                        <span>llama-sidecar</span>
                        <span>0.8%</span>
                        <span>1.4G</span>
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
                        <span>0.2%</span>
                        <span>42M</span>
                      </div>
                    </div>
                  }
                />
              )}
            </TerminalWindow>
          </div>
        )}

        {/* ======================================================= */}
        {/* BEAT 6: PRODUCT LOCKUP & CTA (FRAMES 780-900) */}
        {/* ======================================================= */}
        {lockupOpacity > 0 && (
          <div
            style={{
              position: "absolute",
              opacity: lockupOpacity,
              zIndex: 30,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "36px 54px",
              borderRadius: 16,
              backgroundColor: "rgba(10, 10, 12, 0.88)",
              border: `1px solid rgba(255, 255, 255, 0.12)`,
              boxShadow: "0 24px 64px rgba(0, 0, 0, 0.9), 0 0 1px 1px rgba(255, 255, 255, 0.06)",
              backdropFilter: "blur(14px)",
            }}
          >
            <ProductLockup opacity={lockupOpacity} scale={1.0} />
          </div>
        )}
      </div>

      {/* ======================================================= */}
      {/* SYNCHRONIZED CINEMATIC AUDIO SUITE */}
      {/* ======================================================= */}
      {/* 30-Second Ambient Score */}
      <Audio
        src={staticFile("audio/ambient_soundtrack.wav")}
        volume={0.75}
      />

      {/* Keystrokes for initial npm run dev (frames 4-20) */}
      <Sequence from={4} durationInFrames={18}>
        <Audio
          src={staticFile("audio/typing_cmd1.wav")}
          volume={0.35}
        />
      </Sequence>

      {/* Keystrokes for natural language intent (frames 88-128) */}
      <Sequence from={88} durationInFrames={40}>
        <Audio
          src={staticFile("audio/typing_intent.wav")}
          volume={0.35}
        />
      </Sequence>

      {/* Transformation whoosh into Sentinel (frames 125-150) */}
      <Sequence from={125} durationInFrames={25}>
        <Audio
          src={staticFile("audio/whoosh_transition.wav")}
          volume={0.38}
        />
      </Sequence>

      {/* Confirmation Chime for Safety Gate Approval (frame 390) */}
      <Sequence from={390} durationInFrames={32}>
        <Audio
          src={staticFile("audio/confirm_chime.wav")}
          volume={0.48}
        />
      </Sequence>

      {/* Split Pane expansion whoosh (frames 460-485) */}
      <Sequence from={460} durationInFrames={25}>
        <Audio
          src={staticFile("audio/whoosh_transition.wav")}
          volume={0.35}
        />
      </Sequence>

      {/* ======================================================= */}
      {/* FINAL CUT TO BLACK (FRAMES 885-900) */}
      {/* ======================================================= */}
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

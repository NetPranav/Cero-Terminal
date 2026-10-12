import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  interpolate,
  staticFile,
  useCurrentFrame,
  Easing,
} from "remotion";
import { TOKENS } from "../styles/tokens";
import { GridBackground } from "../components/GridBackground";
import { TerminalWindow } from "../components/TerminalWindow";
import { TerminalPrompt } from "../components/TerminalPrompt";
import { TerminalOutput, OutputLine } from "../components/TerminalOutput";
import { CeroOpening } from "../components/CeroOpening";
import { CeroApprovalCard } from "../components/CeroApprovalCard";
import { CeroWorkflowCard } from "../components/CeroWorkflowCard";
import { CeroClosingHero } from "../components/CeroClosingHero";
import { FeatureLabel } from "../components/FeatureLabel";

export const CeroLaunch30s: React.FC = () => {
  const frame = useCurrentFrame();

  // -------------------------------------------------------------
  // 1. CONTINUOUS VIRTUAL CAMERA
  // -------------------------------------------------------------
  // Smooth physical camera motion that bridges beats without jarring cuts:
  // 0-75: 0.98 -> 1.0 (opening push)
  // 75-210: 1.0 (prompt typing)
  // 210-315: 1.0 (multi-step execution)
  // 315-420: 1.02 (push in to port result 3000)
  // 420-525: 1.01 (approval gate)
  // 525-570: 1.0 (success payoff)
  // 570-705: 1.0 (workflow birth)
  // 705-795: 0.97 (pull back for cross-platform spread)
  // 795-900: 1.0 (settled closing hero)
  const cameraScale = interpolate(
    frame,
    [0, 60, 315, 360, 420, 525, 705, 750, 795, 830],
    [0.96, 1.0, 1.0, 1.02, 1.02, 1.0, 1.0, 0.96, 0.96, 1.0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }
  );

  const cameraTranslateY = interpolate(
    frame,
    [0, 60, 315, 360, 705, 795],
    [10, 0, 0, -6, 0, 0],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.bezier(0.16, 1, 0.3, 1),
    }
  );

  // -------------------------------------------------------------
  // 2. BEAT STATES & TIMELINE FLAGS
  // -------------------------------------------------------------
  // Beat 1: Opening (0-75)
  const isOpening = frame < 75;

  // Beat 5: Approval Gate (420-525)
  const isApprovalActive = frame >= 445 && frame < 525;
  const isRunClicked = frame >= 485 && frame < 492;
  const isApproved = frame >= 485;

  // Beat 6: Success State (525-570)
  const isSuccessActive = frame >= 525 && frame < 570;

  // Beat 7: Workflow Creation (570-705)
  const isWorkflowActive = frame >= 600 && frame < 795;

  // Beat 8: Cross Platform Spread (705-795)
  const showPlatforms = frame >= 705 && frame < 795;
  const platformProgress = interpolate(frame, [705, 735], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1),
  });

  // Beat 9: Closing Hero (795-900)
  const isClosingHero = frame >= 795;
  const closingOpacity = interpolate(frame, [795, 825], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const terminalHeroOpacity = interpolate(frame, [785, 820], [1, 0.22], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const terminalHeroBlur = interpolate(frame, [785, 820], [0, 3], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const fadeToBlack = interpolate(frame, [885, 900], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // -------------------------------------------------------------
  // 3. TERMINAL CONTENT OUTPUT LINES
  // -------------------------------------------------------------
  // Beat 3 multi-step lines
  const multiStepLines: OutputLine[] = [
    { text: "01  create folder demo-app", type: "muted", delayFrames: 0 },
    { text: "02  git init", type: "muted", delayFrames: 7 },
    { text: "03  npm init -y", type: "muted", delayFrames: 14 },
    { text: "04  ls -la", type: "muted", delayFrames: 21 },
  ];

  const multiStepCompletedLines: OutputLine[] = [
    { text: "01 ✓ create folder demo-app", type: "success", delayFrames: 20 },
    { text: "02 ✓ git init", type: "success", delayFrames: 28 },
    { text: "03 ✓ npm init -y", type: "success", delayFrames: 36 },
    { text: "04 ✓ ls -la", type: "success", delayFrames: 44 },
    {
      text: "demo-app/  package.json  .git/  (initialized in 240ms)",
      type: "highlight",
      delayFrames: 50,
    },
  ];

  // Beat 4 port query result
  const portResultLines: OutputLine[] = [
    { text: "PORT 3000   PROCESS node   PID 4190   STATUS LISTEN", type: "highlight", delayFrames: 10 },
  ];

  // Beat 6 success lines
  const successLines: OutputLine[] = [
    { text: "✓ Process node (PID 4190) gracefully terminated", type: "success", delayFrames: 2 },
    { text: "✓ Port 3000 is free", type: "success", delayFrames: 10 },
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
      <GridBackground intensity={0.55} />

      {/* --------------------------------------------------------- */}
      {/* PERSISTENT RUNNING CONTEXTUAL HEADLINES */}
      {/* --------------------------------------------------------- */}
      <div
        style={{
          position: "absolute",
          top: 60,
          zIndex: 40,
          pointerEvents: "none",
          textAlign: "center",
        }}
      >
        {/* Beat 2 & 3: Natural Language to Execution */}
        {frame >= 75 && frame < 315 && (
          <FeatureLabel
            eyebrow="NATURAL LANGUAGE AUTOMATION"
            title="A terminal you can talk to."
            description="Describe multi-step tasks in plain language. CERO parses intent into verified execution."
            align="center"
            opacity={interpolate(frame, [75, 95, 295, 315], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          />
        )}

        {/* Beat 4 & 5: System Awareness & Consent Gate */}
        {frame >= 315 && frame < 570 && (
          <FeatureLabel
            eyebrow="SYSTEM AWARENESS & SAFETY"
            title="Full awareness. Always in control."
            description="Inspect active ports, identify blocking processes, and require explicit approval before execution."
            align="center"
            opacity={interpolate(frame, [315, 335, 550, 570], [0, 1, 1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            })}
          />
        )}

        {/* Beat 7 & 8: Workflows & Cross-Platform */}
        {frame >= 570 && frame < 790 && (
          <FeatureLabel
            eyebrow=".FLOW WORKFLOW AUTOMATION"
            title="Turn any task into a reusable workflow."
            description="Save executed sequences into portable .flow files that run natively on macOS, Linux, and Windows."
            align="center"
            opacity={interpolate(frame, [570, 590, 770, 790], [0, 1, 1, 0], {
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
          maxWidth: 1160,
          height: 560,
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
        {/* BEAT 1: CERO OPENING REVEAL (FRAMES 0-75) */}
        {/* ======================================================= */}
        {isOpening && <CeroOpening />}

        {/* ======================================================= */}
        {/* MAIN TRANSFORMING TERMINAL WINDOW */}
        {/* ======================================================= */}
        <div
          style={{
            width: "100%",
            height: "100%",
            opacity: frame < 60 ? interpolate(frame, [45, 60], [0, 1]) : terminalHeroOpacity,
            filter: terminalHeroBlur > 0 ? `blur(${terminalHeroBlur}px)` : undefined,
          }}
        >
          <TerminalWindow
            title="cero"
            tabs={[
              { id: "1", name: "terminal — bash", active: true },
              { id: "2", name: "logs", active: false },
            ]}
            showStatusBar={frame >= 60}
            statusShell="bash"
            statusCwd={
              frame >= 210 ? "~/demo-app" : "~/workspace"
            }
            statusAi={
              isApproved
                ? "AI: Executed ✓"
                : frame >= 60
                ? "AI: Ready (Local)"
                : "AI: Off"
            }
            isAiActive={frame >= 60}
          >
            {/* Terminal Inner Content Buffer */}
            <div
              style={{
                padding: "24px 28px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
                height: "100%",
                overflow: "hidden",
                position: "relative",
              }}
            >
              {/* BEAT 2: Natural Language Command */}
              {frame >= 75 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <TerminalPrompt
                    prefix="~/workspace ❯"
                    command="> create a folder demo-app, initialize git, npm init, then list the files"
                    startFrame={85}
                    charsPerFrame={0.88}
                    isAiPrompt={true}
                    fontSize={14}
                  />

                  {/* BEAT 3: Multi-step Execution Steps */}
                  {frame >= 210 && frame < 315 && (
                    <div
                      style={{
                        paddingLeft: 12,
                        borderLeft: `2px solid ${TOKENS.colors.borderInteractive}`,
                        marginTop: 4,
                      }}
                    >
                      <TerminalOutput
                        lines={
                          frame >= 250
                            ? multiStepCompletedLines
                            : multiStepLines
                        }
                        currentRelativeFrame={frame - 210}
                        fontSize={13}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* BEAT 4: Port Discovery Query & Result */}
              {frame >= 315 && frame < 445 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    marginTop: 6,
                  }}
                >
                  <TerminalPrompt
                    prefix="~/demo-app ❯"
                    command="> find what's using port 3000"
                    startFrame={320}
                    charsPerFrame={0.9}
                    isAiPrompt={true}
                    fontSize={14}
                  />

                  {frame >= 360 && (
                    <div
                      style={{
                        padding: "8px 12px",
                        backgroundColor: "rgba(255, 255, 255, 0.03)",
                        border: `1px solid ${TOKENS.colors.borderSubtle}`,
                        borderRadius: 6,
                        fontFamily: TOKENS.fonts.mono,
                        fontSize: 12,
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: "rgba(255, 255, 255, 0.4)",
                          marginBottom: 4,
                          letterSpacing: "0.08em",
                        }}
                      >
                        ACTIVE LISTENER IDENTIFIED:
                      </div>
                      <TerminalOutput
                        lines={portResultLines}
                        currentRelativeFrame={frame - 360}
                        fontSize={13}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* BEAT 5: Port Close Command & Approval Card */}
              {frame >= 425 && frame < 525 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    marginTop: 4,
                  }}
                >
                  <TerminalPrompt
                    prefix="~/demo-app ❯"
                    command="> close port 3000"
                    startFrame={425}
                    charsPerFrame={0.9}
                    isAiPrompt={true}
                    fontSize={14}
                  />

                  {/* Real CERO Approval Card */}
                  {isApprovalActive && (
                    <div style={{ marginTop: 4 }}>
                      <CeroApprovalCard
                        command="kill 4190"
                        explanation="Stop node (PID 4190) listening on port 3000"
                        isRunPressed={isRunClicked}
                        isApproved={isApproved}
                        opacity={interpolate(frame, [445, 460], [0, 1], {
                          extrapolateLeft: "clamp",
                          extrapolateRight: "clamp",
                        })}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* BEAT 6: Success Verification */}
              {isSuccessActive && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                    marginTop: 8,
                    padding: "16px 20px",
                    backgroundColor: "rgba(134, 239, 172, 0.04)",
                    border: "1px solid rgba(134, 239, 172, 0.2)",
                    borderRadius: 8,
                  }}
                >
                  <div
                    style={{
                      fontFamily: TOKENS.fonts.mono,
                      fontSize: 11,
                      letterSpacing: "0.06em",
                      color: "#86efac",
                      fontWeight: 600,
                    }}
                  >
                    PORT CONTROL EXECUTION COMPLETED
                  </div>
                  <TerminalOutput
                    lines={successLines}
                    currentRelativeFrame={frame - 525}
                    fontSize={13}
                  />
                </div>
              )}

              {/* BEAT 7 & 8: Workflow Creation & Cross-Platform Emergence */}
              {frame >= 570 && frame < 795 && (
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    marginTop: 4,
                  }}
                >
                  <TerminalPrompt
                    prefix="~/demo-app ❯"
                    command="> make me a workflow for this"
                    startFrame={575}
                    charsPerFrame={0.88}
                    isAiPrompt={true}
                    fontSize={14}
                  />

                  {isWorkflowActive && (
                    <div style={{ marginTop: 6 }}>
                      <CeroWorkflowCard
                        fileName="dev-setup.flow"
                        steps={[
                          { num: "01", text: "create project", completed: true },
                          { num: "02", text: "initialize git", completed: true },
                          { num: "03", text: "install dependencies", completed: true },
                          { num: "04", text: "verify", completed: true },
                          { num: "05", text: "run", completed: true },
                        ]}
                        showPlatforms={showPlatforms}
                        platformProgress={platformProgress}
                        opacity={interpolate(frame, [600, 615], [0, 1], {
                          extrapolateLeft: "clamp",
                          extrapolateRight: "clamp",
                        })}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </TerminalWindow>
        </div>

        {/* ======================================================= */}
        {/* BEAT 9: CERO CLOSING HERO CARD (FRAMES 795-900) */}
        {/* ======================================================= */}
        {isClosingHero && closingOpacity > 0 && (
          <div
            style={{
              position: "absolute",
              opacity: closingOpacity,
              zIndex: 35,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "40px 60px",
              borderRadius: 16,
              backgroundColor: "rgba(10, 11, 14, 0.92)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              boxShadow:
                "0 28px 72px rgba(0, 0, 0, 0.95), 0 0 1px 1px rgba(255, 255, 255, 0.08)",
              backdropFilter: "blur(18px)",
            }}
          >
            <CeroClosingHero opacity={closingOpacity} scale={1.0} />
          </div>
        )}
      </div>

      {/* ======================================================= */}
      {/* SYNCHRONIZED CINEMATIC AUDIO SYSTEM */}
      {/* ======================================================= */}
      {/* Continuous Master Soundtrack (30s) */}
      <Audio
        src={staticFile("audio/cero_soundtrack.wav")}
        volume={0.8}
      />

      {/* Beat 1 Activation sound (frame 60) */}
      <Sequence from={60} durationInFrames={25}>
        <Audio src={staticFile("audio/cero_activate.wav")} volume={0.35} />
      </Sequence>

      {/* Beat 2 Typing Sound: Natural Language Prompt (frames 85-165) */}
      <Sequence from={85} durationInFrames={80}>
        <Audio src={staticFile("audio/cero_typing_nl.wav")} volume={0.38} />
      </Sequence>

      {/* Beat 3 Step ticks (frames 230, 240, 250, 260) */}
      <Sequence from={230} durationInFrames={8}>
        <Audio src={staticFile("audio/cero_step_tick.wav")} volume={0.28} />
      </Sequence>
      <Sequence from={240} durationInFrames={8}>
        <Audio src={staticFile("audio/cero_step_tick.wav")} volume={0.28} />
      </Sequence>
      <Sequence from={250} durationInFrames={8}>
        <Audio src={staticFile("audio/cero_step_tick.wav")} volume={0.28} />
      </Sequence>
      <Sequence from={260} durationInFrames={8}>
        <Audio src={staticFile("audio/cero_step_tick.wav")} volume={0.32} />
      </Sequence>

      {/* Beat 4 Typing Sound: Port query (frames 320-355) */}
      <Sequence from={320} durationInFrames={35}>
        <Audio src={staticFile("audio/cero_typing_port.wav")} volume={0.36} />
      </Sequence>

      {/* Beat 5 Typing Sound: Close port command (frames 425-448) */}
      <Sequence from={425} durationInFrames={25}>
        <Audio src={staticFile("audio/cero_typing_close.wav")} volume={0.36} />
      </Sequence>

      {/* Beat 5 Approval Gate Activation (frame 450) */}
      <Sequence from={450} durationInFrames={20}>
        <Audio src={staticFile("audio/cero_morph.wav")} volume={0.25} />
      </Sequence>

      {/* Beat 5 Approval Run Button Click (frame 485) */}
      <Sequence from={485} durationInFrames={15}>
        <Audio src={staticFile("audio/cero_click.wav")} volume={0.5} />
      </Sequence>
      <Sequence from={486} durationInFrames={25}>
        <Audio src={staticFile("audio/cero_activate.wav")} volume={0.35} />
      </Sequence>

      {/* Beat 6 Success Confirmation Chime (frame 525) */}
      <Sequence from={525} durationInFrames={35}>
        <Audio src={staticFile("audio/cero_success.wav")} volume={0.48} />
      </Sequence>

      {/* Beat 7 Typing Sound: Workflow prompt (frames 575-602) */}
      <Sequence from={575} durationInFrames={28}>
        <Audio src={staticFile("audio/cero_typing_flow.wav")} volume={0.36} />
      </Sequence>

      {/* Beat 7 Workflow Morph Emergence (frame 605) */}
      <Sequence from={605} durationInFrames={25}>
        <Audio src={staticFile("audio/cero_morph.wav")} volume={0.32} />
      </Sequence>

      {/* Beat 8 Cross-Platform Expansion (frame 710) */}
      <Sequence from={710} durationInFrames={25}>
        <Audio src={staticFile("audio/cero_morph.wav")} volume={0.28} />
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

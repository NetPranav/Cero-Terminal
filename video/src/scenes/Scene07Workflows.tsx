import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import { TOKENS } from "../styles/tokens";
import { GridBackground } from "../components/GridBackground";
import { TerminalWindow } from "../components/TerminalWindow";
import { TerminalPrompt } from "../components/TerminalPrompt";
import { WorkflowTimeline, WorkflowStepItem } from "../components/WorkflowTimeline";
import { FeatureLabel } from "../components/FeatureLabel";

export const Scene07Workflows: React.FC = () => {
  const frame = useCurrentFrame();

  // Workflow steps timing
  const steps: WorkflowStepItem[] = [
    {
      phase: "01",
      title: "INSPECT PREREQUISITES",
      status: "COMPLETE",
      time: "1.2s",
    },
    {
      phase: "02",
      title: "INSTALL DEPENDENCIES",
      status: "COMPLETE",
      time: "4.8s",
    },
    {
      phase: "03",
      title: "BUILD PRODUCTION BUNDLE",
      status: frame >= 85 ? "COMPLETE" : "RUNNING",
      time: frame >= 85 ? "8.1s" : "running...",
    },
    {
      phase: "04",
      title: "VERIFY TEST SUITE",
      status: frame >= 130 ? "COMPLETE" : frame >= 85 ? "RUNNING" : "WAITING",
      time: frame >= 130 ? "2.4s" : undefined,
    },
    {
      phase: "05",
      title: "PACKAGE NATIVE ARTIFACTS",
      status: frame >= 170 ? "COMPLETE" : frame >= 130 ? "RUNNING" : "QUEUED",
      time: frame >= 170 ? "5.6s" : undefined,
    },
  ];

  // Collapse transition at the end
  const collapseScale = interpolate(frame, [185, 210], [1.0, 0.98], {
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
        transform: `scale(${collapseScale})`,
        overflow: "hidden",
      }}
    >
      <GridBackground intensity={0.5} />

      {/* Feature Label */}
      <div style={{ position: "absolute", top: 60, zIndex: 20 }}>
        <FeatureLabel
          eyebrow="04 / WORKFLOW AUTOMATION"
          title="Write a setup once. Run it anywhere."
          description="Turn multi-step terminal procedures into repeatable .flow files that execute natively across macOS, Linux, and Windows."
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
          title="SENTINEL TERMINAL — WORKFLOW RUNNER"
          tabs={[
            { id: "1", name: "terminal — bash", active: true },
            { id: "2", name: "workflow: release.flow", active: false },
          ]}
          statusShell="bash"
          statusCwd="~/projects/sentinal"
          statusAi="AI: Pipeline Active"
        >
          <div style={{ padding: 26, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Prompt with flow invocation */}
            <TerminalPrompt
              prefix="~/projects/sentinal ❯"
              command=">prepare project for release"
              startFrame={4}
              charsPerFrame={0.85}
              isAiPrompt={true}
              fontSize={15}
            />

            {/* Workflow steps card */}
            {frame >= 35 && (
              <div style={{ marginTop: 4 }}>
                <WorkflowTimeline
                  steps={steps}
                  showActions={frame >= 140}
                />
              </div>
            )}
          </div>
        </TerminalWindow>
      </div>
    </AbsoluteFill>
  );
};

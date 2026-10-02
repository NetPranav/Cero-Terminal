import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { TOKENS } from "../styles/tokens";
import { GridBackground } from "../components/GridBackground";
import { TerminalWindow } from "../components/TerminalWindow";
import { TerminalPrompt } from "../components/TerminalPrompt";
import { SafetyModal } from "../components/SafetyModal";
import { FeatureLabel } from "../components/FeatureLabel";

export const Scene09Safety: React.FC = () => {
  const frame = useCurrentFrame();

  const isConsentShown = frame >= 40;
  const isConfirmed = frame >= 95;
  const isUndoShown = frame >= 125;

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
          eyebrow="06 / SAFETY & CONTROL"
          title="AI is not uncontrolled shell execution."
          description="Every command that modifies files or system state requires explicit developer approval. With verifiable audit logging and rollback."
          align="center"
        />
      </div>

      {/* Terminal window with safety modal overlay */}
      <div
        style={{
          width: "100%",
          maxWidth: 1100,
          height: 520,
          marginTop: 70,
          position: "relative",
          zIndex: 10,
        }}
      >
        <TerminalWindow
          title="SENTINEL TERMINAL — SAFETY GATEWAY"
          tabs={[{ id: "1", name: "terminal — bash", active: true }]}
          statusShell="bash"
          statusCwd="~/projects/sentinal"
          statusAi="AI: Security Guardrail Active"
        >
          <div style={{ padding: 26, display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Dangerous request prompt */}
            <TerminalPrompt
              prefix="~/projects/sentinal ❯"
              command=">remove project build artifacts"
              startFrame={5}
              charsPerFrame={0.85}
              isAiPrompt={true}
              fontSize={15}
            />

            {/* Safety Consent Card */}
            {isConsentShown && (
              <div style={{ marginTop: 8 }}>
                <SafetyModal
                  actionDescription="clean build outputs in dist/ and target/"
                  commands={[
                    "rm -rf dist/",
                    "rm -rf target/release/",
                    "rm -rf .cache/",
                  ]}
                  isConfirmed={isConfirmed}
                  isUndoShown={isUndoShown}
                />
              </div>
            )}
          </div>
        </TerminalWindow>
      </div>
    </AbsoluteFill>
  );
};

import React from "react";
import { TOKENS } from "../styles/tokens";

export interface WorkflowStepItem {
  phase: string;
  title: string;
  status: "COMPLETE" | "RUNNING" | "WAITING" | "QUEUED";
  time?: string;
}

interface WorkflowTimelineProps {
  steps: WorkflowStepItem[];
  activePhase?: string;
  showActions?: boolean;
}

export const WorkflowTimeline: React.FC<WorkflowTimelineProps> = ({
  steps,
  showActions = true,
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        backgroundColor: TOKENS.colors.surfaceCard,
        border: `1px solid ${TOKENS.colors.borderCard}`,
        borderRadius: 8,
        padding: "16px 20px",
        fontFamily: TOKENS.fonts.mono,
        width: "100%",
        maxWidth: 620,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `1px solid ${TOKENS.colors.borderSubtle}`,
          paddingBottom: 10,
          marginBottom: 4,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ color: TOKENS.colors.textPrimary, fontWeight: 600, fontSize: 13 }}>
            RELEASE PIPELINE
          </span>
          <span style={{ color: TOKENS.colors.textMuted, fontSize: 11 }}>
            [release.flow]
          </span>
        </div>
        <span
          style={{
            fontSize: 10,
            color: TOKENS.colors.textMuted,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Multi-OS Schema 1.0
        </span>
      </div>

      {steps.map((step) => {
        let statusColor = TOKENS.colors.textMuted;
        let badgeBg = "rgba(255, 255, 255, 0.03)";
        let indicator = "•";

        if (step.status === "COMPLETE") {
          statusColor = TOKENS.colors.statusSuccess;
          badgeBg = "rgba(134, 239, 172, 0.08)";
          indicator = "✓";
        } else if (step.status === "RUNNING") {
          statusColor = TOKENS.colors.textPrimary;
          badgeBg = "rgba(255, 255, 255, 0.12)";
          indicator = "›";
        }

        return (
          <div
            key={step.phase}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 10px",
              borderRadius: 4,
              backgroundColor:
                step.status === "RUNNING"
                  ? "rgba(255, 255, 255, 0.04)"
                  : "transparent",
              border:
                step.status === "RUNNING"
                  ? `1px solid ${TOKENS.colors.borderInteractive}`
                  : "1px solid transparent",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span
                style={{
                  color: TOKENS.colors.textMuted,
                  fontSize: 12,
                  fontVariantNumeric: "tabular-nums",
                  width: 24,
                }}
              >
                {step.phase}
              </span>
              <span
                style={{
                  color:
                    step.status === "WAITING" || step.status === "QUEUED"
                      ? TOKENS.colors.textMuted
                      : TOKENS.colors.textPrimary,
                  fontSize: 13,
                  fontWeight: step.status === "RUNNING" ? 600 : 400,
                  letterSpacing: "0.02em",
                }}
              >
                {step.title}
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {step.time && (
                <span
                  style={{
                    color: TOKENS.colors.textSubtle,
                    fontSize: 11,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {step.time}
                </span>
              )}
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: statusColor,
                  backgroundColor: badgeBg,
                  padding: "2px 8px",
                  borderRadius: 3,
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  letterSpacing: "0.04em",
                }}
              >
                <span>{indicator}</span>
                <span>{step.status}</span>
              </span>
            </div>
          </div>
        );
      })}

      {showActions && (
        <div
          style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: `1px solid ${TOKENS.colors.borderSubtle}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                color: TOKENS.colors.textPrimary,
                border: `1px solid ${TOKENS.colors.borderInteractive}`,
                backgroundColor: "rgba(255, 255, 255, 0.06)",
                padding: "4px 10px",
                borderRadius: 4,
                fontWeight: 500,
              }}
            >
              SAVE WORKFLOW [.flow]
            </span>
            <span
              style={{
                fontSize: 11,
                color: TOKENS.colors.textMuted,
                border: `1px solid ${TOKENS.colors.borderSubtle}`,
                padding: "4px 10px",
                borderRadius: 4,
              }}
            >
              REPLAY ANYWHERE
            </span>
          </div>
          <span style={{ fontSize: 10, color: TOKENS.colors.textSubtle }}>
            Zero-Shell-Injection Quoting
          </span>
        </div>
      )}
    </div>
  );
};

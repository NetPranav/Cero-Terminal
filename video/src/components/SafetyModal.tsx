import React from "react";
import { TOKENS } from "../styles/tokens";

interface SafetyModalProps {
  actionDescription: string;
  commands: string[];
  isConfirmed?: boolean;
  isUndoShown?: boolean;
}

export const SafetyModal: React.FC<SafetyModalProps> = ({
  actionDescription = "remove project build artifacts",
  commands = ["rm -rf dist/", "rm -rf target/release/", "rm -rf .cache/"],
  isConfirmed = false,
  isUndoShown = false,
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        backgroundColor: TOKENS.colors.surfaceModal,
        border: `1px solid ${TOKENS.colors.borderFocus}`,
        borderRadius: 8,
        padding: "20px 24px",
        fontFamily: TOKENS.fonts.mono,
        maxWidth: 580,
        boxShadow: "0 20px 50px rgba(0, 0, 0, 0.9)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `1px solid ${TOKENS.colors.borderSubtle}`,
          paddingBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              color: TOKENS.colors.statusWarning,
              fontWeight: 700,
              fontSize: 13,
            }}
          >
            [!]
          </span>
          <span
            style={{
              color: TOKENS.colors.textPrimary,
              fontWeight: 600,
              fontSize: 13,
              letterSpacing: "0.02em",
            }}
          >
            SAFETY & CONSENT GATE
          </span>
        </div>
        <span
          style={{
            fontSize: 10,
            color: TOKENS.colors.statusWarning,
            backgroundColor: "rgba(253, 224, 71, 0.1)",
            padding: "2px 8px",
            borderRadius: 3,
            fontWeight: 600,
          }}
        >
          CONFIRMATION REQUIRED
        </span>
      </div>

      {/* Description */}
      <div style={{ fontSize: 13, color: TOKENS.colors.textSecondary, lineHeight: 1.4 }}>
        Sentinel identified a filesystem modification:{" "}
        <strong style={{ color: TOKENS.colors.textPrimary }}>
          {actionDescription}
        </strong>
      </div>

      {/* Commands preview */}
      <div
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.4)",
          border: `1px solid ${TOKENS.colors.borderSubtle}`,
          borderRadius: 5,
          padding: "10px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontSize: 12,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: TOKENS.colors.textMuted,
            letterSpacing: "0.06em",
            marginBottom: 2,
          }}
        >
          PLANNED SHELL COMMANDS:
        </div>
        {commands.map((cmd, i) => (
          <div key={i} style={{ display: "flex", gap: 8, color: TOKENS.colors.textPrimary }}>
            <span style={{ color: TOKENS.colors.textSubtle }}>❯</span>
            <span>{cmd}</span>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          paddingTop: 6,
        }}
      >
        <span style={{ fontSize: 11, color: TOKENS.colors.textSubtle }}>
          Logged to audit trail: ~/.sentinel/audit.log
        </span>

        <div style={{ display: "flex", gap: 10 }}>
          <span
            style={{
              padding: "5px 14px",
              borderRadius: 4,
              fontSize: 12,
              color: TOKENS.colors.textMuted,
              border: `1px solid ${TOKENS.colors.borderSubtle}`,
              backgroundColor: "transparent",
            }}
          >
            [ CANCEL ]
          </span>
          <span
            style={{
              padding: "5px 14px",
              borderRadius: 4,
              fontSize: 12,
              color: TOKENS.colors.textPrimary,
              border: `1px solid ${
                isConfirmed
                  ? TOKENS.colors.statusSuccess
                  : TOKENS.colors.borderActive
              }`,
              backgroundColor: isConfirmed
                ? "rgba(134, 239, 172, 0.15)"
                : "rgba(255, 255, 255, 0.1)",
              fontWeight: 600,
            }}
          >
            {isConfirmed ? "✓ APPROVED" : "[ CONFIRM ]"}
          </span>
        </div>
      </div>

      {/* Undo rollback state */}
      {isUndoShown && (
        <div
          style={{
            borderTop: `1px solid ${TOKENS.colors.borderSubtle}`,
            paddingTop: 8,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 11,
          }}
        >
          <span style={{ color: TOKENS.colors.textSecondary }}>
            ❯ &gt;undo last step
          </span>
          <span style={{ color: TOKENS.colors.statusSuccess }}>
            ✓ Rollback point restored (.bak preserved)
          </span>
        </div>
      )}
    </div>
  );
};

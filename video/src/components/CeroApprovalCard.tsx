import React from "react";
import { ShieldAlert, Check, X } from "lucide-react";
import { TOKENS } from "../styles/tokens";

interface CeroApprovalCardProps {
  command?: string;
  explanation?: string;
  isRunPressed?: boolean;
  isApproved?: boolean;
  opacity?: number;
}

export const CeroApprovalCard: React.FC<CeroApprovalCardProps> = ({
  command = "kill 4190",
  explanation = "Stop node (PID 4190) listening on port 3000",
  isRunPressed = false,
  isApproved = false,
  opacity = 1,
}) => {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 14,
        backgroundColor: "rgba(12, 14, 18, 0.96)",
        border: `1px solid ${isApproved ? "rgba(134, 239, 172, 0.35)" : TOKENS.colors.borderCard}`,
        borderRadius: 12,
        padding: "20px 24px",
        fontFamily: TOKENS.fonts.sans,
        maxWidth: 620,
        width: "100%",
        boxShadow: "0 24px 60px rgba(0, 0, 0, 0.9), 0 0 1px 1px rgba(255, 255, 255, 0.05)",
        opacity,
        backdropFilter: "blur(16px)",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            backgroundColor: "rgba(255, 255, 255, 0.06)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#e5e7eb",
            flexShrink: 0,
          }}
        >
          <ShieldAlert size={19} />
        </div>
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 16,
              fontWeight: 600,
              color: "#f8fafc",
              letterSpacing: "-0.01em",
            }}
          >
            Run this command?
          </h3>
          <span
            style={{
              fontSize: 12,
              color: "rgba(255, 255, 255, 0.5)",
              display: "block",
              marginTop: 2,
            }}
          >
            Needs your approval · low risk
          </span>
        </div>
      </div>

      {/* Description */}
      <p
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: "rgba(255, 255, 255, 0.72)",
          margin: 0,
        }}
      >
        CERO will run exactly what is shown below. Nothing runs until you approve.
      </p>

      {/* Planned Command Box */}
      <div
        style={{
          backgroundColor: "rgba(8, 9, 12, 0.75)",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: 8,
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          fontFamily: TOKENS.fonts.mono,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "rgba(255, 255, 255, 0.4)",
            fontFamily: TOKENS.fonts.sans,
            fontWeight: 600,
          }}
        >
          COMMAND
        </div>
        <div
          style={{
            color: "#f5f5f7",
            fontSize: 13,
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span style={{ color: TOKENS.colors.textSubtle }}>❯</span>
          <span>{command}</span>
        </div>
        {explanation && (
          <div
            style={{
              marginTop: 4,
              paddingTop: 8,
              borderTop: "1px solid rgba(255, 255, 255, 0.06)",
              display: "flex",
              gap: 8,
              alignItems: "flex-start",
              fontSize: 12,
            }}
          >
            <span style={{ color: "rgba(255, 255, 255, 0.4)", flexShrink: 0 }}>
              Why:
            </span>
            <span style={{ color: "rgba(255, 255, 255, 0.75)" }}>{explanation}</span>
          </div>
        )}
      </div>

      {/* Buttons */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: 10,
          marginTop: 2,
        }}
      >
        {/* Cancel */}
        <button
          type="button"
          style={{
            padding: "8px 16px",
            borderRadius: 7,
            border: "1px solid rgba(255, 255, 255, 0.12)",
            backgroundColor: "rgba(255, 255, 255, 0.04)",
            color: "#94a3b8",
            fontSize: 13,
            fontWeight: 500,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
          }}
        >
          <X size={13} />
          <span>Cancel</span>
          <span style={{ opacity: 0.4, fontSize: 11, marginLeft: 4 }}>Esc</span>
        </button>

        {/* Run / Approved */}
        <button
          type="button"
          style={{
            padding: "8px 20px",
            borderRadius: 7,
            border: isApproved ? "1px solid rgba(134, 239, 172, 0.4)" : "none",
            backgroundColor: isApproved
              ? "rgba(134, 239, 172, 0.18)"
              : isRunPressed
              ? "#e2e8f0"
              : "#f8fafc",
            color: isApproved ? "#86efac" : "#090b10",
            fontSize: 13,
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: "pointer",
            transform: isRunPressed ? "scale(0.97)" : "scale(1.0)",
            boxShadow: isApproved
              ? "0 0 16px rgba(134, 239, 172, 0.2)"
              : "0 2px 8px rgba(0, 0, 0, 0.4)",
          }}
        >
          <Check size={14} />
          <span>{isApproved ? "Approved" : "Run"}</span>
        </button>
      </div>
    </div>
  );
};

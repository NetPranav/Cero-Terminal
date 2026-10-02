import React from "react";
import { FileCode, Check } from "lucide-react";
import { TOKENS } from "../styles/tokens";

interface CeroWorkflowCardProps {
  fileName?: string;
  steps?: { num: string; text: string; completed?: boolean }[];
  showPlatforms?: boolean;
  platformProgress?: number; // 0 to 1
  opacity?: number;
}

export const CeroWorkflowCard: React.FC<CeroWorkflowCardProps> = ({
  fileName = "dev-setup.flow",
  steps = [
    { num: "01", text: "create project", completed: true },
    { num: "02", text: "initialize git", completed: true },
    { num: "03", text: "install dependencies", completed: true },
    { num: "04", text: "verify", completed: true },
    { num: "05", text: "run", completed: true },
  ],
  showPlatforms = false,
  platformProgress = 0,
  opacity = 1,
}) => {
  const platforms = [
    { name: "macOS", detail: "Homebrew / zsh", check: true },
    { name: "Windows", detail: "PowerShell / winget", check: true },
    { name: "Linux", detail: "apt / dnf / pacman", check: true },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        backgroundColor: "rgba(12, 14, 18, 0.96)",
        border: `1px solid ${TOKENS.colors.borderCard}`,
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
      {/* Workflow Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
          paddingBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              backgroundColor: "rgba(255, 255, 255, 0.06)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#e2e8f0",
            }}
          >
            <FileCode size={16} />
          </div>
          <div>
            <div
              style={{
                fontFamily: TOKENS.fonts.mono,
                fontSize: 14,
                fontWeight: 600,
                color: "#f8fafc",
              }}
            >
              {fileName}
            </div>
            <div style={{ fontSize: 11, color: "rgba(255, 255, 255, 0.45)" }}>
              Cross-platform declarative workflow
            </div>
          </div>
        </div>

        <div
          style={{
            fontFamily: TOKENS.fonts.mono,
            fontSize: 10,
            letterSpacing: "0.06em",
            padding: "3px 8px",
            borderRadius: 4,
            backgroundColor: "rgba(134, 239, 172, 0.12)",
            border: "1px solid rgba(134, 239, 172, 0.28)",
            color: "#86efac",
            fontWeight: 600,
          }}
        >
          AUTOMATED REPLAY
        </div>
      </div>

      {/* Steps List */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 7,
          fontFamily: TOKENS.fonts.mono,
          fontSize: 12,
        }}
      >
        {steps.map((st, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "6px 10px",
              borderRadius: 6,
              backgroundColor: "rgba(255, 255, 255, 0.025)",
              border: "1px solid rgba(255, 255, 255, 0.05)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ color: "rgba(255, 255, 255, 0.4)", fontSize: 11 }}>
                {st.num}
              </span>
              <span style={{ color: "#f1f5f9" }}>{st.text}</span>
            </div>
            {st.completed && (
              <span
                style={{
                  color: "#86efac",
                  fontSize: 12,
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                }}
              >
                <Check size={13} />
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Cross-Platform Extension */}
      {showPlatforms && (
        <div
          style={{
            borderTop: "1px solid rgba(255, 255, 255, 0.08)",
            paddingTop: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
            opacity: platformProgress,
            transform: `translateY(${(1 - platformProgress) * 6}px)`,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontFamily: TOKENS.fonts.mono,
              letterSpacing: "0.08em",
              color: "rgba(255, 255, 255, 0.45)",
              textTransform: "uppercase",
            }}
          >
            SUPPORTED PLATFORM REPLAY
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
            }}
          >
            {platforms.map((p, idx) => (
              <div
                key={idx}
                style={{
                  padding: "8px 10px",
                  borderRadius: 6,
                  backgroundColor: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 2,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontWeight: 600,
                    fontSize: 12,
                    color: "#f8fafc",
                  }}
                >
                  <span>{p.name}</span>
                  <Check size={12} color="#86efac" />
                </div>
                <div
                  style={{
                    fontFamily: TOKENS.fonts.mono,
                    fontSize: 10,
                    color: "rgba(255, 255, 255, 0.4)",
                  }}
                >
                  {p.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

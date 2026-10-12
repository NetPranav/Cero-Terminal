import React from "react";
import { TOKENS } from "../styles/tokens";

interface ProjectDiscoveryProps {
  selectedIndex?: number; // 0, 1, 2
  resolved?: boolean;
}

export const ProjectDiscovery: React.FC<ProjectDiscoveryProps> = ({
  selectedIndex = 0,
  resolved = false,
}) => {
  const matches = [
    {
      index: "1",
      path: "~/projects/app",
      tag: "git:main",
      stack: "Node.js / React 19",
    },
    {
      index: "2",
      path: "~/drone_ws",
      tag: "ros2:humble",
      stack: "C++ / Colcon",
    },
    {
      index: "3",
      path: "~/workspace/project",
      tag: "git:feature",
      stack: "Rust / Cargo",
    },
  ];

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        backgroundColor: TOKENS.colors.surfaceCard,
        border: `1px solid ${TOKENS.colors.borderCard}`,
        borderRadius: 8,
        padding: "16px 20px",
        fontFamily: TOKENS.fonts.mono,
        width: "100%",
        maxWidth: 580,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: `1px solid ${TOKENS.colors.borderSubtle}`,
          paddingBottom: 8,
        }}
      >
        <span style={{ fontSize: 11, color: TOKENS.colors.textMuted, letterSpacing: "0.08em" }}>
          DISCOVERED WORKSPACES (3 MATCHES)
        </span>
        <span style={{ fontSize: 10, color: TOKENS.colors.textSubtle }}>
          INDEXED VIA REPO SCAN
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, margin: "6px 0" }}>
        {matches.map((item, idx) => {
          const isSelected = selectedIndex === idx;

          return (
            <div
              key={item.index}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "8px 12px",
                borderRadius: 5,
                backgroundColor: isSelected
                  ? "rgba(255, 255, 255, 0.08)"
                  : "rgba(255, 255, 255, 0.02)",
                border: isSelected
                  ? `1px solid ${TOKENS.colors.borderActive}`
                  : `1px solid ${TOKENS.colors.borderSubtle}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span
                  style={{
                    color: isSelected ? TOKENS.colors.textPrimary : TOKENS.colors.textMuted,
                    fontWeight: 600,
                    fontSize: 12,
                  }}
                >
                  [{item.index}]
                </span>
                <span
                  style={{
                    color: isSelected ? TOKENS.colors.textPrimary : TOKENS.colors.textSecondary,
                    fontWeight: isSelected ? 600 : 400,
                    fontSize: 13,
                  }}
                >
                  {item.path}
                </span>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  style={{
                    fontSize: 10,
                    color: TOKENS.colors.textMuted,
                    backgroundColor: "rgba(255, 255, 255, 0.04)",
                    padding: "2px 6px",
                    borderRadius: 3,
                  }}
                >
                  {item.tag}
                </span>
                <span style={{ fontSize: 10, color: TOKENS.colors.textSubtle }}>
                  {item.stack}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderTop: `1px solid ${TOKENS.colors.borderSubtle}`,
          paddingTop: 8,
          fontSize: 11,
        }}
      >
        <span style={{ color: TOKENS.colors.textMuted }}>
          Enter selection [1-3]:{" "}
          <strong style={{ color: TOKENS.colors.textPrimary }}>
            {selectedIndex + 1}
          </strong>
        </span>
        {resolved && (
          <span style={{ color: TOKENS.colors.statusSuccess, fontWeight: 500 }}>
            ✓ Workspace context resolved
          </span>
        )}
      </div>
    </div>
  );
};

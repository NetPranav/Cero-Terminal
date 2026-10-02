import React from "react";
import { Img, staticFile } from "remotion";

interface CeroLogoProps {
  size?: number;
  opacity?: number;
  style?: React.CSSProperties;
}

export const CeroLogo: React.FC<CeroLogoProps> = ({
  size = 64,
  opacity = 1,
  style = {},
}) => {
  return (
    <div
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity,
        position: "relative",
        ...style,
      }}
    >
      <Img
        src={staticFile("images/cero-logo.png")}
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          filter: "drop-shadow(0 4px 16px rgba(0, 0, 0, 0.6))",
        }}
      />
    </div>
  );
};

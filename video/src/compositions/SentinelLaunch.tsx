import React from "react";
import { Series, AbsoluteFill } from "remotion";
import { SCENES } from "../data/scenes";
import { Scene01ColdOpen } from "../scenes/Scene01ColdOpen";
import { Scene02OldLoop } from "../scenes/Scene02OldLoop";
import { Scene03Reveal } from "../scenes/Scene03Reveal";
import { Scene04NaturalLanguage } from "../scenes/Scene04NaturalLanguage";
import { Scene05Context } from "../scenes/Scene05Context";
import { Scene06SelfHealing } from "../scenes/Scene06SelfHealing";
import { Scene07Workflows } from "../scenes/Scene07Workflows";
import { Scene08Workspace } from "../scenes/Scene08Workspace";
import { Scene09Safety } from "../scenes/Scene09Safety";
import { Scene10LocalAI } from "../scenes/Scene10LocalAI";
import { Scene11Ecosystem } from "../scenes/Scene11Ecosystem";
import { Scene12Final } from "../scenes/Scene12Final";

export const SentinelLaunch: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0A0C" }}>
      <Series>
        {/* Scene 01: Cold Open (0 - 135) */}
        <Series.Sequence durationInFrames={SCENES[0].durationInFrames} name="01-ColdOpen">
          <Scene01ColdOpen />
        </Series.Sequence>

        {/* Scene 02: Old Loop (135 - 300) */}
        <Series.Sequence durationInFrames={SCENES[1].durationInFrames} name="02-OldLoop">
          <Scene02OldLoop />
        </Series.Sequence>

        {/* Scene 03: Reveal (300 - 450) */}
        <Series.Sequence durationInFrames={SCENES[2].durationInFrames} name="03-Reveal">
          <Scene03Reveal />
        </Series.Sequence>

        {/* Scene 04: Natural Language (450 - 660) */}
        <Series.Sequence durationInFrames={SCENES[3].durationInFrames} name="04-NaturalLanguage">
          <Scene04NaturalLanguage />
        </Series.Sequence>

        {/* Scene 05: Context (660 - 840) */}
        <Series.Sequence durationInFrames={SCENES[4].durationInFrames} name="05-Context">
          <Scene05Context />
        </Series.Sequence>

        {/* Scene 06: Self Healing (840 - 1080) */}
        <Series.Sequence durationInFrames={SCENES[5].durationInFrames} name="06-SelfHealing">
          <Scene06SelfHealing />
        </Series.Sequence>

        {/* Scene 07: Workflows (1080 - 1290) */}
        <Series.Sequence durationInFrames={SCENES[6].durationInFrames} name="07-Workflows">
          <Scene07Workflows />
        </Series.Sequence>

        {/* Scene 08: Workspace (1290 - 1440) */}
        <Series.Sequence durationInFrames={SCENES[7].durationInFrames} name="08-Workspace">
          <Scene08Workspace />
        </Series.Sequence>

        {/* Scene 09: Safety (1440 - 1620) */}
        <Series.Sequence durationInFrames={SCENES[8].durationInFrames} name="09-Safety">
          <Scene09Safety />
        </Series.Sequence>

        {/* Scene 10: Local AI (1620 - 1800) */}
        <Series.Sequence durationInFrames={SCENES[9].durationInFrames} name="10-LocalAI">
          <Scene10LocalAI />
        </Series.Sequence>

        {/* Scene 11: Ecosystem (1800 - 2040) */}
        <Series.Sequence durationInFrames={SCENES[10].durationInFrames} name="11-Ecosystem">
          <Scene11Ecosystem />
        </Series.Sequence>

        {/* Scene 12: Final Hero (2040 - 2250) */}
        <Series.Sequence durationInFrames={SCENES[11].durationInFrames} name="12-Final">
          <Scene12Final />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

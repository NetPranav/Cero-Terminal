import React from "react";
import { Series, AbsoluteFill } from "remotion";
import { Scene01ColdOpen } from "../scenes/Scene01ColdOpen";
import { Scene03Reveal } from "../scenes/Scene03Reveal";
import { Scene04NaturalLanguage } from "../scenes/Scene04NaturalLanguage";
import { Scene06SelfHealing } from "../scenes/Scene06SelfHealing";
import { Scene07Workflows } from "../scenes/Scene07Workflows";
import { Scene12Final } from "../scenes/Scene12Final";

export const SentinelLaunchShort: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0A0C" }}>
      <Series>
        {/* Hook */}
        <Series.Sequence durationInFrames={90} name="01-ColdOpen">
          <Scene01ColdOpen />
        </Series.Sequence>

        {/* Sentinel Reveal */}
        <Series.Sequence durationInFrames={120} name="02-Reveal">
          <Scene03Reveal />
        </Series.Sequence>

        {/* Natural Language Command */}
        <Series.Sequence durationInFrames={180} name="03-NaturalLanguage">
          <Scene04NaturalLanguage />
        </Series.Sequence>

        {/* Self Healing */}
        <Series.Sequence durationInFrames={210} name="04-SelfHealing">
          <Scene06SelfHealing />
        </Series.Sequence>

        {/* Workflows */}
        <Series.Sequence durationInFrames={150} name="05-Workflows">
          <Scene07Workflows />
        </Series.Sequence>

        {/* Final Hero */}
        <Series.Sequence durationInFrames={150} name="06-Final">
          <Scene12Final />
        </Series.Sequence>
      </Series>
    </AbsoluteFill>
  );
};

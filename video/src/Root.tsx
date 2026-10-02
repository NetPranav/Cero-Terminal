import React from "react";
import { Composition, Folder } from "remotion";
import { SentinelLaunch } from "./compositions/SentinelLaunch";
import { SentinelLaunchVertical } from "./compositions/SentinelLaunchVertical";
import { SentinelLaunchShort } from "./compositions/SentinelLaunchShort";
import { SentinelLaunch30sPremium } from "./compositions/SentinelLaunch30sPremium";
import { SentinelLaunch30sPremiumVertical } from "./compositions/SentinelLaunch30sPremiumVertical";
import { SCENES } from "./data/scenes";

// Scenes for connected composition preview in Studio
import { Scene01ColdOpen } from "./scenes/Scene01ColdOpen";
import { Scene02OldLoop } from "./scenes/Scene02OldLoop";
import { Scene03Reveal } from "./scenes/Scene03Reveal";
import { Scene04NaturalLanguage } from "./scenes/Scene04NaturalLanguage";
import { Scene05Context } from "./scenes/Scene05Context";
import { Scene06SelfHealing } from "./scenes/Scene06SelfHealing";
import { Scene07Workflows } from "./scenes/Scene07Workflows";
import { Scene08Workspace } from "./scenes/Scene08Workspace";
import { Scene09Safety } from "./scenes/Scene09Safety";
import { Scene10LocalAI } from "./scenes/Scene10LocalAI";
import { Scene11Ecosystem } from "./scenes/Scene11Ecosystem";
import { Scene12Final } from "./scenes/Scene12Final";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {/* 30-Second Premium Masters */}
      <Folder name="30s-Premium">
        <Composition
          id="SentinelLaunch30sPremium"
          component={SentinelLaunch30sPremium}
          durationInFrames={900}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="SentinelLaunch30sPremiumVertical"
          component={SentinelLaunch30sPremiumVertical}
          durationInFrames={900}
          fps={30}
          width={1080}
          height={1920}
        />
      </Folder>

      {/* 75-Second Masters */}
      <Folder name="75s-Masters">
        <Composition
          id="SentinelLaunchLandscape"
          component={SentinelLaunch}
          durationInFrames={2250}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="SentinelLaunchVertical"
          component={SentinelLaunchVertical}
          durationInFrames={2250}
          fps={30}
          width={1080}
          height={1920}
        />
        <Composition
          id="SentinelLaunchShort"
          component={SentinelLaunchShort}
          durationInFrames={900}
          fps={30}
          width={1920}
          height={1080}
        />
      </Folder>

      {/* Individual Scene Compositions for Studio Scrubbing */}
      <Folder name="Scenes">
        <Composition
          id="01-ColdOpen"
          component={Scene01ColdOpen}
          durationInFrames={SCENES[0].durationInFrames}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="02-OldLoop"
          component={Scene02OldLoop}
          durationInFrames={SCENES[1].durationInFrames}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="03-Reveal"
          component={Scene03Reveal}
          durationInFrames={SCENES[2].durationInFrames}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="04-NaturalLanguage"
          component={Scene04NaturalLanguage}
          durationInFrames={SCENES[3].durationInFrames}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="05-Context"
          component={Scene05Context}
          durationInFrames={SCENES[4].durationInFrames}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="06-SelfHealing"
          component={Scene06SelfHealing}
          durationInFrames={SCENES[5].durationInFrames}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="07-Workflows"
          component={Scene07Workflows}
          durationInFrames={SCENES[6].durationInFrames}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="08-Workspace"
          component={Scene08Workspace}
          durationInFrames={SCENES[7].durationInFrames}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="09-Safety"
          component={Scene09Safety}
          durationInFrames={SCENES[8].durationInFrames}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="10-LocalAI"
          component={Scene10LocalAI}
          durationInFrames={SCENES[9].durationInFrames}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="11-Ecosystem"
          component={Scene11Ecosystem}
          durationInFrames={SCENES[10].durationInFrames}
          fps={30}
          width={1920}
          height={1080}
        />
        <Composition
          id="12-Final"
          component={Scene12Final}
          durationInFrames={SCENES[11].durationInFrames}
          fps={30}
          width={1920}
          height={1080}
        />
      </Folder>
    </>
  );
};

export interface SceneDefinition {
  id: string;
  name: string;
  startFrame: number;
  durationInFrames: number;
  endFrame: number;
  description: string;
}

export const SCENES: SceneDefinition[] = [
  {
    id: "scene-01-cold-open",
    name: "Cold Open",
    startFrame: 0,
    durationInFrames: 135,
    endFrame: 135,
    description: "Cursor blink, problem statement, no logo, tension establishment",
  },
  {
    id: "scene-02-old-loop",
    name: "The Old Loop",
    startFrame: 135,
    durationInFrames: 165,
    endFrame: 300,
    description: "Terminal friction: error, lsof, browser docs, copy/paste, retry loop",
  },
  {
    id: "scene-03-reveal",
    name: "Sentinel Reveal",
    startFrame: 300,
    durationInFrames: 150,
    endFrame: 450,
    description: "Clean frame draws, top bar, tab bar, status bar, prompt becomes active",
  },
  {
    id: "scene-04-natural-language",
    name: "Natural Language -> Action",
    startFrame: 450,
    durationInFrames: 210,
    endFrame: 660,
    description: "Type >find what is using port 3000, analyzing status, node PID found",
  },
  {
    id: "scene-05-context",
    name: "Context Awareness",
    startFrame: 660,
    durationInFrames: 180,
    endFrame: 840,
    description: "run my project, workspace indexing, terminal disambiguation list",
  },
  {
    id: "scene-06-self-healing",
    name: "Self-Healing",
    startFrame: 840,
    durationInFrames: 240,
    endFrame: 1080,
    description: "EADDRINUSE error, failure classification, automated remediation & retry",
  },
  {
    id: "scene-07-workflows",
    name: "Workflows",
    startFrame: 1080,
    durationInFrames: 210,
    endFrame: 1290,
    description: "prepare project for release, 5-phase execution, save & replay flow",
  },
  {
    id: "scene-08-workspace",
    name: "Multi-Pane Workspace",
    startFrame: 1290,
    durationInFrames: 150,
    endFrame: 1440,
    description: "Binary tree split panes, real PTY concurrency, visual mode controls",
  },
  {
    id: "scene-09-safety",
    name: "Safety & Control",
    startFrame: 1440,
    durationInFrames: 180,
    endFrame: 1620,
    description: "Sensitive operation, consent gate, command inspection, undo rollback",
  },
  {
    id: "scene-10-local-ai",
    name: "Local AI & Privacy",
    startFrame: 1620,
    durationInFrames: 180,
    endFrame: 1800,
    description: "System diagram: local machine boundary, offline Qwen inference",
  },
  {
    id: "scene-11-ecosystem",
    name: "Product Ecosystem",
    startFrame: 1800,
    durationInFrames: 240,
    endFrame: 2040,
    description: "Rapid, elegant 5-capability montage matching technical UI",
  },
  {
    id: "scene-12-final",
    name: "Final Hero",
    startFrame: 2040,
    durationInFrames: 210,
    endFrame: 2250,
    description: "Calm terminal state, product wordmark, verified repository URL, fade",
  },
];

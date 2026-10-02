export interface ProductConfig {
  name: string;
  wordmark: string;
  tagline: string;
  subheadline: string;
  version: string;
  githubUrl: string;
  author: string;
  platforms: string[];
  shellCompatibility: string[];
  aiEngines: {
    name: string;
    description: string;
    local: boolean;
  }[];
  scenes: {
    coldOpenLine1: string;
    coldOpenLine2: string;
    frictionTitle: string;
    frictionSubtitle: string;
    revealSubtitle: string;
    naturalLanguageCommand: string;
    naturalLanguageTarget: string;
    workspaceQuery: string;
    workspaceMatches: string[];
    selfHealingCommand: string;
    selfHealingError: string;
    selfHealingRemedy: string;
    workflowPrompt: string;
    workflowSteps: { phase: string; title: string; status: string }[];
    safetyWarning: string;
    safetyAction: string;
    safetyCommands: string[];
    localAiTitle: string;
    localAiSubtitle: string;
    ecosystemItems: { title: string; subtitle: string; code: string }[];
  };
}

export const PRODUCT: ProductConfig = {
  name: "Sentinel Terminal",
  wordmark: "SENTINEL",
  tagline: "The terminal that takes requests in plain language.",
  subheadline: "An AI-native terminal for developers. Runs .flow files on any OS.",
  version: "2.1.0",
  githubUrl: "github.com/NetPranav/Sentinal-Terminal",
  author: "Pranav Dubey",
  platforms: ["macOS", "Linux", "Windows"],
  shellCompatibility: ["bash", "zsh", "PowerShell"],
  aiEngines: [
    {
      name: "Qwen2.5-Coder 3B",
      description: "Local embedded inference via llama.cpp sidecar (zero telemetry)",
      local: true,
    },
    {
      name: "Ollama",
      description: "Local self-hosted models",
      local: true,
    },
    {
      name: "Cloud Providers",
      description: "Optional OpenAI, Anthropic, Groq, OpenRouter",
      local: false,
    },
  ],
  scenes: {
    coldOpenLine1: "Your terminal shouldn't fight you.",
    coldOpenLine2: "Neither should your tools.",
    frictionTitle: "Context switching.",
    frictionSubtitle: "Copy. Search. Paste. Retry.",
    revealSubtitle: "An AI-native terminal for developers.",
    naturalLanguageCommand: ">find what is using port 3000",
    naturalLanguageTarget: "Port 3000   PID 4190   node",
    workspaceQuery: ">run my project",
    workspaceMatches: [
      "~/projects/app",
      "~/drone_ws",
      "~/workspace/project",
    ],
    selfHealingCommand: ">start the development server",
    selfHealingError: "Error: Port 3000 is already in use (EADDRINUSE)",
    selfHealingRemedy: "Stop PID 4190 and bind port 3000",
    workflowPrompt: ">prepare project for release",
    workflowSteps: [
      { phase: "01", title: "INSPECT", status: "COMPLETE" },
      { phase: "02", title: "INSTALL", status: "COMPLETE" },
      { phase: "03", title: "BUILD", status: "COMPLETE" },
      { phase: "04", title: "VERIFY", status: "COMPLETE" },
      { phase: "05", title: "PACKAGE", status: "COMPLETE" },
    ],
    safetyWarning: "Action requires confirmation",
    safetyAction: "remove project build artifacts",
    safetyCommands: [
      "rm -rf dist/",
      "rm -rf target/release/",
      "rm -rf .cache/",
    ],
    localAiTitle: "Your terminal. Your context. Your machine.",
    localAiSubtitle: "Embedded local inference keeps requests private and offline.",
    ecosystemItems: [
      {
        title: "NATURAL LANGUAGE",
        subtitle: "Type > to ask anything in plain language",
        code: ">what is the total of score column in data.csv?",
      },
      {
        title: ".FLOW SETUP AUTOMATION",
        subtitle: "Write once, run natively across any OS",
        code: ">run the workflow in dev-setup.flow",
      },
      {
        title: "PROJECT DISCOVERY",
        subtitle: "Instant workspace resolution without directory hunting",
        code: "Indexed 14 Git repositories and 4 ROS2 workspaces",
      },
      {
        title: "SPLIT WORKSPACES",
        subtitle: "High-performance xterm WebGL panes and tabs",
        code: "Binary tree layout with real PTY concurrency",
      },
      {
        title: "SAFETY & AUDIT TRAILS",
        subtitle: "Explicit consent gates and masked credentials",
        code: "[!] Safe execution policy enforced. Undo enabled.",
      },
    ],
  },
};

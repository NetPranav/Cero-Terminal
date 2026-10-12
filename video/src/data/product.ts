export interface ProductConfig {
  name: string;
  wordmark: string;
  previousName: string;
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
  name: "CERO",
  wordmark: "CERO",
  previousName: "Sentinel",
  tagline: "A terminal you can talk to.",
  subheadline: "AI-native terminal and workflow automation for developers.",
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
    coldOpenLine1: "A terminal you can talk to.",
    coldOpenLine2: "AI-native terminal and workflow automation for developers.",
    frictionTitle: "Context switching.",
    frictionSubtitle: "Copy. Search. Paste. Retry.",
    revealSubtitle: "AI-native terminal and workflow automation for developers.",
    naturalLanguageCommand: "> create a folder demo-app, initialize git, npm init, then list the files",
    naturalLanguageTarget: "package.json  .git/",
    workspaceQuery: "> find what's using port 3000",
    workspaceMatches: [
      "PORT 3000   PROCESS node   PID 4190",
    ],
    selfHealingCommand: "> close port 3000",
    selfHealingError: "Port 3000 listening by node (PID 4190)",
    selfHealingRemedy: "Stop PID 4190 and release port 3000",
    workflowPrompt: "> make me a workflow for this",
    workflowSteps: [
      { phase: "01", title: "create project", status: "COMPLETE" },
      { phase: "02", title: "initialize git", status: "COMPLETE" },
      { phase: "03", title: "install dependencies", status: "COMPLETE" },
      { phase: "04", title: "verify", status: "COMPLETE" },
      { phase: "05", title: "run", status: "COMPLETE" },
    ],
    safetyWarning: "Run this command?",
    safetyAction: "kill 4190",
    safetyCommands: [
      "kill 4190",
    ],
    localAiTitle: "Your terminal. Your system. Your control.",
    localAiSubtitle: "Embedded local inference keeps requests private and offline.",
    ecosystemItems: [
      {
        title: "NATURAL LANGUAGE",
        subtitle: "Type > to ask anything in plain language",
        code: "> create a folder demo-app, initialize git, npm init, then list the files",
      },
      {
        title: ".FLOW SETUP AUTOMATION",
        subtitle: "Write once, run natively across any OS",
        code: "> make me a workflow for this",
      },
      {
        title: "SYSTEM AWARENESS",
        subtitle: "Port and process resolution without manual PID hunting",
        code: "> find what's using port 3000",
      },
      {
        title: "SAFETY & CONSENT GATES",
        subtitle: "Explicit verification before process termination",
        code: "> close port 3000",
      },
    ],
  },
};

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DiagnosticLogger } from "./infrastructure/logging/DiagnosticLogger";
import { UrlSchemeHandler } from "./domain/integration/UrlSchemeHandler";
import { hydrateSentinelStore } from "./utils/fsPolyfill";

async function bootstrap() {
  DiagnosticLogger.init().catch(() => {});

  // Load ~/.sentinel learning state before any store is constructed, so synchronous reads in the
  // stores see it. Bounded so a slow disk can never hold up the first paint.
  await Promise.race([
    hydrateSentinelStore(),
    new Promise(resolve => setTimeout(resolve, 1500)),
  ]);

  let initialPath: string | undefined;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const args = await invoke<string[]>("get_launch_args");
    if (args && args.length > 1) {
      const candidateArgs = args.slice(1).filter((arg) => arg && !arg.startsWith("-"));
      if (candidateArgs.length > 0) {
        const actions = UrlSchemeHandler.getInstance().parseMany(candidateArgs);
        if (actions.length > 0 && actions[0].path) {
          initialPath = actions[0].path;
        }
      }
    }
  } catch {
    // Non-Tauri environment or launch args not available
  }

  const rootElement = document.getElementById("root");
  if (rootElement) {
    ReactDOM.createRoot(rootElement as HTMLElement).render(
      <React.StrictMode>
        <App initialPath={initialPath} />
      </React.StrictMode>,
    );
  }
}

bootstrap();

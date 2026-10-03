import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { DiagnosticLogger } from "./infrastructure/logging/DiagnosticLogger";
import { UrlSchemeHandler } from "./domain/integration/UrlSchemeHandler";
import { hydrateCeroStore } from "./utils/fsPolyfill";
import { migrateLegacyStorage } from "./utils/legacyStorage";

async function bootstrap() {
  // settings saved under the old name (Sentinel Terminal) carry over before anything reads them
  try { migrateLegacyStorage(localStorage); } catch { /* storage blocked */ }
  DiagnosticLogger.init().catch(() => {});

  // Load ~/.cero learning state before any store is constructed, so synchronous reads in the
  // stores see it. Bounded so a slow disk can never hold up the first paint.
  await Promise.race([
    hydrateCeroStore(),
    new Promise(resolve => setTimeout(resolve, 1500)),
  ]);

  // Opened to run .flow files (double-click, "Open with", `cero setup.flow`)?
  const flowFiles = await takeLaunchFlowFiles();
  if (flowFiles.length > 0 && (await runDesktopOnlyFlowsHidden(flowFiles))) return;

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
        <App initialPath={initialPath} initialFlowFiles={flowFiles} />
      </React.StrictMode>,
    );
  }
}

/** .flow files in the launch arguments or handed over by the OS (macOS "Open"), as local paths */
async function takeLaunchFlowFiles(): Promise<string[]> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    const { isWorkflowFilePath } = await import("./workflows/storage/FlowImport");
    const args = (await invoke<string[]>("get_launch_args").catch(() => [])).slice(1);
    const opened = await invoke<string[]>("take_opened_files").catch(() => []);
    const toPath = (v: string) => {
      if (!v.startsWith("file://")) return v;
      try {
        const path = decodeURIComponent(new URL(v).pathname);
        // file:///C:/Users/... on Windows
        return /^\/[A-Za-z]:/.test(path) ? path.slice(1) : path;
      } catch {
        return v;
      }
    };
    return [...args, ...opened].filter(a => a && !a.startsWith("-")).map(toPath).filter(isWorkflowFilePath);
  } catch {
    return [];
  }
}

/**
 * A flow that only opens apps, links and folders runs here, before any terminal exists, and the
 * app then quits: the user sees Chrome and VS Code open, never the terminal. Returns false when the
 * window is already showing or a flow needs the terminal (the app then starts normally with it).
 */
async function runDesktopOnlyFlowsHidden(files: string[]): Promise<boolean> {
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    if (await invoke<boolean>("is_main_window_visible")) return false;
    const { planFlowFile, flowOsOf } = await import("./workflows/flow/FlowPlan");
    const { runDesktopSteps } = await import("./workflows/flow/FlowRunner");
    const { getPlatform } = await import("./shared/platform");
    const os = flowOsOf(getPlatform());
    const plans = [];
    for (const file of files) {
      const text = await invoke<string>("read_system_file", { path: file }).catch(() => "");
      const plan = text ? planFlowFile(text, file, os) : null;
      if (plan) plans.push(plan);
    }
    if (plans.length === 0 || plans.some(p => p.needsTerminal)) {
      await invoke("show_main_window");
      return false;
    }
    for (const plan of plans) {
      await runDesktopSteps(plan.steps, os, (command, args) =>
        invoke<{ code: number; stdout: string; stderr: string }>("execute_command", { command, args, timeoutMs: 30000 }));
    }
    const { exit } = await import("@tauri-apps/plugin-process");
    await exit(0);
    return true;
  } catch {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("show_main_window");
    } catch {
      // outside the desktop app
    }
    return false;
  }
}

bootstrap();

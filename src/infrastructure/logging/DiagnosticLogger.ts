import { invoke } from '@tauri-apps/api/core';

let isInitialized = false;
let isDebugMode = false;

export class DiagnosticLogger {
  public static async init(): Promise<void> {
    if (isInitialized) return;
    isInitialized = true;

    try {
      isDebugMode = await invoke<boolean>('is_debug_active');
    } catch {
      isDebugMode = false;
    }

    if (isDebugMode) {
      await this.log('INFO', 'FRONTEND', 'DiagnosticLogger initialized in webview context');
    }

    // Capture uncaught JavaScript runtime exceptions
    window.addEventListener('error', (event: ErrorEvent) => {
      const location = event.filename ? ` at ${event.filename}:${event.lineno}:${event.colno}` : '';
      const message = `${event.message || 'Unknown error'}${location}${event.error?.stack ? `\nStack: ${event.error.stack}` : ''}`;
      this.log('ERROR', 'FRONTEND', `Uncaught exception: ${message}`);
    });

    // Capture unhandled promise rejections
    window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
      const reason = event.reason instanceof Error
        ? `${event.reason.message}\nStack: ${event.reason.stack || 'none'}`
        : String(event.reason);
      this.log('ERROR', 'FRONTEND', `Unhandled promise rejection: ${reason}`);
    });

    // Forward console.error and console.warn when debug mode is enabled
    const originalConsoleError = console.error.bind(console);
    console.error = (...args: any[]) => {
      originalConsoleError(...args);
      const text = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
      this.log('ERROR', 'CONSOLE', text);
    };

    const originalConsoleWarn = console.warn.bind(console);
    console.warn = (...args: any[]) => {
      originalConsoleWarn(...args);
      if (isDebugMode) {
        const text = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
        this.log('WARN', 'CONSOLE', text);
      }
    };
  }

  public static async log(level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR', tag: string, message: string): Promise<void> {
    try {
      await invoke('log_diagnostic', { level, tag, message });
    } catch {
      // IPC might not be ready or failed
    }
  }

  public static isDebug(): boolean {
    return isDebugMode;
  }
}

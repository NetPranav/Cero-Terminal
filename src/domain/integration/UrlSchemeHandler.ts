export type SentinelActionType = 'open' | 'workspace' | 'run' | 'new-tab' | 'split' | 'noop';

export interface SentinelUrlAction {
  type: SentinelActionType;
  path?: string;
  command?: string;
  rawUrl: string;
}

export class UrlSchemeHandler {
  private static instance: UrlSchemeHandler;

  private constructor() {}

  public static getInstance(): UrlSchemeHandler {
    if (!UrlSchemeHandler.instance) {
      UrlSchemeHandler.instance = new UrlSchemeHandler();
    }
    return UrlSchemeHandler.instance;
  }

  /**
   * Parse a sentinel:// URL or direct POSIX path into an actionable terminal instruction.
   */
  public parse(input: string): SentinelUrlAction {
    const cleanInput = input.trim();
    if (!cleanInput) {
      return { type: 'noop', rawUrl: input };
    }

    // Handle file:// protocol passed by FreeDesktop file managers
    if (cleanInput.startsWith('file://')) {
      try {
        const fileUrl = new URL(cleanInput);
        const resolvedPath = decodeURIComponent(fileUrl.pathname);
        if (resolvedPath) {
          return {
            type: 'open',
            path: resolvedPath,
            rawUrl: cleanInput,
          };
        }
      } catch {}
    }

    // Handle raw filesystem paths passed via Finder Quick Actions, CLI, or open -a commands
    if (cleanInput.startsWith('/') || cleanInput.startsWith('~/') || cleanInput.startsWith('./') || cleanInput.startsWith('../')
      || /^[A-Za-z]:[\\/]/.test(cleanInput) || cleanInput.startsWith('\\\\')) {
      return {
        type: 'open',
        path: cleanInput,
        rawUrl: cleanInput,
      };
    }

    if (!cleanInput.startsWith('sentinel://') && !cleanInput.startsWith('sentinel:')) {
      return { type: 'noop', rawUrl: input };
    }

    try {
      // Normalise URL string if custom handler lacks double slash
      const urlStr = cleanInput.startsWith('sentinel://') ? cleanInput : cleanInput.replace('sentinel:', 'sentinel://');
      const url = new URL(urlStr);
      const action = url.hostname || url.pathname.replace(/^\//, '');
      const searchParams = url.searchParams;

      if (action === 'open' || action === 'workspace') {
        const targetPath = searchParams.get('path') || undefined;
        return {
          type: action === 'workspace' ? 'workspace' : 'open',
          path: targetPath ? decodeURIComponent(targetPath) : undefined,
          rawUrl: input,
        };
      }

      if (action === 'run' || action === 'exec' || action === 'execute') {
        const cmd = searchParams.get('cmd') || searchParams.get('command') || '';
        const targetPath = searchParams.get('path') || undefined;
        return {
          type: 'run',
          command: cmd ? decodeURIComponent(cmd) : undefined,
          path: targetPath ? decodeURIComponent(targetPath) : undefined,
          rawUrl: input,
        };
      }

      if (action === 'new-tab' || action === 'new') {
        const targetPath = searchParams.get('path') || undefined;
        return {
          type: 'new-tab',
          path: targetPath ? decodeURIComponent(targetPath) : undefined,
          rawUrl: input,
        };
      }

      if (action === 'split') {
        const targetPath = searchParams.get('path') || undefined;
        return {
          type: 'split',
          path: targetPath ? decodeURIComponent(targetPath) : undefined,
          rawUrl: input,
        };
      }

      return { type: 'open', rawUrl: input };
    } catch (e) {
      console.warn('Failed to parse Sentinel URI scheme:', input, e);
      return { type: 'noop', rawUrl: input };
    }
  }

  /**
   * Parse a collection of URLs or argument strings, returning valid actions.
   */
  public parseMany(inputs: string[]): SentinelUrlAction[] {
    return inputs
      .map(i => this.parse(i))
      .filter(action => action.type !== 'noop');
  }
}

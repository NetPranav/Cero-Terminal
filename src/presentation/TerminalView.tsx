import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { invoke } from '@tauri-apps/api/core';
import { SessionManager } from '../domain/SessionManager';
import { ToolLoader } from '../tools/loader/ToolLoader';
import { AppAliasRegistry } from '../domain/capabilities/AppAliasRegistry';
import { AgentLoop, AgentPlan } from '../ai/agent/AgentLoop';
import { PromptProgressManager } from '../ai/agent/PromptProgressManager';
import { DemonstrationLearningEngine } from '../domain/learning/DemonstrationLearningEngine';
import { EpisodicMemoryEngine } from '../domain/learning/EpisodicMemoryEngine';
import { SentinelSerlCoordinator } from '../domain/learning/SentinelSerlCoordinator';
import { PtyOutputObserver, type RemediationPrompt } from '../domain/observer/PtyOutputObserver';
import { formatAgentEvent, formatDataOutput } from './OutputFormatter';

import { AutocompleteEngine } from '../domain/autocomplete/AutocompleteEngine';
import { HistoryProvider } from '../domain/autocomplete/HistoryProvider';
import { DemonstrationProvider } from '../domain/autocomplete/DemonstrationProvider';
import { WorkspaceContextProvider } from '../domain/autocomplete/WorkspaceContextProvider';
import { GhostTextRenderer } from '../ui/components/GhostText';
import { ThemeManager } from '../ui/theme/ThemeManager';
import { ConsentQueue } from '../domain/security/ConsentQueue';
import { CommandSafetyGuardian } from '../domain/security/CommandSafetyGuardian';
import { PtyStateTracker } from '../domain/terminal/PtyStateTracker';
import { PromptNavigationEngine, BufferLineInfo } from '../domain/terminal/PromptNavigationEngine';
import { ShellAdapter } from '../domain/shell/ShellAdapter';
import { isLinux, getPlatform } from '../shared/platform';
import { 
  Wrench, 
  Play, 
  X, 
  ShieldAlert, 
  AlertCircle, 
  Check,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { SearchAddon } from '@xterm/addon-search';
import { TerminalSearchBar } from './TerminalSearchBar';
import { readClipboardText, writeClipboardText, formatTerminalPastePayload } from '../utils/clipboard';
import '@xterm/xterm/css/xterm.css';

interface TerminalViewProps {
  sessionId?: string;
  onSessionCreated?: (sessionId: string) => void;
  isActive: boolean;
  currentPath?: string;
  onPathChange?: (newPath: string) => void;
}

export const TerminalView: React.FC<TerminalViewProps> = ({ sessionId: initialSessionId, onSessionCreated, isActive, currentPath, onPathChange }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(initialSessionId);
  const sessionIdRef = useRef<string | undefined>(initialSessionId);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    if (initialSessionId) {
      setSessionId(initialSessionId);
      sessionIdRef.current = initialSessionId;
    }
  }, [initialSessionId]);

  const handlePaste = useCallback(async () => {
    const activeSessionId = sessionIdRef.current || sessionId;
    if (!activeSessionId) return;

    try {
      const text = await readClipboardText();
      if (!text) return;

      const term = xtermRef.current;
      const isBracketed = Boolean(term?.modes?.bracketedPasteMode);

      let isPromptDraft = false;
      const buffer = term?.buffer?.active;
      if (buffer) {
        const line = buffer.getLine(buffer.baseY + buffer.cursorY);
        const lineStr = line ? line.translateToString(true).trim() : '';
        if (lineStr.includes('>')) {
          isPromptDraft = true;
        }
      }

      const payload = formatTerminalPastePayload(text, {
        isBracketedPaste: isBracketed,
        isPromptDraft: isPromptDraft
      });

      await SessionManager.getInstance().write(activeSessionId, payload);
    } catch (err) {
      console.warn('[TerminalView] Clipboard paste error:', err);
    }
  }, [sessionId]);

  const handlePasteRef = useRef(handlePaste);
  useEffect(() => {
    handlePasteRef.current = handlePaste;
  });

  const handleCopy = useCallback(async (text: string) => {
    try {
      await writeClipboardText(text);
    } catch (err) {
      console.warn('[TerminalView] Clipboard copy error:', err);
    }
  }, []);

  const handleCopyRef = useRef(handleCopy);
  useEffect(() => {
    handleCopyRef.current = handleCopy;
  });

  const currentPathRef = useRef(currentPath);
  useEffect(() => {
    currentPathRef.current = currentPath;
  });

  const [isSearchOpen, setIsSearchOpen] = useState(false);

  const [securityModalPlan, setSecurityModalPlan] = useState<{
    plan: any;
    resolve: (approved: boolean) => void;
    requestId?: string;
  } | null>(null);
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [latestPlan, setLatestPlan] = useState<AgentPlan | null>(null);
  const [isPlanOpen, setIsPlanOpen] = useState(true);
  const [planExecutionStatus, setPlanExecutionStatus] = useState<'running' | 'completed' | 'failed'>('running');
  const planExecutionStatusRef = useRef<'running' | 'completed' | 'failed'>('running');
  const [hudPlanEnabled, setHudPlanEnabled] = useState<boolean>(() => localStorage.getItem('sentinel_hud_plan_enabled') !== 'false');
  const [hudPlanDuration, setHudPlanDuration] = useState<string>(() => localStorage.getItem('sentinel_hud_plan_duration') || '8');
  const planDismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveringPlanRef = useRef<boolean>(false);

  const clearPlanDismissTimer = useCallback(() => {
    if (planDismissTimerRef.current) {
      clearTimeout(planDismissTimerRef.current);
      planDismissTimerRef.current = null;
    }
  }, []);

  const schedulePlanDismiss = useCallback(() => {
    clearPlanDismissTimer();
    const enabled = localStorage.getItem('sentinel_hud_plan_enabled') !== 'false';
    const duration = localStorage.getItem('sentinel_hud_plan_duration') || '8';
    if (!enabled || duration === 'disabled') {
      setLatestPlan(null);
      return;
    }
    if (duration === 'persistent') {
      return;
    }
    if (isHoveringPlanRef.current) {
      return;
    }
    const seconds = parseInt(duration, 10);
    const ms = (!isNaN(seconds) && seconds > 0 ? seconds : 8) * 1000;
    planDismissTimerRef.current = setTimeout(() => {
      setLatestPlan(null);
      planDismissTimerRef.current = null;
    }, ms);
  }, [clearPlanDismissTimer]);

  useEffect(() => {
    const handleSettingsChange = () => {
      const enabled = localStorage.getItem('sentinel_hud_plan_enabled') !== 'false';
      const duration = localStorage.getItem('sentinel_hud_plan_duration') || '8';
      setHudPlanEnabled(enabled);
      setHudPlanDuration(duration);
      if (!enabled || duration === 'disabled') {
        clearPlanDismissTimer();
        setLatestPlan(null);
      }
    };

    window.addEventListener('sentinel:hud-settings-changed', handleSettingsChange);
    return () => {
      window.removeEventListener('sentinel:hud-settings-changed', handleSettingsChange);
      clearPlanDismissTimer();
    };
  }, [clearPlanDismissTimer]);
  const [activeRemediation, setActiveRemediation] = useState<RemediationPrompt | null>(null);
  const agentLoopRef = useRef<AgentLoop | null>(null);
  const ptyTrackerRef = useRef<PtyStateTracker>(new PtyStateTracker());
  const lastUnresolvedGoalRef = useRef<{ goal: string; timestamp: number } | null>(null);

  const handleExecuteRemediation = async (rem: RemediationPrompt) => {
    setActiveRemediation(null);
    PtyOutputObserver.getInstance().clearRemediation();
    const activeSessionId = sessionIdRef.current || sessionId;
    if (activeSessionId) {
      await SessionManager.getInstance().write(activeSessionId, '\x03');
    }
    if (xtermRef.current) {
      xtermRef.current.write(`\r\n\x1b[1;32m[Sentinel Auto-Heal] Executing: ${rem.actionTitle}...\x1b[0m\r\n`);
    }
    if (rem.tool === 'shell.execute' && rem.params?.command && activeSessionId) {
      await SessionManager.getInstance().write(activeSessionId, `${rem.params.command}\r`);
    } else if (agentLoopRef.current) {
      PromptProgressManager.getInstance().startPrompt(`Auto-Heal: ${rem.actionTitle}`);
      try {
        const res = await agentLoopRef.current.run(`fix error: ${rem.actionTitle}`, { os: getPlatform() === 'linux' ? 'linux' : 'mac', cwd: currentPath || '~' });
        PromptProgressManager.getInstance().completePrompt(res.success, res.summary);
      } catch (err: any) {
        PromptProgressManager.getInstance().completePrompt(false, err?.message);
      }
    }
  };

  const handleAuthorize = async () => {
    if (!authPassword.trim()) {
      setAuthError('Password authentication is strictly required.');
      return;
    }
    setIsVerifying(true);
    setAuthError('');

    let isValid = false;
    let errorMessage = '';

    try {
      if (typeof window === 'undefined' || !(window as any).__TAURI_INTERNALS__) {
        // Fallback for non-Tauri browser development environments
        if (authPassword !== 'admin' && authPassword !== 'password' && authPassword !== 'sentinel') {
          isValid = false;
          errorMessage = 'Authentication failed: Incorrect system password. Please enter your valid macOS login password.';
        } else {
          isValid = true;
        }
      } else {
        const escaped = authPassword.replace(/'/g, "'\\''");
        // Securely verify system password against Linux/macOS login credentials
        const res = await invoke<{ code?: number; stderr?: string; stdout?: string }>('execute_command', {
          command: 'sh',
          args: ['-c', `(which dscl >/dev/null 2>&1 && dscl . -authonly "$(whoami)" '${escaped}' 2>&1) || (echo '${escaped}' | sudo -S -k -v 2>&1)`]
        });
        if (res && res.code === 0) {
          isValid = true;
        } else {
          isValid = false;
          errorMessage = 'Authentication failed: Incorrect system password. Please enter your valid login password.';
        }
      }
    } catch (err: any) {
      isValid = false;
      errorMessage = 'Authentication failed: Incorrect system password. Please enter your valid login password.';
    }

    setIsVerifying(false);
    if (isValid && securityModalPlan) {
      securityModalPlan.resolve(true);
      setSecurityModalPlan(null);
      setAuthPassword('');
    } else {
      setAuthError(errorMessage || 'Authentication failed: Invalid system password.');
    }
  };

  useEffect(() => {
    if (!terminalRef.current) return;

    const themeManager = ThemeManager.getInstance();
    const currentTheme = themeManager.getTheme();

    const isPreviewMode = typeof window !== 'undefined' && (window.location.search.includes('preview') || window.location.search.includes('large_preview'));
    const term = new Terminal({
      cursorBlink: true,
      allowTransparency: true,
      scrollback: 100000,
      allowProposedApi: true,
      convertEol: true,
      fontFamily: currentTheme.ui.fontFamily || '"SF Mono", Menlo, Monaco, "Cascadia Code", "Courier New", monospace',
      fontSize: isPreviewMode ? 17 : (currentTheme.ui.fontSize || 13.5),
      lineHeight: isPreviewMode ? 1.35 : 1.25,
      letterSpacing: 0,
      fontWeight: '400',
      fontWeightBold: '700',
      theme: {
        background: 'rgba(0, 0, 0, 0)', // Completely transparent to reveal glassmorphism backdrop
        foreground: currentTheme.colors.foreground,
        cursor: currentTheme.colors.cursor,
        cursorAccent: currentTheme.colors.cursorAccent,
        selectionBackground: currentTheme.colors.selection,
        black: currentTheme.colors.black,
        red: currentTheme.colors.red,
        green: currentTheme.colors.green,
        yellow: currentTheme.colors.yellow,
        blue: currentTheme.colors.blue,
        magenta: currentTheme.colors.magenta,
        cyan: currentTheme.colors.cyan,
        white: currentTheme.colors.white,
        brightBlack: currentTheme.colors.brightBlack,
        brightRed: currentTheme.colors.brightRed,
        brightGreen: currentTheme.colors.brightGreen,
        brightYellow: currentTheme.colors.brightYellow,
        brightBlue: currentTheme.colors.brightBlue,
        brightMagenta: currentTheme.colors.brightMagenta,
        brightCyan: currentTheme.colors.brightCyan,
        brightWhite: currentTheme.colors.brightWhite,
      }
    });

    const unsubscribeTheme = themeManager.subscribe((t) => {
      term.options.fontFamily = t.ui.fontFamily;
      term.options.fontSize = t.ui.fontSize;
      term.options.theme = {
        ...term.options.theme,
        background: 'rgba(0, 0, 0, 0)',
        foreground: t.colors.foreground,
        cursor: t.colors.cursor,
        cursorAccent: t.colors.cursorAccent,
        selectionBackground: t.colors.selection,
        black: t.colors.black,
        red: t.colors.red,
        green: t.colors.green,
        yellow: t.colors.yellow,
        blue: t.colors.blue,
        magenta: t.colors.magenta,
        cyan: t.colors.cyan,
        white: t.colors.white,
        brightBlack: t.colors.brightBlack,
        brightRed: t.colors.brightRed,
        brightGreen: t.colors.brightGreen,
        brightYellow: t.colors.brightYellow,
        brightBlue: t.colors.brightBlue,
        brightMagenta: t.colors.brightMagenta,
        brightCyan: t.colors.brightCyan,
        brightWhite: t.colors.brightWhite,
      };
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    const searchAddon = new SearchAddon({
      highlightLimit: 1000
    });
    term.loadAddon(searchAddon);
    searchAddonRef.current = searchAddon;

    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      const isCmdOrCtrl = event.ctrlKey || event.metaKey;
      const k = event.key?.toLowerCase();

      // Paste: Ctrl+Shift+V, Ctrl+V, Cmd+V, or Shift+Insert
      const isPasteKey = (isCmdOrCtrl && (k === 'v' || event.code === 'KeyV')) ||
                         (event.shiftKey && (event.key === 'Insert' || event.code === 'Insert'));

      if (isPasteKey) {
        if (event.type === 'keydown') {
          event.preventDefault();
          event.stopPropagation();
          handlePasteRef.current();
        }
        return false;
      }

      // Copy: Ctrl+Shift+C, (Ctrl+C when text is highlighted), or Ctrl+Insert
      const isCopyKey = (isCmdOrCtrl && event.shiftKey && (k === 'c' || event.code === 'KeyC')) ||
                        (isCmdOrCtrl && !event.shiftKey && (k === 'c' || event.code === 'KeyC') && term.hasSelection()) ||
                        (isCmdOrCtrl && (event.key === 'Insert' || event.code === 'Insert'));

      if (isCopyKey) {
        if (event.type === 'keydown') {
          event.preventDefault();
          event.stopPropagation();
          const selection = term.getSelection();
          if (selection) {
            handleCopyRef.current(selection);
          }
        }
        return false;
      }

      // Issue 9: In-buffer vertical line navigation vs shell history cycling
      if (!isCmdOrCtrl && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        const direction = event.key === 'ArrowUp' ? 'up' : 'down';
        const buffer = term.buffer.active;
        const totalBufferLines = buffer.length;
        const currentAbsoluteY = buffer.baseY + buffer.cursorY;
        const startExtractIdx = Math.max(0, currentAbsoluteY - 20);
        const endExtractIdx = Math.min(totalBufferLines - 1, currentAbsoluteY + 20);
        const lines: BufferLineInfo[] = [];

        for (let idx = startExtractIdx; idx <= endExtractIdx; idx++) {
          const l = buffer.getLine(idx);
          if (l) {
            lines.push({
              text: l.translateToString(true),
              isWrapped: Boolean(l.isWrapped),
            });
          }
        }

        const relativeCursorY = currentAbsoluteY - startExtractIdx;

        const decision = PromptNavigationEngine.evaluateNavigation({
          direction,
          cursorX: buffer.cursorX,
          cursorY: relativeCursorY,
          cols: term.cols,
          lines,
          isAlternateBuffer: ptyTrackerRef.current.isAlternateBuffer() || term.buffer.active.type === 'alternate',
        });

        if (decision.handled) {
          if (event.type === 'keydown') {
            event.preventDefault();
            event.stopPropagation();
            if (decision.payload) {
              const activeSessionId = sessionIdRef.current || sessionId;
              if (activeSessionId) {
                SessionManager.getInstance().write(activeSessionId, decision.payload);
              }
            }
          }
          return false;
        }

        return true;
      }

      if (!isCmdOrCtrl) return true;

      // Ctrl+Shift+F: Toggle In-Buffer Search
      if (k === 'f' && event.shiftKey) {
        if (event.type === 'keydown') {
          event.preventDefault();
          event.stopPropagation();
          setIsSearchOpen(prev => !prev);
        }
        return false;
      }

      // Fuzzy History Search: Ctrl+R
      if (isCmdOrCtrl && !event.shiftKey && (k === 'r' || event.code === 'KeyR')) {
        if (event.type === 'keydown') {
          event.preventDefault();
          event.stopPropagation();
          window.dispatchEvent(new CustomEvent('sentinel:toggle-history'));
        }
        return false;
      }

      // Application shortcuts that must bubble to React / window listeners:
      // Ctrl+T (New Tab), Ctrl+W (Close Tab/Split), Ctrl+D / Ctrl+Shift+D (Split Panes),
      // Ctrl+O (Workspaces), Ctrl+R (History), Ctrl+Shift+P (Palette), Ctrl+Alt+P (Ports),
      // Ctrl+Shift+W (Workflows), Ctrl+Shift+X (Plugins), Ctrl+, (Settings), Ctrl+K (Clear)
      if (
        k === 't' ||
        k === 'w' ||
        k === 'd' ||
        k === 'o' ||
        k === 'r' ||
        (k === 'p' && (event.shiftKey || event.altKey)) ||
        (k === 'w' && event.shiftKey) ||
        (k === 'x' && event.shiftKey) ||
        k === ',' ||
        k === 'k'
      ) {
        return false;
      }

      return true;
    });

    const handleToggleSearch = () => {
      setIsSearchOpen(prev => !prev);
    };
    window.addEventListener('sentinel:toggle-search', handleToggleSearch);

    term.open(terminalRef.current);
    
    try {
      const webglAddon = new WebglAddon();
      term.loadAddon(webglAddon);
    } catch (e) {
      console.warn("WebGL addon could not be loaded");
    }

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;
    fitAddon.fit();

    let currentSessionId = initialSessionId;
    const sessionManager = SessionManager.getInstance();

    // Helper to write output locally while recording to SessionManager buffer for pane switching persistence
    const writeTerm = (text: string) => {
      const normalized = text.replace(/\r?\n/g, '\r\n');
      term.write(normalized);
      if (currentSessionId) {
        sessionManager.recordOutput(currentSessionId, normalized);
      }
    };
    
    // We must define the callback here so we can remove it later
    let outputCallback: ((data: Uint8Array) => void) | null = null;
    let unsubRemediation: (() => void) | null = null;
    let unsubConsent: (() => void) | null = null;

    const initSession = async () => {
      try {
        if (!currentSessionId) {
          const shellAdapter = ShellAdapter.getInstance();
          let detectedShell = '';
          try {
            detectedShell = await invoke<string>('get_default_shell');
          } catch {
            // fallback
          }
          const defaultProfile = shellAdapter.detectLoginShell(detectedShell || undefined);
          currentSessionId = await sessionManager.createSession(
            term.rows, 
            term.cols, 
            detectedShell || defaultProfile.defaultPath, 
            currentPath || undefined, 
            true
          );
          sessionIdRef.current = currentSessionId;
          setSessionId(currentSessionId);
          onSessionCreated?.(currentSessionId);
        } else {
          sessionIdRef.current = currentSessionId;
          await sessionManager.resize(currentSessionId, term.rows, term.cols);
        }

        outputCallback = (data: Uint8Array) => {
          const text = new TextDecoder().decode(data);
          ptyTrackerRef.current.feedOutput(text);
          PtyOutputObserver.getInstance().ingest(text, currentPathRef.current);
          writeTerm(text);
        };

        unsubRemediation = PtyOutputObserver.getInstance().onRemediation((rem) => {
          setActiveRemediation(rem);
          if (rem) {
            writeTerm(`\r\n\x1b[1;33m[Sentinel Auto-Heal]:\x1b[0m ${rem.cause}\r\n`);
            writeTerm(`  • \x1b[36mSuggested Fix:\x1b[0m ${rem.actionTitle}\r\n`);
            writeTerm(`  • \x1b[35mType \x1b[1m>fix\x1b[0m\x1b[35m or press \x1b[1m[Tab]\x1b[0m\x1b[35m to auto-resolve with Sentinel.\x1b[0m\r\n\r\n`);
          }
        });

        sessionManager.onOutput(currentSessionId, outputCallback);

        // Initialize AI Tool Registry & Agent Loop
        const toolLoader = new ToolLoader();
        toolLoader.loadAll();
        
        const agentLoop = new AgentLoop(toolLoader.getState());
        agentLoopRef.current = agentLoop;

        // Subscribe to asynchronous ConsentQueue for this tab/session
        unsubConsent = ConsentQueue.getInstance().subscribe((pending) => {
          const matching = pending.find(r => !r.tabId || r.tabId === currentSessionId);
          if (matching) {
            setSecurityModalPlan({
              plan: matching.plan,
              resolve: (approved: boolean) => {
                if (approved) {
                  ConsentQueue.getInstance().approve(matching.id);
                } else {
                  ConsentQueue.getInstance().deny(matching.id);
                }
              },
              requestId: matching.id
            });
          } else {
            setSecurityModalPlan((prev) => (prev?.requestId ? null : prev));
          }
        });

        agentLoop.setAuthorizationHandler((plan: any) => {
          return ConsentQueue.getInstance().enqueue(plan, currentSessionId);
        });

        // Initialize Autocomplete with History, Demonstration, and Workspace Context providers
        const autocompleteEngine = new AutocompleteEngine();
        const historyProvider = new HistoryProvider();
        const demonstrationProvider = new DemonstrationProvider();
        const workspaceContextProvider = new WorkspaceContextProvider();
        autocompleteEngine.registerProvider(historyProvider);
        autocompleteEngine.registerProvider(demonstrationProvider);
        autocompleteEngine.registerProvider(workspaceContextProvider);
        
        // Start Tier 4 Sentinel-SERL Autonomous Orchestrator
        SentinelSerlCoordinator.getInstance().startCoordinator();

        const ghostText = new GhostTextRenderer(term);
        ghostText.attach(terminalRef.current!);

        term.onData(async (data) => {
          if (!currentSessionId) return;
          SentinelSerlCoordinator.getInstance().markActivity();

          // Handle Tab completion or Right Arrow completion
          if (data === '\t' || data === '\x1b[C') {
             const remaining = ghostText.getRemaining();
             if (remaining) {
               await sessionManager.write(currentSessionId, remaining);
               ghostText.clear();
               return; // Intercept key
             }

             // If Tab is pressed and an auto-heal remediation is active
             const activeRem = PtyOutputObserver.getInstance().getActiveRemediation();
             if (activeRem) {
               await ptyTrackerRef.current.safeClearLine(d => sessionManager.write(currentSessionId!, d));
               writeTerm(`\r\n\x1b[1;32m[Sentinel Auto-Heal] Executing: ${activeRem.actionTitle}...\x1b[0m\r\n`);
               PtyOutputObserver.getInstance().clearRemediation();
               if (activeRem.tool === 'shell.execute' && activeRem.params?.command) {
                 await sessionManager.write(currentSessionId!, `${activeRem.params.command}\r`);
               } else {
                 PromptProgressManager.getInstance().startPrompt(`Auto-Heal: ${activeRem.actionTitle}`);
                 try {
                   const res = await agentLoop.run(`fix error: ${activeRem.actionTitle}`, { os: getPlatform() === 'linux' ? 'linux' : 'mac', cwd: currentPath || '~' });
                   PromptProgressManager.getInstance().completePrompt(res.success, res.summary);
                 } catch (err: any) {
                   PromptProgressManager.getInstance().completePrompt(false, err?.message);
                 }
               }
               return;
             }
          }

          // Intercept Enter key for classification and history
          if (data.includes('\r') || data === '\n') {
            ghostText.clear();
            const buffer = term.buffer.active;
            const lineIndex = buffer.baseY + buffer.cursorY;
            const line = buffer.getLine(lineIndex);
            
            if (line) {
              let currentLineIndex = lineIndex;
              let fullText = '';
              
              // Read backwards up to 3 lines to handle terminal wrapping and empty cursor lines
              for (let i = 0; i < 3 && currentLineIndex >= 0; i++) {
                const l = buffer.getLine(currentLineIndex);
                if (!l) break;
                
                fullText = l.translateToString(false).replace(/\s+$/, '') + fullText;
                
                if (fullText.match(/.*[$%#]\s*/)) {
                  break;
                }
                currentLineIndex--;
              }
              
              // Simple heuristic to strip prompt: look for the last common prompt character
              const promptMatch = fullText.match(/.*[$%#]\s*/);
              const commandText = promptMatch ? fullText.substring(promptMatch[0].length) : fullText;

              if (commandText.trim()) {
                 historyProvider.addHistory(commandText.trim(), currentPath || '~');
              }

              console.log("[TerminalView] Full text intercepted:", fullText);
              console.log("[TerminalView] Extracted command:", commandText);
              
              const cleanCmd = commandText.trim();

              // Intercept dangerous / catastrophic destruction commands
              const safetyEval = CommandSafetyGuardian.getInstance().evaluate(cleanCmd);
              if (safetyEval.isBlocked) {
                await ptyTrackerRef.current.safeClearLine(d => sessionManager.write(currentSessionId!, d));
                const banner = CommandSafetyGuardian.getInstance().formatTerminalBanner(safetyEval, cleanCmd);
                writeTerm(banner);
                return;
              }

              const notifyNavigation = (target: string) => {
                if (!onPathChange) return;
                const curr = (currentPath || '~').replace(/\/+/g, '/').trim();
                let next = curr;
                if (target === '~' || target === '/' || target === '..' || target === 'home' || target === '') {
                  if (target === '~' || target === 'home' || target === '') next = '~';
                  else if (target === '/') next = '/';
                  else if (target === '..') {
                    if (curr !== '~' && curr !== '/') {
                      const parts = curr.split('/').filter(Boolean);
                      parts.pop();
                      next = parts.join('/') || '~';
                    } else {
                      next = '~';
                    }
                  }
                } else if (target.startsWith('~/') || target.startsWith('/')) {
                  next = target;
                } else {
                  next = `${curr === '/' ? '' : curr}/${target}`.replace(/\/+/g, '/');
                }
                onPathChange(next);
              };

              if (cleanCmd.startsWith('cd ') || cleanCmd === 'cd') {
                const target = cleanCmd.replace(/^cd\s*/i, '').replace(/["']/g, '').trim() || '~';
                notifyNavigation(target);
              }

              // Intercept application mapping slash commands: /app, /apps, /alias, /aliases
              if (cleanCmd.startsWith('/app') || cleanCmd.startsWith('/alias')) {
                await ptyTrackerRef.current.safeClearLine(d => sessionManager.write(currentSessionId!, d));
                const match = cleanCmd.match(/^\/(?:apps?|aliases?)(?:\s+([^\s"']+)\s+["']?(.+?)["']?)?\s*$/i);
                if (match && match[1] && match[2]) {
                  AppAliasRegistry.getInstance().setAlias(match[1], match[2]);
                  writeTerm(`\r\n\x1b[1;32m[App Registry] Successfully registered application mapping:\x1b[0m\r\n`);
                  writeTerm(`  • Alias: \x1b[1;36m"${match[1]}"\x1b[0m ──► Application: \x1b[1;33m"${match[2]}"\x1b[0m\r\n`);
                  writeTerm(`\x1b[37m[App Registry] Saved to persistent storage (~/.sentinel/app_aliases.json).\x1b[0m\r\n\r\n`);
                } else {
                  writeTerm(`\r\n\x1b[1;35m[App Registry] Currently Registered Application Mappings:\x1b[0m\r\n`);
                  const aliases = AppAliasRegistry.getInstance().getAll();
                  Object.entries(aliases).forEach(([alias, actual]) => {
                    writeTerm(`  • \x1b[36m${alias}\x1b[0m ──► \x1b[33m${actual}\x1b[0m\r\n`);
                  });
                  writeTerm(`\r\n\x1b[37mUsage to register/override an alias:\x1b[0m \x1b[1;32m/app <alias> "<actual_application_name>"\x1b[0m\r\n`);
                  writeTerm(`Example: \x1b[36m/app chrome "Google Chrome"\x1b[0m\r\n\r\n`);
                }
                return;
              }

              // Intercept demonstration learning slash commands: /learn, /learned, /forget
              if (cleanCmd.startsWith('/learn') || cleanCmd.startsWith('/learned') || cleanCmd.startsWith('/forget')) {
                await ptyTrackerRef.current.safeClearLine(d => sessionManager.write(currentSessionId!, d));
                if (cleanCmd.startsWith('/learned')) {
                  const patterns = DemonstrationLearningEngine.getInstance().getAllPatterns();
                  if (patterns.length === 0) {
                    writeTerm(`\r\n\x1b[33m[Learning Engine] No custom patterns learned yet.\x1b[0m\r\n`);
                    writeTerm(`\x1b[37mTeach Sentinel via:\x1b[0m \x1b[1;32m/learn <goal> -> <command>\x1b[0m\r\n\r\n`);
                  } else {
                    writeTerm(`\r\n\x1b[1;35m[Learning Engine] Currently Learned Workflows (${patterns.length}):\x1b[0m\r\n`);
                    patterns.forEach((p, idx) => {
                      writeTerm(`  ${idx + 1}. \x1b[36m"${p.originalGoal}"\x1b[0m\r\n     ──► \x1b[33m${p.commandTemplate}\x1b[0m\r\n     \x1b[90mID: ${p.id} | Used: ${p.timesUsed}x\x1b[0m\r\n`);
                    });
                    writeTerm(`\r\n\x1b[37mTo remove a pattern:\x1b[0m \x1b[1;31m/forget <id or goal>\x1b[0m\r\n\r\n`);
                  }
                } else if (cleanCmd.startsWith('/forget')) {
                  const target = cleanCmd.replace(/^\/forget\s*/i, '').trim();
                  if (target) {
                    const ok = DemonstrationLearningEngine.getInstance().forgetPattern(target);
                    if (ok) {
                      writeTerm(`\r\n\x1b[1;32m[Learning Engine] Successfully removed learned pattern:\x1b[0m ${target}\r\n\r\n`);
                    } else {
                      writeTerm(`\r\n\x1b[1;31m[Learning Engine] Could not find pattern matching:\x1b[0m ${target}\r\n\r\n`);
                    }
                  } else {
                    writeTerm(`\r\n\x1b[37mUsage:\x1b[0m \x1b[1;31m/forget <pattern_id or goal>\x1b[0m\r\n\r\n`);
                  }
                } else {
                  // /learn <trigger> -> <command>
                  const match = cleanCmd.match(/^\/learn\s+(.+?)\s*(?:->|=>|──►|to)\s*(.+)$/i);
                  if (match && match[1] && match[2]) {
                    const pattern = DemonstrationLearningEngine.getInstance().learnExplicit(match[1], match[2]);
                    EpisodicMemoryEngine.getInstance().recordMemory(match[1], match[2], {
                      cwd: currentPath,
                      source: 'explicit_teach'
                    });
                    writeTerm(`\r\n\x1b[1;32m[Learning Engine] Successfully learned new workflow:\x1b[0m\r\n`);
                    writeTerm(`  • Trigger: \x1b[1;36m"${pattern.originalGoal}"\x1b[0m\r\n`);
                    writeTerm(`  • Command: \x1b[1;33m${pattern.commandTemplate}\x1b[0m\r\n`);
                    writeTerm(`\x1b[37m[Learning Engine] Saved to persistent storage (~/.sentinel/learned_patterns.json & episodic memory).\x1b[0m\r\n\r\n`);
                  } else {
                    writeTerm(`\r\n\x1b[37mUsage:\x1b[0m \x1b[1;32m/learn <natural language goal> -> <command>\x1b[0m\r\n`);
                    writeTerm(`Example: \x1b[36m/learn compress backups -> tar -czvf backups.tar.gz ./backups\x1b[0m\r\n\r\n`);
                  }
                }
                return;
              }

              // Intercept auto-heal remediation commands: >fix, >heal
              if (cleanCmd === '>fix' || cleanCmd === '>heal') {
                await ptyTrackerRef.current.safeClearLine(d => sessionManager.write(currentSessionId!, d));
                const rem = PtyOutputObserver.getInstance().getActiveRemediation();
                if (rem) {
                  writeTerm(`\r\n\x1b[1;32m[Sentinel Auto-Heal] Executing: ${rem.actionTitle}...\x1b[0m\r\n`);
                  PtyOutputObserver.getInstance().clearRemediation();
                  PromptProgressManager.getInstance().startPrompt(`Auto-Heal: ${rem.actionTitle}`);
                  try {
                    const res = await agentLoop.run(`fix error: ${rem.actionTitle}`, { os: getPlatform(), cwd: currentPath || '~' });
                    PromptProgressManager.getInstance().completePrompt(res.success, res.summary);
                  } catch (err: any) {
                    PromptProgressManager.getInstance().completePrompt(false, err?.message);
                  }
                } else {
                  writeTerm(`\r\n\x1b[33m[Sentinel Auto-Heal] No active error diagnosed in recent output.\x1b[0m\r\n\r\n`);
                }
                return;
              }

              // If there was an unresolved AI goal within the last 3 minutes and the user demonstrates a command
              if (
                lastUnresolvedGoalRef.current &&
                Date.now() - lastUnresolvedGoalRef.current.timestamp < 180000 &&
                !['ls', 'pwd', 'clear', 'exit'].includes(cleanCmd.toLowerCase()) &&
                !cleanCmd.startsWith('cd ') &&
                !cleanCmd.startsWith('>') &&
                !cleanCmd.startsWith('/')
              ) {
                const learned = DemonstrationLearningEngine.getInstance().learnFromDemonstration(
                  lastUnresolvedGoalRef.current.goal,
                  cleanCmd
                );
                EpisodicMemoryEngine.getInstance().recordMemory(
                  lastUnresolvedGoalRef.current.goal,
                  cleanCmd,
                  {
                    cwd: currentPath,
                    source: 'demonstration'
                  }
                );
                // Tier 4: Feed human demonstration into Sentinel-SERL closed-loop
                SentinelSerlCoordinator.getInstance().onHumanDemonstration(
                  lastUnresolvedGoalRef.current.goal,
                  cleanCmd,
                  `Human demonstration in ${currentPath || '~'}`
                ).catch(e => console.warn('[TerminalView] SERL demonstration recording error:', e));
                if (learned) {
                  writeTerm(`\r\n\x1b[1;35m[Sentinel Learning Engine] Learned this workflow from your demonstration!\x1b[0m\r\n`);
                  writeTerm(`  • \x1b[36mTrigger:\x1b[0m "${lastUnresolvedGoalRef.current.goal}"\r\n`);
                  writeTerm(`  • \x1b[33mCommand:\x1b[0m ${cleanCmd}\r\n`);
                  writeTerm(`  • \x1b[37mSaved to ~/.sentinel/learned_patterns.json & LoRA training dataset. Next time you ask, Sentinel will know this!\x1b[0m\r\n\r\n`);
                  lastUnresolvedGoalRef.current = null;
                }
              }

              // `>` starts an AI request. Once it asks a clarification question,
              // the next normal terminal entry is treated as the answer so the
              // workflow can resume without making the user retype the request.
              const answeringAgentQuestion = agentLoop.hasPendingQuestion();
              if (answeringAgentQuestion && cleanCmd === '/cancel') {
                await ptyTrackerRef.current.safeClearLine(d => sessionManager.write(currentSessionId!, d));
                agentLoop.cancelPendingQuestion();
                clearPlanDismissTimer();
                setLatestPlan(null);
                writeTerm('\r\n\x1b[33m  Workflow cancelled.\x1b[0m\r\n\r\n');
                sessionManager.write(currentSessionId!, '\r');
                return;
              }

              if (cleanCmd.startsWith('>') || answeringAgentQuestion) {
                const aiGoal = answeringAgentQuestion ? cleanCmd : cleanCmd.substring(1).trim();
                if (!aiGoal) {
                  return; // Empty AI instruction
                }

                // Safely cancel the shell line without killing running foreground processes
                await ptyTrackerRef.current.safeClearLine(d => sessionManager.write(currentSessionId!, d));

                // Initiate live progress tracking in the bottom bar
                PromptProgressManager.getInstance().startPrompt(aiGoal);

                // Set up event listener for live output
                agentLoop.onEvent((event) => {
                  if (event.type === 'thinking') {
                    PromptProgressManager.getInstance().updateStage(event.message || 'Thinking...', 30);
                  } else if (event.type === 'plan') {
                    PromptProgressManager.getInstance().updateStage('Planning...', 50);
                    const enabled = localStorage.getItem('sentinel_hud_plan_enabled') !== 'false';
                    const duration = localStorage.getItem('sentinel_hud_plan_duration') || '8';
                    if (!enabled || duration === 'disabled') {
                      return;
                    }
                    clearPlanDismissTimer();
                    if (event.data) {
                      const plan = event.data as AgentPlan;
                      setLatestPlan(plan);
                      setIsPlanOpen(true);
                      const isAllCompleted = plan.phases && plan.phases.length > 0 && plan.phases.every(p => p.status === 'completed');
                      const hasFailed = plan.phases && plan.phases.some(p => p.status === 'failed');
                      if (hasFailed) {
                        setPlanExecutionStatus('failed');
                        planExecutionStatusRef.current = 'failed';
                        schedulePlanDismiss();
                      } else if (isAllCompleted) {
                        setPlanExecutionStatus('completed');
                        planExecutionStatusRef.current = 'completed';
                        schedulePlanDismiss();
                      } else {
                        setPlanExecutionStatus('running');
                        planExecutionStatusRef.current = 'running';
                      }
                    }
                    // Keep execution plan strictly in dropdown overlay; avoid terminal buffer spam
                    return;
                  } else if (event.type === 'tool_start') {
                    const rawMsg = event.message || '';
                    const cleanMsg = rawMsg.replace(/^(Running|Executing|Phase \d+:?)\s*/i, '').trim();
                    PromptProgressManager.getInstance().updateStage(cleanMsg ? `Running: ${cleanMsg.slice(0, 24)}` : 'Executing...', 75);
                  } else if (event.type === 'step_output') {
                    PromptProgressManager.getInstance().updateStage('Executing...', 82);
                  } else if (event.type === 'tool_done') {
                    PromptProgressManager.getInstance().updateStage('Verifying...', 92);
                  } else if (event.type === 'done') {
                    setPlanExecutionStatus('completed');
                    planExecutionStatusRef.current = 'completed';
                    schedulePlanDismiss();
                    PromptProgressManager.getInstance().completePrompt(true, event.message);
                  } else if (event.type === 'error') {
                    setPlanExecutionStatus('failed');
                    planExecutionStatusRef.current = 'failed';
                    schedulePlanDismiss();
                    PromptProgressManager.getInstance().completePrompt(false, event.message);
                  }

                  const text = formatAgentEvent(event);
                  if (text) writeTerm(text);

                  // Show structured data (file lists, devices, etc.) when available
                  if (event.data && (event.type === 'tool_done' || event.type === 'done')) {
                    const dataOutput = formatDataOutput(event.data, { goal: aiGoal });
                    if (dataOutput && (!text || !text.includes(dataOutput.trim()))) {
                      writeTerm(dataOutput);
                    }
                  }
                });

                // Run the agent loop
                agentLoop.run(aiGoal, { os: getPlatform(), cwd: currentPath || '~' }).then(result => {
                  PromptProgressManager.getInstance().completePrompt(result.success, result.summary);
                  if (!result.success) {
                    lastUnresolvedGoalRef.current = { goal: aiGoal, timestamp: Date.now() };
                    setPlanExecutionStatus('failed');
                    planExecutionStatusRef.current = 'failed';
                    schedulePlanDismiss();
                  } else {
                    lastUnresolvedGoalRef.current = null;
                    setPlanExecutionStatus('completed');
                    planExecutionStatusRef.current = 'completed';
                    schedulePlanDismiss();
                  }

                  // Handle clear terminal command
                  if (result.steps.some(s => s.tool === '__clear__')) {
                    term.clear();
                    writeTerm('\x1b[2J\x1b[H');
                    sessionManager.write(currentSessionId!, '\r');
                    return;
                  }

                  // Handle directory navigation
                  if (result.cdPath) {
                    notifyNavigation(result.cdPath);
                    const cdCmd = result.cdPath.includes(' ') && !result.cdPath.startsWith('"') && !result.cdPath.startsWith("'") ? `cd "${result.cdPath}"` : `cd ${result.cdPath}`;
                    setTimeout(() => sessionManager.write(currentSessionId!, `${cdCmd}\r`), 50);
                  } else {
                    writeTerm('\r\n');
                    sessionManager.write(currentSessionId!, '\r');
                  }
                }).catch(err => {
                  PromptProgressManager.getInstance().completePrompt(false, err?.message || 'Error');
                  lastUnresolvedGoalRef.current = { goal: aiGoal, timestamp: Date.now() };
                  setPlanExecutionStatus('failed');
                  planExecutionStatusRef.current = 'failed';
                  schedulePlanDismiss();
                  writeTerm(`\r\n\x1b[1;31m  ✗ ${err.message || 'Something went wrong'}\x1b[0m\r\n\r\n`);
                  sessionManager.write(currentSessionId!, '\r');
                });
                
                return; // Do NOT send the \r to the shell
              } else if (cleanCmd) {
                // User submitted a command to the shell
                ptyTrackerRef.current.notifyCommandStarted(cleanCmd);
              }
            }
          }

          sessionManager.write(currentSessionId, data);

          // Update ghost text asynchronously after terminal buffer updates
          if (data !== '\r' && data !== '\x03') {
            setTimeout(async () => {
              const buffer = term.buffer.active;
              const lineIndex = buffer.baseY + buffer.cursorY;
              const line = buffer.getLine(lineIndex);
              if (line) {
                const fullText = line.translateToString(true);
                const promptMatch = fullText.match(/.*[$%#]\s*/);
                const commandText = promptMatch ? fullText.substring(promptMatch[0].length).trimStart() : fullText.trimStart();
                
                if (commandText.length > 0) {
                  const suggestions = await autocompleteEngine.getSuggestions({ 
                    currentInput: commandText, 
                    cwd: currentPath || '~',
                    cursorPosition: commandText.length,
                    os: getPlatform() === 'linux' ? 'linux' : 'macos'
                  });
                  if (suggestions.length > 0) {
                     ghostText.render(suggestions[0].value, commandText);
                  } else {
                     ghostText.clear();
                  }
                } else {
                  ghostText.clear();
                }
              }
            }, 20);
          }
        });
      } catch (error: any) {
        console.warn("[Sentinel] Native backend unavailable, running in preview mode:", error);
        term.write('\x1b[1;32m❯\x1b[0m \x1b[1mcargo check --workspace\x1b[0m\r\n');
        term.write('   \x1b[34mCompiling\x1b[0m sentinel v2.0.0 (/home/dev/workspace/sentinel)\r\n');
        term.write('    \x1b[32mChecking\x1b[0m sentinel-core v2.0.0\r\n');
        term.write('    \x1b[32mFinished\x1b[0m dev [optimized + debuginfo] target(s) in 0.38s\r\n\r\n');
        term.write('\x1b[1;32m❯\x1b[0m \x1b[1mgit status\x1b[0m\r\n');
        term.write('On branch main\r\n');
        term.write('Your branch is up to date with \'origin/main\'.\r\n');
        term.write('nothing to commit, working tree clean\r\n\r\n');
        term.write('\x1b[1;32m❯\x1b[0m \x1b[7m \x1b[0m');
      }
    };

    initSession();

    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current && currentSessionId) {
        try {
          fitAddonRef.current.fit();
          if (xtermRef.current.rows > 0 && xtermRef.current.cols > 0) {
            sessionManager.resize(currentSessionId, xtermRef.current.rows, xtermRef.current.cols);
          }
        } catch (e) {
          // Ignore resize calculations when dimensions are transitioning or 0
        }
      }
    };

    window.addEventListener('resize', handleResize);

    // Observe element dimensions so split panes dynamically refit immediately upon split or layout changes
    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver.disconnect();
      if (currentSessionId && outputCallback) {
        sessionManager.offOutput(currentSessionId, outputCallback);
      }
      unsubRemediation?.();
      unsubscribeTheme();
      unsubConsent?.();
      ConsentQueue.getInstance().clearQueue(currentSessionId);
      window.removeEventListener('sentinel:toggle-search', handleToggleSearch);
      searchAddon.dispose();
      term.dispose();
    };
  }, []); // Run once on mount

  useEffect(() => {
    // When this tab becomes active, synchronously refit immediately without delay
    if (isActive && fitAddonRef.current && xtermRef.current) {
      try {
        fitAddonRef.current.fit();
        xtermRef.current.focus();
        const activeId = sessionIdRef.current || sessionId;
        if (activeId && xtermRef.current.rows > 0 && xtermRef.current.cols > 0) {
          SessionManager.getInstance().resize(activeId, xtermRef.current.rows, xtermRef.current.cols);
        }
      } catch {}

      const animId = requestAnimationFrame(() => {
        try {
          fitAddonRef.current?.fit();
          xtermRef.current?.focus();
          const activeId = sessionIdRef.current || sessionId;
          if (activeId && xtermRef.current && xtermRef.current.rows > 0 && xtermRef.current.cols > 0) {
            SessionManager.getInstance().resize(activeId, xtermRef.current.rows, xtermRef.current.cols);
          }
        } catch {}
      });

      return () => cancelAnimationFrame(animId);
    }
  }, [isActive, sessionId]);

  return (
    <div 
      style={{ 
        position: 'relative', 
        width: '100%', 
        height: '100%', 
        overflow: 'hidden', 
        visibility: isActive ? 'visible' : 'hidden',
        pointerEvents: isActive ? 'auto' : 'none',
      }}
    >
      <div 
        ref={terminalRef} 
        className="allow-context-menu"
        style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }} 
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const term = xtermRef.current;
          if (!term) return;
          if (term.hasSelection()) {
            const text = term.getSelection();
            if (text) {
              handleCopy(text);
              term.clearSelection();
            }
          } else {
            handlePaste();
          }
        }}
      />

      {/* In-Buffer Regex Search Bar (Ctrl+Shift+F) */}
      <TerminalSearchBar
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        searchAddon={searchAddonRef.current}
        onFocusTerminal={() => xtermRef.current?.focus()}
      />

      {/* Execution Plan Floating HUD Notification Overlay */}
      {latestPlan && hudPlanEnabled && hudPlanDuration !== 'disabled' && (
        <div 
          role="region"
          aria-label="Execution Plan HUD"
          onMouseEnter={() => {
            isHoveringPlanRef.current = true;
            clearPlanDismissTimer();
          }}
          onMouseLeave={() => {
            isHoveringPlanRef.current = false;
            if (planExecutionStatusRef.current !== 'running') {
              schedulePlanDismiss();
            }
          }}
          style={{
            position: 'absolute',
            top: '12px',
            right: '14px',
            width: 'min(380px, calc(100% - 28px))',
            padding: '12px 14px',
            borderRadius: '10px',
            border: planExecutionStatus === 'failed'
              ? '1px solid rgba(255, 255, 255, 0.25)'
              : planExecutionStatus === 'completed'
              ? '1px solid rgba(255, 255, 255, 0.18)'
              : '1px solid rgba(255, 255, 255, 0.12)',
            background: 'rgba(12, 13, 18, 0.96)',
            boxShadow: '0 12px 36px rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(12px)',
            color: '#ffffff',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            fontSize: '12px',
            zIndex: 30,
            transition: 'all 0.2s ease',
            userSelect: 'none'
          }}
        >
          {/* Header Row */}
          <div 
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              gap: '8px'
            }}
            onClick={() => setIsPlanOpen(!isPlanOpen)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
              <span style={{ 
                fontWeight: 700, 
                color: planExecutionStatus === 'failed' ? 'rgba(255, 255, 255, 0.9)' : '#ffffff',
                fontSize: '13px'
              }}>
                {planExecutionStatus === 'completed' ? '✓' : planExecutionStatus === 'failed' ? '✗' : '▸'}
              </span>
              <span style={{ 
                fontWeight: 600, 
                color: '#ffffff', 
                whiteSpace: 'nowrap', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis' 
              }}>
                Execution Plan {latestPlan.phases ? `· ${latestPlan.phases.length} Phases` : `· ${latestPlan.steps.length} Steps`}
              </span>
              {planExecutionStatus === 'completed' && (
                <span style={{ 
                  fontSize: '10px', 
                  color: '#ffffff', 
                  background: 'rgba(255, 255, 255, 0.12)', 
                  border: '1px solid rgba(255, 255, 255, 0.18)', 
                  padding: '1px 6px', 
                  borderRadius: '4px',
                  fontWeight: 500
                }}>
                  Completed
                </span>
              )}
              {planExecutionStatus === 'failed' && (
                <span style={{ 
                  fontSize: '10px', 
                  color: 'rgba(255, 255, 255, 0.95)', 
                  background: 'rgba(255, 255, 255, 0.08)', 
                  border: '1px solid rgba(255, 255, 255, 0.25)', 
                  padding: '1px 6px', 
                  borderRadius: '4px',
                  fontWeight: 500
                }}>
                  Failed
                </span>
              )}
              {planExecutionStatus === 'running' && latestPlan.activePhaseId && (
                <span style={{ 
                  fontSize: '10px', 
                  background: 'rgba(255, 255, 255, 0.08)', 
                  border: '1px solid rgba(255, 255, 255, 0.12)', 
                  color: '#ffffff', 
                  padding: '1px 6px', 
                  borderRadius: '4px' 
                }}>
                  Phase {latestPlan.activePhaseId}
                </span>
              )}
            </div>

            {/* Action Buttons: Toggle Collapse and Manual Dismiss */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsPlanOpen(!isPlanOpen);
                }}
                title={isPlanOpen ? "Collapse plan" : "Expand plan"}
                aria-label={isPlanOpen ? "Collapse plan" : "Expand plan"}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.6)',
                  cursor: 'pointer',
                  padding: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px'
                }}
              >
                {isPlanOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  clearPlanDismissTimer();
                  setLatestPlan(null);
                }}
                title="Dismiss plan overlay"
                aria-label="Dismiss plan overlay"
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.6)',
                  cursor: 'pointer',
                  padding: '3px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '4px'
                }}
              >
                <X size={13} />
              </button>
            </div>
          </div>

          {/* Expanded Content */}
          {isPlanOpen && (
            <div style={{ marginTop: '8px', userSelect: 'text' }}>
              <p style={{ margin: '0 0 8px', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.45, fontSize: '11.5px' }}>
                {latestPlan.summary}
              </p>
              {latestPlan.phases && latestPlan.phases.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', margin: '4px 0 2px' }}>
                  {latestPlan.phases.map((phase) => (
                    <div key={phase.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        color: phase.status === 'completed'
                          ? 'rgba(255, 255, 255, 0.85)'
                          : phase.status === 'running'
                          ? '#ffffff'
                          : phase.status === 'failed'
                          ? 'rgba(255, 255, 255, 0.95)'
                          : phase.status === 'skipped'
                          ? 'rgba(255, 255, 255, 0.4)'
                          : 'rgba(255, 255, 255, 0.55)',
                        fontSize: '11px',
                        fontWeight: phase.status === 'running' || phase.status === 'failed' ? 600 : 400
                      }}>
                        <span style={{ fontWeight: 700 }}>
                          {phase.status === 'completed' ? '✓' : phase.status === 'running' ? '▸' : phase.status === 'failed' ? '✗' : phase.status === 'skipped' ? '⊘' : '○'}
                        </span>
                        <span>Phase {phase.id}: {phase.title}</span>
                        {phase.skippedReason && (
                          <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.4)' }}>({phase.skippedReason})</span>
                        )}
                      </div>
                      {phase.subPhases && phase.subPhases.map((sub) => (
                        <div key={sub.id} style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          paddingLeft: '16px',
                          color: sub.status === 'completed'
                            ? 'rgba(255, 255, 255, 0.75)'
                            : sub.status === 'running'
                            ? '#ffffff'
                            : sub.status === 'failed'
                            ? 'rgba(255, 255, 255, 0.95)'
                            : sub.status === 'skipped'
                            ? 'rgba(255, 255, 255, 0.35)'
                            : 'rgba(255, 255, 255, 0.5)',
                          fontSize: '10.5px'
                        }}>
                          <span style={{ fontWeight: 700 }}>
                            {sub.status === 'completed' ? '✓' : sub.status === 'running' ? '▸' : sub.status === 'failed' ? '✗' : '○'}
                          </span>
                          <span>Phase {sub.id}: {sub.title}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ) : latestPlan.steps.length > 0 ? (
                <ol style={{ margin: '0 0 2px', paddingLeft: '18px', color: 'rgba(255, 255, 255, 0.8)', lineHeight: 1.55 }}>
                  {latestPlan.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}
                </ol>
              ) : null}

              {latestPlan.question && (
                <p style={{ 
                  margin: '8px 0 0', 
                  padding: '6px 10px', 
                  borderRadius: '6px', 
                  background: 'rgba(255, 255, 255, 0.05)', 
                  border: '1px solid rgba(255, 255, 255, 0.12)', 
                  color: '#ffffff', 
                  lineHeight: 1.4,
                  fontSize: '11px'
                }}>
                  Needs your answer: {latestPlan.question}
                </p>
              )}

              {/* Status and auto-dismiss hint */}
              {planExecutionStatus !== 'running' && hudPlanDuration !== 'persistent' && (
                <div style={{
                  marginTop: '10px',
                  paddingTop: '6px',
                  borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  fontSize: '10px',
                  color: 'rgba(255, 255, 255, 0.4)'
                }}>
                  <span>Auto-dismiss in {hudPlanDuration}s</span>
                  <span>Hover to pause</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating Auto-Heal Action Banner HUD */}
      {activeRemediation && (
        <div style={{
          position: 'absolute',
          top: '16px',
          right: '20px',
          maxWidth: '420px',
          backgroundColor: 'rgba(15, 23, 42, 0.92)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          borderRadius: '12px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.65), 0 0 12px rgba(245, 158, 11, 0.15)',
          padding: '14px 16px',
          zIndex: 8000,
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Wrench size={14} color="#f59e0b" />
              <span style={{ fontSize: '12px', fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Sentinel Auto-Heal
              </span>
            </div>
            <button
              onClick={() => {
                setActiveRemediation(null);
                PtyOutputObserver.getInstance().clearRemediation();
              }}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(255,255,255,0.4)',
                cursor: 'pointer',
                padding: '2px 4px',
                display: 'flex',
                alignItems: 'center'
              }}
              title="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
          <div style={{ fontSize: '12px', color: '#e2e8f0', lineHeight: 1.4 }}>
            {activeRemediation.cause}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px', gap: '8px' }}>
            <span style={{ fontSize: '11px', color: '#38bdf8', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={activeRemediation.params?.command || activeRemediation.actionTitle}>
              Fix: {activeRemediation.params?.command || activeRemediation.actionTitle}
            </span>
            <button
              onClick={() => handleExecuteRemediation(activeRemediation)}
              style={{
                background: '#f59e0b',
                color: '#000',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                flexShrink: 0,
                boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)'
              }}
            >
              <Play size={11} fill="currentColor" />
              <span>Auto-Fix</span> <span style={{ opacity: 0.8, fontSize: '10px', background: 'rgba(0,0,0,0.18)', padding: '1px 4px', borderRadius: '3px' }}>Tab</span>
            </button>
          </div>
        </div>
      )}

      {/* Security & Deletion Authorization Overlay Modal */}
      {securityModalPlan && (
        <div 
          tabIndex={0}
          ref={(el) => { if (el && !securityModalPlan.plan.requiresPassword) el.focus(); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'n' || e.key === 'N') {
              securityModalPlan.resolve(false);
              setSecurityModalPlan(null);
              setAuthPassword('');
            } else if ((e.key === 'Enter' || e.key === 'y' || e.key === 'Y') && !securityModalPlan.plan.requiresPassword) {
              securityModalPlan.resolve(true);
              setSecurityModalPlan(null);
            }
          }}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '20px',
            transition: 'all 0.3s ease',
            outline: 'none'
          }}>
          <div style={{
            width: '100%',
            maxWidth: '460px',
            background: 'rgba(22, 24, 32, 0.88)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '16px',
            boxShadow: '0 24px 64px rgba(0, 0, 0, 0.85), 0 4px 16px rgba(0, 0, 0, 0.5)',
            padding: '26px',
            color: '#fff',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f59e0b'
              }}>
                <ShieldAlert size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f8fafc', letterSpacing: '-0.2px' }}>
                  System Authorization Required
                </h3>
                <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.55)', display: 'block', marginTop: '2px' }}>
                  Protected operation requested • {securityModalPlan.plan.riskLevel || 'ADMIN'} Profile
                </span>
              </div>
            </div>

            <p style={{ fontSize: '13px', lineHeight: '1.55', color: 'rgba(255, 255, 255, 0.75)', margin: '0 0 18px 0' }}>
              {securityModalPlan.plan.requiresPassword
                ? 'To ensure system integrity and prevent unauthorized modifications, please verify your system administrator / sudo credentials to execute this capability.'
                : 'This terminal command requires your explicit confirmation before executing. Review the command and intent below.'}
            </p>

            <div style={{
              backgroundColor: 'rgba(10, 11, 15, 0.6)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              borderRadius: '10px',
              padding: '12px 14px',
              marginBottom: '20px',
              fontSize: '12px',
              fontFamily: 'monospace'
            }}>
              <div style={{ marginBottom: '6px', display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.5)' }}>Action:</span>
                <span style={{ color: '#38bdf8', fontWeight: 600 }}>{securityModalPlan.plan.capabilityId}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                <span style={{ color: 'rgba(255, 255, 255, 0.5)', flexShrink: 0 }}>Target:</span>
                <span style={{ color: '#e2e8f0', wordBreak: 'break-all', textAlign: 'right', fontWeight: 500 }}>
                  {String(securityModalPlan.plan.parameters?.path || securityModalPlan.plan.parameters?.source || securityModalPlan.plan.parameters?.command || JSON.stringify(securityModalPlan.plan.parameters))}
                </span>
              </div>
              {securityModalPlan.plan.explanation && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.07)', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
                  <span style={{ color: '#a78bfa', flexShrink: 0, fontWeight: 600 }}>Intent:</span>
                  <span style={{ color: '#f1f5f9', lineHeight: '1.45', wordBreak: 'break-word' }}>
                    {securityModalPlan.plan.explanation}
                  </span>
                </div>
              )}
            </div>

            {securityModalPlan.plan.requiresPassword ? (
              <div style={{ marginBottom: '22px' }}>
                <label style={{ display: 'block', fontSize: '12px', color: 'rgba(255, 255, 255, 0.85)', marginBottom: '8px', fontWeight: 500 }}>
                  System Administrator / Sudo Password:
                </label>
                <input
                  type="password"
                  value={authPassword}
                  onChange={(e) => { setAuthPassword(e.target.value); setAuthError(''); }}
                  placeholder="Enter system credentials..."
                  autoFocus
                  disabled={isVerifying}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isVerifying) {
                      handleAuthorize();
                    } else if (e.key === 'Escape' && !isVerifying) {
                      securityModalPlan.resolve(false);
                      setSecurityModalPlan(null);
                      setAuthPassword('');
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    border: authError ? '1px solid rgba(239, 68, 68, 0.6)' : '1px solid rgba(255, 255, 255, 0.15)',
                    backgroundColor: 'rgba(8, 9, 13, 0.75)',
                    color: '#fff',
                    fontSize: '13px',
                    outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s ease'
                  }}
                />
                {authError && (
                  <div style={{ color: '#ef4444', fontSize: '12px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertCircle size={14} style={{ color: '#ef4444', flexShrink: 0 }} />
                    <span>{authError}</span>
                  </div>
                )}
              </div>
            ) : null}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                disabled={isVerifying}
                onClick={() => {
                  securityModalPlan.resolve(false);
                  setSecurityModalPlan(null);
                  setAuthPassword('');
                }}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  color: '#cbd5e1',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: 500,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '5px',
                  transition: 'background-color 0.2s ease'
                }}
              >
                <X size={13} />
                <span>Cancel</span> <span style={{ opacity: 0.6, fontSize: '11px', marginLeft: '4px' }}>[Esc]</span>
              </button>
              <button
                disabled={isVerifying}
                onClick={() => {
                  if (securityModalPlan.plan.requiresPassword) {
                    handleAuthorize();
                  } else {
                    securityModalPlan.resolve(true);
                    setSecurityModalPlan(null);
                  }
                }}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: isVerifying ? 'rgba(255, 255, 255, 0.2)' : '#f59e0b',
                  color: isVerifying ? '#ffffff' : '#000000',
                  fontSize: '13px',
                  cursor: isVerifying ? 'wait' : 'pointer',
                  fontWeight: 600,
                  boxShadow: isVerifying ? 'none' : '0 2px 10px rgba(245, 158, 11, 0.3)',
                  transition: 'all 0.2s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Check size={14} />
                <span>{isVerifying ? 'Authenticating...' : securityModalPlan.plan.requiresPassword ? 'Authorize' : 'Approve & Execute'}</span>
                {!isVerifying && <span style={{ opacity: 0.75, fontSize: '11px', background: 'rgba(0,0,0,0.18)', padding: '1px 5px', borderRadius: '4px' }}>↵ Enter</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

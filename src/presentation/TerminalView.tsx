import { AuditLogger } from '../domain/security/AuditLogger';
import { SystemSettingsProvider } from '../domain/autocomplete/SystemSettingsProvider';
import { runFlowInTerminal, parseStepMarker, flowApprovalPlan, type ShellFamily } from '../workflows/flow/FlowRunner';
import { flowOsOf, absolutizeCwd, type FlowPlan } from '../workflows/flow/FlowPlan';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { invoke } from '@tauri-apps/api/core';
import { SessionManager } from '../domain/SessionManager';
import { ToolLoader } from '../tools/loader/ToolLoader';
import { AppAliasRegistry } from '../domain/capabilities/AppAliasRegistry';
import { AgentLoop, AgentPlan, AgentResult } from '../ai/agent/AgentLoop';
import { PromptProgressManager } from '../ai/agent/PromptProgressManager';
import { DemonstrationLearningEngine, isPlausibleDemonstration } from '../domain/learning/DemonstrationLearningEngine';
import { EpisodicMemoryEngine } from '../domain/learning/EpisodicMemoryEngine';
import { SentinelSerlCoordinator } from '../domain/learning/SentinelSerlCoordinator';
import { PtyOutputObserver, type RemediationPrompt } from '../domain/observer/PtyOutputObserver';
import { ErrorWatchService } from '../domain/watch/ErrorWatchService';
import { formatAgentEvent, formatDataOutput, formatWatchEvent, formatRemediationNotice, AgentEventRenderer, S } from './OutputFormatter';

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
import { InputLineTracker, stripPrompt, parseCdTarget } from './InputLineTracker';
import { decideGhostKey } from './ghostKeys';
import { decideStopKey } from './stopKeys';
import { PromptQueue, parseQueueCommand } from './PromptQueue';
import { TerminalWorkspace } from '../domain/terminal/TerminalWorkspace';
import { claimTerminalRequests, releaseTerminalRequests, TerminalRequest } from './TerminalRequests';
import { claimChoiceRequests, releaseChoiceRequests, type ChoiceRequest, type ChoiceResult } from './ChoiceRequests';
import { ChoiceDialog } from '../ui/components/ChoiceDialog';
import { createPortal } from 'react-dom';

type AgentRunner = (context: { os: string; cwd: string; paneId?: string; signal?: AbortSignal }) => Promise<AgentResult>;
import { readClipboardText, writeClipboardText, formatTerminalPastePayload } from '../utils/clipboard';

/** Goal text for an auto-heal request: the failing command and diagnosis, not just a title. */
function autoHealGoal(rem: RemediationPrompt): string {
  return rem.failedCommand
    ? `fix the error from \`${rem.failedCommand}\`: ${rem.cause}`
    : `fix this terminal error: ${rem.cause}`;
}
import '@xterm/xterm/css/xterm.css';

interface TerminalViewProps {
  /** Layout id of this pane; registers it with the TerminalWorkspace */
  paneId?: string;
  /** The pane the user last focused; it receives requests from the Workflow Manager and opened files */
  isFocused?: boolean;
  sessionId?: string;
  onSessionCreated?: (sessionId: string) => void;
  isActive: boolean;
  currentPath?: string;
  onPathChange?: (newPath: string) => void;
}

export const TerminalView: React.FC<TerminalViewProps> = ({ paneId, isFocused, sessionId: initialSessionId, onSessionCreated, isActive, currentPath, onPathChange }) => {
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
  const [searchRequest, setSearchRequest] = useState<{ text: string; id: number } | undefined>(undefined);
  // Read by window listeners registered once, which would otherwise see the first value
  const isFocusedRef = useRef(isFocused);
  useEffect(() => { isFocusedRef.current = isFocused; }, [isFocused]);

  const [securityModalPlan, setSecurityModalPlan] = useState<{
    plan: any;
    resolve: (approved: boolean) => void;
    requestId?: string;
  } | null>(null);
  // When the dialog appeared and when the last stray keystroke hit it. A dialog that opens while
  // the user is typing must not be approved by the Enter that finishes their command.
  const consentShownAtRef = useRef(0);
  const consentStrayKeyAtRef = useRef(0);
  // The plan the timestamp belongs to: a dialog replaced by the next request starts unarmed
  const consentPlanRef = useRef<unknown>(null);
  // Keyboard focus goes back to the terminal when the confirmation dialog closes
  useEffect(() => {
    if (securityModalPlan) {
      consentOpenRef.current = true;
    } else if (consentOpenRef.current) {
      consentOpenRef.current = false;
      requestAnimationFrame(() => xtermRef.current?.focus());
    }
  }, [securityModalPlan]);
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
  // One error observer per pane: a failure in one terminal must only offer its fix there
  // (a shared observer mixed every pane's output and applied fixes in the wrong folder)
  const outputObserverRef = useRef<PtyOutputObserver>(new PtyOutputObserver());
  const consentOpenRef = useRef(false);
  const inputLineRef = useRef<InputLineTracker>(new InputLineTracker());
  const aiBusyRef = useRef(false);
  const activeRunAbortControllerRef = useRef<AbortController | null>(null);
  const lastInterruptTimeRef = useRef<number>(0);
  // Runs a request handed over by the app (Workflow Manager, opened workflow file)
  const submitRef = useRef<((request: TerminalRequest) => void) | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  // The focused pane receives requests from the Workflow Manager and opened workflow files
  useEffect(() => {
    if (!paneId || !isFocused || !sessionReady) return;
    claimTerminalRequests(paneId, (request) => submitRef.current?.(request));
    return () => releaseTerminalRequests(paneId);
  }, [paneId, isFocused, sessionReady]);

  // "Where should this file go?": the agent asks, this pane shows the dialog
  const [choiceRequest, setChoiceRequest] = useState<{ request: ChoiceRequest; resolve: (r: ChoiceResult) => void } | null>(null);
  useEffect(() => {
    if (!paneId || !isFocused || !sessionReady) return;
    claimChoiceRequests(paneId, (request) => new Promise<ChoiceResult>((resolve) => setChoiceRequest({ request, resolve })));
    return () => releaseChoiceRequests(paneId);
  }, [paneId, isFocused, sessionReady]);
  useEffect(() => {
    if (!choiceRequest) requestAnimationFrame(() => xtermRef.current?.focus());
  }, [choiceRequest]);

  const lastUnresolvedGoalRef = useRef<{ goal: string; timestamp: number } | null>(null);

  const handleExecuteRemediation = async (rem: RemediationPrompt) => {
    setActiveRemediation(null);
    outputObserverRef.current.clearRemediation();
    const activeSessionId = sessionIdRef.current || sessionId;
    if (activeSessionId) {
      await SessionManager.getInstance().write(activeSessionId, '\x03');
    }
    if (xtermRef.current) {
      xtermRef.current.write(`\r\n  ${S.muted}›${S.reset} ${S.soft}Applying fix: ${rem.actionTitle}${S.reset}\r\n`);
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

  // High-risk commands (stopping processes, deleting, super-user) need an explicit click on Run.
  // Sentinel never asks for the login password: it was collected in this window and checked by putting
  // it on a command line, where other local processes could read it, and it granted nothing (the command
  // runs as the user either way). Super-user commands ask in the terminal itself, where sudo belongs.
  const needsExplicitClick = (plan: any) => Boolean(plan?.requiresPassword || plan?.requiresClick);

  useEffect(() => {
    if (!terminalRef.current) return;

    const themeManager = ThemeManager.getInstance();
    const currentTheme = themeManager.getTheme();

    const isPreviewMode = typeof window !== 'undefined' && (window.location.search.includes('preview') || window.location.search.includes('large_preview'));
    /** Resolves the running .flow step when its end-of-step report arrives */
    let flowStepWaiter: ((code: number | null) => void) | null = null;
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
    // "search the terminal for ERROR": only the pane the request came from opens its search
    const handleFindRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ paneId?: string; query?: string }>).detail || {};
      if (detail.paneId && detail.paneId !== paneId) return;
      if (!detail.paneId && !isFocusedRef.current) return;
      setIsSearchOpen(true);
      if (detail.query) setSearchRequest({ text: detail.query, id: Date.now() });
    };
    window.addEventListener('sentinel:find-in-terminal', handleFindRequest);

    term.open(terminalRef.current);

    // End-of-step reports from .flow runs (OSC 777 "sentinel-step;<code>"): invisible, never drawn
    term.parser.registerOscHandler(777, (payload) => {
      const code = parseStepMarker(payload);
      if (code === null) return false;
      flowStepWaiter?.(code);
      return true;
    });
    
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
      // Through the session's current view: this closure may outlive this view (see attachDisplay)
      if (!currentSessionId || !sessionManager.display(currentSessionId, normalized)) {
        term.write(normalized);
      }
      if (currentSessionId) {
        sessionManager.recordOutput(currentSessionId, normalized);
      }
    };
    
    // We must define the callback here so we can remove it later
    let outputCallback: ((data: Uint8Array, replay?: boolean) => void) | null = null;
    let shellRedrawMuteUntil = 0;
    let unsubPaneState: (() => void) | null = null;
    let detachDisplay: (() => void) | null = null;
    let shellRedrawSeen = false;
    // Runs `next` once the shell has redrawn after the discarded `>` line (or the mute window
    // ran out), then unmutes: a fast answer must not race the redraw into a double prompt
    const afterShellRedraw = (next: () => void) => {
      const finish = () => { shellRedrawMuteUntil = 0; next(); };
      const poll = () => {
        if (shellRedrawSeen) { setTimeout(finish, 40); return; }
        if (Date.now() >= shellRedrawMuteUntil) { finish(); return; }
        setTimeout(poll, 20);
      };
      poll();
    };
    let activeRenderer: AgentEventRenderer | null = null;
    let unsubRemediation: (() => void) | null = null;
    let unsubConsent: (() => void) | null = null;
    let unsubWatch: (() => void) | null = null;

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

        // This view now shows the session: output from requests started in an earlier view lands here
        detachDisplay = sessionManager.attachDisplay(currentSessionId, (text) => term.write(text));

        // Tell the workspace about this pane so the agent knows what every terminal is doing
        const workspace = TerminalWorkspace.getInstance();
        if (paneId) {
          workspace.register(paneId, { sessionId: currentSessionId, cwd: currentPathRef.current || currentPath || '~' });
          unsubPaneState = ptyTrackerRef.current.subscribe((state) => {
            if (state === 'idle-at-prompt') workspace.update(paneId, { busy: false, runningCommand: undefined, alternateScreen: false });
            else if (state === 'alternate-screen-buffer') workspace.update(paneId, { alternateScreen: true });
            else workspace.update(paneId, { alternateScreen: false });
          });
        }
        // A pane the agent opened runs its command once the shell has printed its first prompt
        // (output quiet for a moment), so the command is not typed into shell start-up
        let pendingTimer: ReturnType<typeof setTimeout> | undefined;
        const schedulePendingCommand = () => {
          if (!paneId || !workspace.hasPendingCommand(paneId)) return;
          if (pendingTimer) clearTimeout(pendingTimer);
          pendingTimer = setTimeout(() => {
            const request = workspace.takePendingCommand(paneId);
            if (!request?.command || !currentSessionId) return;
            workspace.update(paneId, { busy: true, runningCommand: request.command });
            ptyTrackerRef.current.notifyCommandStarted(request.command);
            sessionManager.write(currentSessionId, `${request.command}\r`);
          }, 400);
        };

        // One decoder in streaming mode: a UTF-8 character can be split across PTY reads
        const decoder = new TextDecoder();
        const replayDecoder = new TextDecoder();
        outputCallback = (data: Uint8Array, replay?: boolean) => {
          if (replay) {
            // History restored after a layout change: draw only. A new agent pane's first prompt
            // can arrive here, so a queued command is still scheduled.
            term.write(replayDecoder.decode(data, { stream: true }));
            if (paneId) schedulePendingCommand();
            return;
          }
          const text = decoder.decode(data, { stream: true });
          ptyTrackerRef.current.feedOutput(text);
          if (paneId) {
            workspace.appendOutput(paneId, text);
            schedulePendingCommand();
          }
          // Discarding a `>` request line makes the shell print a fresh prompt; hide that redraw so
          // agent output follows the request directly (the final prompt is printed at the end)
          if (Date.now() < shellRedrawMuteUntil) { shellRedrawSeen = true; return; }
          // SessionManager already recorded this shell output; only Sentinel's own text is
          // recorded by writeTerm (recording both doubled every restored screen)
          term.write(text.replace(/\r?\n/g, '\r\n'));
          outputObserverRef.current.ingest(text, currentPathRef.current);
        };

        // A notice that arrives while the shell sits at an empty prompt goes above a fresh prompt
        // (otherwise the next keystrokes would echo after the notice, away from the prompt)
        const writeNotice = (text: string) => {
          const atEmptyPrompt = ptyTrackerRef.current.isIdleAtPrompt() && !inputLineRef.current.hasAnchor() && !aiBusyRef.current;
          if (atEmptyPrompt && currentSessionId) {
            writeTerm(`\r\x1b[2K${text.replace(/^(\r\n)+/, '')}`);
            sessionManager.write(currentSessionId, '\r');
          } else {
            writeTerm(text);
          }
        };

        unsubRemediation = outputObserverRef.current.onRemediation((rem) => {
          setActiveRemediation(rem);
          if (rem) {
            writeNotice(formatRemediationNotice(rem.cause, rem.actionTitle));
          }
        });

        sessionManager.onOutput(currentSessionId, outputCallback);

        // Initialize AI Tool Registry & Agent Loop
        const agentLoop = new AgentLoop(ToolLoader.getSharedState());
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

        // Error watcher notices for watches started from this tab
        unsubWatch = ErrorWatchService.getInstance().onEvent((event) => {
          if (event.watch.owner && event.watch.owner !== agentLoop.ownerId) return;
          writeNotice(formatWatchEvent(event));
        });

        // Initialize Autocomplete with History, Demonstration, and Workspace Context providers
        const autocompleteEngine = new AutocompleteEngine();
        // Shared with the Ctrl+R history search, so commands run in any pane show up there
        const historyProvider = HistoryProvider.getInstance();
        const demonstrationProvider = new DemonstrationProvider();
        const workspaceContextProvider = new WorkspaceContextProvider();
        autocompleteEngine.registerProvider(historyProvider);
        autocompleteEngine.registerProvider(demonstrationProvider);
        autocompleteEngine.registerProvider(workspaceContextProvider);
        autocompleteEngine.registerProvider(new SystemSettingsProvider());
        
        // Start Tier 4 Sentinel-SERL Autonomous Orchestrator
        SentinelSerlCoordinator.getInstance().startCoordinator();

        const ghostText = new GhostTextRenderer(term);
        ghostText.attach(terminalRef.current!);

        // Keep the sidebar/tab path in sync when a request changes directory
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

        // The shell's real working directory, read from the OS; keeps the tab, status bar and
        // agent in the folder the shell is actually in (aliases, pushd, `z`, compound cd lines)
        const syncCwd = async (): Promise<string | null> => {
          if (!currentSessionId) return null;
          try {
            const cwd = await invoke<string | null>('get_pty_cwd', { sessionId: currentSessionId });
            if (!cwd) return null;
            if (cwd !== currentPathRef.current) {
              currentPathRef.current = cwd;
              notifyNavigation(cwd);
            }
            if (paneId) TerminalWorkspace.getInstance().update(paneId, { cwd });
            return cwd;
          } catch {
            return null;
          }
        };

        // Runs one AI request and streams its events into the terminal
        const runAiGoal = async (aiGoal: string, runner?: AgentRunner) => {
          // Busy before the first await, so a second Enter is queued rather than run alongside
          aiBusyRef.current = true;
          const abortController = new AbortController();
          activeRunAbortControllerRef.current = abortController;
          const cwd = (await syncCwd()) || currentPathRef.current || currentPath || '~';
          // Initiate live progress tracking in the bottom bar
          PromptProgressManager.getInstance().startPrompt(aiGoal);
          const renderer = new AgentEventRenderer(() => term.cols);
          activeRenderer = renderer;

          // Set up event listener for live output
          agentLoop.onEvent((event) => {
            if (abortController.signal.aborted) return;
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

            // Structured results (battery, processes, volumes, ...) carry their own labels, so the
            // one-line "✓ summary" above them is dropped; raw command output keeps its header line
            const dataOutput = event.data && (event.type === 'tool_done' || event.type === 'done')
              ? formatDataOutput(event.data, { goal: aiGoal })
              : '';
            const hasStdout = typeof event.data?.stdout === 'string' && event.data.stdout.trim().length > 0;
            const text = event.type === 'tool_done' && dataOutput && !hasStdout
              ? renderer.settleForData(event)
              : renderer.render(event);
            if (text) writeTerm(text);
            // Skip the data only when the message already shows it; compare without color codes
            // (a short answer such as "2" otherwise matches an escape sequence and disappears)
            const plain = (v: string) => v.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').trim();
            if (dataOutput && (!text || !plain(text).includes(plain(dataOutput)))) {
              writeTerm(dataOutput);
            }
          });

          // Run the agent loop
          (runner ? runner({ os: getPlatform(), cwd, paneId, signal: abortController.signal }) : agentLoop.run(aiGoal, { os: getPlatform(), cwd, paneId, signal: abortController.signal })).then(result => {
            if (abortController.signal.aborted || result.cancelled) {
              return;
            }
            const leftover = renderer.finish();
            if (leftover) writeTerm(leftover);
            PromptProgressManager.getInstance().completePrompt(result.success, result.summary);
            // A declined request is answered: the user chose not to do it
            if (!result.success && !result.declined) {
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
              afterShellRedraw(() => sessionManager.write(currentSessionId!, '\r'));
              return;
            }

            // Handle directory navigation
            if (result.cdPath) {
              notifyNavigation(result.cdPath);
              const cdCmd = result.cdPath.includes(' ') && !result.cdPath.startsWith('"') && !result.cdPath.startsWith("'") ? `cd "${result.cdPath}"` : `cd ${result.cdPath}`;
              afterShellRedraw(() => sessionManager.write(currentSessionId!, `${cdCmd}\r`));
            } else {
              writeTerm('\r\n');
              afterShellRedraw(() => sessionManager.write(currentSessionId!, '\r'));
            }
          }).catch(err => {
            if (abortController.signal.aborted) {
              return;
            }
            const leftover = renderer.finish();
            if (leftover) writeTerm(leftover);
            PromptProgressManager.getInstance().completePrompt(false, err?.message || 'Error');
            lastUnresolvedGoalRef.current = { goal: aiGoal, timestamp: Date.now() };
            setPlanExecutionStatus('failed');
            planExecutionStatusRef.current = 'failed';
            schedulePlanDismiss();
            writeTerm(`\r\n${formatAgentEvent({ type: 'error', message: err.message || 'Something went wrong' })}\r\n`);
            afterShellRedraw(() => sessionManager.write(currentSessionId!, '\r'));
          }).finally(() => {
            if (activeRunAbortControllerRef.current === abortController) {
              activeRunAbortControllerRef.current = null;
            }
            aiBusyRef.current = false;
            activeRenderer = null;
            const next = PromptQueue.getInstance().dequeue();
            if (next) setTimeout(() => runAiGoal(next.goal, next.runner), 150);
          });
        };

        // .flow files that install or run things: typed into this terminal step by step
        const runFlow = async (originalPlan: FlowPlan, source?: string) => {
          aiBusyRef.current = true;
          const abortController = new AbortController();
          activeRunAbortControllerRef.current = abortController;
          const os = flowOsOf(getPlatform());
          let plan = originalPlan;
          try {
            // Relative folders in a flow mean "from where the terminal is now" (see absolutizeCwd)
            const startFolder = await invoke<string | null>('get_pty_cwd', { sessionId: currentSessionId }).catch(() => null);
            plan = absolutizeCwd(originalPlan, startFolder || undefined, os);
            let shell: ShellFamily = 'powershell';
            if (os !== 'windows') {
              const probe = await invoke<{ stdout: string }>('execute_command', { command: '/bin/sh', args: ['-c', 'printf %s "$SHELL"'], timeoutMs: 5000 }).catch(() => ({ stdout: '' }));
              shell = /fish$/.test((probe.stdout || '').trim()) ? 'fish' : 'posix';
            }
            // A pane opened for this flow may still be starting its shell
            for (let waited = 0; waited < 15000 && !ptyTrackerRef.current.isIdleAtPrompt(); waited += 250) {
              if (abortController.signal.aborted) break;
              await new Promise(r => setTimeout(r, 250));
            }
            await runFlowInTerminal(plan, {
              os,
              shell,
              type: async (text) => {
                if (!text.startsWith('__sentinel_step') && !text.startsWith('function __sentinel_step')) ptyTrackerRef.current.notifyCommandStarted(text);
                await sessionManager.write(currentSessionId!, text);
              },
              nextStepResult: () => new Promise<number | null>((resolve) => {
                let settled = false;
                const started = Date.now();
                let idleSince = 0;
                const finish = (code: number | null) => {
                  if (settled) return;
                  settled = true;
                  clearInterval(watch);
                  if (flowStepWaiter === finish) flowStepWaiter = null;
                  resolve(code);
                };
                flowStepWaiter = finish;
                // No marker and the prompt has been back for 8 s: the step was interrupted (Ctrl+C)
                const watch = setInterval(() => {
                  if (abortController.signal.aborted) {
                    finish(null);
                    return;
                  }
                  if (Date.now() - started < 2000) return;
                  if (ptyTrackerRef.current.isIdleAtPrompt()) {
                    idleSince = idleSince || Date.now();
                    if (Date.now() - idleSince > 8000) finish(null);
                  } else {
                    idleSince = 0;
                  }
                }, 500);
              }),
              approve: (p) => ConsentQueue.getInstance().enqueue(flowApprovalPlan(p, os, source), currentSessionId!),
              audit: (event) => {
                void AuditLogger.getInstance().log({
                  source: 'user',
                  capabilityId: event.type === 'step' ? 'workflow.flow.step' : 'workflow.flow',
                  parameters: event.type === 'step'
                    ? { flow: plan.name, source, step: event.step?.name, command: event.step?.command, exitCode: event.exitCode }
                    : { flow: plan.name, source, steps: plan.steps.map(s => s.command) },
                  riskScore: 0,
                  permissionResult: event.type === 'declined' ? 'Denied' : 'Granted',
                  executionTimeMs: 0,
                  verificationResult: event.type === 'step' ? (event.exitCode === 0 ? 'Success' : 'Failure') : 'NotApplicable',
                  rollbackAvailable: false,
                  userConfirmation: event.type !== 'declined',
                }).catch(() => {});
              },
              execute: (command, args) => invoke<{ code: number; stdout: string; stderr: string }>('execute_command', { command, args, timeoutMs: 30000 }),
              notice: (text, tone) => {
                const color = tone === 'error' ? S.err : tone === 'ok' ? S.ok : S.muted;
                writeTerm(`\r\n  ${color}${tone === 'error' ? '✗' : tone === 'ok' ? '✓' : '›'}${S.reset} ${S.text}${text}${S.reset}\r\n`);
              },
              signal: abortController.signal
            }, source);
          } catch (err: any) {
            if (!abortController.signal.aborted) {
              writeTerm(`\r\n  ${S.err}✗${S.reset} Flow "${plan.name}" failed: ${err?.message || err}\r\n`);
            }
          } finally {
            if (activeRunAbortControllerRef.current === abortController) {
              activeRunAbortControllerRef.current = null;
            }
            // The result line was written below the last prompt: ask the shell for a fresh one
            if (currentSessionId) void sessionManager.write(currentSessionId, '\r');
            aiBusyRef.current = false;
            const next = PromptQueue.getInstance().dequeue();
            if (next) setTimeout(() => runAiGoal(next.goal, next.runner), 150);
          }
        };

        submitRef.current = (request: TerminalRequest) => {
          if (request.kind === 'flow') {
            writeTerm(`\r\n  ${S.muted}›${S.reset} ${S.text}Flow "${request.plan.name}"${request.source ? ` from ${request.source.split(/[\\/]/).pop()}` : ''}${S.reset}`);
            if (aiBusyRef.current) {
              writeTerm(`\r\n  ${S.muted}Another request is running; open the flow again when it is done.${S.reset}\r\n`);
              return;
            }
            void runFlow(request.plan, request.source);
            return;
          }
          const label = request.kind === 'goal'
            ? request.goal
            : `Run workflow "${request.definition.name}"${request.source ? ` from ${request.source.split(/[\\/]/).pop()}` : ''}`;
          writeTerm(`\r\n  ${S.muted}›${S.reset} ${S.text}${label}${S.reset}`);
          const runner: AgentRunner | undefined = request.kind === 'workflow'
            ? (ctx) => agentLoop.runWorkflow(request.definition, {}, ctx)
            : undefined;
          if (aiBusyRef.current) {
            PromptQueue.getInstance().enqueue(label, runner);
            writeTerm(`\r\n  ${S.muted}Queued: ${label}${S.reset}\r\n`);
            return;
          }
          runAiGoal(request.kind === 'goal' ? request.goal : label, runner);
        };
        setSessionReady(true);

        term.onData(async (data) => {
          if (!currentSessionId) return;
          SentinelSerlCoordinator.getInstance().markActivity();

          // Stop key decision (Task 2.2: Ctrl+C stops a running task or copies selection)
          const stopAction = decideStopKey({
            data,
            hasSelection: term.hasSelection(),
            isAiBusy: aiBusyRef.current,
            lastInterruptTime: lastInterruptTimeRef.current,
          });

          if (stopAction === 'copy-selection') {
            const selection = term.getSelection();
            if (selection) {
              try {
                await navigator.clipboard.writeText(selection);
              } catch { /* ignore clipboard write failure */ }
            }
            return;
          }

          if (stopAction === 'abort-ai-task') {
            lastInterruptTimeRef.current = Date.now();
            activeRunAbortControllerRef.current?.abort();
            if (currentSessionId) {
              await sessionManager.write(currentSessionId, '\x03');
            }
            const leftover = activeRenderer?.finish() ?? '';
            writeTerm(`${leftover}\r\n  ${S.muted}Stopped.${S.reset}\r\n`);
            PromptProgressManager.getInstance().completePrompt(false, 'Stopped.');
            setPlanExecutionStatus('failed');
            planExecutionStatusRef.current = 'failed';
            schedulePlanDismiss();
            aiBusyRef.current = false;
            activeRunAbortControllerRef.current = null;
            afterShellRedraw(() => sessionManager.write(currentSessionId!, '\r'));
            return;
          }

          if (stopAction === 'force-kill-ai-task') {
            lastInterruptTimeRef.current = 0;
            activeRunAbortControllerRef.current?.abort();
            if (currentSessionId) {
              await sessionManager.write(currentSessionId, '\x03');
              await sessionManager.write(currentSessionId, '\x03');
            }
            try {
              await invoke('cancel_command', { runId: '*' }).catch(() => {});
            } catch { /* ignore */ }
            const leftover = activeRenderer?.finish() ?? '';
            writeTerm(`${leftover}\r\n  ${S.err}Force killed.${S.reset}\r\n`);
            PromptProgressManager.getInstance().completePrompt(false, 'Killed.');
            setPlanExecutionStatus('failed');
            planExecutionStatusRef.current = 'failed';
            schedulePlanDismiss();
            aiBusyRef.current = false;
            activeRunAbortControllerRef.current = null;
            PromptQueue.getInstance().clear();
            afterShellRedraw(() => sessionManager.write(currentSessionId!, '\r'));
            return;
          }

          // Remember where this input line starts so Enter can read exactly what was typed
          if (!(data.includes('\r') || data === '\n') && term.buffer.active.type !== 'alternate') {
            const b = term.buffer.active;
            inputLineRef.current.noteKeystroke(data, { row: b.baseY + b.cursorY, col: b.cursorX }, ptyTrackerRef.current.isProcessRunning());
          }

          // Ghost-text key decisions (Task 1.4: only Tab at end and Right at end accept)
          const ghostAction = decideGhostKey(data, {
            cursorAtEnd: (() => {
              const buf = term.buffer.active;
              const row = buf.baseY + buf.cursorY;
              const line = buf.getLine(row);
              if (!line) return true;
              const lineText = line.translateToString(true);
              return buf.cursorX >= lineText.length;
            })(),
            hasGhost: !!ghostText.getRemaining(),
            acceptRight: localStorage.getItem('sentinel_ghost_accept_right') !== 'false',
          });

          if (ghostAction === 'accept-ghost') {
            const remaining = ghostText.getRemaining();
            if (remaining) {
              await sessionManager.write(currentSessionId, remaining);
              ghostText.clear();
              return;
            }
          } else if (ghostAction === 'clear-ghost-and-pass') {
            ghostText.clear();
            // Fall through to send the key to the shell
          }

          // Tab with no ghost: check auto-heal remediation
          if (data === '\t') {
             const activeRem = outputObserverRef.current.getActiveRemediation();
             if (activeRem) {
               await ptyTrackerRef.current.safeClearLine(d => sessionManager.write(currentSessionId!, d));
               writeTerm(`\r\n  ${S.muted}>${S.reset} ${S.soft}Applying fix: ${activeRem.actionTitle}${S.reset}\r\n`);
               outputObserverRef.current.clearRemediation();
               if (activeRem.tool === 'shell.execute' && activeRem.params?.command) {
                 await sessionManager.write(currentSessionId!, `${activeRem.params.command}\r`);
               } else {
                 PromptProgressManager.getInstance().startPrompt(`Auto-Heal: ${activeRem.actionTitle}`);
                 try {
                   const res = await agentLoop.run(autoHealGoal(activeRem), { os: getPlatform(), cwd: currentPath || '~', attachedContext: activeRem.outputTail });
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
              // Exact text from where typing started on this line (see InputLineTracker)
              const anchored = inputLineRef.current.typedText() ?? inputLineRef.current.read(buffer, lineIndex);
              // Typed while a program was running (a server, a REPL): clear the line with Ctrl+U,
              // never ^C, which would stop that program
              const typedWhileRunning = inputLineRef.current.startedWhileRunning();
              inputLineRef.current.reset();
              let commandText: string;
              if (anchored !== null) {
                commandText = anchored;
              } else {
                // Fallback: read back up to 3 rows (wrapping) and strip the prompt
                let currentLineIndex = lineIndex;
                let fullText = '';
                for (let i = 0; i < 3 && currentLineIndex >= 0; i++) {
                  const l = buffer.getLine(currentLineIndex);
                  if (!l) break;
                  fullText = l.translateToString(false).replace(/\s+$/, '') + fullText;
                  if (/[$%#❯]\s/.test(fullText)) break;
                  currentLineIndex--;
                }
                commandText = stripPrompt(fullText);
              }

              // A line typed while a program owns the terminal (a sudo or ssh password prompt, a
              // full-screen editor) is input to that program, not a shell command: never keep it
              const atShellPrompt = !typedWhileRunning && !ptyTrackerRef.current.isProcessRunning()
                && !ptyTrackerRef.current.isAlternateBuffer()
                && term.buffer.active.type !== 'alternate';
              if (commandText.trim() && atShellPrompt) {
                 historyProvider.addHistory(commandText.trim(), currentPath || '~');
              }

              const cleanCmd = commandText.trim();

              // Intercept dangerous / catastrophic destruction commands
              const safetyEval = CommandSafetyGuardian.getInstance().evaluate(cleanCmd);
              if (safetyEval.isBlocked) {
                await (typedWhileRunning ? sessionManager.write(currentSessionId!, '\x15') : ptyTrackerRef.current.safeClearLine(d => sessionManager.write(currentSessionId!, d)));
                const banner = CommandSafetyGuardian.getInstance().formatTerminalBanner(safetyEval, cleanCmd);
                writeTerm(banner);
                return;
              }


              const cdTarget = parseCdTarget(cleanCmd);
              if (cdTarget !== null) notifyNavigation(cdTarget);

              // Intercept application mapping slash commands: /app, /apps, /alias, /aliases
              if (cleanCmd.startsWith('/app') || cleanCmd.startsWith('/alias')) {
                await (typedWhileRunning ? sessionManager.write(currentSessionId!, '\x15') : ptyTrackerRef.current.safeClearLine(d => sessionManager.write(currentSessionId!, d)));
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
                await (typedWhileRunning ? sessionManager.write(currentSessionId!, '\x15') : ptyTrackerRef.current.safeClearLine(d => sessionManager.write(currentSessionId!, d)));
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
                await (typedWhileRunning ? sessionManager.write(currentSessionId!, '\x15') : ptyTrackerRef.current.safeClearLine(d => sessionManager.write(currentSessionId!, d)));
                const rem = outputObserverRef.current.getActiveRemediation();
                if (rem) {
                  writeTerm(`\r\n  ${S.muted}›${S.reset} ${S.soft}Applying fix: ${rem.actionTitle}${S.reset}\r\n`);
                  outputObserverRef.current.clearRemediation();
                  PromptProgressManager.getInstance().startPrompt(`Auto-Heal: ${rem.actionTitle}`);
                  try {
                    const res = await agentLoop.run(autoHealGoal(rem), { os: getPlatform(), cwd: currentPath || '~', attachedContext: rem.outputTail });
                    PromptProgressManager.getInstance().completePrompt(res.success, res.summary);
                  } catch (err: any) {
                    PromptProgressManager.getInstance().completePrompt(false, err?.message);
                  }
                } else {
                  writeTerm(`\r\n  ${S.muted}No recent error to fix.${S.reset}\r\n\r\n`);
                }
                return;
              }

              // If there was an unresolved AI goal within the last 3 minutes and the user demonstrates a command
              if (
                atShellPrompt &&
                lastUnresolvedGoalRef.current &&
                Date.now() - lastUnresolvedGoalRef.current.timestamp < 180000 &&
                !['ls', 'pwd', 'clear', 'exit'].includes(cleanCmd.toLowerCase()) &&
                !cleanCmd.startsWith('cd ') &&
                !cleanCmd.startsWith('>') &&
                !cleanCmd.startsWith('/') &&
                isPlausibleDemonstration(lastUnresolvedGoalRef.current.goal, cleanCmd)
              ) {
                const learned = DemonstrationLearningEngine.getInstance().learnFromDemonstration(
                  lastUnresolvedGoalRef.current.goal,
                  cleanCmd,
                  currentPathRef.current
                );
                EpisodicMemoryEngine.getInstance().recordMemory(
                  lastUnresolvedGoalRef.current.goal,
                  cleanCmd,
                  {
                    cwd: currentPathRef.current,
                    source: 'demonstration'
                  }
                );
                // Tier 4: Feed human demonstration into Sentinel-SERL closed-loop
                SentinelSerlCoordinator.getInstance().onHumanDemonstration(
                  lastUnresolvedGoalRef.current.goal,
                  cleanCmd,
                  `Human demonstration in ${currentPathRef.current || '~'}`
                ).catch(e => console.warn('[TerminalView] SERL demonstration recording error:', e));
                if (learned) {
                  writeTerm(`\r\n  ${S.ok}✓${S.reset} ${S.text}Learned from your command${S.reset}\r\n`);
                  writeTerm(`    ${S.muted}when you ask${S.reset}  ${S.soft}${lastUnresolvedGoalRef.current.goal}${S.reset}\r\n`);
                  writeTerm(`    ${S.muted}Sentinel runs${S.reset} ${S.code}${cleanCmd}${S.reset}\r\n`);
                  writeTerm(`    ${S.muted}Undo with /forget ${learned.id}${S.reset}\r\n\r\n`);
                  lastUnresolvedGoalRef.current = null;
                }
              }

              // `>` starts an AI request. Once it asks a clarification question,
              // the next normal terminal entry is treated as the answer so the
              // workflow can resume without making the user retype the request.
              const answeringAgentQuestion = agentLoop.hasPendingQuestion();
              if (answeringAgentQuestion && cleanCmd === '/cancel') {
                await (typedWhileRunning ? sessionManager.write(currentSessionId!, '\x15') : ptyTrackerRef.current.safeClearLine(d => sessionManager.write(currentSessionId!, d)));
                agentLoop.cancelPendingQuestion();
                clearPlanDismissTimer();
                setLatestPlan(null);
                writeTerm(`\r\n  ${S.muted}Cancelled.${S.reset}\r\n\r\n`);
                sessionManager.write(currentSessionId!, '\r');
                return;
              }

              // Queue management slash and natural language commands (Task 2.3)
              const queueCmd = parseQueueCommand(cleanCmd);
              if (queueCmd) {
                await (typedWhileRunning ? sessionManager.write(currentSessionId!, '\x15') : ptyTrackerRef.current.safeClearLine(d => sessionManager.write(currentSessionId!, d)));
                if (queueCmd.type === 'open-panel') {
                  window.dispatchEvent(new CustomEvent('sentinel:open-queue'));
                  afterShellRedraw(() => sessionManager.write(currentSessionId!, '\r'));
                  return;
                }
                if (queueCmd.type === 'show') {
                  const list = PromptQueue.getInstance().formatQueueList();
                  writeTerm(`\r\n  ${S.soft}${list.replace(/\n/g, '\r\n  ')}${S.reset}\r\n\r\n`);
                  afterShellRedraw(() => sessionManager.write(currentSessionId!, '\r'));
                  return;
                }
                if (queueCmd.type === 'clear') {
                  PromptQueue.getInstance().clear();
                  writeTerm(`\r\n  ${S.ok}✓${S.reset} ${S.text}Queue cleared.${S.reset}\r\n\r\n`);
                  afterShellRedraw(() => sessionManager.write(currentSessionId!, '\r'));
                  return;
                }
                if (queueCmd.type === 'remove') {
                  const ok = PromptQueue.getInstance().remove(queueCmd.index);
                  if (ok) {
                    writeTerm(`\r\n  ${S.ok}✓${S.reset} ${S.text}Removed item ${queueCmd.index} from queue.${S.reset}\r\n\r\n`);
                  } else {
                    writeTerm(`\r\n  ${S.err}✗${S.reset} ${S.text}Item ${queueCmd.index} not found in queue.${S.reset}\r\n\r\n`);
                  }
                  afterShellRedraw(() => sessionManager.write(currentSessionId!, '\r'));
                  return;
                }
              }

              if (cleanCmd.startsWith('>') || answeringAgentQuestion) {
                const aiGoal = answeringAgentQuestion ? cleanCmd : cleanCmd.substring(1).trim();
                if (!aiGoal) {
                  return; // Empty AI instruction
                }

                // Safely cancel the shell line without killing running foreground processes
                if (ptyTrackerRef.current.canSafelyInjectCtrlC()) {
                  shellRedrawMuteUntil = Date.now() + 400;
                  shellRedrawSeen = false;
                }
                await (typedWhileRunning ? sessionManager.write(currentSessionId!, '\x15') : ptyTrackerRef.current.safeClearLine(d => sessionManager.write(currentSessionId!, d)));

                // One request at a time: the agent keeps a single transcript and event listener
                if (aiBusyRef.current) {
                  PromptQueue.getInstance().enqueue(aiGoal);
                  const settled = activeRenderer?.finish() ?? '';
                  const newline = !settled && term.buffer.active.cursorX > 0 ? '\r\n' : '';
                  writeTerm(`${settled}${newline}  ${S.muted}Queued: ${aiGoal}${S.reset}\r\n`);
                  return;
                }
                runAiGoal(aiGoal);
                return; // Do NOT send the \r to the shell
              } else if (cleanCmd) {
                // User submitted a command to the shell
                ptyTrackerRef.current.notifyCommandStarted(cleanCmd);
                if (paneId) TerminalWorkspace.getInstance().update(paneId, { busy: true, runningCommand: cleanCmd });
                // Pick up directory changes once the shell has run it
                setTimeout(() => { void syncCwd(); }, 400);
                setTimeout(() => { void syncCwd(); }, 2000);
              }
            }
          }

          sessionManager.write(currentSessionId, data);

          // Update ghost text asynchronously after terminal buffer updates.
          // Task 1.4: only recompute on printable input and Backspace, and only when cursor is at end.
          const isPrintableOrBackspace = /^[^\x00-\x1f\x7f]+$/.test(data) || data === '\x7f' || data === '\b';
          if (data !== '\r' && data !== '\x03' && isPrintableOrBackspace) {
            setTimeout(async () => {
              const buffer = term.buffer.active;
              const lineIndex = buffer.baseY + buffer.cursorY;
              const line = buffer.getLine(lineIndex);
              if (line) {
                const fullText = line.translateToString(true);
                // Check cursor-at-end before recomputing
                if (buffer.cursorX < fullText.length) {
                  ghostText.clear();
                  return;
                }
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
      unsubWatch?.();
      unsubPaneState?.();
      detachDisplay?.();
      if (paneId) TerminalWorkspace.getInstance().unregister(paneId);
      ConsentQueue.getInstance().clearQueue(currentSessionId);
      window.removeEventListener('sentinel:toggle-search', handleToggleSearch);
      window.removeEventListener('sentinel:find-in-terminal', handleFindRequest);
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
        initialQuery={searchRequest}
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
          backgroundColor: 'rgba(20, 21, 26, 0.94)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '12px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.6)',
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
              <Wrench size={13} color="rgba(255, 255, 255, 0.7)" />
              <span style={{ fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.88)' }}>
                Suggested fix
              </span>
            </div>
            <button
              onClick={() => {
                setActiveRemediation(null);
                outputObserverRef.current.clearRemediation();
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
          <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.45 }}>
            {activeRemediation.cause}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '2px', gap: '8px' }}>
            <span style={{ fontSize: '11.5px', color: '#e5e7eb', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={activeRemediation.params?.command || activeRemediation.actionTitle}>
              {activeRemediation.params?.command || activeRemediation.actionTitle}
            </span>
            <button
              onClick={() => handleExecuteRemediation(activeRemediation)}
              style={{
                background: '#f5f5f7',
                color: '#0b0c10',
                border: 'none',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                flexShrink: 0
              }}
            >
              <Play size={11} fill="currentColor" />
              <span>Apply</span> <span style={{ opacity: 0.55, fontSize: '10px', background: 'rgba(0,0,0,0.08)', padding: '1px 4px', borderRadius: '3px' }}>Tab</span>
            </button>
          </div>
        </div>
      )}

      {choiceRequest && (
        <ChoiceDialog
          request={choiceRequest.request}
          onResult={(result) => { choiceRequest.resolve(result); setChoiceRequest(null); }}
        />
      )}

      {/* Security & Deletion Authorization Overlay Modal: rendered on <body>, above every drawer and pane */}
      {securityModalPlan && createPortal(
        <div 
          tabIndex={0}
          ref={(el) => {
            if (!el) return;
            // Runs at commit, before paint: every new plan starts its own arming delay
            if (consentPlanRef.current !== securityModalPlan.plan) {
              consentPlanRef.current = securityModalPlan.plan;
              consentShownAtRef.current = Date.now();
            }
            el.focus();
          }}
          onKeyDown={(e) => {
            const now = Date.now();
            if (e.key === 'Escape') {
              securityModalPlan.resolve(false);
              setSecurityModalPlan(null);
            } else if (e.key === 'Enter' && needsExplicitClick(securityModalPlan.plan)) {
              // Flows opened from a file, and high-risk commands, start only with a click on Run
              consentStrayKeyAtRef.current = now;
            } else if (e.key === 'Enter') {
              // Armed only after the dialog was visible for a moment with no typing going on
              const armed = now - consentShownAtRef.current > 800 && now - consentStrayKeyAtRef.current > 800 && !e.repeat;
              if (!armed) return;
              securityModalPlan.resolve(true);
              setSecurityModalPlan(null);
            } else if (e.key.length === 1) {
              consentStrayKeyAtRef.current = now;
            }
          }}
          style={{
            position: 'fixed',
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
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#e5e7eb'
              }}>
                <ShieldAlert size={20} />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f8fafc', letterSpacing: '-0.2px' }}>
                  {securityModalPlan.plan.capabilityId === 'workflow.batch' && String(securityModalPlan.plan.parameters?.command || '').includes('\n') ? 'Run these commands?' : 'Run this command?'}
                </h3>
                <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)', display: 'block', marginTop: '2px' }}>
                  Needs your approval · {String(securityModalPlan.plan.riskLevel || 'admin').toLowerCase()} risk
                </span>
              </div>
            </div>

            <p style={{ fontSize: '13px', lineHeight: '1.55', color: 'rgba(255, 255, 255, 0.75)', margin: '0 0 18px 0' }}>
              {securityModalPlan.plan.requiresPassword
                ? 'This can stop or change things on your computer. Sentinel will run exactly what is shown below, only after you click Run. It never asks for your password.'
                : securityModalPlan.plan.requiresClick
                  ? 'These commands come from a file. Sentinel will run exactly what is shown below, only after you click Run.'
                  : 'Sentinel will run exactly what is shown below. Nothing runs until you approve.'}
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
              <div style={{ fontSize: '10.5px', letterSpacing: '0.6px', textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.4)', marginBottom: '6px', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
                {securityModalPlan.plan.capabilityId === 'shell.execute' ? 'Command'
                  : securityModalPlan.plan.capabilityId === 'terminal.spawn' ? 'Command · keeps running in its own terminal'
                  : securityModalPlan.plan.capabilityId === 'workflow.batch' ? 'Commands, in order'
                  : securityModalPlan.plan.capabilityId}
              </div>
              <div style={{ color: '#f5f5f7', fontSize: '13px', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontWeight: 500 }}>
                {String(securityModalPlan.plan.parameters?.command || securityModalPlan.plan.parameters?.path || securityModalPlan.plan.parameters?.source || JSON.stringify(securityModalPlan.plan.parameters))}
              </div>
              {(securityModalPlan.plan.parameters?.explanation || securityModalPlan.plan.explanation) && (
                <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid rgba(255, 255, 255, 0.07)', display: 'flex', gap: '8px', alignItems: 'flex-start', fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
                  <span style={{ color: 'rgba(255, 255, 255, 0.4)', flexShrink: 0 }}>Why</span>
                  <span style={{ color: 'rgba(255, 255, 255, 0.78)', lineHeight: '1.45', wordBreak: 'break-word' }}>
                    {securityModalPlan.plan.parameters?.explanation || securityModalPlan.plan.explanation}
                  </span>
                </div>
              )}
              {securityModalPlan.plan.parameters?.explanation && securityModalPlan.plan.explanation
                && securityModalPlan.plan.parameters.explanation !== securityModalPlan.plan.explanation && (
                <div style={{ marginTop: '6px', fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.42)', lineHeight: 1.45, fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif' }}>
                  {securityModalPlan.plan.explanation}
                </div>
              )}
            </div>


            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                onClick={() => {
                  securityModalPlan.resolve(false);
                  setSecurityModalPlan(null);
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
                <span>Cancel</span> <span style={{ opacity: 0.5, fontSize: '11px', marginLeft: '4px' }}>Esc</span>
              </button>
              <button
                onClick={() => {
                  securityModalPlan.resolve(true);
                  setSecurityModalPlan(null);
                }}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  border: 'none',
                  background: '#f5f5f7',
                  color: '#0b0c10',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: 600,
                  boxShadow: 'none',
                  transition: 'all 0.2s ease',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Check size={14} />
                <span>Run</span>
                {!needsExplicitClick(securityModalPlan.plan) && <span style={{ opacity: 0.55, fontSize: '11px', background: 'rgba(0,0,0,0.08)', padding: '1px 5px', borderRadius: '4px' }}>↵</span>}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

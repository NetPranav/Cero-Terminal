import React, { useState, useEffect, useCallback, useRef, useMemo, Suspense, lazy } from "react";
import { listen } from "@tauri-apps/api/event";
import { TerminalView } from "./presentation/TerminalView";
import { CommandPalette } from "./ui/components/CommandPalette";
import { StatusBar } from "./ui/components/StatusBar";
import { ThemeManager } from "./ui/theme/ThemeManager";
import type { SettingsTabId } from "./ui/components/AiSettingsPage";
import { SessionManager } from "./domain/SessionManager";
import { UrlSchemeHandler } from "./domain/integration/UrlSchemeHandler";
import { SessionPersistenceEngine } from "./domain/session/SessionPersistenceEngine";
import { HistorySearchModal } from "./ui/components/HistorySearchModal";
import { KeyboardShortcutsModal } from "./ui/components/KeyboardShortcutsModal";
import { ZenModeHelpCallout } from "./ui/components/ZenModeHelpCallout";
import { AuditLogger } from "./domain/security/AuditLogger";
import { DotfileSyncEngine } from "./domain/rice/DotfileSyncEngine";
import { EmbeddedEngineManager } from "./ai/models/EmbeddedEngineManager";
import { SystemKnowledgeScanner } from "./domain/knowledge/SystemKnowledgeScanner";
import { invoke } from "@tauri-apps/api/core";
import { 
  Terminal, 
  Folder, 
  Columns2, 
  Rows2, 
  Palette, 
  X, 
  Plus, 
  ChevronDown, 
  Sparkles, 
  ShieldCheck, 
  Compass, 
  RotateCcw, 
  Eraser, 
  Trash2,
  Search,
  Code2 
} from "lucide-react";
import { isLinux, getShortcutModifier, formatShortcut } from "./shared/platform";
import "./App.css";

// Large screens that are only shown on demand load as separate chunks, keeping them out of the
// startup bundle. They mount when opened.
const AiSettingsPage = lazy(() => import("./ui/components/AiSettingsPage").then(m => ({ default: m.AiSettingsPage })));
const InstallerWizard = lazy(() => import("./ui/components/InstallerWizard").then(m => ({ default: m.InstallerWizard })));
const WorkflowManagerDrawer = lazy(() => import("./ui/components/WorkflowManagerDrawer").then(m => ({ default: m.WorkflowManagerDrawer })));
const PluginMarketplaceModal = lazy(() => import("./ui/components/PluginMarketplaceModal").then(m => ({ default: m.PluginMarketplaceModal })));
const EmbeddedModelManagerModal = lazy(() => import("./ui/components/EmbeddedModelManagerModal").then(m => ({ default: m.EmbeddedModelManagerModal })));

type SplitDirection = 'vertical' | 'horizontal';

interface TerminalPane {
  id: string;
  sessionId?: string;
}

interface SplitNode {
  id: string;
  direction: SplitDirection;
  ratio?: number;
  pane1: PaneNode;
  pane2: PaneNode;
}

type PaneNode = { type: 'terminal', data: TerminalPane } | { type: 'split', data: SplitNode };

interface Tab {
  id: string;
  name: string;
  customName?: boolean;
  rootPane: PaneNode;
}

export interface AppProps {
  initialPath?: string;
}

export function App({ initialPath }: AppProps = {}) {
  const getUniqueId = (prefix = 'id') => `${prefix}_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}`;

  const splitContainerRefs = useRef<Record<string, HTMLDivElement>>({});
  const [resizingSplit, setResizingSplit] = useState<{ id: string, isVertical: boolean } | null>(null);

  const createTerminalPane = useCallback((): PaneNode => ({
    type: 'terminal',
    data: { id: getUniqueId('pane') }
  }), []);

  const [initialResolvedState] = useState(() => {
    return SessionPersistenceEngine.getInstance().resolveInitialState(initialPath, () => ({
      type: 'terminal',
      data: { id: `pane_${Math.random().toString(36).substring(2, 9)}_${Date.now().toString(36)}` }
    }));
  });

  const [tabs, setTabs] = useState<Tab[]>(() => initialResolvedState.tabs);
  const [activeTabId, setActiveTabId] = useState<string>(() => initialResolvedState.activeTabId);
  const [activePaneId, setActivePaneId] = useState<string>(() => initialResolvedState.activePaneId); // For focusing
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editingTabName, setEditingTabName] = useState<string>('');
  const [isCommandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTabId>('ai');

  // New UI & Theme customization states
  const [panePaths, setPanePaths] = useState<Record<string, string>>(() => initialResolvedState.panePaths);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [showWorkflowManager, setShowWorkflowManager] = useState(false);
  const [showHistorySearch, setShowHistorySearch] = useState(false);
  const [showPluginMarketplace, setShowPluginMarketplace] = useState(false);
  const [showEmbeddedModal, setShowEmbeddedModal] = useState(false);
  const [showZenCallout, setShowZenCallout] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.location && window.location.search.includes('capture_mode=')) {
      return false;
    }
    return !localStorage.getItem('sentinel_zen_tip_shown') && !!localStorage.getItem('sentinel_onboarded') && localStorage.getItem('sentinel_ui_mode') === 'zen';
  });
  const [selectedThemeId, setSelectedThemeId] = useState<string>('classic-dark');
  const [uiMode, setUiMode] = useState<'zen' | 'visual'>(() => {
    if (typeof window !== 'undefined' && window.location) {
      if (window.location.search.includes('capture_mode=zen')) return 'zen';
      if (window.location.search.includes('capture_mode=visual')) return 'visual';
    }
    return (localStorage.getItem('sentinel_ui_mode') as 'zen' | 'visual') || 'zen';
  });
  const [showHelpModal, setShowHelpModal] = useState<boolean>(false);

  const handleToggleUiMode = (mode: 'zen' | 'visual') => {
    setUiMode(mode);
    localStorage.setItem('sentinel_ui_mode', mode);
  };

  useEffect(() => {
    const handleModeChange = (e: any) => {
      if (e.detail && (e.detail === 'zen' || e.detail === 'visual')) {
        setUiMode(e.detail);
      }
    };
    window.addEventListener('sentinel:ui-mode-changed', handleModeChange);
    return () => window.removeEventListener('sentinel:ui-mode-changed', handleModeChange);
  }, []);

  const handleHistorySelect = (command: string) => {
    if (activeTerminal && activeTerminal.sessionId) {
      SessionManager.getInstance().write(activeTerminal.sessionId, command);
    }
  };

  const handleRunWorkflowInTerminal = (command: string) => {
    if (activeTerminal && activeTerminal.sessionId) {
      SessionManager.getInstance().write(activeTerminal.sessionId, command + '\n');
    }
  };
  const [transparency, setTransparency] = useState<number>(0.82);
  const [blurLevel, setBlurLevel] = useState<number>(20);
  const [activeShellMenuPaneId, setActiveShellMenuPaneId] = useState<string | null>(null);
  const [showWizard, setShowWizard] = useState<boolean>(() => {
    if (typeof window !== 'undefined' && window.location) {
      if (window.location.search.includes('capture_mode=')) return false;
      if (window.location.search.includes('onboarding')) return true;
    }
    return !localStorage.getItem('sentinel_onboarded');
  });
  const [detectedShell, setDetectedShell] = useState<string>(() => isLinux() ? 'bash' : 'zsh');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).openOnboarding = () => setShowWizard(true);
    }
    const detect = async () => {
      try {
        const shell = await invoke<string>('get_default_shell');
        if (shell) {
          const name = shell.split('/').pop()?.replace(/^-/, '') || 'bash';
          setDetectedShell(name);
        }
      } catch {
        setDetectedShell(isLinux() ? 'bash' : 'zsh');
      }
    };
    detect();
    SystemKnowledgeScanner.getInstance().scan().catch(() => {});
  }, []);

  // Close shell action menu on outside click or Escape
  useEffect(() => {
    if (!activeShellMenuPaneId) return;
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target?.closest('.shell-menu-container')) {
        setActiveShellMenuPaneId(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveShellMenuPaneId(null);
      }
    };
    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [activeShellMenuPaneId]);

  // Auto-persist session tabs, splits, and paths across app reloads and crashes
  useEffect(() => {
    SessionPersistenceEngine.getInstance().saveSession(tabs, activeTabId, panePaths, activePaneId);
  }, [tabs, activeTabId, panePaths, activePaneId]);

  // Auto-start embedded local AI inference engine on launch if model is available
  useEffect(() => {
    const autoStartInference = async () => {
      try {
        const autostartPref = localStorage.getItem('sentinel_autostart_ai');
        if (autostartPref === 'false') return;

        const manager = EmbeddedEngineManager.getInstance();
        await manager.proactiveWarmup();
      } catch (err) {
        console.warn('[Sentinel] Auto-start inference engine error:', err);
      }
    };
    const timer = setTimeout(autoStartInference, 150);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    ThemeManager.getInstance();
    const handleGlobalClick = () => setActiveShellMenuPaneId(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  const addTab = useCallback((customPath?: string | unknown) => {
    const newId = getUniqueId('tab');
    const newPane = createTerminalPane();
    setPanePaths(prev => ({ ...prev, [newPane.data.id]: typeof customPath === 'string' ? customPath : '~' }));
    setTabs(prev => [...prev, { id: newId, name: `Terminal ${prev.length + 1}`, rootPane: newPane }]);
    setActiveTabId(newId);
    setActivePaneId(newPane.data.id);
  }, []);

  const startupArgsProcessedRef = useRef(false);
  const activeSessionIdsRef = useRef<Record<string, string>>({});

  useEffect(() => {
    let unlistenMenu: (() => void) | undefined;
    let unlistenUrl: (() => void) | undefined;
    listen<string>("menu-event", (event) => {
      if (event.payload === "open-theme") {
        setShowThemeModal(true);
      } else if (event.payload === "open-ai-settings") {
        setShowAiSettings(true);
      } else if (event.payload === "new-tab") {
        addTab();
      }
    }).then(fn => { unlistenMenu = fn; }).catch(() => {});

    listen<string[]>("sentinel-url", (event) => {
      const actions = UrlSchemeHandler.getInstance().parseMany(event.payload);
      for (const action of actions) {
        if (action.type === 'new-tab') {
          addTab(action.path);
        } else if ((action.type === 'open' || action.type === 'workspace') && action.path) {
          addTab(action.path);
        }
      }
    }).then(fn => { unlistenUrl = fn; }).catch(() => {});

    // Process CLI launch arguments on initial application mount
    if (!startupArgsProcessedRef.current) {
      startupArgsProcessedRef.current = true;
      (async () => {
        try {
          const args = await invoke<string[]>('get_launch_args');
          if (!args || args.length <= 1) return;

          const candidateArgs = args.slice(1).filter(arg => arg && !arg.startsWith('-'));
          if (candidateArgs.length === 0) return;

          const actions = UrlSchemeHandler.getInstance().parseMany(candidateArgs);
          if (actions.length === 0) return;

          const primaryAction = actions[0];
          if (primaryAction.path) {
            const targetPath = primaryAction.path;
            const targetPaneId = activeTerminalRef.current?.id || activePaneId || initialResolvedState.activePaneId;
            if (targetPaneId) {
              setPanePaths(prev => {
                if (prev[targetPaneId] === targetPath) return prev;
                return { ...prev, [targetPaneId]: targetPath };
              });
              const existingSessionId = activeSessionIdsRef.current[targetPaneId] || activeTerminalRef.current?.sessionId;
              if (existingSessionId) {
                SessionManager.getInstance().write(existingSessionId, `cd ${JSON.stringify(targetPath)}\n`);
              }
            }
          }

          for (let i = 1; i < actions.length; i++) {
            if (actions[i].path) {
              addTab(actions[i].path);
            }
          }
        } catch (err) {
          console.warn('[Sentinel] Failed to process startup launch arguments:', err);
        }
      })();
    }

    return () => { 
      if (unlistenMenu) unlistenMenu(); 
      if (unlistenUrl) unlistenUrl();
    };
  }, [addTab]);

  const closeTab = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newTabs = tabs.filter(t => t.id !== id);
    if (newTabs.length === 0) {
      const newId = getUniqueId('tab');
      const newPane = createTerminalPane();
      setPanePaths({ [newPane.data.id]: '~' });
      setTabs([{ id: newId, name: 'Terminal 1', rootPane: newPane }]);
      setActiveTabId(newId);
      setActivePaneId(newPane.data.id);
    } else {
      if (activeTabId === id) {
        const closingIndex = tabs.findIndex(t => t.id === id);
        const nextActiveTab = newTabs[Math.min(closingIndex, newTabs.length - 1)];
        setActiveTabId(nextActiveTab.id);
      }
      setTabs(newTabs);
    }
  };

  const handleSessionCreated = (paneId: string, sessionId: string) => {
    activeSessionIdsRef.current[paneId] = sessionId;
    setTabs(prevTabs => prevTabs.map(tab => {
      if (tab.id !== activeTabId) return tab;
      const updateSessionRecursive = (node: PaneNode): PaneNode => {
        if (node.type === 'terminal') {
          if (node.data.id === paneId) {
            return { ...node, data: { ...node.data, sessionId } };
          }
          return node;
        } else if (node.type === 'split') {
          return {
            ...node,
            data: {
              ...node.data,
              pane1: updateSessionRecursive(node.data.pane1),
              pane2: updateSessionRecursive(node.data.pane2)
            }
          };
        }
        return node;
      };
      return {
        ...tab,
        rootPane: updateSessionRecursive(tab.rootPane)
      };
    }));
  };

  const splitPane = (paneId: string, direction: SplitDirection) => {
    const newTerminal = createTerminalPane();
    const newPaneId = newTerminal.data.id;

    // A newly spawned terminal session opens in the default home directory ('~')
    setPanePaths(prev => ({ ...prev, [newPaneId]: '~' }));
    setActivePaneId(newPaneId);

    setTabs(prevTabs => prevTabs.map(tab => {
      if (tab.id !== activeTabId) return tab;
      const splitRecursive = (node: PaneNode): PaneNode => {
        if (node.type === 'terminal' && node.data.id === paneId) {
          return {
            type: 'split',
            data: {
              id: getUniqueId('split'),
              direction,
              ratio: 0.5,
              pane1: { type: 'terminal', data: { ...node.data } },
              pane2: newTerminal
            }
          };
        } else if (node.type === 'split') {
          return {
            ...node,
            data: {
              ...node.data,
              pane1: splitRecursive(node.data.pane1),
              pane2: splitRecursive(node.data.pane2)
            }
          };
        }
        return node;
      };
      return {
        ...tab,
        rootPane: splitRecursive(tab.rootPane)
      };
    }));
  };

  const updateSplitRatio = (splitId: string, ratio: number) => {
    setTabs(prevTabs => prevTabs.map(tab => {
      if (tab.id !== activeTabId) return tab;
      const updateRatioRecursive = (node: PaneNode): PaneNode => {
        if (node.type === 'split') {
          if (node.data.id === splitId) {
            return {
              ...node,
              data: {
                ...node.data,
                ratio
              }
            };
          }
          return {
            ...node,
            data: {
              ...node.data,
              pane1: updateRatioRecursive(node.data.pane1),
              pane2: updateRatioRecursive(node.data.pane2)
            }
          };
        }
        return node;
      };
      return {
        ...tab,
        rootPane: updateRatioRecursive(tab.rootPane)
      };
    }));
  };

  const handleStartSplitResize = (e: React.MouseEvent, splitId: string, isVertical: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    const container = splitContainerRefs.current[splitId];
    if (!container) return;

    setResizingSplit({ id: splitId, isVertical });
    const rect = container.getBoundingClientRect();

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      let newRatio: number;
      if (isVertical) {
        newRatio = (moveEvent.clientX - rect.left) / rect.width;
      } else {
        newRatio = (moveEvent.clientY - rect.top) / rect.height;
      }
      const clamped = Math.max(0.1, Math.min(0.9, newRatio));
      updateSplitRatio(splitId, clamped);
    };

    const onMouseUp = () => {
      setResizingSplit(null);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.dispatchEvent(new Event('resize'));
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const closePane = (paneId: string) => {
    if (activePaneId === paneId) {
      setActivePaneId('');
    }
    setTabs(prevTabs => prevTabs.map(tab => {
      if (tab.id !== activeTabId) return tab;
      const removeRecursive = (node: PaneNode): PaneNode | null => {
        if (node.type === 'terminal') {
          if (node.data.id === paneId) {
            if (node.data.sessionId) {
              try {
                SessionManager.getInstance().kill(node.data.sessionId);
              } catch (err) {
                console.error("Failed to kill session:", err);
              }
            }
            return null;
          }
          return node;
        } else if (node.type === 'split') {
          const newPane1 = removeRecursive(node.data.pane1);
          const newPane2 = removeRecursive(node.data.pane2);

          if (!newPane1 && !newPane2) return null;
          if (!newPane1) return newPane2;
          if (!newPane2) return newPane1;

          return {
            ...node,
            data: {
              ...node.data,
              pane1: newPane1,
              pane2: newPane2
            }
          };
        }
        return node;
      };

      const newRoot = removeRecursive(tab.rootPane);
      return {
        ...tab,
        rootPane: newRoot || createTerminalPane()
      };
    }));
  };

  const getActiveTerminalPane = (node: PaneNode): TerminalPane | null => {
    if (node.type === 'terminal') return node.data;
    return getActiveTerminalPane(node.data.pane1);
  };

  const activeTab = useMemo(() => tabs.find(t => t.id === activeTabId), [tabs, activeTabId]);

  const activeTerminal = useMemo(() => {
    if (!activeTab) return null;
    
    // Find active pane if id is known
    if (activePaneId) {
      const findPane = (node: PaneNode): TerminalPane | null => {
        if (node.type === 'terminal' && node.data.id === activePaneId) return node.data;
        if (node.type === 'split') {
          return findPane(node.data.pane1) || findPane(node.data.pane2);
        }
        return null;
      };
      const found = findPane(activeTab.rootPane);
      if (found) return found;
    }

    return getActiveTerminalPane(activeTab.rootPane);
  }, [activeTab, activePaneId]);

  const activeTerminalRef = useRef<TerminalPane | null>(null);
  useEffect(() => {
    activeTerminalRef.current = activeTerminal;
  }, [activeTerminal]);

  const currentDisplayPath = activeTerminal ? (panePaths[activeTerminal.id] || '~') : '~';

  const formatDisplayPath = (fullPath: string): string => {
    if (!fullPath || fullPath === '~') return '~';
    const home = typeof process !== 'undefined' ? (process.env.HOME || process.env.USERPROFILE || '') : '';
    if (home && fullPath.startsWith(home)) {
      return '~' + fullPath.slice(home.length);
    }
    return fullPath;
  };

  const getFolderBasename = (fullPath: string): string => {
    const cleaned = formatDisplayPath(fullPath);
    if (cleaned === '~' || cleaned === '') return '~';
    const parts = cleaned.split('/').filter(Boolean);
    return parts.length > 0 ? parts[parts.length - 1] : '~';
  };

  const getTabIcon = (tab: Tab) => {
    const term = getActiveTerminalPane(tab.rootPane);
    const rawPath = term ? (panePaths[term.id] || '~') : '~';
    const cleaned = formatDisplayPath(rawPath).toLowerCase();
    if (cleaned.includes('.sentinel') || cleaned.includes('src') || cleaned.includes('git') || cleaned.includes('project') || cleaned.includes('code')) {
      return <Code2 size={12} style={{ marginRight: 6, opacity: 0.75, flexShrink: 0 }} />;
    }
    if (cleaned === '~' || cleaned === '') {
      return <span style={{ marginRight: 6, opacity: 0.75, flexShrink: 0, fontSize: '11px', fontWeight: 600 }}>❯_</span>;
    }
    return <Folder size={12} style={{ marginRight: 6, opacity: 0.75, flexShrink: 0 }} />;
  };

  const getTabDisplayTitle = (tab: Tab): string => {
    if (tab.customName && tab.name) {
      return tab.name;
    }
    const term = getActiveTerminalPane(tab.rootPane);
    const rawPath = term ? (panePaths[term.id] || '~') : '~';
    return formatDisplayPath(rawPath);
  };

  useEffect(() => {
    try {
      const basename = getFolderBasename(currentDisplayPath);
      const windowTitle = `${basename} — -${detectedShell}`;
      document.title = windowTitle;
      import('@tauri-apps/api/window').then(({ getCurrentWindow }) => {
        getCurrentWindow().setTitle(windowTitle).catch(() => {});
      }).catch(() => {});
    } catch (e) {
      // Ignore in non-Tauri environments
    }
  }, [currentDisplayPath, panePaths, detectedShell]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      try {
        if (e.key === 'F1' || ((e.metaKey || e.ctrlKey) && (e.key === '?' || e.key === '/'))) {
          e.preventDefault();
          setShowHelpModal(prev => !prev);
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key && e.key.toLowerCase() === 'p') {
          e.preventDefault();
          setCommandPaletteOpen(prev => !prev);
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key && e.key.toLowerCase() === 'w') {
          e.preventDefault();
          setShowWorkflowManager(prev => !prev);
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key && e.key.toLowerCase() === 'x') {
          e.preventDefault();
          setShowPluginMarketplace(prev => !prev);
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key && e.key.toLowerCase() === 'f') {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('sentinel:toggle-search'));
          return;
        }
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key && e.key.toLowerCase() === 't') {
          e.preventDefault();
          addTab();
          return;
        }
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          if (activeTerminal) splitPane(activeTerminal.id, 'vertical');
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key && e.key.toLowerCase() === 'd') {
          e.preventDefault();
          if (activeTerminal) splitPane(activeTerminal.id, 'horizontal');
          return;
        }
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key && e.key.toLowerCase() === 'k') {
          e.preventDefault();
          if (activeTerminal && activeTerminal.sessionId) {
            SessionManager.getInstance().write(activeTerminal.sessionId, 'clear\r');
          }
          return;
        }
        if (e.ctrlKey && !e.metaKey && e.key && e.key.toLowerCase() === 'r') {
          e.preventDefault();
          setShowHistorySearch(prev => !prev);
          return;
        }
        if (e.metaKey && !e.shiftKey && e.key && e.key.toLowerCase() === 'r') {
          e.preventDefault();
          if (activeTerminal && activeTerminal.sessionId) {
            SessionManager.getInstance().write(activeTerminal.sessionId, 'clear && printf "\\033c"\r');
          }
          return;
        }
        if (e.key === 'Escape' && showAiSettings) {
          e.preventDefault();
          setShowAiSettings(false);
          return;
        }
        if ((e.metaKey || e.ctrlKey) && e.key === ',') {
          e.preventDefault();
          setShowAiSettings(prev => !prev);
          return;
        }
        if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key && e.key.toLowerCase() === 'w') {
          e.preventDefault();
          if (activeTab && activeTerminal) {
            if (activeTab.rootPane.type === 'split') {
              closePane(activeTerminal.id);
            } else if (tabs.length > 1) {
              closeTab(activeTabId, { stopPropagation: () => {} } as any);
            }
          }
          return;
        }
      } catch (err) {
        console.error("Keyboard event error:", err);
      }
    };

    const handleToggleHistory = () => {
      setShowHistorySearch(prev => !prev);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('sentinel:toggle-history', handleToggleHistory);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('sentinel:toggle-history', handleToggleHistory);
    };
  }, [tabs, activeTabId, activeTab, activeTerminal, addTab]);

  const handleStatusBarNavigate = (targetPath: string, commandToExecute: string) => {
    if (activeTerminal) {
      setPanePaths(prev => ({ ...prev, [activeTerminal.id]: targetPath }));
      if (activeTerminal.sessionId) {
        SessionManager.getInstance().write(activeTerminal.sessionId, `${commandToExecute}\r`);
      }
    }
  };

  const renderPane = (node: PaneNode, isTabActive: boolean, isRoot: boolean = false): React.JSX.Element => {
    if (node.type === 'terminal') {
      const isSelected = activeTerminal?.id === node.data.id;
      return (
        <div 
          key={node.data.id}
          className="pane-terminal-wrapper" 
          onClick={() => setActivePaneId(node.data.id)}
          style={{ 
            border: isSelected ? '1px solid var(--sentinel-border-active, rgba(255, 255, 255, 0.35))' : '1px solid var(--sentinel-border, rgba(255, 255, 255, 0.08))',
            zIndex: activeShellMenuPaneId === node.data.id ? 100 : undefined,
          }}
        >
          {!isRoot && (
            <div className="pane-header-controls pane-header-compact">
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px', opacity: 0.85, fontSize: '11px', fontWeight: 500 }}>
                <Folder size={11} style={{ opacity: 0.75, flexShrink: 0 }} />
                <span>{formatDisplayPath(panePaths[node.data.id] || '~')} — -${detectedShell}</span>
              </span>
              <button 
                className="pane-close-btn" 
                onClick={(e) => { e.stopPropagation(); closePane(node.data.id); }} 
                title="Close Split Pane (Ctrl+W)"
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'inherit',
                  cursor: 'pointer',
                  opacity: 0.65,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '2px 4px',
                  borderRadius: '3px'
                }}
              >
                <X size={12} strokeWidth={2} />
              </button>
            </div>
          )}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', padding: '6px', zIndex: 1 }}>
            <TerminalView 
              key={node.data.id}
              sessionId={node.data.sessionId}
              isActive={isTabActive}
              currentPath={panePaths[node.data.id] || '~'}
              onPathChange={(p) => setPanePaths(prev => ({ ...prev, [node.data.id]: p }))}
              onSessionCreated={(sessionId) => handleSessionCreated(node.data.id, sessionId)}
            />
          </div>
        </div>
      );
    } else {
      const isVertical = node.data.direction === 'vertical';
      const ratio = typeof node.data.ratio === 'number' ? node.data.ratio : 0.5;
      return (
        <div 
          key={node.data.id} 
          ref={(el) => { if (el) splitContainerRefs.current[node.data.id] = el; }}
          className={`split-container ${isVertical ? 'split-vertical' : 'split-horizontal'}`}
        >
          <div className="split-pane" style={{ flex: `${ratio} ${ratio} 0%` }}>
            {renderPane(node.data.pane1, isTabActive, false)}
          </div>
          <div 
            className="split-divider" 
            onMouseDown={(e) => handleStartSplitResize(e, node.data.id, isVertical)}
          />
          <div className="split-pane" style={{ flex: `${1 - ratio} ${1 - ratio} 0%` }}>
            {renderPane(node.data.pane2, isTabActive, false)}
          </div>
        </div>
      );
    }
  };

  return (
    <div 
      className="app-container"
      onContextMenu={(e) => {
        // Suppress default webview context menu to ensure precision native terminal feel
        if (!(e.target as HTMLElement).closest('.allow-context-menu')) {
          e.preventDefault();
        }
      }}
    >
      <div className={`tabs-bar window-drag-region ${isLinux() ? 'platform-linux' : ''}`}>
        <div className="tabs-track">
          {tabs.map((tab) => {
            const isActive = activeTabId === tab.id;
            const isEditing = editingTabId === tab.id;
            return (
              <div 
                key={tab.id} 
                className={`tab-pill ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTabId(tab.id)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingTabId(tab.id);
                  setEditingTabName(tab.customName ? tab.name : '');
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setEditingTabId(tab.id);
                  setEditingTabName(tab.customName ? tab.name : '');
                }}
                title={tab.customName ? `${tab.name} — Double-click or right-click to rename` : "Click to select, double-click or right-click to rename"}
              >
                {getTabIcon(tab)}
                {isEditing ? (
                  <input
                    type="text"
                    autoFocus
                    value={editingTabName}
                    onChange={(e) => setEditingTabName(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        const trimmed = editingTabName.trim();
                        if (trimmed) {
                          setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, name: trimmed, customName: true } : t));
                        } else {
                          setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, customName: false } : t));
                        }
                        setEditingTabId(null);
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setEditingTabId(null);
                      }
                    }}
                    onBlur={() => {
                      const trimmed = editingTabName.trim();
                      if (trimmed) {
                        setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, name: trimmed, customName: true } : t));
                      } else {
                        setTabs(prev => prev.map(t => t.id === tab.id ? { ...t, customName: false } : t));
                      }
                      setEditingTabId(null);
                    }}
                    style={{
                      background: 'rgba(0, 0, 0, 0.5)',
                      border: '1px solid #3b82f6',
                      borderRadius: '4px',
                      color: '#ffffff',
                      fontSize: '11px',
                      padding: '1px 6px',
                      outline: 'none',
                      width: '100px',
                      fontFamily: 'inherit'
                    }}
                  />
                ) : (
                  <span className="tab-pill-text">
                    {getTabDisplayTitle(tab)}
                  </span>
                )}
                {tabs.length > 1 && (
                  <button className="pill-close-btn" onClick={(e) => closeTab(tab.id, e)} title="Close Tab">
                    <X size={13} strokeWidth={2} />
                  </button>
                )}
              </div>
            );
          })}
          <button className="pill-add-btn" onClick={addTab} title="New Terminal Tab">
            <Plus size={13} />
          </button>
        </div>

        {/* Master Active Terminal Pane Actions Strip */}
        {activeTerminal && (
          <div 
            className={`tabs-actions ${uiMode === 'zen' ? 'tabs-actions-zen' : ''} ${activeShellMenuPaneId === activeTerminal.id ? 'menu-active' : ''}`}
            style={{
              opacity: (uiMode === 'zen' && activeShellMenuPaneId === activeTerminal.id) ? 1 : undefined,
              pointerEvents: (uiMode === 'zen' && activeShellMenuPaneId === activeTerminal.id) ? 'auto' : undefined,
            }}
          >
            <div className="shell-menu-container" style={{ position: 'relative', display: 'inline-block', zIndex: 60 }}>
              <button 
                className="shell-btn"
                onClick={(e) => { 
                  e.stopPropagation(); 
                  setActiveShellMenuPaneId(activeShellMenuPaneId === activeTerminal.id ? null : activeTerminal.id); 
                  setShowThemeModal(false); 
                }}
                title="Shell Session & Workspace Actions"
                style={{
                  background: activeShellMenuPaneId === activeTerminal.id ? 'var(--sentinel-hover, rgba(255, 255, 255, 0.15))' : 'transparent',
                  borderColor: activeShellMenuPaneId === activeTerminal.id ? 'var(--sentinel-border-active, rgba(255, 255, 255, 0.35))' : 'var(--sentinel-border, rgba(255, 255, 255, 0.1))',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Terminal size={11} />
                <span>Shell</span>
                <ChevronDown size={10} style={{ opacity: 0.6 }} />
              </button>
              {activeShellMenuPaneId === activeTerminal.id && (
                <div 
                  className="shell-dropdown-menu"
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    position: 'absolute',
                    top: '100%',
                    right: 0,
                    marginTop: '6px',
                    width: '240px',
                    backgroundColor: '#16171a',
                    background: 'var(--sentinel-modal-bg, #16171a)',
                    border: '1px solid var(--sentinel-border-active, rgba(255, 255, 255, 0.18))',
                    borderRadius: '8px',
                    boxShadow: '0 16px 36px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.05)',
                    padding: '5px 0',
                    zIndex: 10000,
                    color: 'var(--sentinel-fg, #ffffff)',
                    fontSize: '12px'
                  }}
                >
                  {[
                    { label: 'New Terminal Tab', icon: <Plus size={12} />, shortcut: formatShortcut('t'), action: () => addTab() },
                    { label: 'Split Vertically (Side by side)', icon: <Columns2 size={12} />, shortcut: formatShortcut('d'), action: () => splitPane(activeTerminal.id, 'vertical') },
                    { label: 'Split Horizontally (Stacked)', icon: <Rows2 size={12} />, shortcut: formatShortcut('d', true), action: () => splitPane(activeTerminal.id, 'horizontal') },
                    { type: 'divider' },
                    { label: 'Clear Scrollback & Screen', icon: <Eraser size={12} />, shortcut: formatShortcut('k'), action: () => { if (activeTerminal.sessionId) SessionManager.getInstance().write(activeTerminal.sessionId, 'clear\r'); } },
                    { label: 'Reset Shell Session', icon: <RotateCcw size={12} />, shortcut: formatShortcut('r'), action: () => { if (activeTerminal.sessionId) SessionManager.getInstance().write(activeTerminal.sessionId, 'clear && printf "\\033c"\r'); } },
                    { type: 'divider' },
                    { label: 'AI Command Palette & Prompt', icon: <Sparkles size={12} />, shortcut: formatShortcut('p', true), action: () => setCommandPaletteOpen(true) },
                    { label: 'Zero-Trust AI Security & Profile', icon: <ShieldCheck size={12} />, shortcut: formatShortcut(','), action: () => setShowAiSettings(true) },
                    { label: isLinux() ? 'Linux Integration & Setup Wizard...' : 'macOS Integration & Setup Wizard...', icon: <Compass size={12} />, shortcut: formatShortcut('i'), action: () => setShowWizard(true) },
                    { type: 'divider' },
                    { label: 'Close Pane / Tab', icon: <Trash2 size={12} />, shortcut: formatShortcut('w'), action: () => {
                      if (activeTab && activeTab.rootPane.type === 'split') closePane(activeTerminal.id);
                      else if (tabs.length > 1) closeTab(activeTabId, { stopPropagation: () => {} } as any);
                    }, disabled: (!activeTab || activeTab.rootPane.type !== 'split') && tabs.length === 1 }
                  ].map((item, idx) => {
                    if ('type' in item && item.type === 'divider') {
                      return <div key={idx} style={{ height: '1px', background: 'var(--sentinel-border, rgba(255, 255, 255, 0.08))', margin: '4px 6px' }} />;
                    }
                    const menuItem = item as { label: string; icon?: React.ReactNode; shortcut: string; action: () => void; disabled?: boolean };
                    return (
                      <div
                        key={idx}
                        onClick={() => { if (!menuItem.disabled) { menuItem.action(); setActiveShellMenuPaneId(null); } }}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          margin: '1px 5px',
                          padding: '6px 10px',
                          borderRadius: '5px',
                          cursor: menuItem.disabled ? 'default' : 'pointer',
                          opacity: menuItem.disabled ? 0.35 : 0.9,
                          transition: 'background-color 0.15s ease',
                        }}
                        onMouseEnter={(e) => { if (!menuItem.disabled) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--sentinel-hover, rgba(255, 255, 255, 0.08))'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                          {menuItem.icon && <span style={{ opacity: 0.7, display: 'flex', alignItems: 'center' }}>{menuItem.icon}</span>}
                          <span>{menuItem.label}</span>
                        </span>
                        <span style={{ fontSize: '11px', opacity: 0.5, fontFamily: 'monospace' }}>{menuItem.shortcut}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <button 
              onClick={(e) => { 
                e.stopPropagation(); 
                window.dispatchEvent(new CustomEvent('sentinel:toggle-search')); 
              }} 
              title="Search Terminal Buffer (Ctrl+Shift+F)"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <Search size={11} />
              <span>Find</span>
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); splitPane(activeTerminal.id, 'vertical'); }} 
              title="Split Vertically (Ctrl+D)"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <Columns2 size={11} />
              <span>Split V</span>
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); splitPane(activeTerminal.id, 'horizontal'); }} 
              title="Split Horizontally (Ctrl+Shift+D)"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              <Rows2 size={11} />
              <span>Split H</span>
            </button>
          </div>
        )}
      </div>

      {/* Classic Minimalist Workspace Appearance Modal */}
      {showThemeModal && (
        <div style={{
          position: 'absolute',
          top: '72px',
          right: '20px',
          width: '320px',
          background: 'var(--sentinel-modal-bg, rgba(20, 20, 22, 0.97))',
          border: '1px solid var(--sentinel-border-active, rgba(255, 255, 255, 0.2))',
          borderRadius: '10px',
          padding: '16px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.45)',
          zIndex: 9999,
          color: 'var(--sentinel-fg, #F8FAFC)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--sentinel-border, rgba(255,255,255,0.08))', paddingBottom: '8px' }}>
            <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 600, opacity: 0.9, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
              <Palette size={13} />
              <span>Workspace Appearance</span>
            </h3>
            <button 
              onClick={() => setShowThemeModal(false)}
              style={{ background: 'transparent', border: 'none', color: 'inherit', opacity: 0.5, cursor: 'pointer', fontSize: '14px', padding: '0 4px', display: 'flex', alignItems: 'center' }}
            >
              <X size={13} />
            </button>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '11px', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.5px', display: 'block', marginBottom: '8px', fontWeight: 600 }}>
              Classic Theme
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {ThemeManager.getInstance().getPresetThemes().map(theme => {
                const isSelected = selectedThemeId === theme.id;
                return (
                  <div
                    key={theme.id}
                    onClick={() => {
                      setSelectedThemeId(theme.id);
                      ThemeManager.getInstance().loadTheme(theme);
                    }}
                    style={{
                      padding: '8px 10px',
                      borderRadius: '6px',
                      background: isSelected ? 'var(--sentinel-hover, rgba(255, 255, 255, 0.12))' : 'rgba(255, 255, 255, 0.03)',
                      border: isSelected ? '1px solid var(--sentinel-border-active, rgba(255, 255, 255, 0.4))' : '1px solid var(--sentinel-border, rgba(255, 255, 255, 0.07))',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <div style={{ fontSize: '12px', fontWeight: isSelected ? 600 : 400, marginBottom: '6px', color: theme.colors.foreground }}>
                      {theme.name}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: theme.colors.background, display: 'inline-block', border: '1px solid rgba(150,150,150,0.3)' }}></span>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: theme.colors.blue, display: 'inline-block', opacity: 0.85 }}></span>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: theme.colors.green, display: 'inline-block', opacity: 0.85 }}></span>
                      <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: theme.colors.foreground, display: 'inline-block', opacity: 0.85 }}></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px', fontWeight: 600 }}>
              <span style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Transparency</span>
              <span style={{ opacity: 0.8 }}>{Math.round(transparency * 100)}%</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[
                { label: '65%', val: 0.65 },
                { label: '80%', val: 0.82 },
                { label: '90%', val: 0.92 },
                { label: '100%', val: 1.0 }
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    setTransparency(item.val);
                    ThemeManager.getInstance().updateTransparency(item.val);
                  }}
                  style={{
                    flex: 1,
                    padding: '5px 4px',
                    fontSize: '11px',
                    borderRadius: '6px',
                    background: transparency === item.val ? 'var(--sentinel-hover, rgba(255, 255, 255, 0.18))' : 'rgba(255, 255, 255, 0.04)',
                    color: 'var(--sentinel-fg, #ffffff)',
                    border: transparency === item.val ? '1px solid var(--sentinel-border-active, rgba(255, 255, 255, 0.4))' : '1px solid var(--sentinel-border, rgba(255, 255, 255, 0.08))',
                    cursor: 'pointer',
                    fontWeight: transparency === item.val ? 600 : 400,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', marginBottom: '6px', fontWeight: 600 }}>
              <span style={{ opacity: 0.6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Backdrop Blur</span>
              <span style={{ opacity: 0.8 }}>{blurLevel}px</span>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[
                { label: '20px', val: 20 },
                { label: '15px', val: 15 },
                { label: '8px', val: 8 },
                { label: '0px', val: 0 }
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => {
                    setBlurLevel(item.val);
                    ThemeManager.getInstance().updateBlur(item.val);
                  }}
                  style={{
                    flex: 1,
                    padding: '5px 4px',
                    fontSize: '11px',
                    borderRadius: '6px',
                    background: blurLevel === item.val ? 'var(--sentinel-hover, rgba(255, 255, 255, 0.18))' : 'rgba(255, 255, 255, 0.04)',
                    color: 'var(--sentinel-fg, #ffffff)',
                    border: blurLevel === item.val ? '1px solid var(--sentinel-border-active, rgba(255, 255, 255, 0.4))' : '1px solid var(--sentinel-border, rgba(255, 255, 255, 0.08))',
                    cursor: 'pointer',
                    fontWeight: blurLevel === item.val ? 600 : 400,
                    transition: 'all 0.2s ease'
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="terminal-container" style={{ position: 'relative', width: '100%', height: '100%', flex: 1, overflow: 'hidden' }}>
        {tabs.map(tab => {
          const isTabActive = activeTabId === tab.id;
          return (
            <div 
              key={tab.id} 
              style={{ 
                position: isTabActive ? 'relative' : 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                visibility: isTabActive ? 'visible' : 'hidden',
                pointerEvents: isTabActive ? 'auto' : 'none',
                zIndex: isTabActive ? 1 : 0,
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {renderPane(tab.rootPane, isTabActive, true)}
            </div>
          );
        })}
      </div>

      {resizingSplit && (
        <div 
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            cursor: resizingSplit.isVertical ? 'col-resize' : 'row-resize',
            userSelect: 'none',
            background: 'transparent'
          }}
        />
      )}

      <StatusBar 
        currentShell={detectedShell}
        currentPath={currentDisplayPath}
        onNavigate={handleStatusBarNavigate}
        onOpenWorkflows={() => setShowWorkflowManager(true)}
        onOpenHelp={() => setShowHelpModal(true)}
        onOpenAiSettings={() => setShowAiSettings(true)}
        uiMode={uiMode}
        highlightHelp={showZenCallout}
      />
      {showWorkflowManager && (
        <Suspense fallback={null}>
          <WorkflowManagerDrawer
            isOpen={showWorkflowManager}
            onClose={() => setShowWorkflowManager(false)}
            onRunInTerminal={handleRunWorkflowInTerminal}
          />
        </Suspense>
      )}
      <HistorySearchModal 
        isOpen={showHistorySearch}
        onClose={() => setShowHistorySearch(false)}
        onSelect={handleHistorySelect}
        currentCwd={currentDisplayPath}
      />
      {showPluginMarketplace && (
        <Suspense fallback={null}>
          <PluginMarketplaceModal
            isOpen={showPluginMarketplace}
            onClose={() => setShowPluginMarketplace(false)}
          />
        </Suspense>
      )}
      {showEmbeddedModal && (
        <Suspense fallback={null}>
          <EmbeddedModelManagerModal
            isOpen={showEmbeddedModal}
            onClose={() => setShowEmbeddedModal(false)}
          />
        </Suspense>
      )}
      <KeyboardShortcutsModal 
        isOpen={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        uiMode={uiMode}
        onToggleUiMode={handleToggleUiMode}
        onTriggerAction={(actionId) => {
          if (actionId === 'new_tab') addTab();
          else if (actionId === 'close_tab') {
            if (tabs.length > 1) closeTab(activeTabId, { stopPropagation: () => {} } as any);
            else if (activeTerminal) closePane(activeTerminal.id);
          }
          else if (actionId === 'split_v' && activeTerminal) splitPane(activeTerminal.id, 'vertical');
          else if (actionId === 'split_h' && activeTerminal) splitPane(activeTerminal.id, 'horizontal');
          else if (actionId === 'find_buffer') window.dispatchEvent(new CustomEvent('sentinel:toggle-search'));
          else if (actionId === 'history_search') setShowHistorySearch(true);
          else if (actionId === 'clear_screen' && activeTerminal?.sessionId) SessionManager.getInstance().write(activeTerminal.sessionId, 'clear\r');
          else if (actionId === 'command_palette') setCommandPaletteOpen(true);
          else if (actionId === 'workflow_manager') setShowWorkflowManager(true);
          else if (actionId === 'ai_settings') {
            setSettingsTab('ai');
            setShowAiSettings(true);
          }
        }}
      />
      <CommandPalette 
        isOpen={isCommandPaletteOpen} 
        onClose={() => setCommandPaletteOpen(false)} 
        capabilities={[
          { id: 'open_settings', name: 'Open Settings Center (Ctrl+,)', description: 'Configure AI models, desktop integrations, terminal experience, and preferences' },
          { id: 'open_desktop_integrations', name: 'Settings: Desktop Integrations & CLI', description: 'Configure terminal launcher in PATH, Linux file manager scripts, and IDE profiles' },
          { id: 'open_terminal_experience', name: 'Settings: Terminal Experience (Zen vs Visual Mode)', description: 'Switch between distraction-free Zen mode and persistent Visual controls' },
          { id: 'open_general_settings', name: 'Settings: General & Setup Diagnostics', description: 'Shell detection, config storage, system platform details, and onboarding launcher' },
          { id: 'toggle_ui_mode', name: `Toggle UI Mode (Current: ${uiMode === 'zen' ? 'Zen Mode' : 'Visual Mode'})`, description: 'Switch between minimal hover-reveal controls and always-on visual buttons' },
          { id: 'keyboard_shortcuts', name: 'Keyboard Shortcuts & Help (F1)', description: 'View interactive cheatsheet of all hotkeys, splits, and workflows' },
          { id: 'open_embedded_ai', name: 'Sentinel Embedded AI (Qwen 2.5 3B)', description: 'Manage self-contained local model — Zero Ollama required' },
          { id: 'personalize', name: 'Personalize UI', description: 'Open color theme and glassmorphic appearance customization' },
          { id: 'workflow_manager', name: 'Workflow & Macro Manager (Cmd+Shift+W)', description: 'View, edit, reorder and replay deterministic zero-token multi-stage workflows' },
          { id: 'history_search', name: 'Command History (Ctrl+R)', description: 'Search previous commands ranked by frequency and recency' },
          { id: 'plugin_marketplace', name: 'Plugin Marketplace (Cmd+Shift+X)', description: 'Browse and hot-reload community extensions, tools, and themes' },
          { id: 'open_onboarding', name: 'Welcome: Setup & Onboarding Wizard', description: 'Re-run initial terminal experience setup, mode selection, and system integrations' },
          { id: 'export_audit_log', name: 'Export Cryptographic Audit Log', description: 'Generate SOC 2 / ISO 27001 tamper-evident signed audit trail' },
          { id: 'export_rice_profile', name: 'Export Rice & AI Profile', description: 'Backup custom themes, aliases, and learned AI patterns' }
        ]}
        onExecuteCapability={async (id) => {
          if (id === 'open_settings') {
            setSettingsTab('ai');
            setShowAiSettings(true);
          } else if (id === 'open_desktop_integrations') {
            setSettingsTab('integrations');
            setShowAiSettings(true);
          } else if (id === 'open_terminal_experience') {
            setSettingsTab('appearance');
            setShowAiSettings(true);
          } else if (id === 'open_general_settings') {
            setSettingsTab('general');
            setShowAiSettings(true);
          } else if (id === 'open_onboarding') {
            setShowWizard(true);
          } else if (id === 'toggle_ui_mode') {
            handleToggleUiMode(uiMode === 'zen' ? 'visual' : 'zen');
          } else if (id === 'keyboard_shortcuts') {
            setShowHelpModal(true);
          } else if (id === 'open_embedded_ai') {
            setShowEmbeddedModal(true);
          } else if (id === 'personalize') {
            setShowThemeModal(true);
          } else if (id === 'workflow_manager') {
            setShowWorkflowManager(true);
          } else if (id === 'history_search') {
            setShowHistorySearch(true);
          } else if (id === 'plugin_marketplace') {
            setShowPluginMarketplace(true);
          } else if (id === 'export_audit_log') {
            const report = await AuditLogger.getInstance().exportSignedAuditReport();
            if (navigator.clipboard) {
              await navigator.clipboard.writeText(report);
              alert('Cryptographic tamper-evident audit report copied to clipboard!');
            }
          } else if (id === 'export_rice_profile') {
            const bundle = DotfileSyncEngine.getInstance().exportBundle(selectedThemeId, transparency, blurLevel);
            if (navigator.clipboard) {
              await navigator.clipboard.writeText(bundle);
              alert('Sentinel Rice & AI Profile copied to clipboard!');
            }
          }
        }}
      />
      {showAiSettings && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999, backgroundColor: '#090b10' }}>
          <Suspense fallback={null}>
          <AiSettingsPage 
            onClose={() => setShowAiSettings(false)} 
            initialTab={settingsTab}
            currentUiMode={uiMode}
            onSelectUiMode={handleToggleUiMode}
            onLaunchOnboarding={() => {
              setShowAiSettings(false);
              setShowWizard(true);
            }}
          />
          </Suspense>
        </div>
      )}
      {showWizard && (
        <Suspense fallback={null}>
          <InstallerWizard
            isOpen={showWizard}
            onClose={() => {
              setShowWizard(false);
              const currentMode = localStorage.getItem('sentinel_ui_mode') || uiMode;
              if (currentMode === 'zen' && !localStorage.getItem('sentinel_zen_tip_shown')) {
                setShowZenCallout(true);
              }
            }}
            onSelectUiMode={handleToggleUiMode}
          />
        </Suspense>
      )}
      <ZenModeHelpCallout 
        isOpen={showZenCallout}
        onDismiss={() => {
          setShowZenCallout(false);
          localStorage.setItem('sentinel_zen_tip_shown', 'true');
        }}
      />
    </div>
  );
}

export default App;

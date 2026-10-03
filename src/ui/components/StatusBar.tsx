import React, { useEffect, useState } from 'react';
import { 
  Terminal, 
  Folder, 
  ChevronRight, 
  FolderGit2, 
  Radio, 
  MemoryStick, 
  Cpu, 
  Clock,
  GitBranch,
  HelpCircle,
  Sparkles,
  ListOrdered
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { isLinux, getShortcutModifier } from '../../shared/platform';
import { EmbeddedEngineManager, EmbeddedStatus } from '../../ai/models/EmbeddedEngineManager';
import { ModelManager, type ActiveModelInfo } from '../../ai/management/ModelManager';
import { CloudApiProvider, CLOUD_CATALOG } from '../../ai/provider/CloudApiProvider';
import { describeAi, type AiBadge } from '../../ai/management/AiStatus';
import { PromptQueue } from '../../presentation/PromptQueue';
import { ShieldAlert } from 'lucide-react';

export interface StatusBarProps {
  currentShell?: string;
  currentPath?: string;
  onNavigate?: (path: string, cmdToRun: string) => void;
  onOpenWorkflows?: () => void;
  onOpenHelp?: () => void;
  onOpenAiSettings?: () => void;
  onOpenQueue?: () => void;
  uiMode?: 'zen' | 'visual';
  memoryUsage?: number;
  cpuUsage?: number;
  currentProfile?: string;
  highlightHelp?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({ 
  currentShell, 
  currentPath = '~',
  onNavigate,
  onOpenWorkflows,
  onOpenHelp,
  onOpenAiSettings,
  onOpenQueue,
  uiMode = 'zen',
  memoryUsage: initialMemory,
  cpuUsage: initialCpu,
  currentProfile = 'Developer',
  highlightHelp = false
}) => {
  const displayShell = currentShell || (isLinux() ? 'bash' : 'zsh');
  const [queueCount, setQueueCount] = useState<number>(() => PromptQueue.getInstance().size());
  const [hasRunningTask, setHasRunningTask] = useState<boolean>(() => PromptQueue.getInstance().getRunningItem() !== null);

  useEffect(() => {
    return PromptQueue.getInstance().subscribe(items => {
      setQueueCount(items.length);
      setHasRunningTask(PromptQueue.getInstance().getRunningItem() !== null);
    });
  }, []);
  // Unknown until the first real reading; never show placeholder numbers
  const [memoryUsage, setMemoryUsage] = useState<number | undefined>(initialMemory);
  const [memoryTotal, setMemoryTotal] = useState<number | undefined>(undefined);
  const [cpuUsage, setCpuUsage] = useState<number | undefined>(initialCpu);
  const [currentTime, setCurrentTime] = useState(() => 
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
  const [aiStatus, setAiStatus] = useState<EmbeddedStatus | null>(null);
  const [activeModel, setActiveModel] = useState<ActiveModelInfo>(() => ModelManager.getInstance().getActiveModel());

  useEffect(() => {
    let isMounted = true;
    const fetchAiStatus = async () => {
      try {
        const s = await EmbeddedEngineManager.getInstance().getStatus();
        if (isMounted) {
          setAiStatus(s);
          // Backstop: also re-read the active model, in case a change event was missed
          setActiveModel(ModelManager.getInstance().getActiveModel());
        }
      } catch {
        // Ignore status fetch errors
      }
    };

    fetchAiStatus();
    // Status changes are also pushed via 'cero:ai-status-changed'; the poll is a slow backstop
    const interval = setInterval(fetchAiStatus, 10_000);
    const handleStatusChanged = () => {
      fetchAiStatus();
      setActiveModel(ModelManager.getInstance().getActiveModel());
    };
    window.addEventListener('cero:ai-status-changed', handleStatusChanged);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('cero:ai-status-changed', handleStatusChanged);
    };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Only poll if Tauri is available
    if (typeof window !== 'undefined' && (window as any).__TAURI_INTERNALS__) {
      const poll = async () => {
        try {
          const stats = await invoke<{ memory_used: number, memory_total?: number, cpu_usage: number }>('get_system_stats');
          if (stats) {
            setMemoryUsage(stats.memory_used);
            if (stats.memory_total) setMemoryTotal(stats.memory_total);
            setCpuUsage(Math.round(stats.cpu_usage));
          }
        } catch (e) {
          // Ignore polling errors
        }
      };
      poll();
      const interval = setInterval(poll, 2500);
      return () => clearInterval(interval);
    }
  }, []);

  const cloudCfg = CloudApiProvider.getInstance().getActiveConfig();
  let cloudHost = '';
  if (cloudCfg) {
    try {
      const url = cloudCfg.baseUrl || (cloudCfg.serviceId && CLOUD_CATALOG[cloudCfg.serviceId]?.defaultUrl) || '';
      cloudHost = url ? new URL(url).host : (cloudCfg.baseUrl || '');
    } catch {
      cloudHost = cloudCfg.baseUrl || '';
    }
  }
  const aiBadge = describeAi({
    active: activeModel,
    embedded: aiStatus,
    cloudConfigured: !!cloudCfg?.apiKey,
    cloudHost,
  });

  // "7.0 / 8 GB" from megabytes; the total comes from the backend, never assumed
  const formatMemory = (mb?: number, totalMb?: number) => {
    if (mb === undefined) return '--';
    const used = mb >= 1024 ? `${(mb / 1024).toFixed(1)}` : `${mb} MB`;
    if (!totalMb) return mb >= 1024 ? `${used} GB` : used;
    return `${used} / ${Math.round(totalMb / 1024)} GB`;
  };

  // Parse path into clean clickable breadcrumb steps
  const getBreadcrumbs = () => {
    const clean = currentPath.replace(/\/+/g, '/').trim() || '~';
    const parts = clean === '/' ? ['/'] : clean.split('/').filter(Boolean);
    const crumbs = parts.map((part, idx) => {
      let fullPath = parts.slice(0, idx + 1).join('/');
      if (parts[0] === '~' && idx === 0) fullPath = '~';
      else if (parts[0] === '~') fullPath = parts.slice(0, idx + 1).join('/');
      else if (currentPath.startsWith('/') && !fullPath.startsWith('/')) fullPath = '/' + fullPath;
      
      const cmd = fullPath === '~' ? 'cd ~' : `cd "${fullPath}"`;
      return { 
        name: part, 
        isHome: part === '~',
        fullPath, 
        cmd, 
        isLast: idx === parts.length - 1,
        isEllipsis: false
      };
    });
    // Long paths: first segment, an ellipsis carrying the full path, then the last two segments
    if (crumbs.length <= 4) return crumbs;
    const hidden = crumbs.slice(1, -2);
    const ellipsis = { ...hidden[hidden.length - 1], name: '…', isEllipsis: true, isLast: false };
    return [crumbs[0], ellipsis, ...crumbs.slice(-2)];
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '0 12px',
      backgroundColor: 'rgba(18, 20, 24, 0.95)',
      backdropFilter: 'blur(16px)',
      WebkitBackdropFilter: 'blur(16px)',
      borderTop: '1px solid rgba(255, 255, 255, 0.06)',
      color: 'rgba(255, 255, 255, 0.7)',
      fontSize: '11px',
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
      userSelect: 'none',
      height: '30px',
      boxSizing: 'border-box',
      zIndex: 100
    }}>
      {/* Left section: Shell + Breadcrumb Path */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, overflow: 'hidden' }}>
        <span style={{ 
          display: 'flex', 
          alignItems: 'center', 
          gap: '5px', 
          color: 'rgba(255, 255, 255, 0.85)', 
          fontWeight: 500,
          flexShrink: 0
        }}>
          <span style={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '12px', fontWeight: 600 }}>❯_</span>
          <span>{displayShell}</span>
        </span>

        <span style={{ color: 'rgba(255, 255, 255, 0.15)', flexShrink: 0 }}>|</span>

        {/* Clean breadcrumb or folder display */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '3px', minWidth: 0, overflow: 'hidden' }}>
          <Folder size={12} style={{ color: 'rgba(255, 255, 255, 0.65)', flexShrink: 0, marginRight: '2px' }} />
          {getBreadcrumbs().map((bc, idx) => (
            <React.Fragment key={idx}>
              {idx > 0 && (
                <ChevronRight size={10} style={{ color: 'rgba(255, 255, 255, 0.25)', flexShrink: 0 }} />
              )}
              <button
                onClick={() => onNavigate && onNavigate(bc.fullPath, bc.cmd)}
                title={bc.isEllipsis ? currentPath : `Click to navigate to ${bc.fullPath}`}
                style={{
                  background: 'transparent',
                  border: 'none',
                  padding: '1px 3px',
                  borderRadius: '3px',
                  color: bc.isLast ? '#f8fafc' : 'rgba(255, 255, 255, 0.6)',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontFamily: 'inherit',
                  fontWeight: bc.isLast ? 500 : 400,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: bc.isLast ? '220px' : '120px',
                  flexShrink: bc.isLast ? 1 : 0,
                  transition: 'color 0.15s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.color = '#ffffff';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.color = bc.isLast ? '#f8fafc' : 'rgba(255, 255, 255, 0.6)';
                }}
              >
                {bc.name}
              </button>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Right section: System stats, Clock, UTF-8, and Help button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
        {/* Visual Mode extended tool buttons */}
        {uiMode === 'visual' && onOpenWorkflows && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderRight: '1px solid rgba(255, 255, 255, 0.08)', paddingRight: '10px' }}>
            <button
              onClick={onOpenWorkflows}
              style={{
                background: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '4px',
                padding: '2px 6px',
                color: 'rgba(255, 255, 255, 0.8)',
                fontSize: '10px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="Workflow & Macro Manager"
            >
              <GitBranch size={11} style={{ color: 'rgba(255, 255, 255, 0.7)' }} />
              <span>Workflows</span>
            </button>
          </div>
        )}

        {/* AI Inference Engine Status */}
        <button
          onClick={onOpenAiSettings}
          title={aiBadge.detail}
          style={{
            background: aiBadge.state === 'ready' ? 'rgba(255, 255, 255, 0.08)' 
              : aiBadge.state === 'starting' ? 'rgba(255, 255, 255, 0.04)' 
              : 'rgba(255, 255, 255, 0.02)',
            border: aiBadge.state === 'ready' ? '1px solid rgba(255, 255, 255, 0.2)' 
              : aiBadge.state === 'starting' ? '1px solid rgba(255, 255, 255, 0.12)' 
              : '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: '4px',
            padding: '1px 7px',
            color: aiBadge.state === 'ready' ? '#ffffff' 
              : aiBadge.state === 'starting' ? 'rgba(255, 255, 255, 0.75)' 
              : 'rgba(255, 255, 255, 0.45)',
            fontSize: '11px',
            fontFamily: 'inherit',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = aiBadge.state === 'ready' ? 'rgba(255, 255, 255, 0.08)' 
              : aiBadge.state === 'starting' ? 'rgba(255, 255, 255, 0.04)' 
              : 'rgba(255, 255, 255, 0.02)';
            e.currentTarget.style.borderColor = aiBadge.state === 'ready' ? '1px solid rgba(255, 255, 255, 0.2)' 
              : aiBadge.state === 'starting' ? '1px solid rgba(255, 255, 255, 0.12)' 
              : '1px solid rgba(255, 255, 255, 0.07)';
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
            <span style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              backgroundColor: aiBadge.state === 'ready' ? '#ffffff'
                : aiBadge.state === 'starting' ? 'rgba(255, 255, 255, 0.65)'
                : 'rgba(255, 255, 255, 0.25)',
              boxShadow: aiBadge.state === 'ready' ? '0 0 6px rgba(255, 255, 255, 0.6)'
                : aiBadge.state === 'starting' ? '0 0 4px rgba(255, 255, 255, 0.35)'
                : 'none',
              display: 'inline-block',
              flexShrink: 0
            }} />
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              {aiBadge.state === 'unavailable'
                ? <ShieldAlert size={11} style={{ opacity: 0.45 }} />
                : <Sparkles size={11} style={{ opacity: aiBadge.state === 'ready' ? 0.9 : (aiBadge.state === 'starting' ? 0.7 : 0.45) }} />}
              <span>{aiBadge.label}</span>
            </span>
          </span>
        </button>

        <span style={{ color: 'rgba(255, 255, 255, 0.12)' }}>|</span>

        {/* CPU usage */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: 0.75 }}>
          <Cpu size={11} style={{ opacity: 0.7 }} />
          <span>{cpuUsage === undefined ? '--' : `${cpuUsage}%`}</span>
        </span>

        <span style={{ color: 'rgba(255, 255, 255, 0.12)' }}>|</span>

        {/* RAM usage */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: 0.75 }}>
          <MemoryStick size={11} style={{ opacity: 0.7 }} />
          <span>{formatMemory(memoryUsage, memoryTotal)}</span>
        </span>

        <span style={{ color: 'rgba(255, 255, 255, 0.12)' }}>|</span>

        {/* Real-time Clock */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: 0.75 }}>
          <Clock size={11} style={{ opacity: 0.7 }} />
          <span>{currentTime}</span>
        </span>

        {/* Queue indicator (only when N > 0) */}
        {queueCount > 0 && (
          <>
            <button
              type="button"
              onClick={onOpenQueue}
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '4px',
                padding: '1px 7px',
                color: '#ffffff',
                fontSize: '11px',
                fontFamily: 'inherit',
                fontWeight: 500,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.14)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
              }}
              title="View queued prompts (/queue)"
            >
              <ListOrdered size={11} style={{ opacity: 0.8 }} />
              <span>Queue: {queueCount} {queueCount === 1 ? 'item' : 'items'}</span>
            </button>
            <span style={{ color: 'rgba(255, 255, 255, 0.12)' }}>|</span>
          </>
        )}

        {/* Task 2.2: Footer hint while a task runs */}
        {hasRunningTask && (
          <>
            <span
              style={{
                color: 'rgba(255, 255, 255, 0.75)',
                fontSize: '11px',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Press Ctrl+C to stop running task"
            >
              <kbd style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '3px',
                padding: '0 4px',
                fontSize: '10px',
                color: '#ffffff'
              }}>Ctrl+C</kbd>
              <span>to stop</span>
            </span>
            <span style={{ color: 'rgba(255, 255, 255, 0.12)' }}>|</span>
          </>
        )}

        {/* [F1 help] button / pill */}
        <button
          onClick={onOpenHelp}
          style={{
            background: highlightHelp ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.05)',
            border: highlightHelp ? '1px solid rgba(255, 255, 255, 0.65)' : '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: highlightHelp ? '0 0 0 1px rgba(255, 255, 255, 0.25)' : 'none',
            borderRadius: '4px',
            padding: '1px 7px',
            color: highlightHelp ? '#ffffff' : 'rgba(255, 255, 255, 0.8)',
            fontSize: '11px',
            fontFamily: 'inherit',
            fontWeight: highlightHelp ? 600 : 400,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
            e.currentTarget.style.color = '#ffffff';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
          }}
          title="Keyboard Shortcuts & Help (F1 / Ctrl+?)"
        >
          <span>[F1 help]</span>
        </button>
      </div>
    </div>
  );
};

import React, { useEffect, useState } from 'react';
import { 
  Terminal, 
  Folder, 
  ChevronRight, 
  FolderGit2, 
  Radio, 
  HardDrive, 
  Cpu, 
  Clock,
  GitBranch,
  Globe,
  HelpCircle,
  Sparkles
} from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { isLinux, getShortcutModifier } from '../../shared/platform';
import { EmbeddedEngineManager, EmbeddedStatus } from '../../ai/models/EmbeddedEngineManager';

export interface StatusBarProps {
  currentShell?: string;
  currentPath?: string;
  onNavigate?: (path: string, cmdToRun: string) => void;
  onOpenWorkflows?: () => void;
  onOpenHelp?: () => void;
  onOpenAiSettings?: () => void;
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
  uiMode = 'zen',
  memoryUsage: initialMemory = 3174,
  cpuUsage: initialCpu = 18,
  currentProfile = 'Developer',
  highlightHelp = false
}) => {
  const displayShell = currentShell || (isLinux() ? 'bash' : 'zsh');
  const [memoryUsage, setMemoryUsage] = useState(initialMemory);
  const [cpuUsage, setCpuUsage] = useState(initialCpu);
  const [currentTime, setCurrentTime] = useState(() => 
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  );
  const [aiStatus, setAiStatus] = useState<EmbeddedStatus | null>(null);

  useEffect(() => {
    let isMounted = true;
    const fetchAiStatus = async () => {
      try {
        const s = await EmbeddedEngineManager.getInstance().getStatus();
        if (isMounted) setAiStatus(s);
      } catch {
        // Ignore status fetch errors
      }
    };

    fetchAiStatus();
    // Status changes are also pushed via 'sentinel:ai-status-changed'; the poll is a slow backstop
    const interval = setInterval(fetchAiStatus, 10_000);
    const handleStatusChanged = () => fetchAiStatus();
    window.addEventListener('sentinel:ai-status-changed', handleStatusChanged);

    return () => {
      isMounted = false;
      clearInterval(interval);
      window.removeEventListener('sentinel:ai-status-changed', handleStatusChanged);
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
      const interval = setInterval(async () => {
        try {
          const stats = await invoke<{ memory_used: number, cpu_usage: number }>('get_system_stats');
          if (stats) {
            setMemoryUsage(stats.memory_used);
            setCpuUsage(parseFloat(stats.cpu_usage.toFixed(0)));
          }
        } catch (e) {
          // Ignore polling errors
        }
      }, 2500);
      return () => clearInterval(interval);
    }
  }, []);

  // Format memory into GB/GB or MB
  const formatMemory = (mb: number) => {
    if (mb >= 1024) {
      return `${(mb / 1024).toFixed(1)}GB/16GB`;
    }
    return `${mb}MB/16GB`;
  };

  // Parse path into clean clickable breadcrumb steps
  const getBreadcrumbs = () => {
    const clean = currentPath.replace(/\/+/g, '/').trim() || '~';
    const parts = clean === '/' ? ['/'] : clean.split('/').filter(Boolean);
    return parts.map((part, idx) => {
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
        isLast: idx === parts.length - 1 
      };
    });
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
                title={`Click to navigate to ${bc.fullPath}`}
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
                  transition: 'color 0.15s ease'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.color = '#38bdf8';
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

        {/* Embedded AI Inference Engine Status */}
        <button
          onClick={onOpenAiSettings}
          title={aiStatus?.isRunning 
            ? `Sentinel Embedded AI: Running (Port ${aiStatus.port})\nModel: ${aiStatus.activeModel || 'Qwen 2.5 Coder 3B'}${aiStatus.isCpuFallback ? ' (CPU Mode)' : ' (GPU Acceleration)'}\nClick to configure AI settings`
            : `Sentinel Embedded AI: Offline\nClick to open AI settings and start engine`}
          style={{
            background: aiStatus?.isRunning ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.02)',
            border: aiStatus?.isRunning ? '1px solid rgba(255, 255, 255, 0.16)' : '1px solid rgba(255, 255, 255, 0.07)',
            borderRadius: '4px',
            padding: '1px 7px',
            color: aiStatus?.isRunning ? '#ffffff' : 'rgba(255, 255, 255, 0.55)',
            fontSize: '11px',
            fontFamily: 'inherit',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '5px',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.09)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.25)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = aiStatus?.isRunning ? 'rgba(255, 255, 255, 0.05)' : (aiStatus?.isWarming ? 'rgba(255, 255, 255, 0.04)' : 'rgba(255, 255, 255, 0.02)');
            e.currentTarget.style.borderColor = aiStatus?.isRunning ? '1px solid rgba(255, 255, 255, 0.16)' : (aiStatus?.isWarming ? '1px solid rgba(255, 255, 255, 0.12)' : '1px solid rgba(255, 255, 255, 0.07)');
          }}
        >
          <span style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: aiStatus?.isRunning ? '#ffffff' : (aiStatus?.isWarming ? 'rgba(255, 255, 255, 0.65)' : 'rgba(255, 255, 255, 0.25)'),
            boxShadow: aiStatus?.isRunning ? '0 0 6px rgba(255, 255, 255, 0.6)' : (aiStatus?.isWarming ? '0 0 4px rgba(255, 255, 255, 0.35)' : 'none'),
            display: 'inline-block',
            flexShrink: 0
          }} />
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
            <Sparkles size={11} style={{ opacity: aiStatus?.isRunning ? 0.9 : (aiStatus?.isWarming ? 0.7 : 0.45) }} />
            <span>{aiStatus?.isRunning ? (aiStatus.isCpuFallback ? 'AI (CPU)' : 'AI: Ready') : (aiStatus?.isWarming ? 'AI: Warming...' : 'AI: Off')}</span>
          </span>
        </button>

        <span style={{ color: 'rgba(255, 255, 255, 0.12)' }}>|</span>

        {/* CPU usage */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: 0.75 }}>
          <Cpu size={11} style={{ opacity: 0.7 }} />
          <span>{cpuUsage}%</span>
        </span>

        <span style={{ color: 'rgba(255, 255, 255, 0.12)' }}>|</span>

        {/* RAM usage */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: 0.75 }}>
          <HardDrive size={11} style={{ opacity: 0.7 }} />
          <span>{formatMemory(memoryUsage)}</span>
        </span>

        <span style={{ color: 'rgba(255, 255, 255, 0.12)' }}>|</span>

        {/* Real-time Clock */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: 0.75 }}>
          <Clock size={11} style={{ opacity: 0.7 }} />
          <span>{currentTime}</span>
        </span>

        <span style={{ color: 'rgba(255, 255, 255, 0.12)' }}>|</span>

        {/* UTF-8 indicator */}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', opacity: 0.65 }}>
          <Globe size={11} style={{ opacity: 0.7 }} />
          <span>UTF-8</span>
        </span>

        <span style={{ color: 'rgba(255, 255, 255, 0.12)' }}>|</span>

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

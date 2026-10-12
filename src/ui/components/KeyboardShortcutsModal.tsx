import React, { useState, useEffect, useRef } from 'react';
import { 
  Search, 
  X, 
  Command, 
  Terminal, 
  Columns2, 
  Rows2, 
  FolderGit2, 
  Radio, 
  Sparkles, 
  RotateCcw, 
  History, 
  Sliders, 
  Zap, 
  Eye, 
  ShieldCheck,
  Check
} from 'lucide-react';
import { getShortcutModifier } from '../../shared/platform';

export interface ShortcutItem {
  id: string;
  name: string;
  description: string;
  category: 'tabs' | 'splits' | 'terminal' | 'ai' | 'tools';
  keys: string[];
  icon?: React.ReactNode;
}

export interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  uiMode: 'zen' | 'visual';
  onToggleUiMode: (mode: 'zen' | 'visual') => void;
  onTriggerAction?: (actionId: string) => void;
}

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
  uiMode,
  onToggleUiMode,
  onTriggerAction
}) => {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const mod = getShortcutModifier();

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const shortcuts: ShortcutItem[] = [
    // Tabs & Navigation
    { id: 'new_tab', name: 'New Terminal Tab', description: 'Open a new terminal tab in current or home directory', category: 'tabs', keys: [`${mod}+T`], icon: <Terminal size={14} /> },
    { id: 'close_tab', name: 'Close Tab / Pane', description: 'Close the active terminal pane or active tab', category: 'tabs', keys: [`${mod}+W`], icon: <X size={14} /> },
    { id: 'switch_tabs', name: 'Switch Tabs', description: 'Quick jump to tabs 1 through 9', category: 'tabs', keys: [`${mod}+1..9`], icon: <Command size={14} /> },
    
    // Splits & Layouts
    { id: 'split_v', name: 'Split Pane Vertically', description: 'Divide the active terminal side by side', category: 'splits', keys: [`${mod}+Shift+D`], icon: <Columns2 size={14} /> },
    { id: 'split_h', name: 'Split Pane Horizontally', description: 'Divide the active terminal stacked vertically', category: 'splits', keys: [`${mod}+Alt+D`], icon: <Rows2 size={14} /> },

    // Terminal & Buffer
    { id: 'find_buffer', name: 'Find in Terminal Buffer', description: 'Search and highlight text in the current terminal scrollback', category: 'terminal', keys: [`${mod}+Shift+F`], icon: <Search size={14} /> },
    { id: 'history_search', name: 'Fuzzy History Search', description: 'Fuzzy search previous commands ranked by recency & frequency', category: 'terminal', keys: ['Ctrl+R'], icon: <History size={14} /> },
    { id: 'clear_screen', name: 'Clear Screen', description: 'Clear active terminal buffer view', category: 'terminal', keys: [`${mod}+K`], icon: <RotateCcw size={14} /> },

    // AI & Automation
    { id: 'command_palette', name: 'Command Palette', description: 'Search commands, configurations, and tools', category: 'ai', keys: [`${mod}+Shift+P`], icon: <Sparkles size={14} /> },
    { id: 'workflow_manager', name: 'Workflow & Macro Manager', description: 'Deterministic zero-token multi-stage workflows', category: 'ai', keys: [`${mod}+Shift+W`], icon: <Zap size={14} /> },
    { id: 'ai_settings', name: 'AI Security & Profiles', description: 'Manage local LLM models and security constraints', category: 'ai', keys: [`${mod}+,`], icon: <ShieldCheck size={14} /> },

    // General & Help
    { id: 'toggle_help', name: 'Keyboard Shortcuts & Help', description: 'Display this interactive cheat sheet', category: 'tools', keys: ['F1', `${mod}+/`, `${mod}+?`], icon: <Sliders size={14} /> },
  ];

  const categories = [
    { key: 'tabs', label: 'Tabs & Navigation' },
    { key: 'splits', label: 'Splits & Layouts' },
    { key: 'terminal', label: 'Terminal & Buffer' },
    { key: 'ai', label: 'AI & Automation' },
    { key: 'tools', label: 'General & Help' },
  ];

  const filtered = shortcuts.filter(s => {
    const q = query.toLowerCase().trim();
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.keys.some(k => k.toLowerCase().includes(q)) ||
      s.category.toLowerCase().includes(q)
    );
  });

  const handleCardClick = (item: ShortcutItem) => {
    if (onTriggerAction) {
      onTriggerAction(item.id);
    }
    onClose();
  };

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.38)',
        backdropFilter: 'blur(7px)',
        WebkitBackdropFilter: 'blur(7px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        paddingTop: '8vh',
        zIndex: 99999
      }}
    >
      <div 
        onClick={e => e.stopPropagation()}
        style={{
          width: '680px',
          maxWidth: '94vw',
          maxHeight: '84vh',
          backgroundColor: 'rgba(18, 20, 25, 0.96)',
          borderRadius: '14px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#f8fafc'
        }}
      >
        {/* Header & Mode Switcher */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          flexDirection: 'column',
          gap: '14px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Command size={15} style={{ color: 'rgba(255, 255, 255, 0.8)' }} />
              <span style={{ fontSize: '15px', fontWeight: 600, letterSpacing: '-0.2px' }}>
                Keyboard Shortcuts & Controls
              </span>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: 'rgba(255, 255, 255, 0.45)',
                borderRadius: '5px',
                padding: '2px 7px',
                fontSize: '11px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <span>ESC</span>
            </button>
          </div>

          {/* Interactive UI Mode Switcher (Matte Grayscale) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '8px',
            padding: '3px 4px'
          }}>
            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)', paddingLeft: '8px' }}>
              Terminal Experience:
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => onToggleUiMode('zen')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  border: uiMode === 'zen' ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid transparent',
                  background: uiMode === 'zen' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  color: uiMode === 'zen' ? '#ffffff' : 'rgba(255, 255, 255, 0.45)'
                }}
                title="Minimalist layout with hover-reveal controls"
              >
                <Zap size={12} />
                <span>Zen Mode</span>
                {uiMode === 'zen' && <Check size={11} />}
              </button>
              <button
                onClick={() => onToggleUiMode('visual')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  border: uiMode === 'visual' ? '1px solid rgba(255, 255, 255, 0.15)' : '1px solid transparent',
                  background: uiMode === 'visual' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                  color: uiMode === 'visual' ? '#ffffff' : 'rgba(255, 255, 255, 0.45)'
                }}
                title="Always visible buttons for splits, tabs, and tools"
              >
                <Eye size={12} />
                <span>Visual Mode</span>
                {uiMode === 'visual' && <Check size={11} />}
              </button>
            </div>
          </div>

          {/* Search bar */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '8px 12px'
          }}>
            <Search size={14} style={{ color: 'rgba(255, 255, 255, 0.4)', flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search shortcuts by name, action, or key..."
              style={{
                flex: 1,
                backgroundColor: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: '13px',
                color: '#f8fafc',
                fontWeight: 400
              }}
            />
            {query && (
              <button 
                onClick={() => setQuery('')}
                style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', padding: 0 }}
              >
                <X size={13} />
              </button>
            )}
          </div>
        </div>

        {/* Shortcuts list categorized */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.4)', fontSize: '13px' }}>
              No shortcuts found matching "{query}"
            </div>
          ) : (
            categories.map(cat => {
              const catItems = filtered.filter(item => item.category === cat.key);
              if (catItems.length === 0) return null;
              return (
                <div key={cat.key} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    letterSpacing: '0.6px',
                    color: 'rgba(255, 255, 255, 0.38)',
                    padding: '2px 4px'
                  }}>
                    {cat.label}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                    {catItems.map(item => (
                      <div
                        key={item.id}
                        onClick={() => handleCardClick(item)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          backgroundColor: 'rgba(255, 255, 255, 0.02)',
                          border: '1px solid transparent',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.07)';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)';
                          e.currentTarget.style.borderColor = 'transparent';
                        }}
                        title={`Click to trigger: ${item.name}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                          <span style={{ color: 'rgba(255, 255, 255, 0.55)', display: 'flex', alignItems: 'center' }}>
                            {item.icon}
                          </span>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 500, color: '#f1f5f9' }}>
                              {item.name}
                            </span>
                            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)' }}>
                              {item.description}
                            </span>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          {item.keys.map((k, kIdx) => (
                            <kbd
                              key={kIdx}
                              style={{
                                background: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.14)',
                                borderRadius: '5px',
                                padding: '3px 7px',
                                fontSize: '11px',
                                fontFamily: 'monospace',
                                color: 'rgba(255, 255, 255, 0.85)',
                                fontWeight: 500,
                                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)'
                              }}
                            >
                              {k}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '10px 18px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(0, 0, 0, 0.25)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: 'rgba(255, 255, 255, 0.45)'
        }}>
          <span>{filtered.length} shortcuts available</span>
          <div style={{ display: 'flex', gap: '14px' }}>
            <span>Click any card to trigger directly</span>
            <span><kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 5px', borderRadius: '3px' }}>ESC</kbd> Close</span>
          </div>
        </div>
      </div>
    </div>
  );
};

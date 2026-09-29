import React, { useState, useEffect, useRef } from 'react';
import { 
  History, 
  Terminal, 
  Clock, 
  Repeat 
} from 'lucide-react';
import { HistoryProvider, HistoryEntry } from '../../domain/autocomplete/HistoryProvider';

export interface HistorySearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (command: string) => void;
  currentCwd?: string;
}

export const HistorySearchModal: React.FC<HistorySearchModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentCwd
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const historyEntries = HistoryProvider.getInstance().getHistory();

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const filtered = historyEntries
    .filter(h => {
      const q = query.toLowerCase().trim();
      if (!q) return true;
      return h.command.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const now = Date.now();
      let scoreA = a.count * 10 - (now - a.lastUsed) / 10000;
      let scoreB = b.count * 10 - (now - b.lastUsed) / 10000;
      if (currentCwd && a.cwd === currentCwd) scoreA += 500;
      if (currentCwd && b.cwd === currentCwd) scoreB += 500;
      return scoreB - scoreA;
    });

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % Math.max(1, filtered.length));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + Math.max(1, filtered.length)) % Math.max(1, filtered.length));
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex].command);
          onClose();
        }
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filtered, selectedIndex, onClose, onSelect]);

  if (!isOpen) return null;

  const formatTimeAgo = (timestamp: number) => {
    const diff = Math.max(0, Date.now() - timestamp);
    const secs = Math.floor(diff / 1000);
    if (secs < 60) return 'just now';
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
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
        paddingTop: '12vh',
        zIndex: 99999
      }}
    >
      <div 
        onClick={e => e.stopPropagation()}
        style={{
          width: '580px',
          maxWidth: '92vw',
          backgroundColor: 'rgba(18, 20, 25, 0.96)',
          borderRadius: '14px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: '#f8fafc'
        }}
      >
        {/* Search Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          <History size={15} color="rgba(255, 255, 255, 0.45)" style={{ flexShrink: 0 }} />
          <input 
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search command history (ranked by frequency & recency)..."
            style={{
              flex: 1,
              backgroundColor: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: '14px',
              color: '#f8fafc',
              fontWeight: 400
            }}
          />
          <span style={{
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.4)',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '2px 7px',
            borderRadius: '5px'
          }}>
            ESC to close
          </span>
        </div>

        {/* History List */}
        <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '6px 8px' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.35)', fontSize: '13px' }}>
              {historyEntries.length === 0 ? 'No commands yet. Commands you run in any terminal appear here.' : 'No matching commands found'}
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const isCurrentDir = currentCwd && item.cwd === currentCwd;

              return (
                <div 
                  key={`${item.command}-${idx}`}
                  onClick={() => {
                    onSelect(item.command);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    backgroundColor: isSelected ? 'rgba(255, 255, 255, 0.07)' : 'transparent',
                    border: isSelected ? '1px solid rgba(255, 255, 255, 0.08)' : '1px solid transparent',
                    transition: 'all 0.12s ease',
                    marginBottom: '1px'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '22px',
                      height: '22px',
                      flexShrink: 0,
                      color: isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.45)'
                    }}>
                      <Terminal size={14} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                      <span style={{ 
                        fontSize: '13px', 
                        fontWeight: 500, 
                        color: isSelected ? '#ffffff' : '#e2e8f0',
                        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, monospace'
                      }}>
                        {item.command}
                      </span>
                      {item.cwd && (
                        <span style={{
                          fontSize: '11px',
                          color: 'rgba(255, 255, 255, 0.38)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '380px'
                        }}>
                          {item.cwd}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                    {isCurrentDir && (
                      <span style={{
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(255, 255, 255, 0.06)',
                        color: 'rgba(255, 255, 255, 0.55)',
                        border: '1px solid rgba(255, 255, 255, 0.08)'
                      }}>
                        here
                      </span>
                    )}

                    <span style={{
                      fontSize: '10px',
                      padding: '1px 5px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                      color: 'rgba(255, 255, 255, 0.4)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}>
                      <Clock size={10} />
                      <span>{formatTimeAgo(item.lastUsed)}</span>
                    </span>

                    {item.count > 1 && (
                      <span style={{
                        fontSize: '10px',
                        padding: '1px 5px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(255, 255, 255, 0.04)',
                        color: 'rgba(255, 255, 255, 0.4)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '2px'
                      }}>
                        <Repeat size={10} />
                        <span>{item.count}×</span>
                      </span>
                    )}

                    {isSelected && (
                      <kbd style={{
                        fontSize: '11px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        color: 'rgba(255, 255, 255, 0.85)',
                        border: '1px solid rgba(255, 255, 255, 0.15)',
                        fontFamily: 'inherit'
                      }}>
                        ↵
                      </kbd>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '9px 16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: 'rgba(255, 255, 255, 0.4)'
        }}>
          <span>{filtered.length} command{filtered.length === 1 ? '' : 's'} in history</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '3px', fontSize: '10px' }}>↑</kbd>
              <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '3px', fontSize: '10px' }}>↓</kbd>
              <span>Navigate</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '3px', fontSize: '10px' }}>↵</kbd>
              <span>Paste & Run</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '3px', fontSize: '10px' }}>ESC</kbd>
              <span>Close</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

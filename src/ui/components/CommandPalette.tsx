import React, { useState, useEffect, useRef } from 'react';
import { Search, Sparkles, Command } from 'lucide-react';

export interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onExecuteCapability?: (capabilityId: string) => void;
  capabilities?: any[];
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ 
  isOpen, 
  onClose, 
  onExecuteCapability, 
  capabilities = [] 
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const results = capabilities.filter(c => 
    c.name.toLowerCase().includes(query.toLowerCase()) || 
    c.description.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation
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
        setSelectedIndex(prev => (prev + 1) % Math.max(1, results.length));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + Math.max(1, results.length)) % Math.max(1, results.length));
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        if (results[selectedIndex]) {
          if (onExecuteCapability) onExecuteCapability(results[selectedIndex].id);
          onClose();
        }
      }
    };

    if (isOpen) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, selectedIndex, onClose, onExecuteCapability]);

  if (!isOpen) return null;

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
          width: '560px',
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
          <Search size={15} color="rgba(255, 255, 255, 0.45)" style={{ flexShrink: 0 }} />
          <input 
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search commands, tools, or capabilities..."
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

        {/* Command List */}
        <div style={{ maxHeight: '380px', overflowY: 'auto', padding: '6px 8px' }}>
          {results.map((c, idx) => {
            const isSelected = idx === selectedIndex;
            return (
              <div 
                key={c.id} 
                onClick={() => {
                  if (onExecuteCapability) onExecuteCapability(c.id);
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '24px',
                    height: '24px',
                    flexShrink: 0,
                    color: isSelected ? '#ffffff' : 'rgba(255, 255, 255, 0.5)'
                  }}>
                    <Command size={15} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0 }}>
                    <span style={{ fontSize: '13px', fontWeight: 500, color: isSelected ? '#ffffff' : '#e2e8f0' }}>
                      {c.name}
                    </span>
                    <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '420px' }}>
                      {c.description}
                    </span>
                  </div>
                </div>

                {isSelected && (
                  <kbd style={{
                    fontSize: '11px',
                    padding: '1px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    color: 'rgba(255, 255, 255, 0.85)',
                    border: '1px solid rgba(255, 255, 255, 0.15)',
                    fontFamily: 'inherit',
                    flexShrink: 0
                  }}>
                    ↵
                  </kbd>
                )}
              </div>
            );
          })}

          {results.length === 0 && (
            <div style={{ padding: '36px 20px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.35)', fontSize: '13px' }}>
              No matching commands found
            </div>
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
          <span>{results.length} command{results.length === 1 ? '' : 's'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '3px', fontSize: '10px' }}>↑</kbd>
              <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '3px', fontSize: '10px' }}>↓</kbd>
              <span>Navigate</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '3px', fontSize: '10px' }}>↵</kbd>
              <span>Run</span>
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

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Search, ChevronUp, ChevronDown, X, CaseSensitive, WholeWord, Regex } from 'lucide-react';
import type { SearchAddon, ISearchOptions } from '@xterm/addon-search';

export interface TerminalSearchBarProps {
  isOpen: boolean;
  onClose: () => void;
  searchAddon: SearchAddon | null;
  onFocusTerminal?: () => void;
  /** Text to search for as soon as the bar opens (a "search the terminal for X" request) */
  initialQuery?: { text: string; id: number };
}

export const TerminalSearchBar: React.FC<TerminalSearchBarProps> = ({
  isOpen,
  onClose,
  searchAddon,
  onFocusTerminal,
  initialQuery
}) => {
  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [resultIndex, setResultIndex] = useState<number>(-1);
  const [resultCount, setResultCount] = useState<number>(0);
  const [regexError, setRegexError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input when search bar opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    } else {
      setQuery('');
      setResultIndex(-1);
      setResultCount(0);
      setRegexError(null);
      searchAddon?.clearDecorations();
    }
  }, [isOpen, searchAddon]);

  // A requested search fills the box; the query effect below runs it
  useEffect(() => {
    if (isOpen && initialQuery?.text) setQuery(initialQuery.text);
  }, [isOpen, initialQuery?.id, initialQuery?.text]);

  // Subscribe to search result changes
  useEffect(() => {
    if (!searchAddon) return;
    try {
      const disposable = searchAddon.onDidChangeResults?.((event) => {
        setResultIndex(event.resultIndex);
        setResultCount(event.resultCount);
      });
      return () => {
        disposable?.dispose?.();
      };
    } catch {
      // Non-blocking if onDidChangeResults is not supported in test mocks
    }
  }, [searchAddon]);

  const getSearchOptions = useCallback((incremental = false): ISearchOptions => {
    return {
      regex: useRegex,
      wholeWord,
      caseSensitive,
      incremental,
      decorations: {
        matchBackground: '#374151',
        matchBorder: '#4b5563',
        matchOverviewRuler: '#3b82f6',
        activeMatchBackground: '#f59e0b',
        activeMatchBorder: '#d97706',
        activeMatchColorOverviewRuler: '#f59e0b'
      }
    };
  }, [useRegex, wholeWord, caseSensitive]);

  // Execute search when query or options change
  const executeSearch = useCallback((searchTerm: string, forward = true, incremental = false) => {
    if (!searchAddon || !searchTerm.trim()) {
      setResultIndex(-1);
      setResultCount(0);
      setRegexError(null);
      searchAddon?.clearDecorations();
      return;
    }

    // Validate regex if regex option is enabled
    if (useRegex) {
      try {
        new RegExp(searchTerm);
        setRegexError(null);
      } catch (err: any) {
        setRegexError(err.message || 'Invalid regex');
        return;
      }
    } else {
      setRegexError(null);
    }

    const options = getSearchOptions(incremental);
    if (forward) {
      searchAddon.findNext(searchTerm, options);
    } else {
      searchAddon.findPrevious(searchTerm, options);
    }
  }, [searchAddon, useRegex, getSearchOptions]);

  // Trigger search on query change
  useEffect(() => {
    if (isOpen && query) {
      executeSearch(query, true, true);
    } else if (!query) {
      searchAddon?.clearDecorations();
      setResultIndex(-1);
      setResultCount(0);
    }
  }, [query, caseSensitive, wholeWord, useRegex, isOpen, executeSearch, searchAddon]);

  const handleNext = () => {
    if (query) executeSearch(query, true, false);
  };

  const handlePrevious = () => {
    if (query) executeSearch(query, false, false);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleGlobalSearchShortcuts = (e: KeyboardEvent) => {
      if (e.altKey) {
        const isC = e.code === 'KeyC' || e.key.toLowerCase() === 'c' || e.key === 'ç';
        const isW = e.code === 'KeyW' || e.key.toLowerCase() === 'w' || e.key === '∑';
        const isR = e.code === 'KeyR' || e.key.toLowerCase() === 'r' || e.key === '®';
        if (isC) {
          e.preventDefault();
          e.stopPropagation();
          setCaseSensitive(prev => !prev);
          return;
        }
        if (isW) {
          e.preventDefault();
          e.stopPropagation();
          setWholeWord(prev => !prev);
          return;
        }
        if (isR) {
          e.preventDefault();
          e.stopPropagation();
          setUseRegex(prev => !prev);
          return;
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
        onFocusTerminal?.();
      }
    };
    window.addEventListener('keydown', handleGlobalSearchShortcuts, true);
    return () => window.removeEventListener('keydown', handleGlobalSearchShortcuts, true);
  }, [isOpen, onClose, onFocusTerminal]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.altKey) {
      const isC = e.code === 'KeyC' || e.key.toLowerCase() === 'c' || e.key === 'ç';
      const isW = e.code === 'KeyW' || e.key.toLowerCase() === 'w' || e.key === '∑';
      const isR = e.code === 'KeyR' || e.key.toLowerCase() === 'r' || e.key === '®';
      if (isC) {
        e.preventDefault();
        e.stopPropagation();
        setCaseSensitive(prev => !prev);
        return;
      }
      if (isW) {
        e.preventDefault();
        e.stopPropagation();
        setWholeWord(prev => !prev);
        return;
      }
      if (isR) {
        e.preventDefault();
        e.stopPropagation();
        setUseRegex(prev => !prev);
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        handlePrevious();
      } else {
        handleNext();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      onFocusTerminal?.();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="cero-terminal-search-bar"
      data-testid="terminal-search-bar"
      style={{
        position: 'absolute',
        top: '12px',
        right: '20px',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 10px',
        background: 'rgba(17, 24, 39, 0.92)',
        backdropFilter: 'blur(12px)',
        border: `1px solid ${regexError ? 'rgba(239, 68, 68, 0.5)' : 'rgba(75, 85, 99, 0.4)'}`,
        borderRadius: '8px',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
        color: '#e5e7eb',
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: '12px',
        minWidth: '360px'
      }}
    >
      <Search size={14} style={{ color: '#9ca3af', flexShrink: 0 }} />

      <div style={{ position: 'relative', flex: 1, display: 'flex', alignItems: 'center' }}>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Find in terminal..."
          data-testid="terminal-search-input"
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: '#f9fafb',
            fontFamily: 'inherit',
            fontSize: '12px',
            padding: '3px 4px'
          }}
        />

        {query && (
          <span
            data-testid="terminal-search-counter"
            style={{
              fontSize: '11px',
              color: resultCount > 0 ? '#9ca3af' : '#ef4444',
              marginLeft: '4px',
              whiteSpace: 'nowrap',
              userSelect: 'none'
            }}
          >
            {regexError ? (
              'Invalid regex'
            ) : resultCount > 0 ? (
              `${resultIndex >= 0 ? resultIndex + 1 : 1} of ${resultCount}`
            ) : (
              'No matches'
            )}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', borderLeft: '1px solid rgba(75, 85, 99, 0.3)', paddingLeft: '6px' }}>
        {/* Match Case */}
        <button
          type="button"
          onClick={() => setCaseSensitive(prev => !prev)}
          title="Match Case (Alt+C)"
          data-testid="toggle-case-sensitive"
          style={{
            background: caseSensitive ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
            border: caseSensitive ? '1px solid #3b82f6' : '1px solid transparent',
            color: caseSensitive ? '#60a5fa' : '#9ca3af',
            borderRadius: '4px',
            padding: '3px 5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <CaseSensitive size={13} />
        </button>

        {/* Match Whole Word */}
        <button
          type="button"
          onClick={() => setWholeWord(prev => !prev)}
          title="Match Whole Word (Alt+W)"
          data-testid="toggle-whole-word"
          style={{
            background: wholeWord ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
            border: wholeWord ? '1px solid #3b82f6' : '1px solid transparent',
            color: wholeWord ? '#60a5fa' : '#9ca3af',
            borderRadius: '4px',
            padding: '3px 5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <WholeWord size={13} />
        </button>

        {/* Use Regular Expression */}
        <button
          type="button"
          onClick={() => setUseRegex(prev => !prev)}
          title="Use Regular Expression (Alt+R)"
          data-testid="toggle-regex"
          style={{
            background: useRegex ? 'rgba(59, 130, 246, 0.2)' : 'transparent',
            border: useRegex ? '1px solid #3b82f6' : '1px solid transparent',
            color: useRegex ? '#60a5fa' : '#9ca3af',
            borderRadius: '4px',
            padding: '3px 5px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <Regex size={13} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '2px', borderLeft: '1px solid rgba(75, 85, 99, 0.3)', paddingLeft: '6px' }}>
        {/* Previous Match */}
        <button
          type="button"
          onClick={handlePrevious}
          disabled={!query || resultCount === 0}
          title="Previous Match (Shift+Enter)"
          data-testid="find-previous-btn"
          style={{
            background: 'transparent',
            border: 'none',
            color: (!query || resultCount === 0) ? '#4b5563' : '#9ca3af',
            borderRadius: '4px',
            padding: '3px',
            cursor: (!query || resultCount === 0) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <ChevronUp size={14} />
        </button>

        {/* Next Match */}
        <button
          type="button"
          onClick={handleNext}
          disabled={!query || resultCount === 0}
          title="Next Match (Enter)"
          data-testid="find-next-btn"
          style={{
            background: 'transparent',
            border: 'none',
            color: (!query || resultCount === 0) ? '#4b5563' : '#9ca3af',
            borderRadius: '4px',
            padding: '3px',
            cursor: (!query || resultCount === 0) ? 'not-allowed' : 'pointer',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <ChevronDown size={14} />
        </button>

        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            onClose();
            onFocusTerminal?.();
          }}
          title="Close (Escape)"
          data-testid="close-search-btn"
          style={{
            background: 'transparent',
            border: 'none',
            color: '#9ca3af',
            borderRadius: '4px',
            padding: '3px',
            cursor: 'pointer',
            marginLeft: '4px',
            display: 'flex',
            alignItems: 'center'
          }}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
};

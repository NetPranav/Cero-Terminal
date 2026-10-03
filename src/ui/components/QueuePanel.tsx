import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, ListOrdered, Pause, Play, Square, Trash2, X } from 'lucide-react';
import { PromptQueue, QueuedItem } from '../../presentation/PromptQueue';

export interface QueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export interface QueuePanelViewProps {
  running: QueuedItem[];
  items: QueuedItem[];
  paused: boolean;
  onStop: (item: QueuedItem) => void;
  onRemove: (id: string) => void;
  onMove: (id: string, toIndex: number) => void;
  onClear: () => void;
  onTogglePause: () => void;
  onClose: () => void;
}

/** What the state column says for a waiting prompt */
export function queueItemState(index: number, paused: boolean): 'Paused' | 'Next' | 'Waiting' {
  if (paused) return 'Paused';
  return index === 0 ? 'Next' : 'Waiting';
}

const KIND_LABEL: Record<string, string> = { goal: '', workflow: 'workflow', flow: 'flow' };

// Compact grayscale styling in the app's inline-style convention (the app has no utility-class CSS)
const ICON = 12;
const iconButton: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  width: 20, height: 20, padding: 0, border: 'none', borderRadius: 4,
  background: 'transparent', color: 'rgba(255, 255, 255, 0.55)', cursor: 'pointer', flexShrink: 0,
};
const textButton: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', gap: 4, height: 20, padding: '0 6px',
  border: 'none', borderRadius: 4, background: 'transparent', color: 'rgba(255, 255, 255, 0.7)',
  fontSize: 11, cursor: 'pointer', flexShrink: 0,
};
const badge: React.CSSProperties = {
  fontSize: 10, lineHeight: '14px', padding: '0 5px', borderRadius: 3,
  background: 'rgba(255, 255, 255, 0.08)', color: 'rgba(255, 255, 255, 0.75)', flexShrink: 0,
};
const row: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 6, height: 26, padding: '0 8px', boxSizing: 'border-box',
};
const labelStyle: React.CSSProperties = {
  flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  fontFamily: 'monospace', fontSize: 11.5, color: 'rgba(255, 255, 255, 0.9)',
};

export const QueuePanelView: React.FC<QueuePanelViewProps> = ({
  running, items, paused, onStop, onRemove, onMove, onClear, onTogglePause, onClose,
}) => {
  return (
    <div
      role="region"
      aria-label="Queued prompts"
      data-testid="queue-panel"
      tabIndex={-1}
      onKeyDown={(e) => {
        // Only while focus is inside the panel: the terminal keeps its own Escape
        if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      }}
      style={{
        position: 'fixed', right: 16, bottom: 52, zIndex: 8000, width: 360, maxWidth: 'calc(100vw - 32px)',
        maxHeight: '50vh', display: 'flex', flexDirection: 'column', boxSizing: 'border-box',
        background: 'rgba(12, 13, 18, 0.97)', border: '1px solid rgba(255, 255, 255, 0.12)', borderRadius: 8,
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)', color: '#e5e7eb', outline: 'none',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <div style={{ ...row, height: 28, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}>
        <ListOrdered size={ICON} style={{ opacity: 0.7 }} />
        <span style={{ fontSize: 12, fontWeight: 600 }}>Queue</span>
        <span style={badge} title="Waiting prompts">{items.length}</span>
        {paused && <span style={{ ...badge, background: 'rgba(255, 255, 255, 0.16)', color: '#fff' }}>Paused</span>}
        <span style={{ flex: 1 }} />
        <button type="button" style={textButton} onClick={onTogglePause} title={paused ? 'Resume the queue' : 'Pause the queue'}>
          {paused ? <Play size={ICON} /> : <Pause size={ICON} />}
          <span>{paused ? 'Resume' : 'Pause'}</span>
        </button>
        {items.length > 0 && (
          <button type="button" style={iconButton} onClick={onClear} title="Remove all waiting prompts" aria-label="Clear queue">
            <Trash2 size={ICON} />
          </button>
        )}
        <button type="button" style={iconButton} onClick={onClose} title="Close" aria-label="Close queue panel">
          <X size={ICON} />
        </button>
      </div>

      <div style={{ overflowY: 'auto', minHeight: 0 }}>
        {running.map((item) => (
          <div key={item.id} data-testid="queue-running" style={{ ...row, background: 'rgba(255, 255, 255, 0.04)' }}>
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: '#fff', flexShrink: 0 }} />
            <span style={{ ...labelStyle }} title={item.label || item.goal}>{item.label || item.goal}</span>
            <span style={badge}>Running</span>
            <button type="button" style={iconButton} onClick={() => onStop(item)} title="Stop this task (Ctrl+C)" aria-label="Stop running task">
              <Square size={ICON - 1} fill="currentColor" />
            </button>
          </div>
        ))}

        {items.length === 0 && running.length === 0 && (
          <div style={{ ...row, color: 'rgba(255, 255, 255, 0.4)', fontSize: 11.5 }}>No queued prompts</div>
        )}

        <ol role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {items.map((item, idx) => {
            const kind = KIND_LABEL[item.kind] ?? '';
            return (
              <li key={item.id} data-testid="queue-item" style={row}>
                <span style={{ width: 16, textAlign: 'right', fontSize: 10.5, color: 'rgba(255, 255, 255, 0.4)', flexShrink: 0 }}>{idx + 1}</span>
                <span style={labelStyle} title={item.label || item.goal}>{item.label || item.goal}</span>
                {kind && <span style={badge}>{kind}</span>}
                <span style={{ fontSize: 10, color: 'rgba(255, 255, 255, 0.45)', width: 44, textAlign: 'right', flexShrink: 0 }}>
                  {queueItemState(idx, paused)}
                </span>
                <button type="button" style={{ ...iconButton, opacity: idx === 0 ? 0.25 : 1 }} disabled={idx === 0}
                  onClick={() => onMove(item.id, idx - 1)} title="Move up" aria-label={`Move item ${idx + 1} up`}>
                  <ChevronUp size={ICON} />
                </button>
                <button type="button" style={{ ...iconButton, opacity: idx === items.length - 1 ? 0.25 : 1 }} disabled={idx === items.length - 1}
                  onClick={() => onMove(item.id, idx + 1)} title="Move down" aria-label={`Move item ${idx + 1} down`}>
                  <ChevronDown size={ICON} />
                </button>
                <button type="button" style={iconButton} onClick={() => onRemove(item.id)} title="Remove from the queue" aria-label={`Remove item ${idx + 1}`}>
                  <X size={ICON} />
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
};

export const QueuePanel: React.FC<QueuePanelProps> = ({ isOpen, onClose }) => {
  const queue = PromptQueue.getInstance();
  const [items, setItems] = useState<QueuedItem[]>(() => queue.getItems());
  const [running, setRunning] = useState<QueuedItem[]>(() => queue.getRunningItems());
  const [paused, setPaused] = useState<boolean>(() => queue.isPaused());

  useEffect(() => {
    if (!isOpen) return;
    return queue.subscribe((updated) => {
      setItems(updated);
      setRunning(queue.getRunningItems());
      setPaused(queue.isPaused());
    });
  }, [isOpen, queue]);

  if (!isOpen) return null;

  return (
    <QueuePanelView
      running={running}
      items={items}
      paused={paused}
      onStop={(item) => window.dispatchEvent(new CustomEvent('cero:abort-active-run', { detail: { ownerId: item.ownerId } }))}
      onRemove={(id) => { queue.remove(id); }}
      onMove={(id, toIndex) => { queue.move(id, toIndex); }}
      onClear={() => queue.clear()}
      onTogglePause={() => setPaused(queue.togglePaused())}
      onClose={onClose}
    />
  );
};

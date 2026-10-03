import React, { useEffect, useState } from 'react';
import { ListOrdered, X, Trash2, ArrowUp, Pause, Play, Square } from 'lucide-react';
import { PromptQueue, QueuedItem } from '../../presentation/PromptQueue';

export interface QueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QueuePanel: React.FC<QueuePanelProps> = ({ isOpen, onClose }) => {
  const [items, setItems] = useState<QueuedItem[]>(() => PromptQueue.getInstance().getItems());
  const [paused, setPaused] = useState<boolean>(() => PromptQueue.getInstance().isPaused());
  const [runningItem, setRunningItem] = useState<QueuedItem | null>(() => PromptQueue.getInstance().getRunningItem());

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = PromptQueue.getInstance().subscribe((updated) => {
      setItems(updated);
      setPaused(PromptQueue.getInstance().isPaused());
      setRunningItem(PromptQueue.getInstance().getRunningItem());
    });
    return unsubscribe;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleRemove = (id: string) => {
    PromptQueue.getInstance().remove(id);
  };

  const handleClear = () => {
    PromptQueue.getInstance().clear();
  };

  const handleMoveToTop = (id: string) => {
    PromptQueue.getInstance().move(id, 0);
  };

  const handleTogglePause = () => {
    const next = PromptQueue.getInstance().togglePaused();
    setPaused(next);
  };

  const handleStopRunning = () => {
    window.dispatchEvent(new CustomEvent('cero:abort-active-run'));
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="queue-panel-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-[#090b10] border border-white/10 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#0c0d12]">
          <div className="flex items-center gap-2">
            <ListOrdered className="w-4 h-4 text-white/70" />
            <h2 id="queue-panel-title" className="text-sm font-semibold tracking-wide text-white">
              Queued Prompts
            </h2>
            <span className="px-2 py-0.5 text-xs font-mono font-medium rounded-full bg-white/10 text-white/80">
              {items.length}
            </span>
            {paused && (
              <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider font-semibold rounded bg-white/15 text-white/90">
                Paused
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTogglePause}
              className="flex items-center gap-1 px-2.5 py-1 text-xs text-white/70 hover:text-white hover:bg-white/10 rounded transition-colors"
              title={paused ? 'Resume queue' : 'Pause queue'}
            >
              {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
              <span>{paused ? 'Resume' : 'Pause'}</span>
            </button>

            {items.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-white/60 hover:text-white hover:bg-white/10 rounded transition-colors"
                title="Clear all queued prompts"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-white/50 hover:text-white hover:bg-white/10 rounded transition-colors"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {/* Running item header block */}
          {runningItem && (
            <div className="mb-4 p-3 rounded bg-white/[0.04] border border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse shrink-0" />
                <div className="min-w-0">
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-white/50 block">
                    Running now
                  </span>
                  <span
                    className="text-xs font-mono text-white truncate block"
                    title={runningItem.label || runningItem.goal}
                  >
                    {runningItem.label || runningItem.goal}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleStopRunning}
                className="flex items-center gap-1 px-2.5 py-1 text-xs text-white/80 hover:text-white bg-white/10 hover:bg-white/15 border border-white/15 rounded transition-colors shrink-0"
                title="Stop running task"
              >
                <Square className="w-3 h-3 fill-current" />
                <span>Stop</span>
              </button>
            </div>
          )}

          {items.length === 0 ? (
            <div className="py-8 text-center text-sm text-white/40 font-mono">
              The queue is empty.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {items.map((item, idx) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 py-2.5 group hover:bg-white/[0.02] px-2 rounded transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <span className="text-xs font-mono text-white/40 select-none w-5 shrink-0 text-right">
                      {idx + 1}.
                    </span>
                    <p
                      className="text-xs font-mono text-white/90 truncate flex-1"
                      title={item.label || item.goal}
                    >
                      {item.label || item.goal}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => handleMoveToTop(item.id)}
                        className="p-1 text-white/40 hover:text-white hover:bg-white/10 rounded transition-colors"
                        title="Run next"
                        aria-label={`Run item ${idx + 1} next`}
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleRemove(item.id)}
                      className="p-1 text-white/30 hover:text-white hover:bg-white/10 rounded transition-colors"
                      title={`Remove item ${idx + 1}`}
                      aria-label={`Remove item ${idx + 1}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-white/10 bg-[#0c0d12] flex items-center justify-between text-xs text-white/40">
          <span>Queued prompts do not persist across restarts</span>
          <span className="font-mono">Press Esc to close</span>
        </div>
      </div>
    </div>
  );
};

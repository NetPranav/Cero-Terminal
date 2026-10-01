import React, { useEffect, useState } from 'react';
import { ListOrdered, X, Trash2 } from 'lucide-react';
import { PromptQueue, QueuedItem } from '../../presentation/PromptQueue';

export interface QueuePanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const QueuePanel: React.FC<QueuePanelProps> = ({ isOpen, onClose }) => {
  const [items, setItems] = useState<QueuedItem[]>(() => PromptQueue.getInstance().getItems());

  useEffect(() => {
    if (!isOpen) return;
    const unsubscribe = PromptQueue.getInstance().subscribe((updated) => {
      setItems(updated);
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
          </div>

          <div className="flex items-center gap-2">
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
        <div className="p-4 overflow-y-auto flex-1 divide-y divide-white/5">
          {items.length === 0 ? (
            <div className="py-8 text-center text-sm text-white/40 font-mono">
              The queue is empty.
            </div>
          ) : (
            items.map((item, idx) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 py-2.5 group hover:bg-white/[0.02] px-2 rounded transition-colors"
              >
                <div className="flex items-start gap-2.5 min-w-0">
                  <span className="text-xs font-mono text-white/40 pt-0.5 select-none w-5 shrink-0 text-right">
                    {idx + 1}.
                  </span>
                  <p className="text-xs font-mono text-white/90 break-words leading-relaxed">
                    {item.goal}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  className="p-1 text-white/30 hover:text-white hover:bg-white/10 rounded transition-colors shrink-0"
                  title={`Remove item ${idx + 1}`}
                  aria-label={`Remove item ${idx + 1}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-white/10 bg-[#0c0d12] flex items-center justify-between text-xs text-white/40">
          <span>Queued items run automatically in order</span>
          <span className="font-mono">Press Esc to close</span>
        </div>
      </div>
    </div>
  );
};

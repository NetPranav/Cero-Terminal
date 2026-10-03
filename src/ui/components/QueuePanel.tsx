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

  const mono = '"SF Mono", Menlo, Monaco, "Cascadia Code", monospace';
  const sans = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif';
  const ghost: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 11px', fontSize: '12px',
    color: 'rgba(255,255,255,0.78)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px', cursor: 'pointer', fontFamily: sans,
  };
  const icon: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px',
    color: 'rgba(255,255,255,0.6)', background: 'transparent', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px', cursor: 'pointer',
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="queue-panel-title"
      style={{ position: 'fixed', inset: 0, zIndex: 9000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: '100%', maxWidth: '620px', maxHeight: '82vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'rgba(22,24,32,0.96)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '18px', color: '#fff', fontFamily: sans, boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '18px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ListOrdered size={18} color="rgba(255,255,255,0.7)" />
            <h2 id="queue-panel-title" style={{ margin: 0, fontSize: '16px', fontWeight: 600, letterSpacing: '-0.2px' }}>Queued prompts</h2>
            <span style={{ padding: '1px 8px', fontSize: '11px', fontFamily: mono, borderRadius: '999px', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)' }}>{items.length}</span>
            {paused && <span style={{ padding: '1px 8px', fontSize: '10px', fontFamily: mono, letterSpacing: '0.6px', textTransform: 'uppercase', borderRadius: '6px', background: 'rgba(255,255,255,0.15)' }}>Paused</span>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button type="button" onClick={handleTogglePause} style={ghost} title={paused ? 'Resume queue' : 'Pause queue'}>
              {paused ? <Play size={13} /> : <Pause size={13} />}<span>{paused ? 'Resume' : 'Pause'}</span>
            </button>
            {items.length > 0 && (
              <button type="button" onClick={handleClear} style={ghost} title="Clear all queued prompts">
                <Trash2 size={13} /><span>Clear all</span>
              </button>
            )}
            <button type="button" onClick={onClose} style={icon} aria-label="Close"><X size={15} /></button>
          </div>
        </div>

        <div style={{ padding: '16px 20px', overflowY: 'auto', flex: 1 }}>
          {runningItem && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', padding: '12px 14px', marginBottom: '14px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '11px', letterSpacing: '0.6px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: '4px' }}>Running now</div>
                <div title={runningItem.label || runningItem.goal} style={{ fontFamily: mono, fontSize: '12.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{runningItem.label || runningItem.goal}</div>
              </div>
              <button type="button" onClick={handleStopRunning} style={ghost} title="Stop running task"><Square size={12} fill="currentColor" /><span>Stop</span></button>
            </div>
          )}

          {items.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', fontSize: '13px', color: 'rgba(255,255,255,0.4)' }}>
              Nothing queued. Prompts you send while a task runs wait here.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {items.map((item, idx) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '9px 10px 9px 12px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px' }}>
                  <span style={{ width: '18px', textAlign: 'right', fontFamily: mono, fontSize: '12px', color: 'rgba(255,255,255,0.4)' }}>{idx + 1}</span>
                  <div title={item.label || item.goal} style={{ flex: 1, minWidth: 0, fontFamily: mono, fontSize: '12.5px', color: 'rgba(255,255,255,0.9)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.label || item.goal}</div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {idx > 0 && (
                      <button type="button" onClick={() => handleMoveToTop(item.id)} style={icon} title="Run next" aria-label={`Run item ${idx + 1} next`}><ArrowUp size={14} /></button>
                    )}
                    <button type="button" onClick={() => handleRemove(item.id)} style={icon} title={`Remove item ${idx + 1}`} aria-label={`Remove item ${idx + 1}`}><X size={14} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '11px 20px', borderTop: '1px solid rgba(255,255,255,0.08)', fontSize: '11.5px', color: 'rgba(255,255,255,0.4)' }}>
          <span>Queued prompts do not persist across restarts</span>
          <span style={{ fontFamily: mono }}>Esc to close</span>
        </div>
      </div>
    </div>
  );
};

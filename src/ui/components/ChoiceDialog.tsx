import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Folder, X, Check } from 'lucide-react';
import type { ChoiceRequest, ChoiceResult } from '../../presentation/ChoiceRequests';

/**
 * Pick one of a few options: press 1, 2 or 3, move with the arrows and press Enter, or type
 * something else (a folder) in the last field. Escape cancels. Grayscale, like the approval dialog.
 */
export const ChoiceDialog: React.FC<{ request: ChoiceRequest; onResult: (result: ChoiceResult) => void }> = ({ request, onResult }) => {
  const [active, setActive] = useState(0);
  const [custom, setCustom] = useState('');
  const [typing, setTyping] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shownAt = useRef(Date.now());
  const count = request.options.length;

  useEffect(() => { rootRef.current?.focus(); }, []);
  useEffect(() => { if (typing) inputRef.current?.focus(); else rootRef.current?.focus(); }, [typing]);

  const pick = (index: number) => onResult({ index });
  const submitCustom = () => { if (custom.trim()) onResult({ custom: custom.trim() }); };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); onResult(null); return; }
    if (typing) {
      if (e.key === 'Enter') { e.preventDefault(); submitCustom(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setTyping(false); setActive(count - 1); }
      return;
    }
    // Keys typed just before the dialog opened must not choose for the person
    if (Date.now() - shownAt.current < 500) return;
    if (/^[1-9]$/.test(e.key) && Number(e.key) <= count) { e.preventDefault(); pick(Number(e.key) - 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (active >= count - 1 && request.custom) setTyping(true); else setActive(a => Math.min(count - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); pick(active); }
    else if (e.key === 'Tab' && request.custom) { e.preventDefault(); setTyping(true); }
  };

  const mono = '"SF Mono", Menlo, Monaco, "Cascadia Code", monospace';
  return createPortal(
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '20px', outline: 'none' }}
    >
      <div style={{ width: '100%', maxWidth: '560px', maxHeight: '90vh', overflowY: 'auto', background: 'rgba(22, 24, 32, 0.92)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '18px', padding: '26px', color: '#fff', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif', boxShadow: '0 30px 80px rgba(0,0,0,0.6)' }}>
        <div style={{ fontSize: '18px', fontWeight: 600, letterSpacing: '-0.2px', marginBottom: '14px' }}>{request.title}</div>
        {request.lines && request.lines.length > 0 && (
          <div style={{ fontFamily: mono, fontSize: '12.5px', lineHeight: 1.6, color: 'rgba(255,255,255,0.78)', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', padding: '12px 14px', marginBottom: '16px', whiteSpace: 'pre-wrap' }}>
            {request.lines.join('\n')}
          </div>
        )}
        <div style={{ fontSize: '12px', letterSpacing: '0.6px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', marginBottom: '8px' }}>{request.heading ?? 'Choose one'}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {request.options.map((o, i) => (
            <button
              key={i}
              onMouseEnter={() => { setTyping(false); setActive(i); }}
              onClick={() => pick(i)}
              style={{ display: 'flex', alignItems: 'center', gap: '12px', textAlign: 'left', width: '100%', padding: '11px 14px', borderRadius: '11px', cursor: 'pointer', color: '#fff', font: 'inherit',
                background: !typing && active === i ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)', border: `1px solid ${!typing && active === i ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.09)'}` }}
            >
              <span style={{ width: '24px', height: '24px', borderRadius: '7px', border: '1px solid rgba(255,255,255,0.2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: mono, fontSize: '12px', flexShrink: 0 }}>{i + 1}</span>
              <Folder size={15} style={{ opacity: 0.6, flexShrink: 0 }} />
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: '14px', fontWeight: 500 }}>{o.label}</span>
                {o.detail && <span style={{ display: 'block', fontFamily: mono, fontSize: '11.5px', color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.detail}</span>}
              </span>
            </button>
          ))}
          {request.custom && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', borderRadius: '11px', background: typing ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.04)', border: `1px solid ${typing ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.09)'}` }}>
              <span style={{ fontSize: '13px', color: 'rgba(255,255,255,0.6)', flexShrink: 0 }}>{request.custom.label}</span>
              <input
                ref={inputRef}
                value={custom}
                placeholder={request.custom.placeholder}
                onFocus={() => setTyping(true)}
                onChange={e => setCustom(e.target.value)}
                spellCheck={false}
                style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: '#fff', fontFamily: mono, fontSize: '12.5px' }}
              />
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
          <span style={{ fontSize: '12px', color: 'rgba(255,255,255,0.45)' }}>Press 1 to {count}, or use the arrows and Enter</span>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={() => onResult(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', cursor: 'pointer', font: 'inherit', fontSize: '13px', color: '#fff', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)' }}>
              <X size={13} /> Cancel <span style={{ opacity: 0.5, fontSize: '11px' }}>Esc</span>
            </button>
            {typing && (
              <button onClick={submitCustom} disabled={!custom.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 14px', borderRadius: '10px', cursor: custom.trim() ? 'pointer' : 'default', font: 'inherit', fontSize: '13px', fontWeight: 600, color: '#0b0c10', background: '#f4f4f5', border: 'none', opacity: custom.trim() ? 1 : 0.4 }}>
                <Check size={13} /> Save here
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

import React from 'react';
import { HelpCircle, ArrowDown, Check, Zap, X } from 'lucide-react';
import { getShortcutModifier } from '../../shared/platform';

export interface ZenModeHelpCalloutProps {
  isOpen: boolean;
  onDismiss: () => void;
}

export const ZenModeHelpCallout: React.FC<ZenModeHelpCalloutProps> = ({ isOpen, onDismiss }) => {
  if (!isOpen) return null;

  const mod = getShortcutModifier();

  return (
    <div style={{
      position: 'fixed',
      bottom: '38px',
      right: '16px',
      zIndex: 9500,
      width: '360px',
      maxWidth: 'calc(100vw - 32px)',
      backgroundColor: 'rgba(18, 20, 25, 0.98)',
      border: '1px solid rgba(255, 255, 255, 0.16)',
      borderRadius: '10px',
      boxShadow: '0 20px 48px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(20px)',
      padding: '16px',
      color: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      animation: 'fadeInUp 0.2s ease-out'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '24px',
            height: '24px',
            borderRadius: '6px',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Zap size={13} color="#ffffff" />
          </div>
          <span style={{ fontWeight: 600, fontSize: '13px', color: '#ffffff', letterSpacing: '-0.2px' }}>
            Zen Mode Activated
          </span>
        </div>
        <button
          onClick={onDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.45)',
            cursor: 'pointer',
            padding: '2px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '4px',
            transition: 'color 0.15s ease'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#ffffff'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)'; }}
          title="Dismiss"
        >
          <X size={14} />
        </button>
      </div>

      {/* Description */}
      <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.5, color: 'rgba(255, 255, 255, 0.7)' }}>
        Pane toolbars and auxiliary buttons are hidden for a clean, distraction-free terminal. Controls smoothly fade in when you hover over any pane header.
      </p>

      {/* Keybind Box */}
      <div style={{
        padding: '9px 11px',
        backgroundColor: 'rgba(255, 255, 255, 0.035)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '7px',
        display: 'flex',
        flexDirection: 'column',
        gap: '5px',
        fontSize: '11.5px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '7px' }}>
          <HelpCircle size={13} color="rgba(255, 255, 255, 0.75)" />
          <span style={{ color: 'rgba(255, 255, 255, 0.85)' }}>
            Press <kbd style={{ padding: '1px 5px', borderRadius: '4px', backgroundColor: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', fontWeight: 600, color: '#ffffff', fontFamily: 'ui-monospace, monospace' }}>{mod}+/</kbd> or <kbd style={{ padding: '1px 5px', borderRadius: '4px', backgroundColor: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', fontWeight: 600, color: '#ffffff', fontFamily: 'ui-monospace, monospace' }}>F1</kbd>
          </span>
        </div>
        <div style={{ color: 'rgba(255, 255, 255, 0.45)', fontSize: '10.5px', marginLeft: '20px' }}>
          Opens keybindings cheatsheet. Toggle modes with <kbd style={{ padding: '0 4px', borderRadius: '3px', backgroundColor: 'rgba(255, 255, 255, 0.08)', border: '1px solid rgba(255, 255, 255, 0.15)', color: 'rgba(255, 255, 255, 0.8)', fontFamily: 'ui-monospace, monospace' }}>{mod}+Shift+Z</kbd>.
        </div>
      </div>

      {/* Footer pointing to [F1 help] */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '2px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', color: 'rgba(255, 255, 255, 0.75)' }}>
          <ArrowDown size={12} color="rgba(255, 255, 255, 0.6)" />
          <span>Status bar: <strong style={{ color: '#ffffff', fontWeight: 600 }}>[F1 help]</strong></span>
        </div>
        <button
          onClick={onDismiss}
          style={{
            padding: '5px 12px',
            borderRadius: '6px',
            border: 'none',
            backgroundColor: '#ffffff',
            color: '#0a0a0c',
            fontSize: '11.5px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            transition: 'opacity 0.15s ease'
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          <Check size={12} strokeWidth={2.5} />
          <span>Got it</span>
        </button>
      </div>
    </div>
  );
};

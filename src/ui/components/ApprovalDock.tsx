import React from 'react';
import { Check, ShieldAlert, X } from 'lucide-react';

interface ApprovalDockProps {
  plan: any;
  /** Commands that come from a file or are high risk are approved with a click only */
  explicitClick: boolean;
  onApprove: () => void;
  onDeny: () => void;
}

/**
 * Approval request shown while the user is writing their next prompt.
 *
 * It is not a dialog: no backdrop, no focus, no keyboard shortcuts. Typing, Enter and Escape keep
 * going to the prompt being written, and the task waits until a button is clicked. The buttons do
 * not take focus either, so answering never interrupts a draft.
 */
export const ApprovalDock: React.FC<ApprovalDockProps> = ({ plan, explicitClick, onApprove, onDeny }) => {
  const params = plan?.parameters ?? {};
  const command = String(params.command || params.path || params.source || JSON.stringify(params));
  const why = params.explanation || plan?.explanation;
  const risk = String(plan?.riskLevel || 'admin').toLowerCase();
  // Keep focus where it is: a mouse press on a button must not move the caret out of the prompt
  const keepFocus = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div
      role="alertdialog"
      aria-modal="false"
      aria-label="Approval needed"
      data-testid="approval-dock"
      style={{
        position: 'fixed',
        right: 16,
        bottom: 52,
        zIndex: 9000,
        width: 340,
        maxWidth: 'calc(100vw - 32px)',
        boxSizing: 'border-box',
        padding: '10px 12px',
        borderRadius: 10,
        background: 'rgba(12, 13, 18, 0.96)',
        border: '1px solid rgba(255, 255, 255, 0.14)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        color: '#e5e7eb',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600 }}>
        <ShieldAlert size={13} style={{ opacity: 0.8 }} />
        <span>Approval needed</span>
        <span style={{ marginLeft: 'auto', fontSize: 10.5, fontWeight: 400, opacity: 0.5 }}>{risk} risk</span>
      </div>
      <div
        title={command}
        style={{
          marginTop: 8,
          padding: '6px 8px',
          borderRadius: 6,
          background: 'rgba(255, 255, 255, 0.04)',
          fontFamily: 'monospace',
          fontSize: 11.5,
          lineHeight: 1.4,
          maxHeight: 64,
          overflow: 'hidden',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          color: '#f5f5f7',
        }}
      >
        {command}
      </div>
      {why && (
        <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.4, opacity: 0.6, maxHeight: 30, overflow: 'hidden' }}>
          {String(why)}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
        <span style={{ fontSize: 10.5, opacity: 0.45, flex: 1 }}>
          {explicitClick ? 'Click Run to continue. Your typing is not affected.' : 'Your typing is not affected.'}
        </span>
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={onDeny}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', fontSize: 11.5, borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(255, 255, 255, 0.14)', background: 'transparent', color: '#cbd5e1' }}
        >
          <X size={11} />
          <span>Deny</span>
        </button>
        <button
          type="button"
          onMouseDown={keepFocus}
          onClick={onApprove}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', fontSize: 11.5, fontWeight: 600, borderRadius: 6, cursor: 'pointer', border: 'none', background: '#f5f5f7', color: '#0b0c10' }}
        >
          <Check size={11} />
          <span>Run</span>
        </button>
      </div>
    </div>
  );
};

import React from 'react';
import { invoke } from '@tauri-apps/api/core';
import { FileText, Check, X } from 'lucide-react';

interface FileAssociationPromptProps {
  onComplete: () => void;
}

export const FileAssociationPrompt: React.FC<FileAssociationPromptProps> = ({ onComplete }) => {
  const handleDecision = async (enabled: boolean) => {
    try {
      await invoke('set_association_status', { enabled });
    } catch (err) {
      console.warn('Failed to set association status:', err);
    }
    onComplete();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        backgroundColor: '#090b10',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        color: '#ffffff',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          backgroundColor: '#0c0d12',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '12px',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)'
        }}
      >
        <div
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '10px',
            backgroundColor: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '20px',
            color: '#ffffff'
          }}
        >
          <FileText size={24} />
        </div>

        <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 10px 0', color: '#ffffff' }}>
          File Association
        </h2>

        <p
          style={{
            fontSize: '13px',
            color: 'rgba(255, 255, 255, 0.7)',
            lineHeight: 1.5,
            margin: '0 0 28px 0'
          }}
        >
          Open .flow files with Sentinel Terminal? This adds a launcher and a file type to your user folders.
        </p>

        <div style={{ display: 'flex', gap: '12px', width: '100%', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => void handleDecision(true)}
            style={{
              flex: 1,
              padding: '10px 20px',
              borderRadius: '6px',
              border: '1px solid #ffffff',
              backgroundColor: '#ffffff',
              color: '#090b10',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <Check size={14} />
            <span>Yes</span>
          </button>

          <button
            type="button"
            onClick={() => void handleDecision(false)}
            style={{
              flex: 1,
              padding: '10px 20px',
              borderRadius: '6px',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              color: 'rgba(255, 255, 255, 0.8)',
              fontSize: '13px',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px'
            }}
          >
            <X size={14} />
            <span>No, never ask</span>
          </button>
        </div>
      </div>
    </div>
  );
};

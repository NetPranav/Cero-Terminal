import React, { useState, useEffect, useRef } from 'react';
import { 
  Cpu, 
  X, 
  Download, 
  Play, 
  Square, 
  Info,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  RotateCcw
} from 'lucide-react';
import { EmbeddedEngineManager, EmbeddedStatus, EMBEDDED_MODEL_TIERS, EmbeddedModelTier } from '../../ai/models/EmbeddedEngineManager';

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function formatEta(seconds: number): string {
  if (!seconds || seconds <= 0 || !isFinite(seconds)) return 'calculating...';
  if (seconds > 3600) {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.round((seconds % 3600) / 60);
    return `${hrs}h ${mins}m left`;
  }
  if (seconds > 60) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return `${mins}m ${secs}s left`;
  }
  return `${Math.round(seconds)}s left`;
}

export interface EmbeddedModelManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EmbeddedModelManagerModal: React.FC<EmbeddedModelManagerModalProps> = ({
  isOpen,
  onClose
}) => {
  const [status, setStatus] = useState<EmbeddedStatus | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{
    isDownloading: boolean;
    downloadedBytes: number;
    totalBytes: number;
    percent: number;
  } | null>(null);
  const [speedStr, setSpeedStr] = useState<string | null>(null);
  const [etaStr, setEtaStr] = useState<string | null>(null);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);
  const [isActionBusy, setIsActionBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tier, setTier] = useState<EmbeddedModelTier>(() => EmbeddedEngineManager.getSelectedTier());
  const model = EMBEDDED_MODEL_TIERS[tier];
  const modelSizeLabel = `~${(model.sizeBytes / 1e9).toFixed(1)} GB`;

  const lastProgressRef = useRef<{ bytes: number; time: number } | null>(null);

  const refreshStatus = async () => {
    const s = await EmbeddedEngineManager.getInstance().getStatus();
    setStatus(s);
  };

  const [engineLog, setEngineLog] = useState<string>('');
  useEffect(() => {
    // When the model is present but the engine is not serving, show why (from llama-server's log)
    if (isOpen && status?.modelDownloaded && status.engineInstalled && !status.isRunning) {
      EmbeddedEngineManager.getInstance().getEngineLogTail(12).then(setEngineLog);
    } else {
      setEngineLog('');
    }
  }, [isOpen, status?.modelDownloaded, status?.engineInstalled, status?.isRunning]);

  const handleSelectTier = async (next: EmbeddedModelTier) => {
    if (next === tier || isActionBusy) return;
    EmbeddedEngineManager.setSelectedTier(next);
    setTier(next);
    setConfirmDelete(false);
    const manager = EmbeddedEngineManager.getInstance();
    const s = await manager.getStatus();
    setStatus(s);
    // Switch a running engine over to the newly selected model if it is already downloaded
    if (s.isRunning && s.modelDownloaded) {
      await manager.startEngine();
      refreshStatus();
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshStatus();
      setConfirmDelete(false);
      const interval = setInterval(refreshStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  // Real-time progress polling (every 800ms)
  useEffect(() => {
    if (!isOpen) return;

    let mounted = true;
    const checkProgress = async () => {
      try {
        const p = await EmbeddedEngineManager.getInstance().getDownloadProgress();
        if (!mounted) return;
        setDownloadProgress(p);
        setIsDownloading(p.isDownloading);

        const now = Date.now();
        if (lastProgressRef.current && p.isDownloading && p.downloadedBytes > 0) {
          const deltaBytes = p.downloadedBytes - lastProgressRef.current.bytes;
          const deltaTimeSec = (now - lastProgressRef.current.time) / 1000;
          if (deltaTimeSec >= 0.6 && deltaBytes > 0) {
            const speedBps = deltaBytes / deltaTimeSec;
            setSpeedStr(`${formatBytes(speedBps)}/s`);
            const remainingBytes = Math.max(0, p.totalBytes - p.downloadedBytes);
            const etaSec = remainingBytes / speedBps;
            setEtaStr(formatEta(etaSec));
            lastProgressRef.current = { bytes: p.downloadedBytes, time: now };
          }
        } else {
          lastProgressRef.current = { bytes: p.downloadedBytes, time: now };
        }
      } catch {
        // ignore
      }
    };

    checkProgress();
    const interval = setInterval(checkProgress, 800);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleDownload = async () => {
    setIsDownloading(true);
    setDownloadMsg(`Starting download of ${model.displayName} (${modelSizeLabel})...`);
    
    try {
      const success = await EmbeddedEngineManager.getInstance().downloadRecommendedModel((p) => {
        setDownloadProgress({
          isDownloading: true,
          downloadedBytes: p.downloadedBytes,
          totalBytes: p.totalBytes,
          percent: p.percent
        });
      });

      setIsDownloading(false);
      if (success) {
        setDownloadMsg('Download complete. Checking the llama.cpp engine...');
        const engineReady = await EmbeddedEngineManager.getInstance().ensureEngineInstalled();
        if (!engineReady) {
          setDownloadMsg('Model ready, but the llama.cpp engine could not be installed. Install llama-server from your package manager (e.g. `pacman -S llama.cpp`) and reopen this panel.');
          await refreshStatus();
          return;
        }
        setDownloadMsg('Starting the engine...');
        await EmbeddedEngineManager.getInstance().startEngine();
        await refreshStatus();
        setTimeout(() => setDownloadMsg(null), 3500);
      } else {
        setDownloadMsg('Download failed or cancelled.');
      }
    } catch (err: any) {
      setIsDownloading(false);
      setDownloadMsg(`Download error: ${err?.message || err}`);
    }
  };

  const handleCancelDownload = async () => {
    setIsActionBusy(true);
    await EmbeddedEngineManager.getInstance().cancelDownload(false);
    setIsDownloading(false);
    setSpeedStr(null);
    setEtaStr(null);
    setDownloadMsg('Download cancelled. Partial progress saved for quick resume.');
    setTimeout(() => setDownloadMsg(null), 4000);
    await refreshStatus();
    setIsActionBusy(false);
  };

  const handleDeleteModel = async () => {
    setIsActionBusy(true);
    const ok = await EmbeddedEngineManager.getInstance().deleteModel();
    if (ok) {
      setDownloadMsg(`Model deleted. ${modelSizeLabel} of disk space freed.`);
      setConfirmDelete(false);
      setDownloadProgress(null);
      setTimeout(() => setDownloadMsg(null), 3500);
      await refreshStatus();
    } else {
      setDownloadMsg('Failed to delete model.');
    }
    setIsActionBusy(false);
  };

  const handleDiscardPartial = async () => {
    setIsActionBusy(true);
    await EmbeddedEngineManager.getInstance().cancelDownload(true);
    setDownloadProgress(null);
    setSpeedStr(null);
    setEtaStr(null);
    setDownloadMsg('Partial download discarded.');
    setTimeout(() => setDownloadMsg(null), 3000);
    setIsActionBusy(false);
  };

  const handleToggleEngine = async () => {
    if (!status) return;
    setIsActionBusy(true);
    if (status.isRunning) {
      await EmbeddedEngineManager.getInstance().stopEngine();
    } else {
      await EmbeddedEngineManager.getInstance().startEngine();
    }
    await refreshStatus();
    setIsActionBusy(false);
  };

  const isModelDownloading = isDownloading || Boolean(downloadProgress?.isDownloading);
  const percent = downloadProgress?.percent ?? 0;
  const hasPartialDownload = !isModelDownloading && !status?.modelDownloaded && Boolean(downloadProgress && downloadProgress.downloadedBytes > 0);

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
        paddingTop: '10vh',
        zIndex: 99996
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '620px',
          maxWidth: '92vw',
          maxHeight: '85vh',
          backgroundColor: 'rgba(18, 20, 25, 0.96)',
          borderRadius: '14px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          color: '#f8fafc',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          overflow: 'hidden'
        }}
      >
        {/* Modal Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '24px',
              height: '24px',
              borderRadius: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'rgba(255, 255, 255, 0.6)'
            }}>
              <Cpu size={14} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 500, color: '#ffffff' }}>
                Cero Embedded AI
              </h2>
              <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.38)', display: 'block' }}>
                Native local intelligence • Zero Ollama dependency
              </span>
            </div>
          </div>
          <span style={{
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.4)',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '2px 7px',
            borderRadius: '5px',
            cursor: 'pointer'
          }} onClick={onClose}>
            ESC to close
          </span>
        </div>

        {/* Modal Content */}
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '12px', overflowY: 'auto' }}>
          {/* Status banner */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '11px 14px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: status?.isRunning ? '#ffffff' : 'rgba(255, 255, 255, 0.25)',
                boxShadow: status?.isRunning ? '0 0 8px rgba(255, 255, 255, 0.6)' : 'none'
              }} />
              <div>
                <span style={{ fontSize: '12px', fontWeight: 500, color: '#f8fafc' }}>
                  {status?.isRunning ? 'Inference Engine Active' : 'Inference Engine Inactive'}
                </span>
                <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.38)', display: 'block', marginTop: '1px', fontFamily: 'ui-monospace, monospace' }}>
                  127.0.0.1:8847 • llama-server sidecar
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              {status?.isRunning ? (
                <button
                  disabled={isActionBusy}
                  onClick={handleToggleEngine}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '5px',
                    border: '1px solid rgba(255, 255, 255, 0.16)',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.14)'; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'; }}
                >
                  <Square size={11} />
                  <span>Stop</span>
                </button>
              ) : (
                <button
                  onClick={handleToggleEngine}
                  disabled={!status?.modelDownloaded || isModelDownloading || isActionBusy}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '5px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    color: '#ffffff',
                    fontSize: '11px',
                    fontWeight: 500,
                    cursor: (!status?.modelDownloaded || isModelDownloading) ? 'not-allowed' : 'pointer',
                    opacity: (!status?.modelDownloaded || isModelDownloading) ? 0.35 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Play size={11} />
                  <span>Start Engine</span>
                </button>
              )}
            </div>
          </div>

          {/* Feedback Alert Toast */}
          {downloadMsg && (
            <div style={{
              padding: '9px 12px',
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '6px',
              fontSize: '11px',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              {downloadMsg.includes('complete') ? (
                <CheckCircle2 size={13} style={{ color: '#ffffff' }} />
              ) : (
                <Info size={13} style={{ color: 'rgba(255, 255, 255, 0.65)' }} />
              )}
              <span>{downloadMsg}</span>
            </div>
          )}

          {/* Live Progress Card (while actively downloading) */}
          {isModelDownloading && downloadProgress && (
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '8px',
              padding: '12px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Download size={13} color="rgba(255, 255, 255, 0.6)" />
                  <span style={{ fontSize: '12px', fontWeight: 500, color: '#f8fafc' }}>
                    Downloading {model.displayName}
                  </span>
                </div>
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#ffffff', fontFamily: 'ui-monospace, monospace' }}>
                  {percent.toFixed(1)}%
                </span>
              </div>

              {/* Progress Track */}
              <div style={{
                width: '100%',
                height: '6px',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                borderRadius: '3px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${Math.max(2, Math.min(100, percent))}%`,
                  height: '100%',
                  backgroundColor: 'rgba(255, 255, 255, 0.75)',
                  borderRadius: '3px',
                  transition: 'width 0.3s ease'
                }} />
              </div>

              {/* Metrics, ETA, and Cancel */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '11px',
                color: 'rgba(255, 255, 255, 0.38)'
              }}>
                <span style={{ fontFamily: 'ui-monospace, monospace' }}>
                  {formatBytes(downloadProgress.downloadedBytes)} / {formatBytes(downloadProgress.totalBytes)}
                </span>
                <span>
                  {speedStr ? <span style={{ color: 'rgba(255, 255, 255, 0.7)', marginRight: '6px' }}>{speedStr}</span> : null}
                  {etaStr ? <span>{etaStr}</span> : 'Estimating...'}
                </span>
                <button
                  onClick={handleCancelDownload}
                  disabled={isActionBusy}
                  style={{
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    borderRadius: '4px',
                    padding: '2px 7px',
                    color: 'rgba(255, 255, 255, 0.85)',
                    fontSize: '10px',
                    fontWeight: 500,
                    cursor: isActionBusy ? 'not-allowed' : 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)'; }}
                  onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)'; }}
                >
                  <X size={10} />
                  <span>Cancel</span>
                </button>
              </div>
            </div>
          )}

          {/* Model Card */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '8px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '13px', fontWeight: 500, color: '#f8fafc' }}>
                  {model.displayName}
                </h3>
                <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.38)', display: 'block', marginTop: '1px', fontFamily: 'ui-monospace, monospace' }}>
                  {model.fileName} • 4-bit Quantized
                </span>
              </div>
              <span style={{
                fontSize: '10px',
                padding: '1px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                color: status?.modelDownloaded ? '#ffffff' : isModelDownloading ? '#ffffff' : 'rgba(255, 255, 255, 0.45)',
                fontWeight: 400
              }}>
                {status?.modelDownloaded ? `Installed (${modelSizeLabel})` : isModelDownloading ? `Downloading (${percent.toFixed(0)}%)` : 'Not Downloaded'}
              </span>
            </div>

            <div role="radiogroup" aria-label="Model size" style={{ display: 'flex', gap: '6px' }}>
              {(Object.keys(EMBEDDED_MODEL_TIERS) as EmbeddedModelTier[]).map(t => (
                <button
                  key={t}
                  role="radio"
                  aria-checked={t === tier}
                  disabled={isActionBusy || isModelDownloading}
                  onClick={() => handleSelectTier(t)}
                  style={{
                    flex: 1,
                    padding: '6px 8px',
                    borderRadius: '6px',
                    border: `1px solid ${t === tier ? 'rgba(255, 255, 255, 0.28)' : 'rgba(255, 255, 255, 0.08)'}`,
                    backgroundColor: t === tier ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                    color: t === tier ? '#ffffff' : 'rgba(255, 255, 255, 0.55)',
                    fontSize: '11px',
                    cursor: isActionBusy || isModelDownloading ? 'not-allowed' : 'pointer',
                    textTransform: 'capitalize'
                  }}
                >
                  {t}
                </button>
              ))}
            </div>

            <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255, 255, 255, 0.55)', lineHeight: 1.5 }}>
              {model.description}. Runs locally through Cero's own llama.cpp engine; nothing leaves this machine.
            </p>

            <div style={{ display: 'flex', gap: '12px', fontSize: '10px', color: 'rgba(255, 255, 255, 0.35)', fontFamily: 'ui-monospace, monospace' }}>
              <span>Download: {modelSizeLabel}</span>
              <span>RAM: ~{(model.ramRequiredMb / 1024).toFixed(1)} GB</span>
              <span>Hardware Acceleration: Supported</span>
            </div>

            {engineLog && (
              <pre style={{
                margin: 0,
                padding: '8px 10px',
                maxHeight: '140px',
                overflow: 'auto',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '6px',
                fontSize: '10px',
                lineHeight: 1.4,
                color: 'rgba(255, 255, 255, 0.6)',
                fontFamily: 'ui-monospace, monospace',
                whiteSpace: 'pre-wrap'
              }}>
                {`Engine log (~/.cero/logs/llama-server.log):\n${engineLog}`}
              </pre>
            )}

            {/* Actions for Not Downloaded State */}
            {!status?.modelDownloaded && !isModelDownloading && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '2px' }}>
                {hasPartialDownload && (
                  <div style={{
                    padding: '6px 10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.03)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '6px',
                    fontSize: '11px',
                    color: 'rgba(255, 255, 255, 0.7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <span>Partial download saved ({formatBytes(downloadProgress!.downloadedBytes)}).</span>
                    <button
                      onClick={handleDiscardPartial}
                      disabled={isActionBusy}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(255, 255, 255, 0.65)',
                        fontSize: '10px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.65)'; }}
                    >
                      <Trash2 size={10} />
                      <span>Discard</span>
                    </button>
                  </div>
                )}

                <button
                  disabled={isActionBusy}
                  onClick={handleDownload}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: isActionBusy ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  {hasPartialDownload ? <RotateCcw size={12} /> : <Download size={12} />}
                  <span>
                    {hasPartialDownload 
                      ? `Resume Download (${formatBytes(downloadProgress!.downloadedBytes)} saved)` 
                      : `Download & Activate ${model.displayName} (${modelSizeLabel})`}
                  </span>
                </button>
              </div>
            )}

            {/* Actions for Downloaded State: Delete Model */}
            {status?.modelDownloaded && (
              <div style={{ marginTop: '2px' }}>
                {!confirmDelete ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.85)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={12} style={{ color: '#ffffff' }} />
                      <span>Model ready for offline zero-token terminal automation</span>
                    </span>
                    <button
                      onClick={() => setConfirmDelete(true)}
                      disabled={isActionBusy}
                      style={{
                        background: 'rgba(255, 255, 255, 0.06)',
                        border: '1px solid rgba(255, 255, 255, 0.12)',
                        borderRadius: '5px',
                        padding: '4px 10px',
                        color: 'rgba(255, 255, 255, 0.8)',
                        fontSize: '11px',
                        fontWeight: 500,
                        cursor: isActionBusy ? 'not-allowed' : 'pointer',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px',
                        transition: 'all 0.15s ease'
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                        e.currentTarget.style.color = '#ffffff';
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                        e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
                      }}
                    >
                      <Trash2 size={11} />
                      <span>Delete</span>
                    </button>
                  </div>
                ) : (
                  <div style={{
                    padding: '8px 12px',
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid rgba(255, 255, 255, 0.14)',
                    borderRadius: '6px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#ffffff' }}>
                      <AlertTriangle size={13} style={{ color: 'rgba(255, 255, 255, 0.7)' }} />
                      <span>Delete model ({modelSizeLabel})?</span>
                    </div>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        onClick={handleDeleteModel}
                        disabled={isActionBusy}
                        style={{
                          background: 'rgba(255, 255, 255, 0.16)',
                          border: '1px solid rgba(255, 255, 255, 0.25)',
                          borderRadius: '4px',
                          padding: '4px 10px',
                          color: '#ffffff',
                          fontSize: '11px',
                          fontWeight: 600,
                          cursor: isActionBusy ? 'not-allowed' : 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = '#ffffff';
                          e.currentTarget.style.color = '#000000';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.16)';
                          e.currentTarget.style.color = '#ffffff';
                        }}
                      >
                        <Trash2 size={11} />
                        <span>Yes, Delete</span>
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        disabled={isActionBusy}
                        style={{
                          background: 'rgba(255, 255, 255, 0.05)',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          borderRadius: '4px',
                          padding: '4px 10px',
                          color: 'rgba(255, 255, 255, 0.75)',
                          fontSize: '11px',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Information box */}
          <div style={{
            fontSize: '11px',
            color: 'rgba(255, 255, 255, 0.38)',
            lineHeight: 1.5,
            padding: '10px 12px',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            border: '1px solid rgba(255, 255, 255, 0.04)',
            borderRadius: '6px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px'
          }}>
            <Info size={13} style={{ color: 'rgba(255, 255, 255, 0.4)', flexShrink: 0, marginTop: '2px' }} />
            <div>
              <strong>Why Embedded?</strong> Cero runs its own native inference engine without background daemons or port collisions. You can switch providers anytime in AI Settings.
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div style={{
          padding: '9px 16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          fontSize: '11px',
          color: 'rgba(255, 255, 255, 0.4)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontFamily: 'ui-monospace, monospace' }}>~/.cero/models/</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <kbd style={{ background: 'rgba(255,255,255,0.08)', padding: '1px 4px', borderRadius: '3px', fontSize: '10px' }}>ESC</kbd>
            <span>Close</span>
          </div>
        </div>
      </div>
    </div>
  );
};

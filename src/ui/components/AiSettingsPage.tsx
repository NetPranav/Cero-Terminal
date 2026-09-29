import React, { useEffect, useState } from 'react';
import { 
  Cpu, 
  Sparkles, 
  Server, 
  CheckCircle2, 
  AlertCircle,
  Key,
  Globe,
  Download,
  Check,
  Eye,
  EyeOff,
  Zap,
  Layers,
  Layout,
  Settings,
  Terminal,
  Folder,
  Code2,
  ExternalLink,
  RefreshCw,
  Info,
  ShieldCheck,
  Compass
} from 'lucide-react';
import { OllamaProvider as OllamaModelManager, OllamaModel } from '../../ai/models/OllamaProvider';
import { EmbeddedModelManagerModal } from './EmbeddedModelManagerModal';
import { EmbeddedEngineManager, EmbeddedStatus } from '../../ai/models/EmbeddedEngineManager';
import { ModelRecommendationEngine, TierRecommendationResult } from '../../ai/management/ModelRecommendationEngine';
import { CloudApiProvider, CloudServiceId, CloudKeyConfig, CLOUD_CATALOG } from '../../ai/provider/CloudApiProvider';
import { ModelManager, ActiveModelInfo } from '../../ai/management/ModelManager';
import { InstallerService, IntegrationStatus } from '../../domain/integration/InstallerService';
import { isLinux } from '../../shared/platform';

export type SettingsTabId = 'ai' | 'integrations' | 'appearance' | 'general';

export interface AiSettingsPageProps {
  onClose?: () => void;
  initialTab?: SettingsTabId;
  onLaunchOnboarding?: () => void;
  currentUiMode?: 'zen' | 'visual';
  onSelectUiMode?: (mode: 'zen' | 'visual') => void;
}

export const AiSettingsPage: React.FC<AiSettingsPageProps> = ({ 
  onClose,
  initialTab = 'ai',
  onLaunchOnboarding,
  currentUiMode,
  onSelectUiMode
}) => {
  const [mainTab, setMainTab] = useState<SettingsTabId>(initialTab);
  const [activeTab, setActiveTabState] = useState<'local' | 'cloud'>('local');
  // Model size, hardware profile, Ollama models and cloud keys live behind "Advanced"
  const [showAdvancedAi, setShowAdvancedAi] = useState(false);
  // Any click that needs an advanced section opens it too
  const setActiveTab = (tab: 'local' | 'cloud') => {
    setActiveTabState(tab);
    setShowAdvancedAi(true);
  };
  const embeddedModelName = EmbeddedEngineManager.RECOMMENDED_MODEL.displayName;
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [ollamaHealthy, setOllamaHealthy] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [pullProgress, setPullProgress] = useState<string>('');
  const [showEmbeddedModal, setShowEmbeddedModal] = useState(false);
  const [embeddedStatus, setEmbeddedStatus] = useState<EmbeddedStatus | null>(null);
  const [autoStart, setAutoStart] = useState<boolean>(() => localStorage.getItem('sentinel_autostart_ai') !== 'false');
  const [engineActionLoading, setEngineActionLoading] = useState(false);

  // Active AI Provider Selection State
  const [activeProviderId, setActiveProviderId] = useState<string>(() => ModelManager.getInstance().getActiveProviderId());
  const [activeModelInfo, setActiveModelInfo] = useState<ActiveModelInfo>(() => ModelManager.getInstance().getActiveModel());
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>('');

  // Recommendation Engine State
  const [recommendation, setRecommendation] = useState<TierRecommendationResult | null>(null);

  // Cloud API Key State
  const [cloudConfigs, setCloudConfigs] = useState<Record<CloudServiceId, CloudKeyConfig>>(() => CloudApiProvider.getInstance().getSavedConfigs());
  const [selectedCloudService, setSelectedCloudService] = useState<CloudServiceId>('groq');
  const [keyInput, setKeyInput] = useState<string>('');
  const [customUrlInput, setCustomUrlInput] = useState<string>('');
  const [customModelInput, setCustomModelInput] = useState<string>('');
  const [showKey, setShowKey] = useState<boolean>(false);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; latencyMs?: number; error?: string } | null>(null);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Desktop Integrations State
  const [integrationStatus, setIntegrationStatus] = useState<IntegrationStatus>({
    cliInstalled: false,
    finderEnabled: false,
    vscodeConfigured: false,
    cursorConfigured: false,
  });
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integrationMessage, setIntegrationMessage] = useState<string | null>(null);

  // Terminal Experience (UI Mode) State
  const [uiModeState, setUiModeState] = useState<'zen' | 'visual'>(() => {
    return currentUiMode || (localStorage.getItem('sentinel_ui_mode') as 'zen' | 'visual') || 'zen';
  });

  // General Tab Feedback State
  const [generalMessage, setGeneralMessage] = useState<string | null>(null);

  // Workflow HUD & Execution Notification Overlay State
  const [hudPlanEnabled, setHudPlanEnabled] = useState<boolean>(() => localStorage.getItem('sentinel_hud_plan_enabled') !== 'false');
  const [hudPlanDuration, setHudPlanDuration] = useState<string>(() => localStorage.getItem('sentinel_hud_plan_duration') || '8');

  const handleToggleHudPlan = (enabled: boolean) => {
    setHudPlanEnabled(enabled);
    localStorage.setItem('sentinel_hud_plan_enabled', String(enabled));
    window.dispatchEvent(new CustomEvent('sentinel:hud-settings-changed'));
  };

  const handleSelectHudDuration = (duration: string) => {
    setHudPlanDuration(duration);
    localStorage.setItem('sentinel_hud_plan_duration', duration);
    window.dispatchEvent(new CustomEvent('sentinel:hud-settings-changed'));
  };
  
  const manager = new OllamaModelManager();
  const cloudProvider = CloudApiProvider.getInstance();
  const installer = InstallerService.getInstance();

  const refreshActiveAiInfo = () => {
    const mm = ModelManager.getInstance();
    setActiveProviderId(mm.getActiveProviderId());
    setActiveModelInfo(mm.getActiveModel());
  };

  const handleSwitchActiveProvider = async (provId: string, modelId?: string) => {
    const mm = ModelManager.getInstance();
    await mm.setActiveProviderId(provId, modelId);
    refreshActiveAiInfo();
    const name = provId === 'embedded' ? `the built-in model (${EmbeddedEngineManager.RECOMMENDED_MODEL.displayName})` : provId === 'cloud_api' ? 'the cloud service' : `Ollama (${modelId || 'default'})`;
    setSaveSuccessMsg(`✓ Requests now use ${name}.`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
  };

  useEffect(() => {
    if (initialTab) {
      setMainTab(initialTab);
    }
  }, [initialTab]);

  useEffect(() => {
    if (currentUiMode) {
      setUiModeState(currentUiMode);
    }
  }, [currentUiMode]);

  useEffect(() => {
    checkHealthAndLoad();
    loadEmbeddedStatus();
    loadRecommendations();
    loadCloudConfigState(selectedCloudService);
    refreshIntegrations();
    refreshActiveAiInfo();

    const handleAiChanged = () => refreshActiveAiInfo();
    window.addEventListener('sentinel:ai-status-changed', handleAiChanged);
    return () => window.removeEventListener('sentinel:ai-status-changed', handleAiChanged);
  }, []);

  const refreshIntegrations = async () => {
    try {
      const cur = await installer.checkStatus();
      setIntegrationStatus(cur);
    } catch {
      // Non-fatal
    }
  };

  const formatIntegrationError = (err: any): string => {
    const msg = err?.message || String(err);
    if (msg.includes('invoke') || msg.includes('undefined')) {
      return 'Desktop integrations require the native Sentinel desktop runtime.';
    }
    return `Error: ${msg}`;
  };

  const handleInstallCli = async () => {
    setIntegrationLoading(true);
    try {
      const res = await installer.installCli();
      if (res.success) setIntegrationMessage('✓ Command line launcher installed in PATH!');
      else setIntegrationMessage(formatIntegrationError(res.error));
    } catch (err: any) {
      setIntegrationMessage(formatIntegrationError(err));
    }
    await refreshIntegrations();
    setIntegrationLoading(false);
  };

  const handleEnableFinder = async () => {
    setIntegrationLoading(true);
    try {
      const res = await installer.enableFinderIntegration();
      if (res.success) setIntegrationMessage(isLinux() ? '✓ Linux File Manager scripts registered!' : '✓ Finder Quick Actions registered!');
      else setIntegrationMessage(formatIntegrationError(res.error));
    } catch (err: any) {
      setIntegrationMessage(formatIntegrationError(err));
    }
    await refreshIntegrations();
    setIntegrationLoading(false);
  };

  const handleConfigureIdes = async () => {
    setIntegrationLoading(true);
    try {
      await installer.configureVsCodeIntegration();
      await installer.configureCursorIntegration();
      setIntegrationMessage('✓ VS Code and Cursor integrated terminal profiles configured!');
    } catch (err: any) {
      setIntegrationMessage(formatIntegrationError(err));
    }
    await refreshIntegrations();
    setIntegrationLoading(false);
  };

  const handleInstallAllIntegrations = async () => {
    setIntegrationLoading(true);
    setIntegrationMessage('Configuring desktop integrations...');
    try {
      await installer.installCli();
      await installer.enableFinderIntegration();
      await installer.configureVsCodeIntegration();
      await installer.configureCursorIntegration();
      await refreshIntegrations();
      setIntegrationMessage('✓ All desktop integrations successfully configured!');
    } catch (err: any) {
      setIntegrationMessage(formatIntegrationError(err));
    } finally {
      setIntegrationLoading(false);
    }
  };

  const handleSelectMode = (mode: 'zen' | 'visual') => {
    setUiModeState(mode);
    localStorage.setItem('sentinel_ui_mode', mode);
    if (onSelectUiMode) onSelectUiMode(mode);
    window.dispatchEvent(new CustomEvent('sentinel:ui-mode-changed', { detail: mode }));
  };

  const loadRecommendations = () => {
    const rec = ModelRecommendationEngine.getInstance().getRecommendation();
    setRecommendation(rec);
  };

  const loadCloudConfigState = (serviceId: CloudServiceId) => {
    const configs = cloudProvider.getSavedConfigs();
    setCloudConfigs(configs);
    const cfg = configs[serviceId];
    if (cfg) {
      setKeyInput(cfg.apiKey || '');
      setCustomUrlInput(cfg.baseUrl || CLOUD_CATALOG[serviceId].defaultUrl);
      setCustomModelInput(cfg.modelId || CLOUD_CATALOG[serviceId].defaultModel);
    }
    setTestResult(null);
    setSaveSuccessMsg(null);
  };

  const handleSelectCloudService = (serviceId: CloudServiceId) => {
    setSelectedCloudService(serviceId);
    loadCloudConfigState(serviceId);
  };

  const handleTestConnection = async () => {
    if (!keyInput.trim()) {
      setTestResult({ success: false, error: 'Please enter an API key first.' });
      return;
    }
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await cloudProvider.testConnection(
        selectedCloudService,
        keyInput.trim(),
        customUrlInput.trim() || undefined,
        customModelInput.trim() || undefined
      );
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, error: err?.message || 'Connection test failed' });
    } finally {
      setTestingConnection(false);
    }
  };

  const handleSaveCloudConfig = (setAsActive = true) => {
    const current = cloudConfigs[selectedCloudService];
    const updated: CloudKeyConfig = {
      ...current,
      serviceId: selectedCloudService,
      apiKey: keyInput.trim(),
      baseUrl: customUrlInput.trim() || undefined,
      modelId: customModelInput.trim() || undefined,
      isActive: setAsActive
    };

    // If setting active, deactivate other cloud keys
    if (setAsActive) {
      const all = cloudProvider.getSavedConfigs();
      for (const k of Object.keys(all) as CloudServiceId[]) {
        all[k].isActive = false;
      }
      all[selectedCloudService] = updated;
      cloudProvider.saveConfig(updated);
      setCloudConfigs(all);
      ModelManager.getInstance().setActiveProviderId('cloud_api', updated.modelId);
      refreshActiveAiInfo();
    } else {
      cloudProvider.saveConfig(updated);
      setCloudConfigs(cloudProvider.getSavedConfigs());
    }

    setSaveSuccessMsg(`✓ ${CLOUD_CATALOG[selectedCloudService].name} configuration saved${setAsActive ? ' & activated' : ''}!`);
    setTimeout(() => setSaveSuccessMsg(null), 3000);
    window.dispatchEvent(new CustomEvent('sentinel:ai-status-changed'));
  };

  const loadEmbeddedStatus = async () => {
    const s = await EmbeddedEngineManager.getInstance().getStatus();
    setEmbeddedStatus(s);
  };

  const handleToggleEngine = async () => {
    setEngineActionLoading(true);
    try {
      if (embeddedStatus?.isRunning) {
        await EmbeddedEngineManager.getInstance().stopEngine();
      } else {
        await EmbeddedEngineManager.getInstance().startEngine();
      }
      await loadEmbeddedStatus();
      window.dispatchEvent(new CustomEvent('sentinel:ai-status-changed'));
    } catch (e) {
      console.error(e);
    }
    setEngineActionLoading(false);
  };

  const checkHealthAndLoad = async () => {
    setLoading(true);
    const isHealthy = await manager.checkHealth();
    setOllamaHealthy(isHealthy);
    if (isHealthy) {
      const ms = await manager.listModels();
      setModels(ms);
    }
    setLoading(false);
  };

  const handlePullModel = async (model: string) => {
    setPulling(true);
    setPullProgress('Starting download...');
    try {
      await manager.pullModel(model, (progress: any) => {
        if (progress.status) {
          setPullProgress(progress.status);
        }
      });
      await checkHealthAndLoad();
    } catch (e: any) {
      setPullProgress(`Error: ${e.message}`);
    }
    setPulling(false);
  };

  return (
    <div style={{
      padding: '28px 24px',
      color: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
      height: '100%',
      overflowY: 'auto',
      backgroundColor: '#090b10',
      boxSizing: 'border-box'
    }}>
      <div style={{
        maxWidth: '960px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingBottom: '16px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff'
            }}>
              <Settings size={18} />
            </div>
            <div>
              <h1 style={{ fontSize: '17px', margin: 0, fontWeight: 600, color: '#ffffff', letterSpacing: '-0.2px' }}>
                Settings
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.55)' }}>
                AI, terminal and desktop options
              </p>
            </div>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '6px',
                color: 'rgba(255, 255, 255, 0.8)',
                fontSize: '12px',
                fontWeight: 500,
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                e.currentTarget.style.color = '#ffffff';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.06)';
                e.currentTarget.style.color = 'rgba(255, 255, 255, 0.8)';
              }}
            >
              <span>Close Settings</span>
              <span style={{
                fontSize: '10px',
                color: 'rgba(255, 255, 255, 0.4)',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                padding: '1px 5px',
                borderRadius: '4px'
              }}>
                ESC
              </span>
            </button>
          )}
        </div>

        {/* Primary Settings Navigation (4 Pillars) */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', paddingBottom: '10px' }}>
          <button
            type="button"
            onClick={() => setMainTab('ai')}
            style={{
              padding: '7px 16px',
              borderRadius: '7px',
              border: mainTab === 'ai' ? '1px solid rgba(255, 255, 255, 0.35)' : '1px solid transparent',
              backgroundColor: mainTab === 'ai' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: mainTab === 'ai' ? '#ffffff' : 'rgba(255, 255, 255, 0.55)',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              transition: 'all 0.15s ease'
            }}
          >
            <Cpu size={14} />
            <span>AI</span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab('integrations')}
            style={{
              padding: '7px 16px',
              borderRadius: '7px',
              border: mainTab === 'integrations' ? '1px solid rgba(255, 255, 255, 0.35)' : '1px solid transparent',
              backgroundColor: mainTab === 'integrations' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: mainTab === 'integrations' ? '#ffffff' : 'rgba(255, 255, 255, 0.55)',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              transition: 'all 0.15s ease'
            }}
          >
            <Layers size={14} />
            <span>Integrations</span>
            {integrationStatus.cliInstalled && (
              <span style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.7)'
              }} />
            )}
          </button>

          <button
            type="button"
            onClick={() => setMainTab('appearance')}
            style={{
              padding: '7px 16px',
              borderRadius: '7px',
              border: mainTab === 'appearance' ? '1px solid rgba(255, 255, 255, 0.35)' : '1px solid transparent',
              backgroundColor: mainTab === 'appearance' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: mainTab === 'appearance' ? '#ffffff' : 'rgba(255, 255, 255, 0.55)',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              transition: 'all 0.15s ease'
            }}
          >
            <Layout size={14} />
            <span>Terminal</span>
            <span style={{
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
              color: 'rgba(255, 255, 255, 0.4)',
              backgroundColor: 'rgba(255, 255, 255, 0.06)',
              padding: '1px 5px',
              borderRadius: '3px'
            }}>
              {uiModeState}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab('general')}
            style={{
              padding: '7px 16px',
              borderRadius: '7px',
              border: mainTab === 'general' ? '1px solid rgba(255, 255, 255, 0.35)' : '1px solid transparent',
              backgroundColor: mainTab === 'general' ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              color: mainTab === 'general' ? '#ffffff' : 'rgba(255, 255, 255, 0.55)',
              fontSize: '12.5px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '7px',
              transition: 'all 0.15s ease'
            }}
          >
            <Compass size={14} />
            <span>General</span>
          </button>
        </div>

        {/* TAB 1: AI MODELS & ARCHITECTURE */}
        {mainTab === 'ai' && (
          <>
            {/* PROMINENT ACTIVE AI MODEL & PROVIDER SELECTOR */}
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '12px',
              padding: '20px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={16} />
                    <h2 style={{ fontSize: '15px', fontWeight: 600, color: '#ffffff', margin: 0 }}>
                      Which AI answers your requests
                    </h2>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)' }}>
                    Used for requests typed after <code style={{ background: 'rgba(255, 255, 255, 0.08)', padding: '1px 5px', borderRadius: '3px' }}>&gt;</code> and for workflows.
                  </p>
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '5px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  color: '#ffffff'
                }}>
                  <Check size={13} strokeWidth={2.5} />
                  <span>{activeProviderId === 'embedded' ? `Built-in: ${embeddedModelName}` : activeProviderId === 'cloud_api' ? `Cloud: ${cloudProvider.getActiveConfig()?.displayName || 'service'}` : `Ollama: ${activeModelInfo.displayName || activeModelInfo.modelId}`}</span>
                </div>
              </div>

              {/* 3-Column Provider Selector */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                {/* Option 1: Embedded Engine */}
                <div
                  onClick={() => handleSwitchActiveProvider('embedded', 'sentinel-embedded')}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: activeProviderId === 'embedded' ? '1.5px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: activeProviderId === 'embedded' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                    boxShadow: activeProviderId === 'embedded' ? '0 0 0 1px #ffffff' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '10px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Cpu size={14} />
                        <span style={{ fontWeight: 600, fontSize: '13px', color: '#ffffff' }}>
                          Built-in model
                        </span>
                      </div>
                      {activeProviderId === 'embedded' && (
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px', background: '#ffffff', color: '#090b10' }}>
                          Active
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.6)', lineHeight: 1.4 }}>
                      {embeddedModelName}, running on this computer. Private, works offline, no account.
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '10.5px' }}>
                    <span style={{ color: embeddedStatus?.modelDownloaded ? '#ffffff' : 'rgba(255, 255, 255, 0.5)' }}>
                      {embeddedStatus?.modelDownloaded ? (embeddedStatus.isRunning ? '● Running' : '✓ Ready') : '○ Not downloaded'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setShowEmbeddedModal(true); }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(255, 255, 255, 0.8)',
                        fontSize: '10.5px',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline'
                      }}
                    >
                      Manage
                    </button>
                  </div>
                </div>

                {/* Option 2: Local Ollama */}
                <div
                  onClick={() => {
                    const targetModel = selectedOllamaModel || (models.length > 0 ? models[0].name : 'qwen2.5-coder:3b');
                    handleSwitchActiveProvider('ollama', targetModel);
                  }}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: activeProviderId === 'ollama' ? '1.5px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: activeProviderId === 'ollama' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                    boxShadow: activeProviderId === 'ollama' ? '0 0 0 1px #ffffff' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '10px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Server size={14} />
                        <span style={{ fontWeight: 600, fontSize: '13px', color: '#ffffff' }}>
                          Ollama
                        </span>
                      </div>
                      {activeProviderId === 'ollama' && (
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px', background: '#ffffff', color: '#090b10' }}>
                          Active
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.6)', lineHeight: 1.4 }}>
                      Use models you already run with Ollama on this computer.
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '10.5px' }}>
                      <span style={{ color: ollamaHealthy ? '#ffffff' : 'rgba(255, 255, 255, 0.45)' }}>
                        {ollamaHealthy ? `● Running (${models.length} models)` : '○ Not running'}
                      </span>
                    </div>
                    {models.length > 0 && (
                      <select
                        value={activeProviderId === 'ollama' ? (activeModelInfo.modelId || models[0].name) : (selectedOllamaModel || models[0].name)}
                        onChange={(e) => {
                          e.stopPropagation();
                          setSelectedOllamaModel(e.target.value);
                          handleSwitchActiveProvider('ollama', e.target.value);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          width: '100%',
                          padding: '3px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(0, 0, 0, 0.5)',
                          border: '1px solid rgba(255, 255, 255, 0.15)',
                          color: '#ffffff',
                          fontSize: '11px',
                          fontFamily: 'monospace'
                        }}
                      >
                        {models.map(m => (
                          <option key={m.name} value={m.name} style={{ backgroundColor: '#090b10', color: '#ffffff' }}>
                            {m.name} {m.size ? `(${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB)` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>

                {/* Option 3: Cloud API Provider */}
                <div
                  onClick={() => {
                    const cfg = cloudProvider.getActiveConfig();
                    if (cfg) {
                      handleSwitchActiveProvider('cloud_api', cfg.modelId);
                    } else {
                      setActiveTab('cloud');
                    }
                  }}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '10px',
                    border: activeProviderId === 'cloud_api' ? '1.5px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.1)',
                    backgroundColor: activeProviderId === 'cloud_api' ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.02)',
                    boxShadow: activeProviderId === 'cloud_api' ? '0 0 0 1px #ffffff' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    gap: '10px',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Key size={14} />
                        <span style={{ fontWeight: 600, fontSize: '13px', color: '#ffffff' }}>
                          Cloud service
                        </span>
                      </div>
                      {activeProviderId === 'cloud_api' && (
                        <span style={{ fontSize: '10px', fontWeight: 600, padding: '1px 6px', borderRadius: '4px', background: '#ffffff', color: '#090b10' }}>
                          Active
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.6)', lineHeight: 1.4 }}>
                      Groq, OpenAI, Anthropic, DeepSeek or OpenRouter with your API key. Uses no local memory.
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '10.5px' }}>
                    <span style={{ color: cloudProvider.getActiveConfig() ? '#ffffff' : 'rgba(255, 255, 255, 0.5)' }}>
                      {cloudProvider.getActiveConfig() ? `✓ ${cloudProvider.getActiveConfig()?.displayName || 'Configured'}` : '○ No key yet'}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setActiveTab('cloud'); }}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'rgba(255, 255, 255, 0.8)',
                        fontSize: '10.5px',
                        cursor: 'pointer',
                        padding: 0,
                        textDecoration: 'underline'
                      }}
                    >
                      Add key
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvancedAi(v => !v)}
              aria-expanded={showAdvancedAi}
              style={{
                alignSelf: 'flex-start',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                color: 'rgba(255, 255, 255, 0.8)',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              <Layers size={13} />
              <span>{showAdvancedAi ? 'Hide advanced options' : 'Advanced: model size, hardware, cloud keys'}</span>
            </button>

            {showAdvancedAi && (<>
            {/* Secondary Navigation Tabs for AI */}
            <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)', paddingBottom: '8px' }}>
              <button
                type="button"
                onClick={() => setActiveTab('local')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: activeTab === 'local' ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid transparent',
                  backgroundColor: activeTab === 'local' ? 'rgba(255, 255, 255, 0.07)' : 'transparent',
                  color: activeTab === 'local' ? '#ffffff' : 'rgba(255, 255, 255, 0.55)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <Cpu size={13} />
                <span>Model size & hardware</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('cloud')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: activeTab === 'cloud' ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid transparent',
                  backgroundColor: activeTab === 'cloud' ? 'rgba(255, 255, 255, 0.07)' : 'transparent',
                  color: activeTab === 'cloud' ? '#ffffff' : 'rgba(255, 255, 255, 0.55)',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  transition: 'all 0.15s ease'
                }}
              >
                <Key size={13} />
                <span>Cloud keys</span>
                {cloudProvider.getActiveConfig() && (
                  <span style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#ffffff'
                  }} />
                )}
              </button>
            </div>

        {/* TAB 1: LOCAL HARDWARE & LOCAL MODELS */}
        {activeTab === 'local' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* System Hardware & Recommendation Card */}
            {recommendation && (
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '10px',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Zap size={15} color="#ffffff" />
                    <span style={{ fontWeight: 600, fontSize: '13.5px', color: '#ffffff' }}>
                      System Hardware Profile: {recommendation.detectedRamGb}GB RAM · {recommendation.detectedCores} CPU Cores
                    </span>
                    {recommendation.gpuSummary && (
                      <span style={{
                        fontSize: '11px',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        border: '1px solid rgba(255, 255, 255, 0.14)',
                        color: 'rgba(255, 255, 255, 0.9)'
                      }}>
                        {recommendation.gpuSummary}
                      </span>
                    )}
                  </div>
                  <span style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '3px 8px',
                    borderRadius: '5px',
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    color: '#ffffff'
                  }}>
                    {recommendation.tierLabel}
                  </span>
                </div>

                <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.5 }}>
                  {recommendation.summaryRationale}
                </p>

                {/* Recommended models for this tier */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '2px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.55)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Recommended Models for Your System:
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '10px' }}>
                    {recommendation.recommendedModels.map((m) => (
                      <div
                        key={m.id}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '8px',
                          backgroundColor: 'rgba(255, 255, 255, 0.025)',
                          border: m.isDefault ? '1px solid rgba(255, 255, 255, 0.3)' : '1px solid rgba(255, 255, 255, 0.08)',
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '12.5px', color: '#ffffff' }}>
                            {m.name}
                          </span>
                          {m.isDefault && (
                            <span style={{ fontSize: '9.5px', padding: '1px 5px', borderRadius: '3px', backgroundColor: 'rgba(255, 255, 255, 0.12)', color: '#ffffff' }}>
                              Optimal
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.5)' }}>
                          RAM needed: ~{m.ramRequiredGb}GB · {m.parameterCount} ({m.quantization})
                        </div>
                        <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.35 }}>
                          {m.bestFor}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
                          <button
                            onClick={() => handlePullModel(m.id)}
                            disabled={pulling}
                            style={{
                              padding: '4px 10px',
                              borderRadius: '5px',
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              backgroundColor: 'rgba(255, 255, 255, 0.06)',
                              color: '#ffffff',
                              fontSize: '11px',
                              fontWeight: 500,
                              cursor: pulling ? 'not-allowed' : 'pointer',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px'
                            }}
                          >
                            <Download size={11} />
                            <span>Download ({m.parameterCount})</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Embedded Native AI Card */}
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '18px 20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '20px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <Sparkles size={15} style={{ color: '#ffffff' }} />
                    <h2 style={{ margin: 0, fontSize: '14.5px', fontWeight: 600, color: '#ffffff' }}>
                      Sentinel Embedded In-Process AI Engine
                    </h2>
                    <span style={{
                      fontSize: '10.5px',
                      padding: '2px 7px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: 'rgba(255, 255, 255, 0.85)'
                    }}>
                      Standalone Native Sidecar
                    </span>
                  </div>
                  <p style={{ margin: '4px 0 14px', fontSize: '12.5px', color: 'rgba(255, 255, 255, 0.6)', lineHeight: 1.5 }}>
                    Runs local models in-process without external daemons. Fully private, zero cloud data transfer.
                  </p>

                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '18px', fontSize: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span style={{ color: 'rgba(255, 255, 255, 0.45)' }}>Status:</span>
                      <span style={{ color: '#ffffff', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{
                          width: '6px',
                          height: '6px',
                          borderRadius: '50%',
                          backgroundColor: embeddedStatus?.isRunning ? '#22c55e' : 'rgba(255, 255, 255, 0.3)'
                        }} />
                        {embeddedStatus?.isRunning ? (embeddedStatus?.isCpuFallback ? 'Running (CPU)' : 'Running (GPU)') : (embeddedStatus?.modelDownloaded ? 'Ready (Stopped)' : 'Download Required')}
                      </span>
                    </div>

                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', userSelect: 'none' }}>
                      <input 
                        type="checkbox"
                        checked={autoStart}
                        onChange={(e) => {
                          const val = e.target.checked;
                          setAutoStart(val);
                          localStorage.setItem('sentinel_autostart_ai', String(val));
                        }}
                        style={{ accentColor: '#ffffff', cursor: 'pointer' }}
                      />
                      <span style={{ color: 'rgba(255, 255, 255, 0.65)' }}>Auto-start on boot</span>
                    </label>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                  {embeddedStatus?.modelDownloaded && (
                    <button
                      onClick={handleToggleEngine}
                      disabled={engineActionLoading}
                      style={{
                        padding: '7px 14px',
                        backgroundColor: 'rgba(255, 255, 255, 0.08)',
                        color: '#ffffff',
                        border: '1px solid rgba(255, 255, 255, 0.16)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 500,
                        cursor: engineActionLoading ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {engineActionLoading ? 'Wait...' : (embeddedStatus?.isRunning ? 'Stop Engine' : 'Start Engine')}
                    </button>
                  )}

                  <button
                    onClick={() => setShowEmbeddedModal(true)}
                    style={{
                      padding: '7px 14px',
                      backgroundColor: 'rgba(255, 255, 255, 0.08)',
                      color: '#ffffff',
                      border: '1px solid rgba(255, 255, 255, 0.16)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 500,
                      cursor: 'pointer'
                    }}
                  >
                    Manage Engine Models
                  </button>
                </div>
              </div>
            </div>

            {/* External Ollama Server Card */}
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '18px 20px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Server size={15} style={{ color: 'rgba(255, 255, 255, 0.7)' }} />
                  <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                    External Ollama Daemon (http://localhost:11434)
                  </h3>
                </div>
                <span style={{
                  fontSize: '11px',
                  padding: '2px 7px',
                  borderRadius: '4px',
                  backgroundColor: ollamaHealthy ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.06)',
                  color: ollamaHealthy ? '#4ade80' : 'rgba(255, 255, 255, 0.5)',
                  border: `1px solid ${ollamaHealthy ? 'rgba(34, 197, 94, 0.3)' : 'rgba(255, 255, 255, 0.1)'}`
                }}>
                  {ollamaHealthy ? '● Online' : '○ Offline'}
                </span>
              </div>

              {pullProgress && (
                <div style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(255, 255, 255, 0.05)', fontSize: '12px', color: '#ffffff', marginBottom: '10px' }}>
                  {pullProgress}
                </div>
              )}

              {models.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {models.map(m => (
                    <span key={m.name} style={{ padding: '3px 8px', borderRadius: '5px', backgroundColor: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', fontSize: '11.5px', color: '#ffffff' }}>
                      {m.name}
                    </span>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.45)' }}>
                  {ollamaHealthy ? 'No models installed in external Ollama.' : 'External Ollama is not running. Sentinel will use the embedded engine or configured cloud API keys.'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: CLOUD API KEYS & EXTERNAL PROVIDERS */}
        {activeTab === 'cloud' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Explanatory Header */}
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '10px',
              padding: '16px 20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Globe size={15} color="#ffffff" />
                <span style={{ fontWeight: 600, fontSize: '13.5px', color: '#ffffff' }}>
                  Cloud Model Providers (Zero Local Resource Footprint)
                </span>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', lineHeight: 1.5 }}>
                Offload LLM inference to high-speed cloud providers (OpenAI, Anthropic, Groq, DeepSeek). Local CPU and RAM usage drop to 0% during command reasoning.
              </p>
            </div>

            {/* Provider Selector Strip */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {(Object.keys(CLOUD_CATALOG) as CloudServiceId[]).map((serviceId) => {
                const isSel = selectedCloudService === serviceId;
                const isAct = cloudConfigs[serviceId]?.isActive;
                return (
                  <button
                    key={serviceId}
                    onClick={() => handleSelectCloudService(serviceId)}
                    style={{
                      padding: '8px 14px',
                      borderRadius: '7px',
                      border: isSel ? '1px solid rgba(255, 255, 255, 0.45)' : '1px solid rgba(255, 255, 255, 0.1)',
                      backgroundColor: isSel ? 'rgba(255, 255, 255, 0.09)' : 'rgba(255, 255, 255, 0.025)',
                      color: isSel ? '#ffffff' : 'rgba(255, 255, 255, 0.7)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <span>{CLOUD_CATALOG[serviceId].name}</span>
                    {isAct && (
                      <span style={{
                        padding: '1px 5px',
                        borderRadius: '3px',
                        backgroundColor: '#ffffff',
                        color: '#0a0a0c',
                        fontSize: '9px',
                        fontWeight: 700
                      }}>
                        ACTIVE
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected Provider Form */}
            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '10px',
              padding: '20px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 600, fontSize: '14px', color: '#ffffff' }}>
                  {CLOUD_CATALOG[selectedCloudService].name} Configuration
                </span>
                {cloudConfigs[selectedCloudService]?.isActive && (
                  <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.8)', backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                    Currently Active AI Engine
                  </span>
                )}
              </div>

              {/* API Key Input */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 500 }}>
                  API Key:
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <div style={{
                    position: 'relative',
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={keyInput}
                      onChange={(e) => setKeyInput(e.target.value)}
                      placeholder={`Enter ${CLOUD_CATALOG[selectedCloudService].name} API Key...`}
                      style={{
                        width: '100%',
                        padding: '8px 36px 8px 12px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.14)',
                        color: '#ffffff',
                        fontSize: '12.5px',
                        outline: 'none',
                        fontFamily: 'ui-monospace, monospace'
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      style={{
                        position: 'absolute',
                        right: '8px',
                        background: 'none',
                        border: 'none',
                        color: 'rgba(255, 255, 255, 0.5)',
                        cursor: 'pointer',
                        padding: '4px'
                      }}
                    >
                      {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Custom URL and Model inputs for Custom/Advanced */}
              {selectedCloudService === 'custom' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 500 }}>
                      Endpoint Base URL:
                    </label>
                    <input
                      type="text"
                      value={customUrlInput}
                      onChange={(e) => setCustomUrlInput(e.target.value)}
                      placeholder="https://integrate.api.nvidia.com/v1"
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.14)',
                        color: '#ffffff',
                        fontSize: '12px',
                        outline: 'none'
                      }}
                    />
                    <span style={{ fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.4)' }}>
                      e.g. https://integrate.api.nvidia.com/v1 (Sentinel automatically appends /chat/completions)
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.6)', fontWeight: 500 }}>
                      Model Identifier:
                    </label>
                    <input
                      type="text"
                      value={customModelInput}
                      onChange={(e) => setCustomModelInput(e.target.value)}
                      placeholder="e.g. nvidia/nemotron-3-ultra-550b-a55b"
                      style={{
                        padding: '8px 12px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(255, 255, 255, 0.04)',
                        border: '1px solid rgba(255, 255, 255, 0.14)',
                        color: '#ffffff',
                        fontSize: '12px',
                        outline: 'none'
                      }}
                    />
                    <span style={{ fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.4)' }}>
                      Exact model name from your provider catalog
                    </span>
                  </div>
                </div>
              )}

              {/* Feedback messages */}
              {testResult && (
                <div style={{
                  padding: '9px 12px',
                  borderRadius: '6px',
                  backgroundColor: testResult.success ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                  border: `1px solid ${testResult.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                  color: testResult.success ? '#86efac' : '#fca5a5',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}>
                  {testResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                  <span>
                    {testResult.success ? `✓ Connection verified successfully (${testResult.latencyMs}ms latency)` : `Error: ${testResult.error}`}
                  </span>
                </div>
              )}

              {saveSuccessMsg && (
                <div style={{ padding: '8px 12px', borderRadius: '6px', backgroundColor: 'rgba(255, 255, 255, 0.08)', color: '#ffffff', fontSize: '12px' }}>
                  {saveSuccessMsg}
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '6px' }}>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testingConnection || !keyInput.trim()}
                  style={{
                    padding: '7px 14px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.18)',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    color: '#ffffff',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: (testingConnection || !keyInput.trim()) ? 'not-allowed' : 'pointer',
                    opacity: (testingConnection || !keyInput.trim()) ? 0.5 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {testingConnection ? (
                    <>
                      <RefreshCw size={13} style={{ animation: 'spin 0.9s linear infinite' }} />
                      <span>Verifying Connection...</span>
                    </>
                  ) : (
                    <span>Test Connection</span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveCloudConfig(true)}
                  disabled={!keyInput.trim()}
                  style={{
                    padding: '7px 18px',
                    borderRadius: '6px',
                    border: '1px solid #ffffff',
                    backgroundColor: '#ffffff',
                    color: '#0a0a0c',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: !keyInput.trim() ? 'not-allowed' : 'pointer',
                    opacity: !keyInput.trim() ? 0.5 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Check size={13} />
                  <span>Save & Activate Provider</span>
                </button>
              </div>
            </div>
          </div>
        )}
            </>)}
          </>
        )}

        {/* TAB 2: DESKTOP & SYSTEM INTEGRATIONS */}
        {mainTab === 'integrations' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#ffffff' }}>
                  Native Desktop & Shell Integrations
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', lineHeight: 1.45 }}>
                  Integrate Sentinel Terminal deeply with your operating system, terminal launchers, file managers, and IDEs.
                </div>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={refreshIntegrations}
                  disabled={integrationLoading}
                  style={{
                    padding: '7px 12px',
                    borderRadius: '6px',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    color: 'rgba(255, 255, 255, 0.8)',
                    fontSize: '11.5px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  <RefreshCw size={12} className={integrationLoading ? 'spin' : ''} />
                  <span>Refresh</span>
                </button>

                <button
                  type="button"
                  onClick={handleInstallAllIntegrations}
                  disabled={integrationLoading}
                  style={{
                    padding: '7px 16px',
                    borderRadius: '6px',
                    border: '1px solid #ffffff',
                    backgroundColor: '#ffffff',
                    color: '#090b10',
                    fontSize: '11.5px',
                    fontWeight: 600,
                    cursor: integrationLoading ? 'not-allowed' : 'pointer',
                    opacity: integrationLoading ? 0.6 : 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px'
                  }}
                >
                  <Check size={13} />
                  <span>Configure All Integrations</span>
                </button>
              </div>
            </div>

            {integrationMessage && (() => {
              const isErr = integrationMessage.startsWith('Error') || integrationMessage.includes('require the native');
              return (
                <div style={{
                  padding: '11px 16px',
                  borderRadius: '8px',
                  backgroundColor: isErr ? 'rgba(239, 68, 68, 0.08)' : 'rgba(34, 197, 94, 0.08)',
                  border: isErr ? '1px solid rgba(239, 68, 68, 0.25)' : '1px solid rgba(34, 197, 94, 0.25)',
                  color: isErr ? '#fca5a5' : '#86efac',
                  fontSize: '12.5px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  {isErr ? <AlertCircle size={14} /> : <Check size={14} />}
                  <span>{integrationMessage}</span>
                </div>
              );
            })()}

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '16px'
            }}>
              {/* Box 1: CLI Launcher */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '18px 20px',
                backgroundColor: 'rgba(255, 255, 255, 0.025)',
                border: '1px solid rgba(255, 255, 255, 0.09)',
                borderRadius: '12px',
                minHeight: '200px',
                boxSizing: 'border-box'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '7px',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      flexShrink: 0
                    }}>
                      <Terminal size={15} />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#ffffff', lineHeight: 1.3 }}>
                      Command Line Launcher (<code style={{ fontSize: '11.5px', background: 'rgba(255, 255, 255, 0.08)', padding: '1px 5px', borderRadius: '4px' }}>sentinel</code>)
                    </div>
                  </div>

                  <div style={{ fontSize: '11.8px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.5 }}>
                    Installs a user-space launcher into your PATH. Enables launching Sentinel from any terminal prompt, bash/zsh script, or application launcher (Rofi, Wofi, dmenu) via <code style={{ fontSize: '11px', color: '#ffffff', background: 'rgba(255, 255, 255, 0.08)', padding: '2px 5px', borderRadius: '3px' }}>sentinel &lt;path&gt;</code>.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '10px',
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontFamily: 'ui-monospace, monospace',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    padding: '4px 8px',
                    borderRadius: '5px',
                    overflow: 'hidden'
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{isLinux() ? '~/.local/bin/sentinel' : '/usr/local/bin/sentinel'}</span>
                    <span>•</span>
                    <span style={{ color: 'rgba(255, 255, 255, 0.75)', flexShrink: 0 }}>User Space</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleInstallCli}
                    disabled={integrationLoading}
                    style={{
                      padding: '5px 14px',
                      borderRadius: '6px',
                      border: integrationStatus.cliInstalled ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid rgba(255, 255, 255, 0.18)',
                      backgroundColor: integrationStatus.cliInstalled ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.04)',
                      color: integrationStatus.cliInstalled ? '#ffffff' : 'rgba(255, 255, 255, 0.9)',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      flexShrink: 0
                    }}
                  >
                    {integrationStatus.cliInstalled ? 'Reinstall' : 'Install'}
                  </button>
                </div>
              </div>

              {/* Box 2: File Manager Context Actions */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '18px 20px',
                backgroundColor: 'rgba(255, 255, 255, 0.025)',
                border: '1px solid rgba(255, 255, 255, 0.09)',
                borderRadius: '12px',
                minHeight: '200px',
                boxSizing: 'border-box'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '7px',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      flexShrink: 0
                    }}>
                      <Folder size={15} />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#ffffff', lineHeight: 1.3 }}>
                      {isLinux() ? 'Linux File Manager Scripts' : 'Finder Quick Actions'}
                    </div>
                  </div>

                  <div style={{ fontSize: '11.8px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.5 }}>
                    {isLinux()
                      ? 'Adds "Open in Sentinel Terminal" to right-click context menus in Nautilus, Nemo, and Caja, plus XDG .desktop application directory registration.'
                      : 'Registers a native macOS Finder service workflow allowing you to right-click any folder or directory and immediately open Sentinel.'}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '10px',
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontFamily: 'ui-monospace, monospace',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    padding: '4px 8px',
                    borderRadius: '5px',
                    overflow: 'hidden'
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isLinux() ? '~/.local/share/nautilus/scripts' : '~/Library/Services'}
                    </span>
                    <span>•</span>
                    <span style={{ color: 'rgba(255, 255, 255, 0.75)', flexShrink: 0 }}>Context Menu</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleEnableFinder}
                    disabled={integrationLoading}
                    style={{
                      padding: '5px 14px',
                      borderRadius: '6px',
                      border: integrationStatus.finderEnabled ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid rgba(255, 255, 255, 0.18)',
                      backgroundColor: integrationStatus.finderEnabled ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.04)',
                      color: integrationStatus.finderEnabled ? '#ffffff' : 'rgba(255, 255, 255, 0.9)',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      flexShrink: 0
                    }}
                  >
                    {integrationStatus.finderEnabled ? 'Enabled' : 'Enable'}
                  </button>
                </div>
              </div>

              {/* Box 3: VS Code & Cursor IDE Profiles */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '18px 20px',
                backgroundColor: 'rgba(255, 255, 255, 0.025)',
                border: '1px solid rgba(255, 255, 255, 0.09)',
                borderRadius: '12px',
                minHeight: '200px',
                boxSizing: 'border-box'
              }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                    <div style={{
                      width: '30px',
                      height: '30px',
                      borderRadius: '7px',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      flexShrink: 0
                    }}>
                      <Code2 size={15} />
                    </div>
                    <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#ffffff', lineHeight: 1.3 }}>
                      VS Code & Cursor Profiles
                    </div>
                  </div>

                  <div style={{ fontSize: '11.8px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.5 }}>
                    Updates your user <code style={{ fontSize: '11px', color: '#ffffff', background: 'rgba(255, 255, 255, 0.08)', padding: '2px 5px', borderRadius: '3px' }}>settings.json</code> to register Sentinel as an integrated terminal profile, allowing one-click launching inside editor panels.
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', paddingTop: '8px', borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '10px',
                    color: 'rgba(255, 255, 255, 0.5)',
                    fontFamily: 'ui-monospace, monospace',
                    backgroundColor: 'rgba(0, 0, 0, 0.3)',
                    padding: '4px 8px',
                    borderRadius: '5px',
                    overflow: 'hidden'
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {isLinux() ? '~/.config/Code/User' : 'Application Support/Code'}
                    </span>
                    <span>•</span>
                    <span style={{ color: 'rgba(255, 255, 255, 0.75)', flexShrink: 0 }}>IDE Profile</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleConfigureIdes}
                    disabled={integrationLoading}
                    style={{
                      padding: '5px 14px',
                      borderRadius: '6px',
                      border: (integrationStatus.vscodeConfigured && integrationStatus.cursorConfigured) ? '1px solid rgba(255, 255, 255, 0.25)' : '1px solid rgba(255, 255, 255, 0.18)',
                      backgroundColor: (integrationStatus.vscodeConfigured && integrationStatus.cursorConfigured) ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.04)',
                      color: (integrationStatus.vscodeConfigured && integrationStatus.cursorConfigured) ? '#ffffff' : 'rgba(255, 255, 255, 0.9)',
                      fontSize: '11.5px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      flexShrink: 0
                    }}
                  >
                    {(integrationStatus.vscodeConfigured && integrationStatus.cursorConfigured) ? 'Configured' : 'Configure'}
                  </button>
                </div>
              </div>
            </div>

            {/* Zero Root Box */}
            <div style={{
              padding: '14px 18px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}>
              <Info size={16} style={{ color: 'rgba(255, 255, 255, 0.5)', marginTop: '2px', flexShrink: 0 }} />
              <div style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.5 }}>
                <strong style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Zero Root Privileges Required:</strong> All Sentinel integrations write strictly to standard user-space directories (<code style={{ color: '#ffffff', backgroundColor: 'rgba(255, 255, 255, 0.07)', padding: '1px 4px', borderRadius: '3px' }}>~/.local/bin</code>, <code style={{ color: '#ffffff', backgroundColor: 'rgba(255, 255, 255, 0.07)', padding: '1px 4px', borderRadius: '3px' }}>~/.local/share/nautilus/scripts</code>, and <code style={{ color: '#ffffff', backgroundColor: 'rgba(255, 255, 255, 0.07)', padding: '1px 4px', borderRadius: '3px' }}>~/.config/Code/User</code>). No root or sudo credentials are ever requested or modified.
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TERMINAL EXPERIENCE & APPEARANCE */}
        {mainTab === 'appearance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '14px', color: '#ffffff' }}>
                  Terminal Experience & Control Density
                </div>
                <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.55)', marginTop: '2px' }}>
                  Choose how action buttons, headers, and window controls are presented during sessions.
                </div>
              </div>
              <div style={{
                fontSize: '11.5px',
                color: 'rgba(255, 255, 255, 0.55)',
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '5px 10px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span>Quick Toggle:</span>
                <kbd style={{ padding: '2px 6px', borderRadius: '4px', background: 'rgba(255, 255, 255, 0.1)', color: '#ffffff', fontSize: '10.5px' }}>Ctrl+Shift+Z</kbd>
              </div>
            </div>

            {/* Zen vs Visual Mode Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Zen Mode Card */}
              <div
                onClick={() => handleSelectMode('zen')}
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  backgroundColor: uiModeState === 'zen' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.015)',
                  border: uiModeState === 'zen' ? '1.5px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: uiModeState === 'zen' ? '0 0 0 1px #ffffff, 0 14px 36px rgba(0, 0, 0, 0.75)' : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  width: '100%',
                  aspectRatio: '16 / 9',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  backgroundColor: '#05070a',
                  overflow: 'hidden'
                }}>
                  <img
                    src="/previews/zen_mode_preview.png"
                    alt="Zen Mode Preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        border: uiModeState === 'zen' ? '1.5px solid #ffffff' : '1.5px solid rgba(255, 255, 255, 0.3)',
                        backgroundColor: uiModeState === 'zen' ? '#ffffff' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {uiModeState === 'zen' && (
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#0a0a0c' }} />
                        )}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: '14px', color: '#ffffff' }}>
                        Zen Mode
                      </span>
                      {uiModeState === 'zen' && (
                        <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)', backgroundColor: 'rgba(255, 255, 255, 0.08)', padding: '1px 6px', borderRadius: '4px' }}>
                          Active
                        </span>
                      )}
                    </div>

                    <span style={{
                      fontSize: '10.5px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(255, 255, 255, 0.12)',
                      color: '#ffffff',
                      border: '1px solid rgba(255, 255, 255, 0.2)'
                    }}>
                      Recommended
                    </span>
                  </div>

                  <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.5, paddingLeft: '24px' }}>
                    Distraction-free focus with auto-hiding chrome. Action buttons stay hidden until top header hover. Full multi-pane, tab & AI support.
                  </span>
                </div>
              </div>

              {/* Visual Mode Card */}
              <div
                onClick={() => handleSelectMode('visual')}
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  backgroundColor: uiModeState === 'visual' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.015)',
                  border: uiModeState === 'visual' ? '1.5px solid #ffffff' : '1px solid rgba(255, 255, 255, 0.1)',
                  boxShadow: uiModeState === 'visual' ? '0 0 0 1px #ffffff, 0 14px 36px rgba(0, 0, 0, 0.75)' : 'none',
                  cursor: 'pointer',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                  transition: 'all 0.15s ease'
                }}
              >
                <div style={{
                  width: '100%',
                  aspectRatio: '16 / 9',
                  borderRadius: '8px',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  backgroundColor: '#05070a',
                  overflow: 'hidden'
                }}>
                  <img
                    src="/previews/visual_mode_preview.png"
                    alt="Visual Mode Preview"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                  />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <div style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '50%',
                        border: uiModeState === 'visual' ? '1.5px solid #ffffff' : '1.5px solid rgba(255, 255, 255, 0.3)',
                        backgroundColor: uiModeState === 'visual' ? '#ffffff' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        {uiModeState === 'visual' && (
                          <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#0a0a0c' }} />
                        )}
                      </div>
                      <span style={{ fontWeight: 600, fontSize: '14px', color: '#ffffff' }}>
                        Visual Mode
                      </span>
                      {uiModeState === 'visual' && (
                        <span style={{ fontSize: '10px', color: 'rgba(255, 255, 255, 0.6)', backgroundColor: 'rgba(255, 255, 255, 0.08)', padding: '1px 6px', borderRadius: '4px' }}>
                          Active
                        </span>
                      )}
                    </div>

                    <span style={{
                      fontSize: '10.5px',
                      fontWeight: 500,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      color: 'rgba(255, 255, 255, 0.65)',
                      border: '1px solid rgba(255, 255, 255, 0.12)'
                    }}>
                      Classic Controls
                    </span>
                  </div>

                  <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.5, paddingLeft: '24px' }}>
                    Traditional GUI workflow with persistent controls. Action buttons stay always visible for splits, tabs, and workflows. Full multi-pane, tab & AI support.
                  </span>
                </div>
              </div>
            </div>

            {/* Feature parity callout */}
            <div style={{
              padding: '14px 18px',
              borderRadius: '8px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.07)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px'
            }}>
              <ShieldCheck size={16} style={{ color: 'rgba(255, 255, 255, 0.7)', marginTop: '2px', flexShrink: 0 }} />
              <div style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.5 }}>
                <strong style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Full Feature Parity:</strong> Both modes share 100% of features including arbitrary horizontal & vertical splits (<code style={{ color: '#ffffff', backgroundColor: 'rgba(255, 255, 255, 0.07)', padding: '1px 4px', borderRadius: '3px' }}>Cmd+D</code> / <code style={{ color: '#ffffff', backgroundColor: 'rgba(255, 255, 255, 0.07)', padding: '1px 4px', borderRadius: '3px' }}>Cmd+Shift+D</code>), workflow recording, command history search (<code style={{ color: '#ffffff', backgroundColor: 'rgba(255, 255, 255, 0.07)', padding: '1px 4px', borderRadius: '3px' }}>Ctrl+R</code>), and local/cloud AI agents.
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: GENERAL & ONBOARDING */}
        {mainTab === 'general' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* Onboarding Wizard Launcher Card */}
            <div style={{
              padding: '18px 20px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '20px'
            }}>
              <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  flexShrink: 0
                }}>
                  <Compass size={18} />
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#ffffff' }}>
                    Setup & Onboarding Wizard
                  </div>
                  <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '3px', lineHeight: 1.45 }}>
                    Re-run the initial welcome setup wizard to reconfigure experience profiles and desktop integrations with interactive previews.
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (onLaunchOnboarding) {
                    onLaunchOnboarding();
                  } else {
                    if (onClose) onClose();
                    window.dispatchEvent(new CustomEvent('sentinel:open-onboarding'));
                  }
                }}
                style={{
                  padding: '8px 18px',
                  borderRadius: '6px',
                  border: '1px solid #ffffff',
                  backgroundColor: '#ffffff',
                  color: '#090b10',
                  fontSize: '12px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <ExternalLink size={13} />
                <span>Launch Wizard</span>
              </button>
            </div>

            {/* Workflow Execution Plan HUD & Notifications Card */}
            <div style={{
              padding: '18px 20px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(255, 255, 255, 0.06)',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    flexShrink: 0
                  }}>
                    <Layers size={18} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#ffffff' }}>
                      Workflow Execution Plan HUD & Notifications
                    </div>
                    <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', marginTop: '3px', lineHeight: 1.45 }}>
                      Controls the real-time floating execution plan HUD overlay in the terminal during multi-step AI workflows.
                    </div>
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}>
                  <input
                    type="checkbox"
                    checked={hudPlanEnabled}
                    onChange={(e) => handleToggleHudPlan(e.target.checked)}
                    style={{ accentColor: '#ffffff', cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                  <span style={{ fontSize: '12px', color: hudPlanEnabled ? '#ffffff' : 'rgba(255, 255, 255, 0.5)', fontWeight: 500 }}>
                    {hudPlanEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>

              {hudPlanEnabled && (
                <div style={{
                  padding: '12px 14px',
                  borderRadius: '8px',
                  backgroundColor: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '10px'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', fontWeight: 500, color: 'rgba(255, 255, 255, 0.9)' }}>
                      Auto-Dismiss Duration
                    </span>
                    <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.45)' }}>
                      Hovering cursor over HUD pauses dismissal
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {[
                      { id: '5', label: '5 Seconds' },
                      { id: '8', label: '8 Seconds (Default)' },
                      { id: '15', label: '15 Seconds' },
                      { id: 'persistent', label: 'Persistent (Manual Close Only)' }
                    ].map(opt => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelectHudDuration(opt.id)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: hudPlanDuration === opt.id ? '1px solid rgba(255, 255, 255, 0.35)' : '1px solid rgba(255, 255, 255, 0.08)',
                          backgroundColor: hudPlanDuration === opt.id ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.02)',
                          color: hudPlanDuration === opt.id ? '#ffffff' : 'rgba(255, 255, 255, 0.6)',
                          fontSize: '11.5px',
                          fontWeight: hudPlanDuration === opt.id ? 600 : 400,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Environment Diagnostics Card */}
            <div style={{
              padding: '18px 20px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.025)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px'
            }}>
              <div style={{ fontWeight: 600, fontSize: '13.5px', color: '#ffffff' }}>
                System Environment & Shell Diagnostics
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                fontSize: '12px'
              }}>
                <div style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px'
                }}>
                  <span style={{ fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase' }}>Target Platform</span>
                  <span style={{ fontWeight: 500, color: '#ffffff' }}>{isLinux() ? 'Linux (XDG / Freedesktop Standard)' : 'macOS (Darwin / Cocoa)'}</span>
                </div>

                <div style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px'
                }}>
                  <span style={{ fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase' }}>Active Shell</span>
                  <span style={{ fontWeight: 500, color: '#ffffff', fontFamily: 'monospace' }}>
                    {typeof process !== 'undefined' && process.env?.SHELL ? process.env.SHELL : '/bin/bash'}
                  </span>
                </div>

                <div style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px'
                }}>
                  <span style={{ fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase' }}>Configuration Directory</span>
                  <span style={{ fontWeight: 500, color: '#ffffff', fontFamily: 'monospace' }}>
                    {isLinux() ? '~/.config/sentinel/' : '~/Library/Application Support/Sentinel Terminal/'}
                  </span>
                </div>

                <div style={{
                  padding: '10px 14px',
                  borderRadius: '6px',
                  backgroundColor: 'rgba(0, 0, 0, 0.3)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '3px'
                }}>
                  <span style={{ fontSize: '10.5px', color: 'rgba(255, 255, 255, 0.45)', textTransform: 'uppercase' }}>CLI Launcher Target</span>
                  <span style={{ fontWeight: 500, color: '#ffffff', fontFamily: 'monospace' }}>
                    {isLinux() ? '~/.local/bin/sentinel' : '/usr/local/bin/sentinel'}
                  </span>
                </div>
              </div>
            </div>

            {/* Reset Preferences Card */}
            <div style={{
              padding: '16px 20px',
              borderRadius: '10px',
              backgroundColor: 'rgba(255, 255, 255, 0.015)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: '13px', color: 'rgba(255, 255, 255, 0.9)' }}>
                  Reset First-Run Flags
                </div>
                <div style={{ fontSize: '11.5px', color: 'rgba(255, 255, 255, 0.5)', marginTop: '2px' }}>
                  Causes the welcome setup wizard and help callouts to trigger on the next application launch.
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem('sentinel_onboarded');
                  localStorage.removeItem('sentinel_zen_tip_shown');
                  setGeneralMessage('✓ First-run flags cleared. Onboarding will trigger on next restart.');
                  setTimeout(() => setGeneralMessage(null), 3500);
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  color: 'rgba(255, 255, 255, 0.85)',
                  fontSize: '11.5px',
                  fontWeight: 500,
                  cursor: 'pointer'
                }}
              >
                Reset Flags
              </button>
            </div>

            {generalMessage && (
              <div style={{
                padding: '11px 16px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                color: '#ffffff',
                fontSize: '12px'
              }}>
                {generalMessage}
              </div>
            )}
          </div>
        )}

      </div>

      {showEmbeddedModal && (
        <EmbeddedModelManagerModal
          isOpen={showEmbeddedModal}
          onClose={() => {
            setShowEmbeddedModal(false);
            loadEmbeddedStatus();
          }}
        />
      )}
    </div>
  );
};

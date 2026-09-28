import React, { useState, useEffect } from 'react';
import { 
  GitBranch, 
  Play, 
  RefreshCw, 
  X, 
  Trash2, 
  ChevronDown, 
  ChevronUp, 
  ArrowUp, 
  ArrowDown, 
  CheckCircle2, 
  AlertCircle, 
  Terminal, 
  Cpu, 
  Layers, 
  ShieldCheck, 
  Sliders,
  Search
} from 'lucide-react';
import { DiskWorkflowStorage } from '../../workflows/storage/DiskWorkflowStorage';
import { SavedWorkflowDefinition, WorkflowStepDefinition } from '../../workflows/models/WorkflowTypes';
import { DeterministicReplayEngine, ReplayExecutionResult } from '../../workflows/engine/DeterministicReplayEngine';
import { getRecommendedStarterWorkflowIds } from '../../workflows/templates/StarterWorkflows';

export interface WorkflowManagerDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onRunInTerminal?: (command: string) => void;
}

export const WorkflowManagerDrawer: React.FC<WorkflowManagerDrawerProps> = ({
  isOpen,
  onClose,
  onRunInTerminal
}) => {
  const [workflows, setWorkflows] = useState<SavedWorkflowDefinition[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [expandedWf, setExpandedWf] = useState<string | null>(null);
  const [activeReplayWf, setActiveReplayWf] = useState<string | null>(null);
  const [replayParams, setReplayParams] = useState<Record<string, string>>({});
  const [isDryRun, setIsDryRun] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [replayResult, setReplayResult] = useState<ReplayExecutionResult | null>(null);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [workflowToDelete, setWorkflowToDelete] = useState<string | null>(null);
  const [testStubsDetected, setTestStubsDetected] = useState<boolean>(false);

  const fetchWorkflows = async () => {
    setIsLoading(true);
    try {
      const storage = DiskWorkflowStorage.getInstance();
      const list = await storage.listWorkflows();
      // Sort newest first
      list.sort((a, b) => b.updatedAt - a.updatedAt);
      setWorkflows(list);

      const KNOWN_TEST_STUBS = new Set([
        'desktop-reset', 'db-sync', 'dev-boot', 'release-gate',
        'dry-run-pipeline', 'param-test-workflow', 'test-port-replay',
        'cargo-build-flow', 'cargo-build', 'curl-check-pipeline',
        'deploy-service', 'get-date', 'get-time-wf', 'my-ci-pipeline',
        'my-scoped-pipeline', 'scoped-pipeline', 'productive'
      ]);
      const hasStubs = list.some(w => 
        KNOWN_TEST_STUBS.has(w.name.toLowerCase()) || 
        !w.steps || w.steps.length === 0 || 
        w.description?.includes('Auto-recorded workflow for task')
      );
      setTestStubsDetected(hasStubs);
    } catch {
      // ignore
    } finally {
      setIsLoading(false);
    }
  };

  const handleCleanTestStubs = async () => {
    setIsLoading(true);
    try {
      const storage = DiskWorkflowStorage.getInstance();
      const purged = await storage.purgeTestStubs();
      showToast(`✓ Removed ${purged.length} test stubs.`);
      await fetchWorkflows();
    } catch (err: any) {
      showToast(err?.message || 'Failed to purge test stubs', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSeedStarterWorkflows = async () => {
    setIsLoading(true);
    try {
      const storage = DiskWorkflowStorage.getInstance();
      await storage.initializeStarterWorkflows(getRecommendedStarterWorkflowIds(), false);
      showToast('✓ Seeded curated starter workflows!');
      await fetchWorkflows();
    } catch (err: any) {
      showToast(err?.message || 'Failed to seed starter workflows', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setFeedbackMsg(null);
      setReplayResult(null);
      setActiveStepIndex(null);
      setSearchFilter('');
      setWorkflowToDelete(null);
      fetchWorkflows();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!workflowToDelete) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setWorkflowToDelete(null);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        handleConfirmDelete();
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [workflowToDelete]);

  const filteredWorkflows = workflows.filter(wf => {
    if (!searchFilter.trim()) return true;
    const query = searchFilter.toLowerCase();
    return (
      wf.name.toLowerCase().includes(query) ||
      (wf.description && wf.description.toLowerCase().includes(query)) ||
      (wf.tags && wf.tags.some(t => t.toLowerCase().includes(query)))
    );
  });

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setFeedbackMsg({ text, type });
    setTimeout(() => setFeedbackMsg(null), 3500);
  };

  const handleDelete = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setWorkflowToDelete(name);
  };

  const handleConfirmDelete = async () => {
    if (!workflowToDelete) return;
    const name = workflowToDelete;
    setWorkflowToDelete(null);
    try {
      const storage = DiskWorkflowStorage.getInstance();
      const ok = await storage.deleteWorkflow(name);
      if (ok) {
        showToast(`Workflow "${name}" deleted.`);
        if (expandedWf === name) setExpandedWf(null);
        if (activeReplayWf === name) setActiveReplayWf(null);
        await fetchWorkflows();
      } else {
        showToast(`Failed to delete "${name}".`, 'error');
      }
    } catch {
      showToast(`Error deleting workflow "${name}".`, 'error');
    }
  };

  const handleMoveStep = async (wf: SavedWorkflowDefinition, index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= wf.steps.length) return;

    const newSteps = [...wf.steps];
    const temp = newSteps[index];
    newSteps[index] = newSteps[targetIndex];
    newSteps[targetIndex] = temp;

    const updatedWf: SavedWorkflowDefinition = {
      ...wf,
      steps: newSteps,
      updatedAt: Date.now()
    };

    try {
      const storage = DiskWorkflowStorage.getInstance();
      await storage.saveWorkflow(updatedWf);
      await fetchWorkflows();
      showToast(`Step order updated for "${wf.name}".`);
    } catch {
      showToast(`Failed to update step order.`, 'error');
    }
  };

  const handleStartReplay = (wf: SavedWorkflowDefinition, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setActiveReplayWf(wf.name);
    setReplayResult(null);
    setActiveStepIndex(null);

    // Initialize parameters with default values
    const initialParams: Record<string, string> = {};
    if (wf.parameters) {
      wf.parameters.forEach(p => {
        initialParams[p.name] = p.defaultValue !== undefined ? String(p.defaultValue) : '';
      });
    }
    setReplayParams(initialParams);
  };

  const handleExecuteReplay = async (wf: SavedWorkflowDefinition) => {
    // Run in the focused terminal: its confirmation dialog and step output are visible there,
    // and steps start in that terminal's folder
    if (onRunInTerminal) {
      const flagStr = Object.entries(replayParams).filter(([, v]) => v !== '').map(([k, v]) => `--${k.toLowerCase()}=${v}`).join(' ');
      onRunInTerminal(`run workflow ${wf.name} ${flagStr}${isDryRun ? ' --dry-run' : ''}`.trim());
      return;
    }
    setIsExecuting(true);
    setReplayResult(null);
    setActiveStepIndex(0);

    try {
      const engine = DeterministicReplayEngine.getInstance();
      const result = await engine.replay(wf.name, {
        parameters: replayParams,
        dryRun: isDryRun,
        // Do not halt on sensitive steps: the default executor asks for consent per step
        autoApprove: true,
        onStepStart: (_step, idx) => {
          setActiveStepIndex(idx);
        },
        onStepDone: (_step, _res) => {
          // step finished
        }
      });

      setReplayResult(result);
      if (result.success) {
        showToast(`Executed ${result.stepsExecuted} steps with 0 AI tokens!`);
      } else {
        showToast(`Workflow execution failed at step: ${result.error}`, 'error');
      }
    } catch (err: any) {
      showToast(err?.message || 'Error replaying workflow', 'error');
    } finally {
      setIsExecuting(false);
      setActiveStepIndex(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        justifyContent: 'flex-end',
        zIndex: 99990
      }}
    >
      <div 
        onClick={e => e.stopPropagation()}
        style={{
          width: '520px',
          maxWidth: '94vw',
          height: '100%',
          backgroundColor: 'rgba(18, 20, 25, 0.98)',
          borderLeft: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '-16px 0 48px rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          color: '#f8fafc',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 18px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
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
              <GitBranch size={14} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '13px', fontWeight: 500, color: '#ffffff' }}>
                Workflow & Macro Manager
              </h2>
              <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.38)', marginTop: '1px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>Deterministic Zero-Token Automation</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {testStubsDetected && (
              <button
                onClick={handleCleanTestStubs}
                title="Purge obsolete test and benchmark stubs"
                disabled={isLoading}
                style={{
                  background: 'rgba(255, 255, 255, 0.08)',
                  border: '1px solid rgba(255, 255, 255, 0.16)',
                  borderRadius: '5px',
                  padding: '4px 8px',
                  color: '#ffffff',
                  fontSize: '11px',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Trash2 size={11} />
                <span>Clean Stubs</span>
              </button>
            )}
            <button
              onClick={handleSeedStarterWorkflows}
              title="Seed curated starter workflows"
              disabled={isLoading}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.09)',
                borderRadius: '5px',
                padding: '4px 8px',
                color: 'rgba(255, 255, 255, 0.8)',
                fontSize: '11px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Play size={11} />
              <span>Seed Starters</span>
            </button>
            <button
              onClick={fetchWorkflows}
              title="Refresh workflows"
              disabled={isLoading}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '5px',
                padding: '4px 8px',
                color: 'rgba(255, 255, 255, 0.6)',
                fontSize: '11px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <RefreshCw size={11} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
              <span>Refresh</span>
            </button>
            <span 
              onClick={onClose}
              style={{
                fontSize: '11px',
                color: 'rgba(255, 255, 255, 0.4)',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '2px 7px',
                borderRadius: '5px',
                cursor: 'pointer'
              }}
            >
              ESC to close
            </span>
          </div>
        </div>

        {/* Feedback Alert Toast */}
        {feedbackMsg && (
          <div style={{
            padding: '10px 16px',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            color: '#ffffff',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            {feedbackMsg.type === 'success' ? <CheckCircle2 size={14} style={{ color: '#ffffff' }} /> : <AlertCircle size={14} style={{ color: 'rgba(255, 255, 255, 0.75)' }} />}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Test Stubs Detected Banner */}
        {testStubsDetected && (
          <div style={{
            margin: '10px 16px 0 16px',
            padding: '8px 12px',
            borderRadius: '6px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            fontSize: '11.5px',
            color: 'rgba(255, 255, 255, 0.75)'
          }}>
            <span>Test and benchmark stubs detected in workspace</span>
            <button
              onClick={handleCleanTestStubs}
              disabled={isLoading}
              style={{
                padding: '3px 9px',
                borderRadius: '4px',
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                color: '#ffffff',
                fontSize: '11px',
                fontWeight: 500,
                cursor: isLoading ? 'not-allowed' : 'pointer'
              }}
            >
              Clean Test Stubs
            </button>
          </div>
        )}

        {/* Search / Filter Bar */}
        <div style={{
          padding: '12px 16px 4px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}>
          <div style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '8px',
            padding: '7px 12px'
          }}>
            <Search size={14} style={{ color: 'rgba(255, 255, 255, 0.4)', flexShrink: 0 }} />
            <input
              type="text"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              placeholder="Search workflows by name, tag, or description..."
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: '#f8fafc',
                fontSize: '12px',
                outline: 'none',
                minWidth: 0
              }}
            />
            {searchFilter && (
              <button
                onClick={() => setSearchFilter('')}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'rgba(255, 255, 255, 0.4)',
                  cursor: 'pointer',
                  padding: '2px',
                  display: 'flex',
                  alignItems: 'center',
                  flexShrink: 0
                }}
              >
                <X size={13} />
              </button>
            )}
          </div>
          {workflows.length > 0 && (
            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.35)', whiteSpace: 'nowrap', flexShrink: 0 }}>
              {filteredWorkflows.length} / {workflows.length}
            </span>
          )}
        </div>

        {/* Workflows List */}
        <div style={{ 
          flex: 1, 
          minHeight: 0, 
          overflowY: 'auto', 
          padding: '12px 16px 16px 16px', 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '10px' 
        }}>
          {filteredWorkflows.length === 0 && !isLoading ? (
            <div style={{
              textAlign: 'center',
              padding: '44px 20px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              borderRadius: '10px',
              border: '1px dashed rgba(255, 255, 255, 0.08)'
            }}>
              <Layers size={32} style={{ color: 'rgba(255, 255, 255, 0.35)', margin: '0 auto 12px' }} />
              <div style={{ fontSize: '13px', fontWeight: 500, color: '#ffffff', marginBottom: '6px' }}>
                {searchFilter ? `No workflows match "${searchFilter}"` : 'No Saved Workflows Yet'}
              </div>
              <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.45)', lineHeight: 1.5, maxWidth: '320px', margin: '0 auto' }}>
                {searchFilter ? (
                  <button
                    onClick={() => setSearchFilter('')}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.12)',
                      color: '#ffffff',
                      padding: '4px 12px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                      marginTop: '8px'
                    }}
                  >
                    Clear Filter
                  </button>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', marginTop: '6px' }}>
                    <span>Record recent actions using <code style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)', border: '1px solid rgba(255, 255, 255, 0.08)', padding: '2px 5px', borderRadius: '4px', color: 'rgba(255, 255, 255, 0.8)' }}>&gt;save workflow &lt;name&gt;</code> in the terminal, or seed curated starters.</span>
                    <button
                      onClick={handleSeedStarterWorkflows}
                      disabled={isLoading}
                      style={{
                        padding: '6px 14px',
                        borderRadius: '6px',
                        backgroundColor: '#ffffff',
                        color: '#090b10',
                        border: '1px solid #ffffff',
                        fontSize: '11.5px',
                        fontWeight: 600,
                        cursor: isLoading ? 'not-allowed' : 'pointer',
                        transition: 'opacity 0.15s ease'
                      }}
                      onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
                      onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
                    >
                      Seed Curated Starter Workflows
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            filteredWorkflows.map(wf => {
              const isExpanded = expandedWf === wf.name;
              const isReplayingThis = activeReplayWf === wf.name;

              return (
                <div 
                  key={wf.name}
                  style={{
                    flexShrink: 0,
                    backgroundColor: 'rgba(255, 255, 255, 0.025)',
                    border: isReplayingThis ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(255, 255, 255, 0.07)',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    transition: 'border-color 0.15s ease',
                    boxShadow: 'none'
                  }}
                >
                  {/* Item Header */}
                  <div 
                    onClick={() => setExpandedWf(isExpanded ? null : wf.name)}
                    style={{
                      padding: '12px 14px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      justifyContent: 'space-between',
                      userSelect: 'none'
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: '#ffffff' }}>
                          {wf.name}
                        </span>
                        <span style={{
                          fontSize: '11px',
                          padding: '1px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(255, 255, 255, 0.04)',
                          color: 'rgba(255, 255, 255, 0.5)',
                          border: '1px solid rgba(255, 255, 255, 0.07)'
                        }}>
                          {wf.steps.length} {wf.steps.length === 1 ? 'step' : 'steps'}
                        </span>
                        {wf.tags?.map(t => (
                          <span 
                            key={t}
                            style={{
                              fontSize: '10px',
                              padding: '1px 6px',
                              borderRadius: '4px',
                              backgroundColor: 'rgba(255, 255, 255, 0.04)',
                              color: 'rgba(255, 255, 255, 0.55)',
                              border: '1px solid rgba(255, 255, 255, 0.08)'
                            }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                      <div style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.45)', marginTop: '4px' }}>
                        {wf.description || 'No description provided'}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={(e) => handleStartReplay(wf, e)}
                        title="Run deterministic replay"
                        style={{
                          background: 'rgba(255, 255, 255, 0.08)',
                          border: '1px solid rgba(255, 255, 255, 0.14)',
                          borderRadius: '6px',
                          padding: '5px 10px',
                          color: '#ffffff',
                          fontSize: '12px',
                          fontWeight: 500,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px',
                          boxShadow: 'none',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.13)';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.22)';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.14)';
                        }}
                      >
                        <Play size={11} fill="#ffffff" />
                        <span>Run</span>
                      </button>
                      <button
                        onClick={(e) => handleDelete(wf.name, e)}
                        title="Delete workflow"
                        style={{
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          borderRadius: '6px',
                          padding: '6px',
                          color: 'rgba(255, 255, 255, 0.45)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={e => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                          e.currentTarget.style.color = '#ffffff';
                        }}
                        onMouseLeave={e => {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                          e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                          e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)';
                        }}
                      >
                        <Trash2 size={13} />
                      </button>
                      <div style={{ color: 'rgba(255, 255, 255, 0.4)', marginLeft: '4px', display: 'flex', alignItems: 'center' }}>
                        {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                      </div>
                    </div>
                  </div>

                  {/* Replay Console (when active for this workflow) */}
                  {isReplayingThis && (
                    <div style={{
                      padding: '14px',
                      backgroundColor: 'rgba(0, 0, 0, 0.35)',
                      borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                      borderBottom: isExpanded ? '1px solid rgba(255, 255, 255, 0.08)' : 'none'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.85)' }}>
                          <Sliders size={13} style={{ color: 'rgba(255, 255, 255, 0.6)' }} />
                          <span>Replay Execution Settings</span>
                        </div>
                        <button
                          onClick={() => setActiveReplayWf(null)}
                          style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'rgba(255, 255, 255, 0.4)',
                            cursor: 'pointer',
                            padding: '2px'
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>

                      {/* Parameters Form */}
                      {wf.parameters && wf.parameters.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '12px' }}>
                          <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Parameters & Overrides:
                          </div>
                          {wf.parameters.map(param => (
                            <div key={param.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.75)', width: '120px', fontFamily: 'monospace' }}>
                                {param.name}:
                              </span>
                              <input 
                                type="text"
                                value={replayParams[param.name] ?? (param.defaultValue !== undefined ? String(param.defaultValue) : '')}
                                onChange={e => setReplayParams({ ...replayParams, [param.name]: e.target.value })}
                                placeholder={param.description || (param.defaultValue !== undefined ? String(param.defaultValue) : 'value')}
                                style={{
                                  flex: 1,
                                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                                  border: '1px solid rgba(255, 255, 255, 0.08)',
                                  borderRadius: '5px',
                                  padding: '5px 8px',
                                  color: '#f8fafc',
                                  fontSize: '12px',
                                  fontFamily: 'monospace',
                                  outline: 'none'
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Dry-run Toggle & Action Buttons */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)', cursor: 'pointer' }}>
                          <input 
                            type="checkbox" 
                            checked={isDryRun} 
                            onChange={e => setIsDryRun(e.target.checked)}
                            style={{ cursor: 'pointer' }}
                          />
                          <span>Dry Run (Simulate without side-effects)</span>
                        </label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          {onRunInTerminal && (
                            <button
                              onClick={() => {
                                const flagStr = Object.entries(replayParams)
                                  .filter(([_, v]) => v)
                                  .map(([k, v]) => `--${k.toLowerCase()}=${v}`)
                                  .join(' ');
                                onRunInTerminal(`run workflow ${wf.name} ${flagStr}`.trim());
                                onClose();
                              }}
                              style={{
                                background: 'rgba(255, 255, 255, 0.06)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '6px',
                                padding: '6px 10px',
                                color: 'rgba(255, 255, 255, 0.8)',
                                fontSize: '12px',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                transition: 'all 0.15s ease'
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.06)';
                              }}
                            >
                              <Terminal size={13} />
                              <span>To Terminal</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleExecuteReplay(wf)}
                            disabled={isExecuting}
                            style={{
                              background: 'rgba(255, 255, 255, 0.12)',
                              border: '1px solid rgba(255, 255, 255, 0.18)',
                              borderRadius: '6px',
                              padding: '6px 14px',
                              color: '#fff',
                              fontSize: '12px',
                              fontWeight: 500,
                              cursor: isExecuting ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              boxShadow: 'none',
                              transition: 'all 0.15s ease'
                            }}
                            onMouseEnter={e => {
                              if (!isExecuting) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.18)';
                              }
                            }}
                            onMouseLeave={e => {
                              if (!isExecuting) {
                                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.12)';
                              }
                            }}
                          >
                            <Play size={11} fill="#fff" />
                            <span>{isExecuting ? 'Replaying...' : 'Execute Now'}</span>
                          </button>
                        </div>
                      </div>

                      {/* Replay Output Card */}
                      {replayResult && (
                        <div style={{
                          marginTop: '12px',
                          padding: '10px 12px',
                          borderRadius: '6px',
                          backgroundColor: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(255, 255, 255, 0.08)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <span style={{ 
                              fontSize: '12px', 
                              fontWeight: 600, 
                              color: replayResult.success ? '#ffffff' : 'rgba(255, 255, 255, 0.85)',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px'
                            }}>
                              {replayResult.success ? <CheckCircle2 size={13} style={{ color: 'rgba(255, 255, 255, 0.75)' }} /> : <AlertCircle size={13} style={{ color: 'rgba(255, 255, 255, 0.65)' }} />}
                              <span>{replayResult.success ? 'Replay Completed' : 'Replay Failed'}</span>
                            </span>
                            <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)' }}>
                              Duration: {replayResult.durationMs.toFixed(0)}ms
                            </span>
                          </div>

                          <div style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.65)', lineHeight: 1.4 }}>
                            {replayResult.success
                              ? `Executed ${replayResult.stepsExecuted} of ${replayResult.totalSteps} steps with zero AI inference tokens.`
                              : (replayResult.error || 'Execution halted.')}
                          </div>

                          {/* Step-by-step breakdown */}
                          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {replayResult.stepResults.map((sr, idx) => (
                              <div key={idx} style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                fontSize: '11px',
                                fontFamily: 'monospace',
                                padding: '4px 6px',
                                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                                borderRadius: '4px'
                              }}>
                                <span style={{ color: sr.status === 'completed' ? '#ffffff' : (sr.status === 'skipped_dry_run' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(255, 255, 255, 0.85)') }}>
                                  [{idx + 1}] {sr.name} ({sr.durationMs.toFixed(0)}ms)
                                </span>
                                <span style={{ color: 'rgba(255, 255, 255, 0.4)' }}>{sr.status}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Expanded Step Inspector */}
                  {isExpanded && (
                    <div style={{
                      padding: '14px',
                      backgroundColor: 'rgba(0, 0, 0, 0.25)',
                      borderTop: '1px solid rgba(255, 255, 255, 0.06)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', fontWeight: 600, color: 'rgba(255, 255, 255, 0.4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          Workflow Pipeline Steps:
                        </span>
                        {wf.environmentPrerequisites && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {wf.environmentPrerequisites.requiredPorts?.map(p => (
                              <span key={p} style={{ fontSize: '10px', background: 'rgba(255, 255, 255, 0.04)', color: 'rgba(255, 255, 255, 0.55)', border: '1px solid rgba(255, 255, 255, 0.07)', padding: '1px 5px', borderRadius: '3px' }}>
                                port:{p}
                              </span>
                            ))}
                            {wf.environmentPrerequisites.requiredBinaries?.map(b => (
                              <span key={b} style={{ fontSize: '10px', background: 'rgba(255, 255, 255, 0.04)', color: 'rgba(255, 255, 255, 0.55)', border: '1px solid rgba(255, 255, 255, 0.07)', padding: '1px 5px', borderRadius: '3px' }}>
                                bin:{b}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {wf.steps.map((step, idx) => (
                        <div 
                          key={step.id || idx}
                          style={{
                            padding: '10px',
                            backgroundColor: 'rgba(255, 255, 255, 0.02)',
                            border: '1px solid rgba(255, 255, 255, 0.05)',
                            borderRadius: '6px',
                            display: 'flex',
                            alignItems: 'flex-start',
                            justifyContent: 'space-between',
                            gap: '10px'
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                              <span style={{
                                width: '18px',
                                height: '18px',
                                borderRadius: '50%',
                                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                color: 'rgba(255, 255, 255, 0.8)',
                                fontSize: '10px',
                                fontWeight: 600,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                              }}>
                                {idx + 1}
                              </span>
                              <span style={{ fontSize: '12px', fontWeight: 500, color: '#ffffff' }}>
                                {step.name}
                              </span>
                              {step.isDestructive && (
                                <span style={{ fontSize: '10px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.08)', color: 'rgba(255, 255, 255, 0.5)', padding: '1px 5px', borderRadius: '3px' }}>
                                  Destructive
                                </span>
                              )}
                            </div>
                            <div style={{
                              fontFamily: 'monospace',
                              fontSize: '11px',
                              backgroundColor: 'rgba(0, 0, 0, 0.4)',
                              border: '1px solid rgba(255, 255, 255, 0.05)',
                              padding: '5px 8px',
                              borderRadius: '4px',
                              color: 'rgba(255, 255, 255, 0.85)',
                              overflowX: 'auto',
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-all'
                            }}>
                              {step.command}
                            </div>
                          </div>

                          {/* Reorder Buttons */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                            <button
                              onClick={() => handleMoveStep(wf, idx, 'up')}
                              disabled={idx === 0}
                              title="Move step up"
                              style={{
                                background: 'rgba(255, 255, 255, 0.04)',
                                border: '1px solid rgba(255, 255, 255, 0.07)',
                                borderRadius: '4px',
                                padding: '3px',
                                color: idx === 0 ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.6)',
                                cursor: idx === 0 ? 'not-allowed' : 'pointer'
                              }}
                            >
                              <ArrowUp size={12} />
                            </button>
                            <button
                              onClick={() => handleMoveStep(wf, idx, 'down')}
                              disabled={idx === wf.steps.length - 1}
                              title="Move step down"
                              style={{
                                background: 'rgba(255, 255, 255, 0.04)',
                                border: '1px solid rgba(255, 255, 255, 0.07)',
                                borderRadius: '4px',
                                padding: '3px',
                                color: idx === wf.steps.length - 1 ? 'rgba(255, 255, 255, 0.2)' : 'rgba(255, 255, 255, 0.6)',
                                cursor: idx === wf.steps.length - 1 ? 'not-allowed' : 'pointer'
                              }}
                            >
                              <ArrowDown size={12} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer Info */}
        <div style={{
          padding: '9px 16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.06)',
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '11px',
          color: 'rgba(255, 255, 255, 0.4)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ShieldCheck size={13} style={{ color: 'rgba(255, 255, 255, 0.55)' }} />
            <span>AST Verified</span>
          </div>
          <span style={{ fontFamily: 'ui-monospace, monospace' }}>~/.sentinel/workflows/</span>
        </div>

        {/* Custom Grayscale Delete Confirmation Modal */}
        {workflowToDelete && (
          <div
            onClick={() => setWorkflowToDelete(null)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100000,
              padding: '16px'
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                width: '420px',
                maxWidth: '92vw',
                backgroundColor: 'rgba(18, 20, 25, 0.98)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                borderRadius: '12px',
                boxShadow: '0 24px 64px rgba(0, 0, 0, 0.85), 0 0 0 1px rgba(255, 255, 255, 0.06)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              <div style={{
                padding: '16px 20px',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Trash2 size={16} style={{ color: '#ffffff' }} />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#ffffff' }}>
                    Delete Workflow
                  </span>
                </div>
                <button
                  onClick={() => setWorkflowToDelete(null)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: 'rgba(255, 255, 255, 0.45)',
                    cursor: 'pointer',
                    padding: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    borderRadius: '4px'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = '#ffffff'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255, 255, 255, 0.45)'; }}
                >
                  <X size={15} />
                </button>
              </div>

              <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <p style={{ margin: 0, fontSize: '13px', lineHeight: '1.5', color: 'rgba(255, 255, 255, 0.75)' }}>
                  Are you sure you want to delete workflow <span style={{ fontFamily: 'ui-monospace, monospace', color: '#ffffff', fontWeight: 600, backgroundColor: 'rgba(255, 255, 255, 0.08)', padding: '2px 6px', borderRadius: '4px' }}>"{workflowToDelete}"</span>?
                </p>
                <p style={{ margin: 0, fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)' }}>
                  This action cannot be undone. All AST steps, macro bindings, and replay history for this workflow will be permanently removed.
                </p>
              </div>

              <div style={{
                padding: '12px 20px',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: 'rgba(0, 0, 0, 0.25)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: '10px'
              }}>
                <button
                  onClick={() => setWorkflowToDelete(null)}
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: 'rgba(255, 255, 255, 0.8)',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'; }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmDelete}
                  style={{
                    background: 'rgba(255, 255, 255, 0.16)',
                    border: '1px solid rgba(255, 255, 255, 0.25)',
                    color: '#ffffff',
                    borderRadius: '6px',
                    padding: '6px 14px',
                    fontSize: '12px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
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
                  <Trash2 size={13} />
                  <span>Delete Workflow</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

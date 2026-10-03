import React, { useState, useEffect } from 'react';
import { 
  Puzzle, 
  Search, 
  X, 
  Download, 
  Trash2, 
  Check, 
  Boxes, 
  Bot, 
  Container, 
  GitBranch, 
  Cloud, 
  Palette 
} from 'lucide-react';
import { MarketplacePlugin, PluginMarketplaceCatalog } from '../../plugins/marketplace/PluginMarketplaceCatalog';

export interface PluginMarketplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PluginMarketplaceModal: React.FC<PluginMarketplaceModalProps> = ({
  isOpen,
  onClose
}) => {
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [plugins, setPlugins] = useState<MarketplacePlugin[]>([]);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  const categories = ['All', 'DevOps', 'Robotics', 'Developer', 'Cloud', 'System Rice'];

  const reloadPlugins = () => {
    const list = PluginMarketplaceCatalog.getInstance().search(query, selectedCategory);
    setPlugins(list);
  };

  const getPluginIcon = (icon: string) => {
    switch (icon) {
      case 'k8s': return <Boxes size={24} color="#38bdf8" />;
      case 'ros': return <Bot size={24} color="#fb923c" />;
      case 'docker': return <Container size={24} color="#38bdf8" />;
      case 'git': return <GitBranch size={24} color="#4ade80" />;
      case 'cloud': return <Cloud size={24} color="#facc15" />;
      case 'palette': return <Palette size={24} color="#c084fc" />;
      default: return <Puzzle size={24} color="#a855f7" />;
    }
  };

  useEffect(() => {
    if (isOpen) {
      reloadPlugins();
    }
  }, [isOpen, query, selectedCategory]);

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

  const handleInstall = (id: string, name: string) => {
    PluginMarketplaceCatalog.getInstance().install(id);
    reloadPlugins();
    setActionFeedback(`Installed ${name}!`);
    setTimeout(() => setActionFeedback(null), 2500);
  };

  const handleUninstall = (id: string, name: string) => {
    PluginMarketplaceCatalog.getInstance().uninstall(id);
    reloadPlugins();
    setActionFeedback(`Uninstalled ${name}.`);
    setTimeout(() => setActionFeedback(null), 2500);
  };

  const handleToggle = (id: string) => {
    PluginMarketplaceCatalog.getInstance().toggle(id);
    reloadPlugins();
  };

  return (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 99995
      }}
    >
      <div 
        onClick={e => e.stopPropagation()}
        style={{
          width: '780px',
          maxWidth: '92vw',
          maxHeight: '85vh',
          backgroundColor: 'rgba(16, 20, 31, 0.96)',
          borderRadius: '16px',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.9)',
          display: 'flex',
          flexDirection: 'column',
          color: '#f8fafc',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '18px 24px',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Puzzle size={20} color="#a855f7" />
            <div>
              <h2 style={{ margin: 0, fontSize: '17px', fontWeight: 600 }}>Cero Plugin Marketplace</h2>
              <span style={{ fontSize: '12px', color: 'rgba(255, 255, 255, 0.5)' }}>
                Hot-reload capabilities, cloud tools, robotics, and rice extensions
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'rgba(255, 255, 255, 0.5)',
              cursor: 'pointer',
              padding: '4px',
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Action feedback alert */}
        {actionFeedback && (
          <div style={{
            margin: '12px 24px 0',
            padding: '8px 14px',
            backgroundColor: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid rgba(56, 189, 248, 0.35)',
            borderRadius: '8px',
            fontSize: '12px',
            color: '#38bdf8'
          }}>
            {actionFeedback}
          </div>
        )}

        {/* Controls: Search & Category Pills */}
        <div style={{ padding: '16px 24px 10px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            backgroundColor: 'rgba(0, 0, 0, 0.25)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '8px',
            padding: '0 12px'
          }}>
            <Search size={14} color="rgba(255,255,255,0.4)" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search extensions, authors, or capabilities..."
              style={{
                flex: 1,
                padding: '10px 0',
                backgroundColor: 'transparent',
                border: 'none',
                color: '#fff',
                fontSize: '13px',
                outline: 'none'
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  padding: '5px 12px',
                  borderRadius: '20px',
                  border: selectedCategory === cat ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.08)',
                  backgroundColor: selectedCategory === cat ? 'rgba(56, 189, 248, 0.15)' : 'rgba(255, 255, 255, 0.03)',
                  color: selectedCategory === cat ? '#38bdf8' : 'rgba(255, 255, 255, 0.65)',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: selectedCategory === cat ? 600 : 400,
                  transition: 'all 0.15s ease'
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Plugin Cards List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 24px 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {plugins.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255, 255, 255, 0.4)', fontSize: '13px' }}>
              No plugins match your filter.
            </div>
          ) : (
            plugins.map(p => (
              <div
                key={p.id}
                style={{
                  backgroundColor: 'rgba(255, 255, 255, 0.03)',
                  border: p.installed ? '1px solid rgba(56, 189, 248, 0.25)' : '1px solid rgba(255, 255, 255, 0.07)',
                  borderRadius: '12px',
                  padding: '16px',
                  display: 'flex',
                  gap: '16px',
                  alignItems: 'flex-start'
                }}
              >
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  padding: '12px',
                  borderRadius: '12px',
                  lineHeight: 1
                }}>
                  {getPluginIcon(p.icon)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                    <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#f8fafc' }}>
                      {p.name}
                    </h3>
                    <span style={{ fontSize: '11px', color: 'rgba(255, 255, 255, 0.4)' }}>
                      v{p.version} by {p.author}
                    </span>
                    <span style={{
                      fontSize: '10px',
                      backgroundColor: 'rgba(255, 255, 255, 0.06)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      color: 'rgba(255, 255, 255, 0.6)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}>
                      <Download size={10} />
                      <span>{p.downloads}</span>
                    </span>
                  </div>

                  <p style={{ margin: '0 0 10px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.7)', lineHeight: 1.45 }}>
                    {p.description}
                  </p>

                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {p.permissions.map(perm => (
                      <span 
                        key={perm}
                        style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(255, 255, 255, 0.05)',
                          color: 'rgba(255, 255, 255, 0.5)',
                          fontFamily: 'monospace'
                        }}
                      >
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'flex-end', flexShrink: 0 }}>
                  {p.installed ? (
                    <>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                          onClick={() => handleToggle(p.id)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: p.enabled ? '1px solid rgba(34, 197, 94, 0.35)' : '1px solid rgba(255, 255, 255, 0.12)',
                            backgroundColor: p.enabled ? 'rgba(34, 197, 94, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                            color: p.enabled ? '#4ade80' : 'rgba(255, 255, 255, 0.5)',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          {p.enabled && <Check size={12} />}
                          <span>{p.enabled ? 'Enabled' : 'Disabled'}</span>
                        </button>
                        <button
                          onClick={() => handleUninstall(p.id, p.name)}
                          style={{
                            padding: '6px 10px',
                            borderRadius: '6px',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            backgroundColor: 'rgba(239, 68, 68, 0.08)',
                            color: '#f87171',
                            fontSize: '11px',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                        >
                          <Trash2 size={11} />
                          <span>Uninstall</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      onClick={() => handleInstall(p.id, p.name)}
                      style={{
                        padding: '7px 16px',
                        borderRadius: '6px',
                        border: 'none',
                        backgroundColor: '#38bdf8',
                        color: '#000',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(56, 189, 248, 0.25)',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '5px'
                      }}
                    >
                      <Download size={12} />
                      <span>Install</span>
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '12px 24px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(0, 0, 0, 0.25)',
          fontSize: '11px',
          color: 'rgba(255, 255, 255, 0.45)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span>Plugins run sandboxed in isolated web-workers</span>
          <span>ESC to close</span>
        </div>
      </div>
    </div>
  );
};

/**
 * WindowControls.tsx — minimize, maximize and close inside the tab bar on Windows and Linux.
 *
 * The app has no separate title bar on any OS. macOS keeps its native traffic lights, overlaid on
 * the tab bar's left inset; Windows and Linux have no native frame (lib.rs), so these buttons sit
 * at the right end of the tab bar, where those systems put them.
 */

import React, { useEffect, useState } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';

type AppWindow = {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  isMaximized(): Promise<boolean>;
  onResized(handler: () => void): Promise<() => void>;
};

async function currentWindow(): Promise<AppWindow | null> {
  try {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    return getCurrentWindow() as unknown as AppWindow;
  } catch {
    return null; // outside the desktop app (tests, browser preview)
  }
}

export const WindowControls: React.FC = () => {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let alive = true;
    void currentWindow().then(async (w) => {
      if (!w || !alive) return;
      const refresh = () => { void w.isMaximized().then(m => alive && setMaximized(m)).catch(() => {}); };
      refresh();
      unlisten = await w.onResized(refresh).catch(() => undefined);
    });
    return () => { alive = false; unlisten?.(); };
  }, []);

  const act = (fn: (w: AppWindow) => Promise<void>) => (e: React.MouseEvent) => {
    e.stopPropagation();
    void currentWindow().then(w => w && fn(w)).catch(() => {});
  };

  return (
    <div className="window-controls window-no-drag" onDoubleClick={e => e.stopPropagation()}>
      <button className="window-control" onClick={act(w => w.minimize())} title="Minimize" aria-label="Minimize">
        <Minus size={14} strokeWidth={1.75} />
      </button>
      <button className="window-control" onClick={act(w => w.toggleMaximize())} title={maximized ? 'Restore' : 'Maximize'} aria-label={maximized ? 'Restore' : 'Maximize'}>
        {maximized ? <Copy size={12} strokeWidth={1.75} /> : <Square size={12} strokeWidth={1.75} />}
      </button>
      <button className="window-control window-control-close" onClick={act(w => w.close())} title="Close" aria-label="Close">
        <X size={15} strokeWidth={1.75} />
      </button>
    </div>
  );
};

/**
 * The top strip of a full-screen view (Settings, onboarding). It replaces the tab bar while the view
 * is open: drag to move the window, room for the macOS traffic lights, window controls elsewhere.
 */
export const WindowTitleStrip: React.FC<{ isMac: boolean }> = ({ isMac }) => (
  <div className="window-title-strip" data-tauri-drag-region>
    {!isMac && <WindowControls />}
  </div>
);

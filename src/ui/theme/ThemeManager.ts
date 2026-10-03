export interface TerminalTheme {
  id: string;
  name: string;
  colors: {
    background: string;
    foreground: string;
    cursor: string;
    cursorAccent: string;
    selection: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
  ui: {
    fontFamily: string;
    fontSize: number;
    transparency: number; // 0.0 to 1.0
    blur: number; // in px
    glassmorphism: boolean;
    borderGlow: string; // CSS color or 'none'
  };
}

export class ThemeManager {
  private static instance: ThemeManager;
  private currentTheme: TerminalTheme;
  private styleElement: HTMLStyleElement | null = null;
  private listeners: Set<(theme: TerminalTheme) => void> = new Set();

  private constructor() {
    this.currentTheme = this.getDefaultTheme();
    this.injectCSSVariables(this.currentTheme);
  }

  public static getInstance(): ThemeManager {
    if (!ThemeManager.instance) {
      ThemeManager.instance = new ThemeManager();
    }
    return ThemeManager.instance;
  }

  public loadTheme(theme: TerminalTheme) {
    this.currentTheme = theme;
    this.injectCSSVariables(theme);
    this.notifyListeners();
  }

  public getTheme(): TerminalTheme {
    return this.currentTheme;
  }

  public subscribe(listener: (theme: TerminalTheme) => void): () => void {
    this.listeners.add(listener);
    // Initial call
    listener(this.currentTheme);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      listener(this.currentTheme);
    }
  }

  private injectCSSVariables(theme: TerminalTheme) {
    if (typeof document === 'undefined') return; // For test environments

    if (!this.styleElement) {
      this.styleElement = document.createElement('style');
      document.head.appendChild(this.styleElement);
    }

    // Convert transparency (0-1) to opacity value, and blur to backdrop-filter
    const bgWithAlpha = this.hexToRgba(theme.colors.background, theme.ui.transparency);
    const backdropFilter = theme.ui.glassmorphism && theme.ui.blur > 0 
        ? `blur(${theme.ui.blur}px)` 
        : 'none';

    this.styleElement.textContent = `
      :root {
        --cero-bg: ${bgWithAlpha};
        --cero-bg-solid: ${theme.colors.background};
        --cero-fg: ${theme.colors.foreground};
        --cero-cursor: ${theme.colors.cursor};
        --cero-selection: ${theme.colors.selection};
        
        --cero-border: ${theme.id === 'apple-light' ? 'rgba(0, 0, 0, 0.1)' : 'rgba(255, 255, 255, 0.1)'};
        --cero-border-active: ${theme.id === 'apple-light' ? 'rgba(0, 0, 0, 0.35)' : 'rgba(255, 255, 255, 0.35)'};
        --cero-hover: ${theme.id === 'apple-light' ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)'};
        --cero-modal-bg: ${theme.id === 'apple-light' ? 'rgba(245, 245, 247, 0.97)' : 'rgba(20, 20, 22, 0.97)'};
        --cero-accent: ${theme.id === 'apple-light' ? '#000000' : '#FFFFFF'};

        --cero-font: ${theme.ui.fontFamily};
        --cero-font-size: ${theme.ui.fontSize}px;
        
        --cero-backdrop: ${backdropFilter};
        --cero-border-glow: none;
      }
      
      body {
        background-color: transparent !important;
      }
      
      #root {
        background-color: var(--cero-bg);
        backdrop-filter: var(--cero-backdrop);
        -webkit-backdrop-filter: var(--cero-backdrop);
      }
    `;
  }

  private hexToRgba(hex: string, alpha: number): string {
    const r = parseInt(hex.slice(1, 3), 16) || 0;
    const g = parseInt(hex.slice(3, 5), 16) || 0;
    const b = parseInt(hex.slice(5, 7), 16) || 0;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  public updateTransparency(alpha: number) {
    this.currentTheme.ui.transparency = alpha;
    this.injectCSSVariables(this.currentTheme);
    this.notifyListeners();
  }

  public updateBlur(blur: number) {
    this.currentTheme.ui.blur = blur;
    this.injectCSSVariables(this.currentTheme);
    this.notifyListeners();
  }

  public getPresetThemes(): TerminalTheme[] {
    return [
      this.getDefaultTheme(),
      {
        id: 'pure-black',
        name: 'Pure Black (OLED)',
        colors: {
          background: '#000000',
          foreground: '#F5F5F7',
          cursor: '#FFFFFF',
          cursorAccent: '#000000',
          selection: 'rgba(255, 255, 255, 0.2)',
          black: '#121212', red: '#FF453A', green: '#32D74B', yellow: '#FFD60A',
          blue: '#0A84FF', magenta: '#BF5AF2', cyan: '#5E5CE6', white: '#F5F5F7',
          brightBlack: '#3A3A3C', brightRed: '#FF453A', brightGreen: '#32D74B',
          brightYellow: '#FFD60A', brightBlue: '#0A84FF', brightMagenta: '#BF5AF2',
          brightCyan: '#5E5CE6', brightWhite: '#FFFFFF',
        },
        ui: { ...this.getDefaultTheme().ui, transparency: 0.85, blur: 20 }
      },
      {
        id: 'apple-light',
        name: 'Apple Classic Light',
        colors: {
          background: '#F5F5F7',
          foreground: '#1D1D1F',
          cursor: '#1D1D1F',
          cursorAccent: '#F5F5F7',
          selection: 'rgba(0, 0, 0, 0.15)',
          black: '#000000', red: '#D70015', green: '#248A3D', yellow: '#9E6B00',
          blue: '#0040DD', magenta: '#862B9C', cyan: '#007D8B', white: '#FFFFFF',
          brightBlack: '#6E6E73', brightRed: '#E30000', brightGreen: '#18A033',
          brightYellow: '#B57D00', brightBlue: '#0051FF', brightMagenta: '#9E32B5',
          brightCyan: '#0090A1', brightWhite: '#FFFFFF',
        },
        ui: { ...this.getDefaultTheme().ui, transparency: 0.90, blur: 15 }
      },
      {
        id: 'monokai-minimal',
        name: 'Monokai Minimal',
        colors: {
          background: '#1A1C1E',
          foreground: '#F0F0E8',
          cursor: '#D4D4CE',
          cursorAccent: '#1A1C1E',
          selection: 'rgba(212, 212, 206, 0.2)',
          black: '#1B1D1E', red: '#F92672', green: '#A6E22E', yellow: '#E6DB74',
          blue: '#66D9EF', magenta: '#AE81FF', cyan: '#A1EFE4', white: '#F8F8F2',
          brightBlack: '#505354', brightRed: '#FF3385', brightGreen: '#B4ED47',
          brightYellow: '#F3E88A', brightBlue: '#78E2F2', brightMagenta: '#BE95FF',
          brightCyan: '#B3F7EE', brightWhite: '#FFFFFF',
        },
        ui: { ...this.getDefaultTheme().ui, transparency: 0.82, blur: 20 }
      },
      {
        id: 'midnight-slate',
        name: 'Midnight Slate',
        colors: {
          background: '#0B1017',
          foreground: '#CBD5E1',
          cursor: '#94A3B8',
          cursorAccent: '#0B1017',
          selection: 'rgba(148, 163, 184, 0.25)',
          black: '#1E293B', red: '#F43F5E', green: '#10B981', yellow: '#F59E0B',
          blue: '#3B82F6', magenta: '#8B5CF6', cyan: '#06B6D4', white: '#F8FAFC',
          brightBlack: '#475569', brightRed: '#E11D48', brightGreen: '#059669',
          brightYellow: '#D97706', brightBlue: '#2563EB', brightMagenta: '#7C3AED',
          brightCyan: '#0891B2', brightWhite: '#FFFFFF',
        },
        ui: { ...this.getDefaultTheme().ui, transparency: 0.82, blur: 20 }
      }
    ];
  }

  public getDefaultTheme(): TerminalTheme {
    return {
      id: 'classic-dark',
      name: 'Classic Dark',
      colors: {
        background: '#141416', // Timeless classic graphite dark
        foreground: '#EEEEF0',
        cursor: '#FFFFFF',
        cursorAccent: '#141416',
        selection: 'rgba(255, 255, 255, 0.2)',
        black: '#1D1D1F',
        red: '#FF453A',
        green: '#32D74B',
        yellow: '#FFD60A',
        blue: '#0A84FF',
        magenta: '#BF5AF2',
        cyan: '#5E5CE6',
        white: '#F5F5F7',
        brightBlack: '#48484A',
        brightRed: '#FF6358',
        brightGreen: '#4AE162',
        brightYellow: '#FFDF34',
        brightBlue: '#409CFF',
        brightMagenta: '#D17CFC',
        brightCyan: '#7D7AFF',
        brightWhite: '#FFFFFF',
      },
      ui: {
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        fontSize: 14,
        transparency: 0.82,
        blur: 20,
        glassmorphism: true,
        borderGlow: 'none'
      }
    };
  }
}

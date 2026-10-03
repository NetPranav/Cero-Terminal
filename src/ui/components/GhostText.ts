import { Terminal } from '@xterm/xterm';

export class GhostTextRenderer {
  private terminal: Terminal;
  private overlayElement: HTMLDivElement | null = null;
  private currentSuggestion: string = '';
  private currentGhostPart: string = '';

  constructor(terminal: Terminal) {
    this.terminal = terminal;
  }

  public attach(container: HTMLElement) {
    this.overlayElement = document.createElement('div');
    this.overlayElement.className = 'cero-ghost-text';
    this.overlayElement.style.position = 'absolute';
    this.overlayElement.style.pointerEvents = 'none';
    this.overlayElement.style.whiteSpace = 'pre';
    this.overlayElement.style.color = 'var(--cero-fg, #ffffff)';
    this.overlayElement.style.opacity = '0.38';
    this.overlayElement.style.fontFamily = 'var(--cero-font, "JetBrains Mono", Menlo, Monaco, monospace)';
    this.overlayElement.style.fontSize = 'var(--cero-font-size, 14px)';
    this.overlayElement.style.zIndex = '250';
    this.overlayElement.style.display = 'none';

    container.appendChild(this.overlayElement);
  }

  public setOverlayElement(element: HTMLDivElement | null) {
    this.overlayElement = element;
  }

  public render(suggestion: string, currentInput: string, endCol?: number, cursorAtEnd: boolean = true) {
    if (!cursorAtEnd) {
      this.clear();
      return;
    }

    if (!this.overlayElement || !suggestion || !currentInput) {
      this.clear();
      return;
    }

    const buffer = this.terminal?.buffer?.active;
    const cursorX = buffer?.cursorX ?? 0;
    const cursorY = buffer?.cursorY ?? 0;

    // If endCol is passed, cursor must be at end
    if (endCol !== undefined && cursorX < endCol) {
      this.clear();
      return;
    }

    const cleanInput = currentInput.trimStart();
    if (cleanInput.length === 0 || !suggestion.toLowerCase().startsWith(cleanInput.toLowerCase())) {
      this.clear();
      return;
    }

    if (suggestion.length <= cleanInput.length) {
      this.clear();
      return;
    }

    this.currentSuggestion = suggestion;
    const ghostPart = suggestion.substring(cleanInput.length);
    this.currentGhostPart = ghostPart;

    // Retrieve precise rendering dimensions from xterm v6 internals or fallback to mathematical element division
    const core = (this.terminal as any)?._core;
    const dims = core?._renderService?.dimensions || core?._renderService?.dimensions?.css || {};
    
    const cellWidth = dims.actualCellWidth || dims.css?.cell?.width || dims.scaledCellWidth || 
      (this.terminal.element ? this.terminal.element.clientWidth / this.terminal.cols : 9);
    const cellHeight = dims.actualCellHeight || dims.css?.cell?.height || dims.scaledCellHeight || 
      (this.terminal.element ? this.terminal.element.clientHeight / this.terminal.rows : 17);

    // Calculate exact pixel offset relative to positioned container
    const screenEl = this.terminal.element?.querySelector?.('.xterm-screen') as HTMLElement | null;
    let offsetTop = 0;
    let offsetLeft = 0;
    if (screenEl && this.overlayElement.parentElement) {
      const screenRect = screenEl.getBoundingClientRect();
      const containerRect = this.overlayElement.parentElement.getBoundingClientRect();
      offsetTop = screenRect.top - containerRect.top;
      offsetLeft = screenRect.left - containerRect.left;
    }

    const targetCol = endCol !== undefined ? endCol : cursorX;
    const top = offsetTop + (cursorY * cellHeight);
    const left = offsetLeft + (targetCol * cellWidth);

    this.overlayElement.style.top = `${top}px`;
    this.overlayElement.style.left = `${left}px`;
    this.overlayElement.style.lineHeight = `${cellHeight}px`;
    this.overlayElement.textContent = ghostPart;
    this.overlayElement.style.display = 'block';
  }

  public clear() {
    this.currentSuggestion = '';
    this.currentGhostPart = '';
    if (this.overlayElement) {
      this.overlayElement.textContent = '';
      this.overlayElement.style.display = 'none';
    }
  }

  public getSuggestion(): string {
    return this.currentSuggestion;
  }

  public getRemaining(): string {
    return this.currentGhostPart;
  }
}

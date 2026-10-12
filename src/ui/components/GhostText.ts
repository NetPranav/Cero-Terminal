import { Terminal } from '@xterm/xterm';

export class GhostTextRenderer {
  private terminal: Terminal;
  private overlayElement: HTMLDivElement | null = null;
  private currentSuggestion: string = '';
  private currentGhostPart: string = '';
  /** The exact input this suggestion was computed for; the suggestion is only valid for that text. */
  private forInput: string = '';
  /** Bumped by every invalidation so an async recompute that started earlier can tell it is stale. */
  private epoch = 0;

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
    this.forInput = cleanInput;
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
    this.forInput = '';
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

  /**
   * The text to type when the user accepts the suggestion, or '' when it must not be used.
   * `typedNow` is what is really on the input line right now (null when that cannot be known).
   * The suggestion only continues the exact text it was computed for; after a paste, an edit
   * or a cursor move the remainder would land in the wrong place and duplicate text.
   */
  public acceptableRemaining(typedNow: string | null): string {
    if (typedNow === null || !this.currentGhostPart || !this.forInput) return '';
    if (typedNow.trimStart() !== this.forInput) return '';
    if (!this.currentSuggestion.toLowerCase().startsWith(this.forInput.toLowerCase())) return '';
    return this.currentGhostPart;
  }

  /** Drop the suggestion and cancel any recompute that is still in flight. */
  public invalidate() {
    this.epoch++;
    this.clear();
  }

  /** Start of a recompute; pair with isCurrent() after any await. */
  public beginRecompute(): number {
    return ++this.epoch;
  }

  public isCurrent(epoch: number): boolean {
    return epoch === this.epoch;
  }
}

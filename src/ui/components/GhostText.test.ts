import { describe, it, expect } from 'vitest';
import { GhostTextRenderer } from './GhostText';

describe('GhostTextRenderer', () => {
  const createMockElement = () => ({
    style: {} as Record<string, string>,
    textContent: '',
    parentElement: null,
  });

  const createMockTerminal = (cursorX = 10, cursorY = 0) => ({
    buffer: {
      active: {
        cursorX,
        cursorY,
      },
    },
    cols: 80,
    rows: 24,
    element: null,
  });

  it('clears overlay when cursor is not at the end (cursorAtEnd is false)', () => {
    const mockTerm = createMockTerminal(5, 0);
    const renderer = new GhostTextRenderer(mockTerm as any);
    const mockEl = createMockElement();
    renderer.setOverlayElement(mockEl as any);

    // Call render with cursorAtEnd = false
    renderer.render('git status', 'git sta', 7, false);

    expect(mockEl.style.display).toBe('none');
    expect(mockEl.textContent).toBe('');
    expect(renderer.getRemaining()).toBe('');
    expect(renderer.getSuggestion()).toBe('');
  });

  it('clears overlay when cursorX is before endCol', () => {
    // cursorX is 5, but endCol is 7 (cursor mid-line)
    const mockTerm = createMockTerminal(5, 0);
    const renderer = new GhostTextRenderer(mockTerm as any);
    const mockEl = createMockElement();
    renderer.setOverlayElement(mockEl as any);

    renderer.render('git status', 'git sta', 7, true);

    expect(mockEl.style.display).toBe('none');
    expect(mockEl.textContent).toBe('');
    expect(renderer.getRemaining()).toBe('');
  });

  it('renders ghost text and positions overlay when cursor is at the end', () => {
    // cursorX is 7, endCol is 7
    const mockTerm = createMockTerminal(7, 0);
    const renderer = new GhostTextRenderer(mockTerm as any);
    const mockEl = createMockElement();
    renderer.setOverlayElement(mockEl as any);

    renderer.render('git status', 'git sta', 7, true);

    expect(mockEl.style.display).toBe('block');
    expect(mockEl.textContent).toBe('tus');
    expect(renderer.getRemaining()).toBe('tus');
    expect(renderer.getSuggestion()).toBe('git status');
  });

  it('clear() resets overlay and ghost state', () => {
    const mockTerm = createMockTerminal(7, 0);
    const renderer = new GhostTextRenderer(mockTerm as any);
    const mockEl = createMockElement();
    renderer.setOverlayElement(mockEl as any);

    renderer.render('git status', 'git sta', 7, true);
    expect(renderer.getRemaining()).toBe('tus');

    renderer.clear();
    expect(mockEl.style.display).toBe('none');
    expect(mockEl.textContent).toBe('');
    expect(renderer.getRemaining()).toBe('');
    expect(renderer.getSuggestion()).toBe('');
  });
});

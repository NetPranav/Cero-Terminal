/**
 * ThemeEngine.ts — Runtime theme switching
 */

export type AppTheme = 'Cero Dark' | 'Cero Light' | 'Glass' | 'Minimal' | 'OLED' | 'Matrix' | 'Developer';

export class ThemeEngine {
  private currentTheme: AppTheme = 'Cero Dark';

  public setTheme(theme: AppTheme): void {
    this.currentTheme = theme;
    // In production, dispatches CSS variable updates to the DOM
  }

  public getTheme(): AppTheme {
    return this.currentTheme;
  }

  public getAvailableThemes(): AppTheme[] {
    return ['Cero Dark', 'Cero Light', 'Glass', 'Minimal', 'OLED', 'Matrix', 'Developer'];
  }
}

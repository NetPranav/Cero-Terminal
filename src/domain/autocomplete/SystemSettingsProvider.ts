import type { AutocompleteContext, AutocompleteSuggestion, IAutocompleteProvider } from './types';
import { completeSystemRequest } from '../system/SystemControl';

/**
 * Completes ">" requests about system settings with what Windows can do ("turn bluetooth off",
 * "set brightness to 70%", "open sound settings").
 */
export class SystemSettingsProvider implements IAutocompleteProvider {
  id = 'provider.system-settings';
  enabled = true;

  async getSuggestions(context: AutocompleteContext): Promise<AutocompleteSuggestion[]> {
    const input = context.currentInput.trimStart();
    if (!input.startsWith('>')) return [];
    return completeSystemRequest(input.slice(1)).map((request, i) => ({
      id: `system-${request}`,
      value: `>${request}`,
      category: 'Capability',
      priority: 85 - i,
      confidence: 0.85,
      sourceProvider: this.id,
    }));
  }
}

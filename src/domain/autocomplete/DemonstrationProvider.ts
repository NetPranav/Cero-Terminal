import { AutocompleteContext, AutocompleteSuggestion, IAutocompleteProvider } from './types';
import { DemonstrationLearningEngine } from '../learning/DemonstrationLearningEngine';

/**
 * Autocomplete provider that suggests learned user workflows and demonstrations
 */
export class DemonstrationProvider implements IAutocompleteProvider {
  id = 'DemonstrationProvider';
  enabled = true;

  public async getSuggestions(context: AutocompleteContext): Promise<AutocompleteSuggestion[]> {
    const input = context.currentInput.trim();
    if (!input) return [];

    const patterns = DemonstrationLearningEngine.getInstance().getAllPatterns();
    const suggestions: AutocompleteSuggestion[] = [];

    for (const p of patterns) {
      // 1. If user is in AI prompt mode (> or >text)
      if (input.startsWith('>')) {
        const goalInput = input.replace(/^>\s*/, '').toLowerCase();
        if (goalInput === '' || p.originalGoal.toLowerCase().includes(goalInput)) {
          suggestions.push({
            id: `demo_goal_${p.id}`,
            value: `> ${p.originalGoal}`,
            displayText: `> ${p.originalGoal} (Learned)`,
            description: `Executes: ${p.commandTemplate}`,
            category: 'Workflow',
            priority: 95,
            confidence: 0.95,
            sourceProvider: this.id
          });
        }
      } else {
        // 2. Direct shell command prefix matching
        const lowerInput = input.toLowerCase();
        const lowerCmd = p.commandTemplate.toLowerCase();
        if (lowerCmd.startsWith(lowerInput) && lowerCmd !== lowerInput) {
          suggestions.push({
            id: `demo_cmd_${p.id}`,
            value: p.commandTemplate,
            displayText: `${p.commandTemplate} [${p.originalGoal}]`,
            description: `Learned from user demonstration`,
            category: 'Workflow',
            priority: 90,
            confidence: 0.9,
            sourceProvider: this.id
          });
        }
      }
    }

    return suggestions;
  }
}

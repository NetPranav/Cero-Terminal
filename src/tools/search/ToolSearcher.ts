/**
 * ToolSearcher.ts
 * 
 * Multi-dimensional semantic search across all registry indexes with stopword exclusion,
 * typo tolerance, verb-aware scoring, entity-context boosting, and strict domain isolation guardrails.
 * 
 * Search dimensions (in priority order):
 * 1. Tool ID exact match (score: 1000)
 * 2. Alias exact match (score: 900)
 * 3. Multi-word alias substring match (score: 850)
 * 4. Domain + action match (score: 800)
 * 5. Entity-context boosting (score: up to 600)
 * 6. Knowledge index scored match (score: variable, up to 500)
 * 7. Typo-tolerant Tool ID & Name semantic word match (score: variable, 400/term)
 * 8. Tag match (score: 400)
 * 9. Action verb group match (score: 350)
 * 10. Description fuzzy match (score: up to 300)
 */

import { ToolRegistryState } from '../loader/ToolLoader';
import { LoadedTool } from '../schemas/ToolDefinitionSchema';

export interface SearchResult {
  tool: LoadedTool;
  score: number;
  matchReasons: string[];
}

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(matrix[i - 1][j] + 1, matrix[i][j - 1] + 1, matrix[i - 1][j - 1] + cost);
    }
  }
  return matrix[a.length][b.length];
}

function isWordMatch(queryWord: string, targetWord: string): boolean {
  if (!queryWord || !targetWord) return false;
  if (queryWord === targetWord) return true;
  if (queryWord.length < 3 || targetWord.length < 3) return false;
  if (queryWord.length >= 5 && targetWord.length >= 5 && queryWord.substring(0, 4) === targetWord.substring(0, 4)) return true;
  const dist = levenshtein(queryWord, targetWord);
  if (queryWord.length >= 7 && dist <= 2) return true;
  if (queryWord.length >= 4 && dist <= 1) return true;
  return false;
}

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'by', 'for', 'with',
  'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from',
  'up', 'down', 'out', 'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
  'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'can', 'will', 'just', 'should', 'now', 'me', 'my',
  'i', 'you', 'your', 'we', 'our', 'he', 'she', 'it', 'they', 'them', 'show', 'list', 'tell', 'give', 'make', 'do',
  'please', 'could', 'would', 'kindly', 'want', 'need', 'help', 'did', 'does', 'have', 'has', 'had', 'been', 'what'
]);

import { VerbSynonyms } from '../../ai/intent/SynonymMap';

/** Action verbs auto-generated from centralized SynonymMap */
const ACTION_VERB_GROUPS: Record<string, string[]> = Object.fromEntries(
  Object.entries(VerbSynonyms).map(([canonical, synonyms]) => [
    canonical,
    [canonical, ...synonyms.map(s => s.split(/\s+/)[0])] // Use first word of multi-word synonyms
  ])
);

export class ToolSearcher {
  constructor(private registry: ToolRegistryState) {}

  /**
   * Search for tools matching a natural language query.
   * Returns results sorted by score (highest first).
   */
  public search(query: string, intent?: { domain: string; action: string }, entities?: Record<string, any>): SearchResult[] {
    const scores = new Map<string, { score: number; reasons: string[] }>();

    const normalizedQuery = query.toLowerCase().trim();
    const rawWords = normalizedQuery.split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, '')).filter(Boolean);
    const queryWords = new Set(rawWords.filter(w => !STOPWORDS.has(w) && w.length > 1));

    // 1. Exact tool ID match
    const exactTool = this.registry.toolIndex.get(normalizedQuery);
    if (exactTool) {
      this.addScore(scores, exactTool.definition.id, 1000, 'Exact tool ID match');
    }

    // 2. Alias exact/fuzzy match
    const aliasExact = this.registry.aliasIndex.getToolId(normalizedQuery);
    if (aliasExact) {
      this.addScore(scores, aliasExact, 900, `Alias exact match: "${normalizedQuery}"`);
    }

    const aliasFuzzy = this.registry.aliasIndex.fuzzyMatch(normalizedQuery);
    for (const match of aliasFuzzy) {
      if (match.toolId !== aliasExact) {
        this.addScore(scores, match.toolId, 600, `Alias fuzzy match: "${match.alias}"`);
      }
    }

    // 2b. Multi-word alias substring matching
    for (const tool of this.registry.toolIndex.getAll()) {
      for (const alias of (tool.definition.aliases || [])) {
        const aliasLower = alias.toLowerCase();
        if (aliasLower.includes(' ') && normalizedQuery.includes(aliasLower)) {
          this.addScore(scores, tool.definition.id, 850, `Multi-word alias substring match: "${alias}"`);
        }
      }
    }

    // 3. Domain + action match (if intent is provided)
    if (intent) {
      const domainTools = this.registry.domainIndex.getToolIds(intent.domain);
      for (const toolId of domainTools) {
        this.addScore(scores, toolId, 800, `Domain match: ${intent.domain}`);
      }
    }

    // 4. Tag match (excluding stopwords)
    for (const word of queryWords) {
      const tagTools = this.registry.tagIndex.getToolIds(word);
      for (const toolId of tagTools) {
        this.addScore(scores, toolId, 400, `Tag match: "${word}"`);
      }
    }

    // 5. Entity-context boosting
    if (entities) {
      for (const entityType of Object.keys(entities)) {
        const entityTools = this.registry.entityIndex.getToolIds(entityType);
        for (const toolId of entityTools) {
          this.addScore(scores, toolId, 500, `Entity match: ${entityType}`);
        }
      }

      // Domain-level entity boosting
      if (entities.bluetooth_devices?.length || entities.device_names?.length) {
        const btTools = this.registry.domainIndex.getToolIds('network');
        for (const toolId of btTools) {
          if (toolId.includes('bluetooth')) {
            this.addScore(scores, toolId, 600, 'Entity context: bluetooth device detected');
          }
        }
      }
      if (entities.SSID?.length) {
        const wifiTools = this.registry.domainIndex.getToolIds('network');
        for (const toolId of wifiTools) {
          if (toolId.includes('wifi')) {
            this.addScore(scores, toolId, 600, 'Entity context: SSID detected');
          }
        }
      }
      if (entities.folders?.length || entities.paths?.length) {
        const fsTools = this.registry.domainIndex.getToolIds('filesystem');
        for (const toolId of fsTools) {
          this.addScore(scores, toolId, 200, 'Entity context: path/folder detected');
        }
      }
      if (entities.applications?.length || entities.processes?.length) {
        const appTools = this.registry.domainIndex.getToolIds('application');
        for (const toolId of appTools) {
          this.addScore(scores, toolId, 200, 'Entity context: application/process detected');
        }
      }
    }

    // 6. Knowledge index search
    const knowledgeResults = this.registry.knowledgeIndex.search(normalizedQuery);
    for (const kr of knowledgeResults) {
      const scaledScore = Math.min(kr.score * 5, 500);
      this.addScore(scores, kr.toolId, scaledScore, `Knowledge match: "${kr.matchedPhrase}" (score: ${kr.score.toFixed(0)})`);
    }

    // 7. Typo-tolerant semantic keyword match on Tool IDs and Display Names
    for (const tool of this.registry.toolIndex.getAll()) {
      const idWords = tool.definition.id.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
      const nameWords = tool.definition.displayName.toLowerCase().replace(/[^a-z0-9]/g, ' ').split(/\s+/).filter(Boolean);
      const targetWords = [...new Set([...idWords, ...nameWords])];

      let matchCount = 0;
      for (const qw of queryWords) {
        if (targetWords.some(tw => isWordMatch(qw, tw))) {
          matchCount++;
        }
      }
      if (matchCount > 0) {
        this.addScore(scores, tool.definition.id, matchCount * 400, `Semantic keyword/typo match (${matchCount} terms)`);
      }

      // Description fuzzy match (using content words without stopwords)
      const descWords = tool.definition.description.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z0-9]/g, '')).filter(w => !STOPWORDS.has(w) && w.length > 1);
      const overlap = descWords.filter(w => [...queryWords].some(qw => isWordMatch(qw, w))).length;
      if (overlap > 0) {
        const descScore = Math.min((overlap / (descWords.length || 1)) * 300, 300);
        this.addScore(scores, tool.definition.id, descScore, `Description word overlap (${overlap} words)`);
      }
    }

    // 8. Action verb + tool alias/tag compound matching
    const detectedActions = this.extractActionVerbs(normalizedQuery);
    if (detectedActions.length > 0) {
      for (const tool of this.registry.toolIndex.getAll()) {
        const toolTags = new Set((tool.definition.tags || []).map(t => t.toLowerCase()));
        const toolAliasWords = new Set((tool.definition.aliases || []).flatMap(a => a.toLowerCase().split(/\s+/)));
        const idParts = new Set(tool.definition.id.toLowerCase().split('.'));

        for (const action of detectedActions) {
          const verbGroup = this.getVerbGroup(action);
          if (verbGroup) {
            const hasVerbMatch = verbGroup.some(v => toolTags.has(v) || toolAliasWords.has(v) || idParts.has(v));
            if (hasVerbMatch) {
              this.addScore(scores, tool.definition.id, 350, `Action verb group match: "${action}"`);
            }
          }
        }
      }
    }

    // Build results
    const results: SearchResult[] = [];
    for (const [toolId, data] of scores.entries()) {
      const tool = this.registry.toolIndex.get(toolId);
      if (tool) {
        results.push({ tool, score: data.score, matchReasons: data.reasons });
      }
    }

    // Strict Domain Isolation & Anti-Confusion Filters
    const hasBluetooth = /bluetooth|bt|airpod|headphone|earbud|speaker|mouse|keyboard|pair/i.test(normalizedQuery);
    const hasWifi = /wifi|wi-fi|wireless|wlan|internet|ssid|router|network|hotspot/i.test(normalizedQuery);
    const hasAppOrProcess = /app|applic|program|process|runn|kill|terminate/i.test(normalizedQuery);
    const hasBattery = /battery|power|charge|charging|energy/i.test(normalizedQuery);

    for (const res of results) {
      const toolId = res.tool.definition.id.toLowerCase();
      const dispName = res.tool.definition.displayName.toLowerCase();

      if ((toolId.includes('bluetooth') || dispName.includes('bluetooth')) && !hasBluetooth) {
        res.score -= 3000;
      }
      if ((toolId.includes('wifi') || dispName.includes('wifi') || dispName.includes('wireless')) && !hasWifi) {
        res.score -= 3000;
      }
      if (hasAppOrProcess && !hasBluetooth && !hasWifi) {
        if (toolId.includes('network.') || toolId.includes('wifi') || toolId.includes('bluetooth')) {
          res.score -= 3000;
        }
      }
      if (toolId.includes('battery') && !hasBattery) {
        res.score -= 3000;
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results;
  }

  /**
   * Get the best matching tool, or null if no match exceeds the threshold.
   */
  public findBestMatch(query: string, intent?: { domain: string; action: string }, entities?: Record<string, any>, minScore = 200): SearchResult | null {
    const results = this.search(query, intent, entities);
    if (results.length === 0 || results[0].score < minScore) {
      return null;
    }
    return results[0];
  }

  /**
   * Extract action verbs from a query string.
   */
  private extractActionVerbs(query: string): string[] {
    const words = query.split(/\s+/);
    const verbs: string[] = [];
    const allVerbs = new Set(Object.values(ACTION_VERB_GROUPS).flat());
    for (const word of words) {
      const clean = word.replace(/[^a-z]/g, '');
      if (allVerbs.has(clean)) {
        verbs.push(clean);
      }
    }
    return verbs;
  }

  /**
   * Get the verb group (list of synonyms) for a given action verb.
   */
  private getVerbGroup(verb: string): string[] | null {
    for (const group of Object.values(ACTION_VERB_GROUPS)) {
      if (group.includes(verb)) return group;
    }
    return null;
  }

  private addScore(scores: Map<string, { score: number; reasons: string[] }>, toolId: string, score: number, reason: string): void {
    const existing = scores.get(toolId);
    if (existing) {
      existing.score += score;
      existing.reasons.push(reason);
    } else {
      scores.set(toolId, { score, reasons: [reason] });
    }
  }
}

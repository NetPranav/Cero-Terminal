/**
 * Planner.ts — Local Intent Multi-Step Task Decomposition
 * 
 * Converts unrestricted natural language into sequential task arrays composed of Tool IDs and extracted entities.
 * Uses ToolSearcher as the PRIMARY resolution engine instead of hardcoded string matching.
 * 
 * Architecture:
 * 1. Split natural language into clauses
 * 2. Extract entities per clause
 * 3. Resolve tool via ToolSearcher (aliases, tags, knowledge, typo tolerance)
 * 4. Apply lightweight disambiguation ONLY for genuinely confusing patterns
 * 5. Enrich entities with contextual information
 */

import { ModelManager } from '../management/ModelManager';
import { ContextBuilder } from './ContextBuilder';
import { EntityExtractor, ExtractedEntities } from './EntityExtractor';
import { ToolSearcher } from '../../tools/search/ToolSearcher';
import { correctTypos, WebDestinations } from './SynonymMap';
import { matchCompositePattern } from './CompositePatterns';

export interface PlannedTask {
  tool: string;
  entities: Record<string, any>;
}

export interface StructuredPlan {
  goal: string;
  confidence: number;
  tasks: PlannedTask[];
  rawGeneration?: boolean;
}

export class Planner {
  private extractor: EntityExtractor;
  private searcher: ToolSearcher;

  constructor(private modelManager: ModelManager, private contextBuilder: ContextBuilder) {
    this.extractor = new EntityExtractor();
    this.searcher = this.contextBuilder.getToolSearcher();
  }

  /**
   * Generates a structured sequential execution plan from natural language.
   * Uses ToolSearcher as the primary resolution engine.
   */
  public async generatePlan(query: string): Promise<StructuredPlan> {
    // Apply typo correction before processing
    const corrected = correctTypos(query);
    const clean = corrected.replace(/^[\s>$#\-:]+/, '').trim();

    // 1. Extract global entities from prompt
    const globalEntities = this.extractor.extract(clean);

    // 1b. Check for known composite multi-step patterns BEFORE clause splitting
    const compositeMatch = matchCompositePattern(clean);
    if (compositeMatch) {
      const { pattern: cp, entities: entityArrays } = compositeMatch;
      const compositeTasks: PlannedTask[] = [];
      for (let i = 0; i < cp.tools.length; i++) {
        const toolEntities = entityArrays[i] || {};
        compositeTasks.push({
          tool: cp.tools[i],
          entities: { ...globalEntities, ...toolEntities }
        });
      }
      return {
        goal: clean,
        tasks: compositeTasks,
        confidence: 0.90
      };
    }

    // 2. Split into clauses for multi-step instructions
    const clauses = this.splitIntoClauses(clean);
    const tasks: PlannedTask[] = [];
    let activeContextPath: string | undefined = undefined;

    for (const clause of clauses) {
      // Extract clause-specific entities
      const clauseEntities = this.extractor.extract(clause);
      // Smart entity merging: prefer fully-qualified paths from global context
      const combinedEntities: Record<string, any> = { ...globalEntities, ...clauseEntities };
      // If global entities had more specific (longer) folder/path references, preserve them
      if (globalEntities.folders?.length && clauseEntities.folders?.length) {
        const globalBest = globalEntities.folders.find((f: string) => f.includes('/'));
        const clauseBest = clauseEntities.folders[0];
        if (globalBest && clauseBest && !clauseBest.includes('/') && globalBest.includes(clauseBest)) {
          combinedEntities.folders = [globalBest];
        }
      }
      if (globalEntities.paths?.length && clauseEntities.paths?.length) {
        const globalBest = globalEntities.paths.find((p: string) => p.includes('/'));
        const clauseBest = clauseEntities.paths[0];
        if (globalBest && clauseBest && !clauseBest.includes('/') && globalBest.includes(clauseBest)) {
          combinedEntities.paths = globalEntities.paths;
        }
      }
      const clauseLower = clause.toLowerCase();

      // --- TOOL RESOLUTION: ToolSearcher-first ---
      const searchResult = this.searcher.findBestMatch(clause, undefined, combinedEntities);
      let toolId = searchResult ? searchResult.tool.definition.id : 'unknown.tool';

      // --- DISAMBIGUATION: Only for genuinely ambiguous patterns ---
      toolId = this.disambiguate(clause, clauseLower, toolId, searchResult?.score || 0, combinedEntities, activeContextPath);

      // --- ENTITY ENRICHMENT: Map extracted entities to tool parameter names ---
      this.enrichEntities(clause, clauseLower, toolId, combinedEntities, activeContextPath);

      // Track active path context for multi-step instructions
      if ((toolId === 'filesystem.mkdir' || toolId === 'filesystem.navigate') && (combinedEntities.folders?.[0] || combinedEntities['path'] || combinedEntities['directory'])) {
        activeContextPath = combinedEntities.folders?.[0] || combinedEntities['path'] || combinedEntities['directory'];
      }

      // Handle multi-file creation (e.g., "make 2 files p1.ts, p2.ts")
      if (toolId === 'filesystem.create' && combinedEntities.files && Array.isArray(combinedEntities.files) && combinedEntities.files.length > 1) {
        for (const f of combinedEntities.files) {
          // Prefix with active context path if file doesn't already have a path prefix
          const filePath = (activeContextPath && !f.includes('/') && !f.startsWith('~') && !f.startsWith('.')) 
            ? `${activeContextPath.replace(/\/+$/, '')}/${f}` 
            : f;
          tasks.push({
            tool: 'filesystem.create',
            entities: { ...combinedEntities, file: filePath, path: filePath, files: [f] }
          });
        }
        continue;
      }

      tasks.push({ tool: toolId, entities: combinedEntities });
    }

    const goalSummary = this.summarizeGoal(clean, tasks);

    return {
      goal: goalSummary,
      confidence: 0.95,
      tasks
    };
  }

  /**
   * Lightweight disambiguation for genuinely ambiguous tool matches.
   * This replaces the 400-line if/else block with ~80 lines of targeted overrides.
   */
  private disambiguate(
    clause: string,
    clauseLower: string,
    searchToolId: string,
    searchScore: number,
    entities: Record<string, any>,
    activeContextPath?: string
  ): string {
    // --- WiFi vs Bluetooth disambiguation ---
    // "connect" can mean WiFi or Bluetooth depending on context
    if (/\b(?:connect|join|pair)\b/i.test(clauseLower)) {
      const isBtContext = /\b(?:bluetooth|bt|airpod|headphone|earbud|speaker|mouse|keyboard)\b/i.test(clauseLower) || (entities.bluetooth_devices?.length > 0);
      const isWifiContext = /\b(?:wifi|wi-fi|network|hotspot|phone|5g|4g|fiber|airtel|jio|bsnl|verizon)\b/i.test(clauseLower) || (entities.SSID?.length > 0);

      if (isBtContext && !isWifiContext) return 'network.bluetooth.connect';
      if (isWifiContext && !isBtContext) return 'network.wifi.connect';
      // If neither domain keyword, default to WiFi for "connect me to X" patterns
      if (!isBtContext && !isWifiContext && /\bconnect\b/i.test(clauseLower)) return 'network.wifi.connect';
    }

    // --- On/Off disambiguation (Bluetooth vs WiFi) ---
    if (/\b(?:turn|switch|enable|disable|activate|deactivate)\b/i.test(clauseLower) || (/\b(?:on|off)\b/i.test(clauseLower) && /\b(?:bluetooth|bt|wifi|wi-fi)\b/i.test(clauseLower))) {
      const isBt = /\b(?:bluetooth|bt)\b/i.test(clauseLower);
      const isWifi = /\b(?:wifi|wi-fi|wireless)\b/i.test(clauseLower);
      const isOn = /\b(?:on|enable|activate|start)\b/i.test(clauseLower) && !/\b(?:off|disable|deactivate|stop)\b/i.test(clauseLower);
      const isOff = /\b(?:off|disable|deactivate|stop)\b/i.test(clauseLower);

      if (isBt && isOn) return 'network.bluetooth.on';
      if (isBt && isOff) return 'network.bluetooth.off';
      if (isWifi && isOn) return 'network.wifi.on';
      if (isWifi && isOff) return 'network.wifi.off';
    }

    // --- Shell command shortcuts (MUST run before ToolSearcher can override with fuzzy matches) ---
    const shellMappings: [RegExp, string][] = [
      [/\b(?:clear\s+terminal|clear\s+screen|clean\s+screen|clean\s+terminal)\b|^clear$/i, 'clear'],
      [/\b(?:who\s+am\s+i|whoami|current\s+user|my\s+username)\b/i, 'whoami'],
      [/(?:enviorn|environ|environment\s+variables?|env\s+var)/i, 'env'],
      [/\b(?:what\s+time|current\s+time|show\s+time|what\s+is\s+the\s+time)\b|^(?:date|time)$/i, 'date'],
      [/\b(?:calendar|show\s+cal)\b|^cal$/i, 'cal'],
    ];
    for (const [regex, cmd] of shellMappings) {
      if (regex.test(clauseLower)) {
        entities.command = cmd;
        return 'shell.execute';
      }
    }

    // --- Browser action disambiguation (MUST run before navigation check) ---
    const isWebDestination = /\b(?:http|www|\.com|\.org|\.io|website|page)\b/i.test(clauseLower) || WebDestinations.some(w => clauseLower.includes(w));
    if ((/\bgo\s+to\b/i.test(clauseLower) || /\bnavigate\b/i.test(clauseLower)) && (isWebDestination || entities.URLs?.length)) {
      return 'browser.navigate';
    }
    if (/\bsearch\s+for\b/i.test(clauseLower) || (clauseLower.startsWith('search ') && !clauseLower.includes('file') && !clauseLower.includes('folder'))) {
      return 'browser.search';
    }

    // --- Navigation vs Listing disambiguation ---
    const isNavVerb = /\b(?:go\s+to|navigate\s+to|take\s+me\s+to|bring\s+me\s+to|head\s+to|switch\s+to|jump\s+to|move\s+to|cd\s+into|cd\s+|enter\s+|goto)\b/i.test(clauseLower);
    const isListVerb = /\b(?:show|list|view|content|what\s+is\s+in|files\s+in|files\s+inside)\b/i.test(clauseLower);
    const isFolderContext = entities.folders?.length || entities.paths?.length || /\b(?:folder|directory|dir|download|desktop|document|home)\b/i.test(clauseLower);

    if (isNavVerb && isFolderContext && !isListVerb && !isWebDestination) {
      return 'filesystem.navigate';
    }
    if (isListVerb && isFolderContext) {
      return 'filesystem.list';
    }

    // --- Search/Locate disambiguation ---
    if (/\b(?:where|locate|find\s+folder|find\s+file|tell\s+me\s+the\s+path|search\s+folder|search\s+file)\b/i.test(clauseLower) && isFolderContext) {
      return 'filesystem.search';
    }
    if (/\b(?:find\s+every|find\s+all|find\s+any)\b/i.test(clauseLower) || (/\bfind\b/i.test(clauseLower) && /\b(?:larger|smaller|mb|gb|kb)\b/i.test(clauseLower))) {
      return 'filesystem.search';
    }

    // --- Read file disambiguation ---
    if (/\b(?:read|cat|view|display)\s+(?:file|the\s+file)\b/i.test(clauseLower) || clauseLower.startsWith('cat ') || /\bcontents\s+of\s+file\b/i.test(clauseLower)) {
      return 'filesystem.read';
    }

    // --- Create file vs Create folder disambiguation ---
    if (/\b(?:make|create|new|add|mkdir)\b/i.test(clauseLower) && /\b(?:folder|directory|dir)\b/i.test(clauseLower)) {
      return 'filesystem.mkdir';
    }
    if (/\b(?:make|create|new|add|touch)\b/i.test(clauseLower) && /\b(?:file|files)\b/i.test(clauseLower) && !/\b(?:folder|directory|dir)\b/i.test(clauseLower)) {
      return 'filesystem.create';
    }

    // --- Delete disambiguation ---
    if (/\b(?:delete|remove|destroy|erase)\b/i.test(clauseLower) && /\b(?:file|folder|directory|dir)\b/i.test(clauseLower)) {
      return 'filesystem.delete';
    }

    // --- Process listing vs Process killing disambiguation ---
    // Must come BEFORE kill disambiguation to prevent "show running processes" from being caught by kill
    if (/\b(?:process|processes)\b/i.test(clauseLower) && /\b(?:show|list|view|running|active|what|tell|all\s+the|currently)\b/i.test(clauseLower) && !/\b(?:kill|terminate|stop|end|pkill|killall|force)\b/i.test(clauseLower)) {
      return 'system.processes';
    }

    // --- Running applications listing disambiguation ---
    if ((/\b(?:app|applic|program)\b/i.test(clauseLower)) && (/\b(?:running|active|open|list|show|what)\b/i.test(clauseLower)) && !/\b(?:kill|terminate|stop|quit|close|force)\b/i.test(clauseLower)) {
      return 'application.list_running';
    }

    // --- Port/Network disambiguation ---
    if (/\b(?:port|ports|socket|lsof|netstat)\b/i.test(clauseLower)) {
      return 'network.ports';
    }

    // --- Kill/Stop process disambiguation ---
    if (/\b(?:kill|terminate|pkill|killall|force\s+quit|force\s+close)\b/i.test(clauseLower)) {
      if (/\b(?:force\s+quit|force\s+close)\b/i.test(clauseLower) && /\b(?:app|application)\b/i.test(clauseLower)) {
        return 'application.force_quit';
      }
      return 'system.kill_process';
    }
    // "stop" is ambiguous — only route to kill_process if it's about processes/apps, not about processes listing
    if (/\bstop\b/i.test(clauseLower) && /\b(?:process|app|application|all|chrome|node|safari|firefox|docker)\b/i.test(clauseLower) && !/\b(?:show|list|view|running|active|what|tell)\b/i.test(clauseLower)) {
      return 'system.kill_process';
    }

    // --- Developer tool disambiguation ---
    if (!/\b(?:kill|terminate|pkill|killall|stop|quit|close)\b/.test(clauseLower)) {
      if (/\b(?:vscode|visual\s+studio\s+code|vs\s+code)\b/i.test(clauseLower) || (clauseLower.includes('open ') && /\bvs\b/i.test(clauseLower) && /\bcode\b/i.test(clauseLower))) {
        return 'developer.vscode';
      }
      if (/\bcursor\b/i.test(clauseLower)) return 'developer.cursor';
      if (/\bantigravity\b/i.test(clauseLower)) return 'application.open';
      if (/\bxcode\b/i.test(clauseLower)) return 'developer.xcode';
      if (/\bandroid\s+studio\b/i.test(clauseLower)) return 'developer.android_studio';
    }

    // --- Git sub-command disambiguation ---
    if (/\bgit\b/i.test(clauseLower) || /\bcommit\s+history\b/i.test(clauseLower)) {
      if (/\b(?:log|history|commit\s+history)\b/i.test(clauseLower)) return 'git.log';
      if (/\bclone\b/i.test(clauseLower)) return 'git.clone';
      if (/\bpush\b/i.test(clauseLower)) return 'git.push';
      if (/\bpull\b/i.test(clauseLower)) return 'git.pull';
      if (/\b(?:checkout|switch\s+branch)\b/i.test(clauseLower)) return 'git.checkout';
      if (/\bmerge\b/i.test(clauseLower)) return 'git.merge';
      if (/\bstash\b/i.test(clauseLower)) return 'git.stash';
      if (/\b(?:diff|show\s+changes)\b/i.test(clauseLower)) return 'git.diff';
      if (/\b(?:branch|list\s+branch)\b/i.test(clauseLower)) return 'git.branch';
      if (/\bcommit\b/i.test(clauseLower) && !/\bhistory\b/i.test(clauseLower)) return 'git.commit';
      if (/\bstatus\b/i.test(clauseLower)) { entities.command = 'git status'; return 'shell.execute'; }
    }

    // --- Docker disambiguation ---
    if (/\b(?:docker|container|compose)\b/i.test(clauseLower)) {
      if (/\b(?:image|cached\s+image)\b/i.test(clauseLower)) return 'docker.images';
      if (/\blog\b/i.test(clauseLower)) return 'docker.logs';
      if (/\bexec\b/i.test(clauseLower)) return 'docker.exec';
      if (/\b(?:compose\s+up|start\s+stack)\b/i.test(clauseLower)) return 'docker.compose_up';
      if (/\b(?:compose\s+down|stop\s+stack)\b/i.test(clauseLower)) return 'docker.compose_down';
      if (/\bstop\b/i.test(clauseLower)) return 'docker.stop';
      if (/\brestart\b/i.test(clauseLower)) return 'docker.restart';
      return 'docker.ps';
    }

    // --- Open application (generic) ---
    if (/\b(?:open|launch)\b/i.test(clauseLower) && !isFolderContext && !isListVerb && !entities.URLs?.length && searchToolId === 'unknown.tool') {
      return 'application.open';
    }

    // If ToolSearcher found a good match (score >= 400), trust it
    if (searchScore >= 400 && searchToolId !== 'unknown.tool') {
      return searchToolId;
    }

    return searchToolId;
  }

  /**
   * Enrich entities with parameter names that tools expect.
   */
  private enrichEntities(
    clause: string,
    clauseLower: string,
    toolId: string,
    entities: Record<string, any>,
    activeContextPath?: string
  ): void {
    // --- Filesystem path enrichment ---
    if (toolId === 'filesystem.navigate' || toolId === 'filesystem.list') {
      if (!entities['path'] && !entities['directory']) {
        const m = clause.match(/(?:to|of|in|inside|show|list|view)\s+([^\s]+)/i);
        const rawPath = m ? m[1].trim() : (entities.folders?.[0] || '.');
        entities['path'] = rawPath;
        entities['directory'] = rawPath;
      }
      // Normalize known folder names in path
      if (entities['path'] && entities.folders?.length) {
        entities['path'] = entities.folders[0];
        entities['directory'] = entities.folders[0];
      }
    }

    // --- Mkdir/Create path enrichment ---
    if (toolId === 'filesystem.mkdir') {
      if (!entities['path'] && entities.folders?.length) {
        entities['path'] = entities.folders[0];
      }
    }
    if (toolId === 'filesystem.create') {
      if (!entities['file'] && entities.files?.length) {
        entities['file'] = entities.files[0];
      }
    }
    if (toolId === 'filesystem.delete') {
      if (!entities['path'] && entities.folders?.length) {
        entities['path'] = entities.folders[0];
      }
    }

    if (toolId === 'filesystem.search') {
      // Ensure size extraction
      if (!entities.size) {
        const szMatch = clause.match(/(?:(larger|bigger|greater|over|above|exceeding)|(smaller|less|under|below))\s*(?:than\s*)?(\d+(?:\.\d+)?)\s*(mb|mbs|gb|gbs|kb|kbs|bytes?|b|m|k|g)\b/i);
        if (szMatch && (szMatch[1] || szMatch[2])) {
          const isLarger = Boolean(szMatch[1]);
          const num = szMatch[3];
          const uStr = (szMatch[4] || '').toLowerCase().replace(/s$/, '');
          let u = 'M';
          if (uStr === 'kb' || uStr === 'k') u = 'k'; else if (uStr === 'gb' || uStr === 'g') u = 'G'; else if (uStr === 'byte' || uStr === 'b' || uStr === 'c') u = 'c';
          entities.size = `${isLarger ? '+' : '-'}${num}${u}`;
        }
      }
      if (!entities.pattern && !entities.query) {
        const extMatch = clause.match(/\b(pdf|png|jpg|jpeg|gif|svg|mp4|mp3|mov|avi|zip|tar|gz|txt|md|json|yaml|yml|ts|js|py|rs|go|html|css|sql|csv|doc|docx|xls|xlsx|ppt|pptx)s?\b/i);
        if (extMatch && extMatch[1]) {
          entities.pattern = `*.${extMatch[1].toLowerCase()}`;
          entities.query = `*.${extMatch[1].toLowerCase()}`;
        } else {
          const match = clause.match(/(?:where|path|find|locate|search)\s+(?:(?:is|are|of|for|did\s+you\s+(?:create|make|save|put)|did\s+it\s+(?:create|make|save|put)|to|the|my|a|an)\s+)*(?:(?:folder|directory|dir|file|app|application)\s+)*(?:named?|called)?\s*["']?([a-zA-Z0-9_\-\.]+)/i);
          const name = match && match[1] ? match[1].replace(/\s+(?:folder|directory|dir|file)$/i, '').trim() : (entities.folders?.[0] || entities.files?.[0] || 'folder');
          entities.pattern = name;
          entities.query = name;
        }
      }
      if (!entities.dir) {
        entities.dir = /(?:where|path)/i.test(clauseLower) ? '~' : '.';
      }
    }

    // --- Process/Kill enrichment ---
    if (toolId === 'system.kill_process' || toolId === 'application.force_quit') {
      if (!entities.process && !entities.app) {
        let target = clause.replace(/^.*(?:kill|terminate|stop|end|pkill|killall|force\s+quit|force\s+close)\s+/i, '').trim();
        const cleanWords = /^(?:entirely|completely|all|the|any|every|active|running|processes|process|services|service|apps|app|applications|application|tasks|task|of|called|named|with\s+name|by\s+name|using\s+port|using\s+pid|using|on\s+port|on\s+pid|on|at\s+port|at\s+pid|at|port|pid)\s+/i;
        while (cleanWords.test(target)) {
          target = target.replace(cleanWords, '').trim();
        }
        target = target.replace(/\s+(?:processes|process|services|service|apps|app|applications|application|tasks|task)$/i, '').trim();
        target = target.replace(/["'.!;,?]/g, '').trim();
        if (!target || ['process', 'app', 'application', 'task', 'any'].includes(target.toLowerCase())) {
          target = entities.applications?.[0] || entities.processes?.[0] || 'any';
        }
        entities.process = target;
        entities.app = target;
      }
    }

    // --- Read file enrichment ---
    if (toolId === 'filesystem.read') {
      if (!entities['file'] || (entities['file'] && entities.files?.length > 0 && entities.files[0] !== entities['file'])) {
        // Prefer file with extension from entities.files extracted by EntityExtractor
        const fileWithExt = entities.files?.find((f: string) => /\.[a-z0-9]+$/i.test(f));
        if (fileWithExt) {
          entities['file'] = fileWithExt;
          entities['path'] = fileWithExt;
        } else {
          const m = clause.match(/(?:file|cat|of|read|view|show|display)\s+["']?([^\s,;:"'!?]+\.[a-z0-9]+)/i);
          if (m && m[1]) {
            entities['file'] = m[1];
            entities['path'] = m[1];
          }
        }
      }
    }

    // --- Port enrichment ---
    if (toolId === 'network.ports') {
      if (!entities.port) {
        const m = clause.match(/port\s*[:=]?\s*(\d{2,5})/i) || clause.match(/\b(\d{2,5})\b/);
        if (m && m[1]) {
          const portNum = parseInt(m[1], 10);
          if (portNum > 0 && portNum <= 65535) entities.port = portNum;
        }
      }
    }

    // --- Developer tool path enrichment ---
    if (['developer.vscode', 'developer.cursor', 'developer.xcode', 'developer.android_studio'].includes(toolId)) {
      entities.path = this.resolveFolderPath(clause, entities, activeContextPath);
    }

    // --- Antigravity special handling ---
    if (toolId === 'application.open' && /\bantigravity\b/i.test(clauseLower)) {
      entities.app = 'Antigravity IDE';
      entities.args = [this.resolveFolderPath(clause, entities, activeContextPath)];
    }

    // --- Open application entity enrichment ---
    if (toolId === 'application.open' && !entities.app && !/\bantigravity\b/i.test(clauseLower)) {
      const openInMatch = clause.match(/(?:open|launch)\s+(.+?)\s+(?:in|inside|using|with|via|on|at)\s+([a-z0-9_\-\.\s]+)$/i);
      if (openInMatch && openInMatch[1] && openInMatch[2]) {
        entities.app = openInMatch[2].trim().replace(/^(?:the|my|a|an)\s+/i, '');
        const targetArg = this.resolveFolderPath(openInMatch[1].trim(), entities);
        entities.url = targetArg;
        entities.args = [targetArg];
      } else {
        if (!entities.app) entities.app = (entities['path'] || clause.replace(/^.*(?:open|launch)\s+/i, '').trim()).replace(/^(?:the|my|a|an)\s+/i, '');
      }
    }

    // --- Browser navigate URL enrichment ---
    if (toolId === 'browser.navigate') {
      if (!entities.url && clauseLower.includes('youtube')) entities.url = 'https://youtube.com';
    }

    // --- Browser search query enrichment ---
    if (toolId === 'browser.search') {
      if (!entities.query) entities.query = clause.replace(/^.*search (for )?/i, '').trim();
    }

    // --- WiFi connect SSID enrichment ---
    if (toolId === 'network.wifi.connect') {
      const extractedSsid = entities.ssid || entities.device || entities.SSID?.[0] || clause.replace(/^.*(?:connect|join)\s+(?:(?:me|it|us|device|my|the|wifi|network)\s+)*(?:to|with|from)?\s*/i, '').trim();
      entities.ssid = extractedSsid;
      delete entities.device;
      delete entities.device_names;
      delete entities.bluetooth_devices;
    }

    // --- Bluetooth connect device enrichment ---
    if (toolId === 'network.bluetooth.connect') {
      if (!entities.device && clauseLower.includes('headphones')) entities.device = 'headphones';
    }
  }

  private splitIntoClauses(text: string): string[] {
    const cleaned = text
      .replace(/^(?:hey|hi|hello|please|cero)[\s,]+/i, '')
      .replace(/\.\s+/g, '|')
      .replace(/\.$/, '')
      .replace(/;\s*/g, '|')
      .replace(/,\s*(?:and\s+)?(?:then|next|afterwards|inside\s+(?:it|that|this|the\s+dir(?:ectory)?|the\s+folder)|in\s+(?:it|that|this|the\s+dir(?:ectory)?|the\s+folder))\b/gi, '|$&')
      .replace(/ \b(?:and\s+)?then\b /gi, '|then ')
      .replace(/,\s*(?=(?:make|create|open|delete|remove|run|execute|list|check|find|search|go|navigate)\b)/gi, '|');

    const segments = cleaned.split('|').flatMap(s => {
      if (s.toLowerCase().includes(' and then ')) return s.split(/ \band then\b /i);
      if (s.toLowerCase().includes(' and ') && !s.includes('@') && !s.includes('=')) {
        const parts = s.split(/ \band\b /i);
        if (parts.length === 2 && this.hasActionVerb(parts[1])) {
          return parts;
        }
      }
      if (s.toLowerCase().includes(' then ')) return s.split(/ \bthen\b /i);
      return [s];
    });

    return segments.map(s => s.replace(/^[,|\s]+/, '').trim()).filter(Boolean);
  }

  private hasActionVerb(str: string): boolean {
    const verbs = ['connect', 'disconnect', 'open', 'close', 'launch', 'search', 'go', 'navigate', 'show', 'list', 'turn', 'enable', 'disable', 'start', 'stop', 'scan', 'check', 'make', 'create', 'touch', 'delete', 'remove', 'run', 'execute', 'install', 'uninstall', 'find', 'locate', 'inside', 'in'];
    const firstWord = str.trim().split(/\s+/)[0]?.toLowerCase();
    return verbs.includes(firstWord);
  }

  private summarizeGoal(original: string, tasks: PlannedTask[]): string {
    if (original.length <= 40) {
      const cleaned = original.trim().replace(/\.$/, '');
      return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
    if (tasks.length > 1) {
      return `Sequential execution: ${tasks.map(t => t.tool.split('.').pop()).join(' → ')}`;
    }
    return `Execute ${tasks[0]?.tool || 'requested tool'}`;
  }

  private resolveFolderPath(inputStr: string, entities: Record<string, any>, activeContext?: string): string {
    const lower = inputStr.toLowerCase().trim();
    if (activeContext && (lower.includes('open it') || lower.includes('in it') || lower.includes('open that') || lower.includes('this') || lower.includes('there'))) {
      return activeContext;
    }
    if (lower.includes('this folder') || lower.includes('this directory') || lower.includes('current folder') || lower.includes('current directory') || lower.includes('this project') || lower === 'this' || lower === 'here' || lower === '.' || lower === 'code' || lower === 'cursor' || lower.includes('open ')) {
      return activeContext || '.';
    }
    return entities.path || entities.directory || activeContext || inputStr || '.';
  }
}

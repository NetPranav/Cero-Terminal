/**
 * ShellAstParser.ts
 * 
 * Recursive-descent concrete AST parser for Bash/Zsh/POSIX shell command lines.
 * Accurately parses compound pipelines, subshells, variable assignments,
 * redirections, and command substitutions. Eliminates regex evasion.
 */

export type TokenType =
  | 'WORD'
  | 'ASSIGNMENT'
  | 'PIPE'          // |
  | 'AND_IF'        // &&
  | 'OR_IF'         // ||
  | 'SEMI'          // ;
  | 'AMP'           // &
  | 'LPAREN'        // (
  | 'RPAREN'        // )
  | 'REDIR_OUT'     // >
  | 'REDIR_APPEND'  // >>
  | 'REDIR_IN'      // <
  | 'REDIR_FD'      // 2>, &>, 2>&1, etc.
  | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  start: number;
  end: number;
}

export interface RedirectNode {
  type: 'redirect';
  op: '>' | '>>' | '<' | '2>' | '&>' | '2>&1' | string;
  target: string;
  fd?: number;
}

export interface SimpleCommandNode {
  type: 'simple_command';
  envVars: Record<string, string>;
  name: string;
  args: string[];
  redirects: RedirectNode[];
  substitutions: SimpleCommandNode[];
  rawText: string;
}

export interface SubshellNode {
  type: 'subshell';
  body: ProgramNode;
  redirects: RedirectNode[];
}

export type CommandNode = SimpleCommandNode | SubshellNode;

export interface PipelineNode {
  type: 'pipeline';
  commands: CommandNode[];
}

export interface StatementNode {
  type: 'statement';
  pipeline: PipelineNode;
  operator?: '&&' | '||' | ';' | '&';
}

export interface ProgramNode {
  type: 'program';
  statements: StatementNode[];
  rawText: string;
}

export class ShellAstParser {
  /**
   * Tokenizes a raw shell command line string.
   */
  public static tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    const len = input.length;

    while (i < len) {
      const ch = input[i];

      // Skip whitespace
      if (/\s/.test(ch)) {
        i++;
        continue;
      }

      // Operators
      if (ch === '&') {
        if (input[i + 1] === '&') {
          tokens.push({ type: 'AND_IF', value: '&&', start: i, end: i + 2 });
          i += 2;
        } else if (input[i + 1] === '>') {
          tokens.push({ type: 'REDIR_FD', value: '&>', start: i, end: i + 2 });
          i += 2;
        } else {
          tokens.push({ type: 'AMP', value: '&', start: i, end: i + 1 });
          i++;
        }
        continue;
      }

      if (ch === '|') {
        if (input[i + 1] === '|') {
          tokens.push({ type: 'OR_IF', value: '||', start: i, end: i + 2 });
          i += 2;
        } else {
          tokens.push({ type: 'PIPE', value: '|', start: i, end: i + 1 });
          i++;
        }
        continue;
      }

      if (ch === ';') {
        tokens.push({ type: 'SEMI', value: ';', start: i, end: i + 1 });
        i++;
        continue;
      }

      if (ch === '(') {
        tokens.push({ type: 'LPAREN', value: '(', start: i, end: i + 1 });
        i++;
        continue;
      }

      if (ch === ')') {
        tokens.push({ type: 'RPAREN', value: ')', start: i, end: i + 1 });
        i++;
        continue;
      }

      // Redirections: 2>&1, 2>, >>, >, <
      if (ch === '2' && input[i + 1] === '>' && input[i + 2] === '&' && input[i + 3] === '1') {
        tokens.push({ type: 'REDIR_FD', value: '2>&1', start: i, end: i + 4 });
        i += 4;
        continue;
      }

      if (ch === '2' && input[i + 1] === '>') {
        tokens.push({ type: 'REDIR_FD', value: '2>', start: i, end: i + 2 });
        i += 2;
        continue;
      }

      if (ch === '>') {
        if (input[i + 1] === '>') {
          tokens.push({ type: 'REDIR_APPEND', value: '>>', start: i, end: i + 2 });
          i += 2;
        } else {
          tokens.push({ type: 'REDIR_OUT', value: '>', start: i, end: i + 1 });
          i++;
        }
        continue;
      }

      if (ch === '<') {
        tokens.push({ type: 'REDIR_IN', value: '<', start: i, end: i + 1 });
        i++;
        continue;
      }

      // Word, quotes, assignments, command substitutions
      const wordStart = i;
      let wordValue = '';

      while (i < len && !/\s/.test(input[i]) && !['|', '&', ';', '(', ')'].includes(input[i])) {
        const curr = input[i];

        // Redirection boundary inside word (e.g. echo foo>out)
        if ((curr === '>' || curr === '<') && wordValue.length > 0) {
          break;
        }

        // Backslash escape
        if (curr === '\\' && i + 1 < len) {
          wordValue += input[i + 1];
          i += 2;
          continue;
        }

        // Single quote (literal preserve)
        if (curr === "'") {
          const closeIdx = input.indexOf("'", i + 1);
          if (closeIdx === -1) {
            // Unclosed single quote
            wordValue += input.slice(i);
            i = len;
            break;
          } else {
            wordValue += input.slice(i, closeIdx + 1);
            i = closeIdx + 1;
            continue;
          }
        }

        // Double quote
        if (curr === '"') {
          let str = '"';
          i++;
          while (i < len && input[i] !== '"') {
            if (input[i] === '\\' && i + 1 < len) {
              str += input[i] + input[i + 1];
              i += 2;
            } else {
              str += input[i];
              i++;
            }
          }
          if (i < len && input[i] === '"') {
            str += '"';
            i++; // skip closing quote
          }
          wordValue += str;
          continue;
        }

        // Command substitution $( ... )
        if (curr === '$' && input[i + 1] === '(') {
          let depth = 1;
          let subIdx = i + 2;
          let subStr = '$(';
          while (subIdx < len && depth > 0) {
            if (input[subIdx] === '(') depth++;
            else if (input[subIdx] === ')') depth--;
            subStr += input[subIdx];
            subIdx++;
          }
          wordValue += subStr;
          i = subIdx;
          continue;
        }

        // Backticks ` ... `
        if (curr === '`') {
          const closeTick = input.indexOf('`', i + 1);
          if (closeTick === -1) {
            wordValue += input.slice(i);
            i = len;
          } else {
            wordValue += input.slice(i, closeTick + 1);
            i = closeTick + 1;
          }
          continue;
        }

        wordValue += curr;
        i++;
      }

      // Check if this word is a variable assignment (e.g. FOO=bar, PORT=3000)
      // Must not start with a number and must contain '=' not preceded by special chars
      const assignMatch = wordValue.match(/^[a-zA-Z_][a-zA-Z0-9_]*=(.*)$/);
      if (assignMatch && (tokens.length === 0 || (
        tokens[tokens.length - 1].type === 'PIPE' ||
        tokens[tokens.length - 1].type === 'AND_IF' ||
        tokens[tokens.length - 1].type === 'OR_IF' ||
        tokens[tokens.length - 1].type === 'SEMI' ||
        tokens[tokens.length - 1].type === 'LPAREN' ||
        tokens[tokens.length - 1].type === 'ASSIGNMENT'
      ))) {
        tokens.push({ type: 'ASSIGNMENT', value: wordValue, start: wordStart, end: i });
      } else {
        tokens.push({ type: 'WORD', value: wordValue, start: wordStart, end: i });
      }
    }

    tokens.push({ type: 'EOF', value: '', start: len, end: len });
    return tokens;
  }

  /**
   * Validates the syntactic integrity of a shell command line.
   */
  public static validateSyntax(commandLine: string): { valid: boolean; error?: string } {
    if (!commandLine || !commandLine.trim()) {
      return { valid: true };
    }

    // Check unmatched single quotes
    let inSingle = false;
    let inDouble = false;
    let escaped = false;
    let parenDepth = 0;

    for (let i = 0; i < commandLine.length; i++) {
      const c = commandLine[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (c === '\\' && !inSingle) {
        escaped = true;
        continue;
      }
      if (c === "'" && !inDouble) {
        inSingle = !inSingle;
        continue;
      }
      if (c === '"' && !inSingle) {
        inDouble = !inDouble;
        continue;
      }
      if (!inSingle && !inDouble) {
        if (c === '(') parenDepth++;
        else if (c === ')') parenDepth--;
      }
    }

    if (inSingle) return { valid: false, error: 'Unterminated single quote in command' };
    if (inDouble) return { valid: false, error: 'Unterminated double quote in command' };
    if (parenDepth > 0) return { valid: false, error: 'Unclosed subshell parenthesis' };
    if (parenDepth < 0) return { valid: false, error: 'Unexpected closing parenthesis' };

    try {
      this.parse(commandLine);
      return { valid: true };
    } catch (err: any) {
      return { valid: false, error: err.message || 'Syntax error in shell command' };
    }
  }

  /**
   * Parses the command line into an abstract syntax tree ProgramNode.
   */
  public static parse(commandLine: string): ProgramNode {
    const tokens = this.tokenize(commandLine);
    let pos = 0;

    const peek = (): Token => tokens[pos];
    const consume = (): Token => tokens[pos++];
    const match = (type: TokenType): boolean => {
      if (peek().type === type) {
        pos++;
        return true;
      }
      return false;
    };

    const parseProgram = (): ProgramNode => {
      const statements: StatementNode[] = [];

      while (peek().type !== 'EOF' && peek().type !== 'RPAREN') {
        const pipeline = parsePipeline();
        let operator: '&&' | '||' | ';' | '&' | undefined;

        if (peek().type === 'AND_IF') {
          consume();
          operator = '&&';
        } else if (peek().type === 'OR_IF') {
          consume();
          operator = '||';
        } else if (peek().type === 'SEMI') {
          consume();
          operator = ';';
        } else if (peek().type === 'AMP') {
          consume();
          operator = '&';
        }

        statements.push({ type: 'statement', pipeline, operator });

        // Skip any trailing semicolons
        while (peek().type === 'SEMI') {
          consume();
        }
      }

      return { type: 'program', statements, rawText: commandLine };
    };

    const parsePipeline = (): PipelineNode => {
      const commands: CommandNode[] = [];
      commands.push(parseCommand());

      while (peek().type === 'PIPE') {
        consume(); // consume '|'
        if (peek().type === 'EOF' || peek().type === 'PIPE' || peek().type === 'AND_IF' || peek().type === 'OR_IF') {
          throw new Error('Dangling pipe operator without following command');
        }
        commands.push(parseCommand());
      }

      return { type: 'pipeline', commands };
    };

    const parseCommand = (): CommandNode => {
      // Subshell: ( ... )
      if (peek().type === 'LPAREN') {
        consume(); // consume '('
        const subProgram = parseProgram();
        if (peek().type !== 'RPAREN') {
          throw new Error('Expected closing parenthesis for subshell');
        }
        consume(); // consume ')'

        const redirects = parseRedirects();
        return {
          type: 'subshell',
          body: subProgram,
          redirects,
        };
      }

      // Simple command
      const envVars: Record<string, string> = {};
      while (peek().type === 'ASSIGNMENT') {
        const token = consume();
        const eqIdx = token.value.indexOf('=');
        const key = token.value.substring(0, eqIdx);
        const val = token.value.substring(eqIdx + 1);
        envVars[key] = val;
      }

      const words: string[] = [];
      const redirects: RedirectNode[] = [];
      const substitutions: SimpleCommandNode[] = [];

      while (
        peek().type === 'WORD' ||
        peek().type === 'REDIR_OUT' ||
        peek().type === 'REDIR_APPEND' ||
        peek().type === 'REDIR_IN' ||
        peek().type === 'REDIR_FD'
      ) {
        if (
          peek().type === 'REDIR_OUT' ||
          peek().type === 'REDIR_APPEND' ||
          peek().type === 'REDIR_IN' ||
          peek().type === 'REDIR_FD'
        ) {
          const redirToken = consume();
          let target = '';
          if (redirToken.value === '2>&1') {
            target = '&1';
          } else if (peek().type === 'WORD') {
            target = consume().value;
          }
          redirects.push({
            type: 'redirect',
            op: redirToken.value,
            target,
          });
        } else {
          const wordToken = consume();
          words.push(wordToken.value);

          // Extract any embedded command substitutions $(...) or `...`
          const extractedSubs = extractSubstitutions(wordToken.value);
          for (const sub of extractedSubs) {
            try {
              const subAst = ShellAstParser.parse(sub);
              const subCmds = ShellAstParser.getAllSimpleCommands(subAst);
              substitutions.push(...subCmds);
            } catch {
              // Ignore sub-parse failures
            }
          }
        }
      }

      const name = words.length > 0 ? words[0].replace(/^['"]|['"]$/g, '') : '';
      const args = words.length > 1 ? words.slice(1) : [];

      return {
        type: 'simple_command',
        envVars,
        name,
        args,
        redirects,
        substitutions,
        rawText: words.join(' '),
      };
    };

    const parseRedirects = (): RedirectNode[] => {
      const redirects: RedirectNode[] = [];
      while (
        peek().type === 'REDIR_OUT' ||
        peek().type === 'REDIR_APPEND' ||
        peek().type === 'REDIR_IN' ||
        peek().type === 'REDIR_FD'
      ) {
        const redirToken = consume();
        let target = '';
        if (redirToken.value === '2>&1') {
          target = '&1';
        } else if (peek().type === 'WORD') {
          target = consume().value;
        }
        redirects.push({
          type: 'redirect',
          op: redirToken.value,
          target,
        });
      }
      return redirects;
    };

    const extractSubstitutions = (str: string): string[] => {
      const subs: string[] = [];
      // Matches $(cmd)
      let idx = 0;
      while ((idx = str.indexOf('$(', idx)) !== -1) {
        let depth = 1;
        let end = idx + 2;
        while (end < str.length && depth > 0) {
          if (str[end] === '(') depth++;
          else if (str[end] === ')') depth--;
          end++;
        }
        if (depth === 0) {
          subs.push(str.slice(idx + 2, end - 1));
        }
        idx = end;
      }
      // Matches `cmd`
      let bIdx = 0;
      while ((bIdx = str.indexOf('`', bIdx)) !== -1) {
        const nextB = str.indexOf('`', bIdx + 1);
        if (nextB !== -1) {
          subs.push(str.slice(bIdx + 1, nextB));
          bIdx = nextB + 1;
        } else {
          break;
        }
      }
      return subs;
    };

    return parseProgram();
  }

  /**
   * Recursively extracts all SimpleCommandNodes across pipelines, subshells,
   * and command substitutions.
   */
  public static getAllSimpleCommands(ast: ProgramNode): SimpleCommandNode[] {
    const list: SimpleCommandNode[] = [];

    const traverse = (node: ProgramNode | PipelineNode | CommandNode) => {
      if (node.type === 'program') {
        for (const stmt of node.statements) {
          traverse(stmt.pipeline);
        }
      } else if (node.type === 'pipeline') {
        for (const cmd of node.commands) {
          traverse(cmd);
        }
      } else if (node.type === 'subshell') {
        traverse(node.body);
      } else if (node.type === 'simple_command') {
        if (node.name) {
          list.push(node);
        }
        for (const sub of node.substitutions) {
          list.push(sub);
        }
      }
    };

    traverse(ast);
    return list;
  }

  /**
   * Extracts clean executable binary names from a command line.
   * Excludes environment variable assignments like PORT=3000.
   */
  public static extractBinaries(commandLine: string): string[] {
    try {
      const ast = this.parse(commandLine);
      const cmds = this.getAllSimpleCommands(ast);
      return Array.from(new Set(cmds.map(c => c.name).filter(Boolean)));
    } catch {
      // Fallback
      return [];
    }
  }

  /**
   * Evaluates if any command in the AST performs a catastrophic destructive operation.
   */
  public static isDestructiveOperation(ast: ProgramNode): { isDestructive: boolean; reasons: string[] } {
    const cmds = this.getAllSimpleCommands(ast);
    const reasons: string[] = [];

    for (const cmd of cmds) {
      const bin = cmd.name;
      const args = cmd.args;
      const fullCmd = `${bin} ${args.join(' ')}`;

      // 1. Recursive root deletion: rm -rf / or rm -rf /*
      if (bin === 'rm') {
        const hasRecursive = args.some(a => a.includes('r') || a.includes('R'));
        const hasForce = args.some(a => a.includes('f'));
        const targetsRoot = args.some(a => a === '/' || a === '/*' || a === '~' || a === '$HOME');
        if (hasRecursive && (targetsRoot || hasForce && targetsRoot)) {
          reasons.push(`Destructive root deletion detected: ${fullCmd}`);
        }
      }

      // 2. Drive overwrite / disk wipe: dd if=... of=/dev/...
      if (bin === 'dd') {
        const writesToDevice = args.some(a => a.startsWith('of=/dev/'));
        if (writesToDevice) {
          reasons.push(`Direct block device overwrite detected: ${fullCmd}`);
        }
      }

      // 3. Filesystem formatting: mkfs, diskutil eraseDisk
      if (bin.startsWith('mkfs') || (bin === 'diskutil' && args.includes('eraseDisk'))) {
        reasons.push(`Filesystem format / drive erasure detected: ${fullCmd}`);
      }

      // 4. Recursive permission wipe on root: chmod -R 777 /
      if (bin === 'chmod' || bin === 'chown') {
        const hasRecursive = args.some(a => a.includes('R'));
        const targetsRoot = args.some(a => a === '/' || a === '/*' || a === '/System');
        if (hasRecursive && targetsRoot) {
          reasons.push(`Root permission wipe detected: ${fullCmd}`);
        }
      }

      // 5. Fork bomb pattern: :(){ :|:& };:
      if (fullCmd.includes(':(){ :|:& };:') || fullCmd.includes('fork bomb')) {
        reasons.push(`Fork bomb pattern detected`);
      }
    }

    return {
      isDestructive: reasons.length > 0,
      reasons,
    };
  }

  /**
   * Evaluates if a shell command line or AST uses obfuscated execution techniques.
   * Detects:
   *  - Decoding pipelines: base64 -d | sh, xxd -r | bash, etc.
   *  - Network payload piping: curl | sh, wget | bash, etc.
   *  - Command substitutions inside eval or execution targets: eval $(...), etc.
   *  - Inline script decoding execution: python -c "exec(b64decode...)", perl -e "eval...", etc.
   *  - Shell variable IFS bypasses: ${IFS}
   *  - ANSI-C quoting or hex escapes in binary execution: $'\x...', \x2f\x62\x69\x6e
   */
  public static isObfuscatedExecution(astOrCommand: ProgramNode | string): { isObfuscated: boolean; reasons: string[] } {
    const reasons: string[] = [];
    let ast: ProgramNode;
    let rawText: string = '';

    if (typeof astOrCommand === 'string') {
      rawText = astOrCommand;
      // 1. Check raw text for whitespace/character evasion techniques
      if (/\$\{IFS\}|\$IFS\b/.test(rawText)) {
        reasons.push('Shell $IFS whitespace obfuscation bypass detected');
      }
      if (/\$'(?:\\x[0-9a-fA-F]{2}|\\[0-7]{3})+'/.test(rawText)) {
        reasons.push('ANSI-C hex/octal string escape execution detected');
      }
      if (/(?:\\x[0-9a-fA-F]{2}){3,}/.test(rawText)) {
        reasons.push('Hex encoded byte sequence detected');
      }
      if (/\/(?:dev\/tcp|dev\/udp)\//.test(rawText)) {
        reasons.push('Direct socket pseudo-device network redirection detected');
      }

      try {
        ast = this.parse(rawText);
      } catch {
        // If syntax is too warped to parse, but contains obfuscation tokens, return true
        if (reasons.length > 0) {
          return { isObfuscated: true, reasons };
        }
        return { isObfuscated: false, reasons: [] };
      }
    } else {
      ast = astOrCommand;
      rawText = ast.rawText || '';
    }

    const shells = new Set(['sh', 'bash', 'zsh', 'dash', 'ash', 'ksh', 'fish', 'source', '.']);
    const decoders = new Set(['base64', 'uudecode', 'xxd', 'openssl']);
    const downloaders = new Set(['curl', 'wget', 'fetch', 'nc', 'ncat', 'netcat']);

    // 2. Check pipelines
    for (const stmt of ast.statements) {
      const pipeline = stmt.pipeline;
      if (pipeline && pipeline.commands && pipeline.commands.length > 1) {
        for (let i = 1; i < pipeline.commands.length; i++) {
          const targetNode = pipeline.commands[i];
          const prevNode = pipeline.commands[i - 1];

          if (targetNode.type === 'simple_command') {
            const targetBin = targetNode.name.toLowerCase();

            // Piped into a shell
            if (shells.has(targetBin)) {
              if (prevNode.type === 'simple_command') {
                const prevBin = prevNode.name.toLowerCase();
                const prevArgs = prevNode.args;

                // base64 -d / base64 --decode | sh
                if (decoders.has(prevBin)) {
                  reasons.push(`Decoded pipeline execution: '${prevBin} ${prevArgs.join(' ')}' piped into shell '${targetBin}'`);
                }

                // curl ... | sh
                if (downloaders.has(prevBin)) {
                  reasons.push(`Remote script piped directly into shell: '${prevBin}' piped into '${targetBin}'`);
                }

                // printf with hex/octal or echo -e with escapes | sh
                if ((prevBin === 'printf' || prevBin === 'echo') && (prevArgs.some(a => /\\x|\\0/.test(a)) || prevArgs.includes('-e'))) {
                  reasons.push(`Escaped output piped into shell: '${prevBin}' piped into '${targetBin}'`);
                }
              }
            }
          }
        }
      }
    }

    // 3. Check simple commands
    const allCmds = this.getAllSimpleCommands(ast);
    for (const cmd of allCmds) {
      const bin = cmd.name.toLowerCase();
      const args = cmd.args;
      const joinedArgs = args.join(' ');

      // eval with command substitutions or dynamic variables
      if (bin === 'eval') {
        if (cmd.substitutions.length > 0 || joinedArgs.includes('$(') || joinedArgs.includes('`') || joinedArgs.includes('$')) {
          reasons.push(`Dynamic eval execution: eval ${joinedArgs}`);
        }
      }

      // bash -c / sh -c with command substitutions or base64 decoding
      if (shells.has(bin) && (args.includes('-c') || args.includes('-e'))) {
        if (joinedArgs.includes('base64') || joinedArgs.includes('$(') || joinedArgs.includes('`')) {
          reasons.push(`Shell sub-process with dynamic/encoded payload: ${bin} ${joinedArgs}`);
        }
      }

      // Inline script interpreters with decode/exec
      if (bin.startsWith('python') || bin === 'py') {
        if (args.includes('-c') && (/exec\s*\(|b64decode|codecs\.decode/.test(joinedArgs))) {
          reasons.push(`Python inline script execution with dynamic decoding/exec: ${joinedArgs}`);
        }
      }
      if (bin === 'perl') {
        if (args.includes('-e') && (/eval\s*\(|decode_base64/.test(joinedArgs))) {
          reasons.push(`Perl inline script execution with eval/decode: ${joinedArgs}`);
        }
      }
      if (bin === 'node') {
        if (args.includes('-e') && (/eval\s*\(|Buffer\.from\(.*'base64'\)/.test(joinedArgs))) {
          reasons.push(`Node inline script execution with eval/base64: ${joinedArgs}`);
        }
      }
    }

    return {
      isObfuscated: reasons.length > 0,
      reasons
    };
  }
}

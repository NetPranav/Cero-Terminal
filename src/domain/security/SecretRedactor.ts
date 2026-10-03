/**
 * SecretRedactor.ts — Phase 0.5, Item 14
 *
 * Scans text for common secret/credential patterns and replaces them
 * with `[REDACTED:<type>]` placeholders before the text is persisted
 * to learned_patterns.json, episodic_memory.json, audit logs, or
 * benchmark traces.
 *
 * Coverage:
 *  - AWS access keys (AKIA…)
 *  - Bearer / API tokens
 *  - .env-style KEY=value lines matching known secret keywords
 *  - SSH private key blocks
 *  - Generic high-entropy strings adjacent to secret keywords
 *  - GitHub / GitLab personal access tokens
 *  - Base64-encoded JWT tokens
 */

export class SecretRedactor {
  private static readonly PATTERNS: { regex: RegExp; label: string }[] = [
    // === HIGH-SPECIFICITY PATTERNS FIRST (must run before generic catch-all) ===

    // AWS Access Key IDs (always start with AKIA, 20 uppercase alphanumeric)
    { regex: /\b(AKIA[0-9A-Z]{16})\b/g, label: 'AWS_KEY' },

    // AWS Secret Access Keys (40 chars, mixed case + digits + slashes)
    { regex: /(?<=aws_secret_access_key\s*[=:]\s*)[A-Za-z0-9/+=]{40}/gi, label: 'AWS_SECRET' },

    // GitHub Personal Access Tokens (ghp_, gho_, ghu_, ghs_, ghr_)
    { regex: /\b(gh[pousr]_[A-Za-z0-9_]{36,255})\b/g, label: 'GITHUB_TOKEN' },

    // GitLab Personal / Project / Group tokens
    { regex: /\b(glpat-[A-Za-z0-9\-_]{20,})\b/g, label: 'GITLAB_TOKEN' },

    // SSH private key blocks
    // (any type, including PKCS#8 "PRIVATE KEY" and "ENCRYPTED PRIVATE KEY"; a truncated block counts too)
    { regex: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z0-9 ]*PRIVATE KEY-----|$)/g, label: 'SSH_PRIVATE_KEY' },

    // OpenAI / Anthropic API keys
    { regex: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}/g, label: 'API_KEY' },

    // Google API keys
    { regex: /\bAIza[0-9A-Za-z_-]{35}\b/g, label: 'GOOGLE_API_KEY' },

    // Slack tokens
    { regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, label: 'SLACK_TOKEN' },

    // JWT tokens (three dot-separated base64 segments)
    { regex: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, label: 'JWT_TOKEN' },

    // Slack webhook URLs
    { regex: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/g, label: 'SLACK_WEBHOOK' },

    // Bearer tokens in headers
    { regex: /(?:Bearer\s+)([A-Za-z0-9\-._~+/]+=*)/gi, label: 'BEARER_TOKEN' },

    // === GENERIC CATCH-ALL PATTERNS LAST ===

    // Generic hex strings (32+ chars) adjacent to known keywords
    {
      regex: /(?:secret|key|token|password|credential|auth)\s*[=:]\s*['"]?([0-9a-f]{32,})['"]?/gi,
      label: 'HEX_SECRET'
    },

    // Generic "token", "api_key", "apikey", "secret", "password", "auth" assignment patterns
    // Matches: TOKEN=abc123, api_key: "xyz", password = 's3cret', etc.
    // This runs LAST so specific token formats (GitHub, GitLab, JWT) are already redacted.
    {
      regex: /(?:^|[^a-zA-Z0-9_])((?:[A-Za-z0-9]+[_-])*(?:api[_-]?key|api[_-]?secret|auth[_-]?token|access[_-]?token|access[_-]?key|secret[_-]?access[_-]?key|secret[_-]?key|password|passwd|token|private[_-]?key|client[_-]?secret|app[_-]?secret)\s*[=:]\s*['"]?)([^\s'"}{,\]]+)/gim,
      label: 'SECRET_VALUE'
    },
  ];

  /**
   * Redact secrets from the given text, returning the sanitized version.
   */
  public static redact(text: string): string {
    if (!text) return text;

    let result = text;

    for (const { regex, label } of SecretRedactor.PATTERNS) {
      // Reset lastIndex for global regexes
      regex.lastIndex = 0;

      result = result.replace(regex, (fullMatch, ...groups) => {
        // For patterns that use capture groups, only redact the captured secret portion
        if (label === 'SECRET_VALUE') {
          // Group 1 = keyword+delimiter, Group 2 = the actual secret value
          const keyword = groups[0] || '';
          const value = groups[1] || '';
          // Skip if the value was already redacted by a more specific pattern
          if (value.includes('[REDACTED:')) return fullMatch;
          // Keep the boundary character matched before the name (a newline, space or quote)
          const lead = fullMatch.slice(0, fullMatch.indexOf(keyword));
          return lead + keyword + `[REDACTED:${label}]`;
        }
        if (label === 'BEARER_TOKEN') {
          return `Bearer [REDACTED:${label}]`;
        }
        if (label === 'AWS_SECRET') {
          return `[REDACTED:${label}]`;
        }
        if (label === 'HEX_SECRET') {
          // Preserve the keyword prefix, redact the hex value
          const secretVal = groups[0];
          return fullMatch.replace(secretVal, `[REDACTED:${label}]`);
        }
        return `[REDACTED:${label}]`;
      });
    }

    return result;
  }

  /**
   * Check if text contains any detectable secrets.
   */
  public static containsSecrets(text: string): boolean {
    if (!text) return false;

    for (const { regex } of SecretRedactor.PATTERNS) {
      regex.lastIndex = 0;
      if (regex.test(text)) return true;
    }

    return false;
  }

  /**
   * Recursively traverses an object, array, or primitive and redacts all string values.
   */
  public static redactObject<T>(obj: T): T {
    if (obj === null || obj === undefined) return obj;
    if (typeof obj === 'string') return SecretRedactor.redact(obj) as unknown as T;
    if (Array.isArray(obj)) return obj.map(item => SecretRedactor.redactObject(item)) as unknown as T;
    if (typeof obj === 'object') {
      const res: any = {};
      for (const [k, v] of Object.entries(obj)) {
        res[k] = SecretRedactor.redactObject(v);
      }
      return res;
    }
    return obj;
  }
}

// ---- Credential files: commands that name one always ask first -------------------------------
// `cat ~/.ssh/id_rsa` looks read-only, so it used to run without asking and its output went to the
// model (a cloud model, when one is configured).

/** Files and stores that hold credentials; any command that names one needs consent. */
const SECRET_PATH = new RegExp([
  String.raw`\.ssh[\\/](?![\w.-]*\.pub\b)(?!known_hosts\b)`,
  String.raw`\bid_(?:rsa|dsa|ecdsa|ed25519)(?!\.pub)\b`,
  String.raw`\.gnupg\b`,
  String.raw`\.aws[\\/](?:credentials|config)\b`,
  String.raw`\.config[\\/](?:gcloud|gh)\b`,
  String.raw`\.azure\b`,
  String.raw`\.kube[\\/]config\b`,
  String.raw`\.docker[\\/]config\.json\b`,
  String.raw`\.(?:netrc|npmrc|pypirc|git-credentials|pgpass|my\.cnf)\b`,
  String.raw`(?:^|[\s'"=\\/])\.env(?:\.[\w-]+)?(?=$|[\s'";|&)])`,
  String.raw`\.(?:pem|key|p12|pfx|keystore|jks)\b`,
  String.raw`/etc/(?:shadow|gshadow|sudoers)\b`,
  String.raw`\bKeychains?\b`,
  String.raw`\bsecurity\s+(?:find|dump)-(?:generic|internet)-password\b|\bsecurity\s+dump-keychain\b`,
  String.raw`\bsecret-tool\s+lookup\b`,
  String.raw`\.password-store\b`,
  String.raw`\.terraform\.d[\\/]credentials`,
].join('|'), 'i');

export function referencesSecretPath(commandLine: string): boolean {
  return SECRET_PATH.test(commandLine || '');
}

/** Text handed to a model (command output, pane output, file contents): keys and tokens masked */
export function redactSecrets(text: string): string {
  return SecretRedactor.redact(text);
}

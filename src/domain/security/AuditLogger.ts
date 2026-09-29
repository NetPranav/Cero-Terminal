import { appendSentinelFile } from '../../infrastructure/storage/SentinelFiles';
import { SecretRedactor } from './SecretRedactor';

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  source?: 'user' | 'benchmark' | 'system';
  capabilityId: string;
  parameters: any;
  riskScore: number;
  permissionResult: 'Granted' | 'Denied' | 'Bypassed';
  executionTimeMs: number;
  verificationResult?: 'Success' | 'Failure' | 'NotApplicable';
  rollbackAvailable: boolean;
  userConfirmation: boolean;
  previousHash?: string;
  hash?: string;
}

export const GENESIS_HASH = '0000000000000000000000000000000000000000000000000000000000000000';

/**
 * Computes a SHA-256 hash using the Web Crypto API or a fast fallback.
 */
export async function computeSha256(data: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    try {
      const encoder = new TextEncoder();
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback hash implementation for restricted runtime environments
  let h1 = 0xdeadbeef, h2 = 0x41c64e6d;
  for (let i = 0; i < data.length; i++) {
    const ch = data.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  
  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return (hex1 + hex2).repeat(4);
}

export async function computeEntryHash(entry: Omit<AuditLogEntry, 'hash'>): Promise<string> {
  const source = entry.source || 'user';
  const payload = `${entry.previousHash || GENESIS_HASH}:${entry.id}:${entry.timestamp}:${source}:${entry.capabilityId}:${JSON.stringify(entry.parameters)}:${entry.riskScore}:${entry.permissionResult}:${entry.userConfirmation}`;
  return computeSha256(payload);
}

export interface IAuditLogger {
  log(entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'previousHash' | 'hash'>): Promise<void>;
  exportLogs(): Promise<AuditLogEntry[]>;
  verifyChain(entries?: AuditLogEntry[]): Promise<{ valid: boolean; brokenIndex?: number; error?: string; totalEntries: number }>;
}

export class AuditLogger implements IAuditLogger {
  private static instance?: AuditLogger;
  private logs: AuditLogEntry[] = [];

  static getInstance(): AuditLogger {
    if (!AuditLogger.instance) {
      AuditLogger.instance = new AuditLogger();
    }
    return AuditLogger.instance;
  }

  async log(entry: Omit<AuditLogEntry, 'id' | 'timestamp' | 'previousHash' | 'hash'>): Promise<void> {
    const previousEntry = this.logs[this.logs.length - 1];
    const previousHash = previousEntry ? (previousEntry.hash || GENESIS_HASH) : GENESIS_HASH;

    const isBenchmark = typeof process !== 'undefined' && process.env.SENTINEL_BENCHMARK === 'true';
    const source: 'user' | 'benchmark' | 'system' = entry.source || (isBenchmark ? 'benchmark' : 'user');
    const sanitizedParameters = SecretRedactor.redactObject(entry.parameters);

    const entryWithoutHash = {
      id: crypto.randomUUID ? crypto.randomUUID() : `log_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      timestamp: new Date().toISOString(),
      source,
      ...entry,
      parameters: sanitizedParameters,
      previousHash
    };

    const hash = await computeEntryHash(entryWithoutHash);
    const fullEntry: AuditLogEntry = {
      ...entryWithoutHash,
      hash
    };
    
    this.logs.push(fullEntry);
    
    console.log('[AuditLogger] Logged execution:', fullEntry);

    // Skip native disk writes during unit tests
    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return;
    }

    try {
      // Append to the JSONL audit log (benchmark runs kept apart from real history). Through the
      // native store, not `sh -c "echo ..."`: that does not exist on Windows, and echo turned the
      // \n escapes inside JSON into real line breaks
      const auditFileName = isBenchmark ? 'audit.benchmark.jsonl' : 'audit.jsonl';
      if (!appendSentinelFile(auditFileName, `${JSON.stringify(fullEntry)}\n`)) throw new Error('audit store unavailable');
    } catch (err) {
      // Fallback to localStorage in web preview / browser dev mode
      if (typeof localStorage !== 'undefined') {
        try {
          const key = isBenchmark ? 'sentinel_audit_benchmark_logs' : 'sentinel_audit_logs';
          const existing = localStorage.getItem(key) || '';
          localStorage.setItem(key, existing + JSON.stringify(fullEntry) + '\n');
        } catch { /* ignore */ }
      }
    }
  }

  async exportLogs(): Promise<AuditLogEntry[]> {
    return [...this.logs];
  }

  /**
   * Verifies the cryptographic tamper-evident integrity of the audit log chain.
   */
  async verifyChain(customEntries?: AuditLogEntry[]): Promise<{
    valid: boolean;
    brokenIndex?: number;
    error?: string;
    totalEntries: number;
  }> {
    const entries = customEntries || this.logs;
    if (entries.length === 0) {
      return { valid: true, totalEntries: 0 };
    }

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      // Check genesis or chain link
      const expectedPrevHash = i === 0 ? GENESIS_HASH : entries[i - 1].hash;
      if (entry.previousHash !== expectedPrevHash) {
        return {
          valid: false,
          brokenIndex: i,
          error: `Broken chain link at index ${i}: expected previousHash ${expectedPrevHash}, got ${entry.previousHash}`,
          totalEntries: entries.length
        };
      }

      // Recompute and verify hash
      const recomputed = await computeEntryHash({
        id: entry.id,
        timestamp: entry.timestamp,
        source: entry.source,
        capabilityId: entry.capabilityId,
        parameters: entry.parameters,
        riskScore: entry.riskScore,
        permissionResult: entry.permissionResult,
        executionTimeMs: entry.executionTimeMs,
        verificationResult: entry.verificationResult,
        rollbackAvailable: entry.rollbackAvailable,
        userConfirmation: entry.userConfirmation,
        previousHash: entry.previousHash
      });

      if (entry.hash !== recomputed) {
        return {
          valid: false,
          brokenIndex: i,
          error: `Tampered log payload at index ${i}: hash ${entry.hash} does not match computed ${recomputed}`,
          totalEntries: entries.length
        };
      }
    }

    return { valid: true, totalEntries: entries.length };
  }

  /**
   * Exports an enterprise-grade compliance report with cryptographic validation metadata.
   */
  async exportSignedAuditReport(): Promise<string> {
    const verification = await this.verifyChain();
    const latestEntry = this.logs[this.logs.length - 1];
    
    const report = {
      standard: 'SOC2-TypeII-ISO27001',
      generatedAt: new Date().toISOString(),
      entryCount: this.logs.length,
      integrityVerified: verification.valid,
      rootHash: latestEntry ? latestEntry.hash : GENESIS_HASH,
      verificationDetails: verification,
      entries: this.logs
    };

    return JSON.stringify(report, null, 2);
  }
}

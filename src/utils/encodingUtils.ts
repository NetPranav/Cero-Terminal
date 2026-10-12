/**
 * encodingUtils.ts — Isomorphic Base64 and String Utilities
 * 
 * Works identically in Node.js (Buffer) and Browser/WebKit (btoa/atob).
 */

export function safeBase64Encode(text: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(text, 'utf-8').toString('base64');
  }
  if (typeof btoa !== 'undefined') {
    return btoa(unescape(encodeURIComponent(text)));
  }
  return '';
}

export function safeBase64Decode(base64: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(base64, 'base64').toString('utf-8');
  }
  if (typeof atob !== 'undefined') {
    return decodeURIComponent(escape(atob(base64)));
  }
  return '';
}

export function safeGetHomeDir(): string {
  if (typeof process !== 'undefined' && process && process.env) {
    return process.env.HOME || process.env.USERPROFILE || '/tmp';
  }
  return '/tmp';
}

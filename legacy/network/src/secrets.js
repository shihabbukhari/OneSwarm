import { httpError } from './util.js';

export const SECRET_REFUSAL =
  'This text looks like a password, key, token, or other secret. Remove it and describe the problem instead. OneSwarm will not store it.';

// Words that show up in ordinary sentences ("the password is required"), not credentials.
const ORDINARY = new Set([
  'accepted',
  'changeme',
  'disabled',
  'empty',
  'enabled',
  'example',
  'expired',
  'false',
  'hashed',
  'hidden',
  'ignored',
  'incorrect',
  'invalid',
  'missing',
  'none',
  'null',
  'omitted',
  'optional',
  'password',
  'placeholder',
  'redacted',
  'rejected',
  'removed',
  'required',
  'secret',
  'stored',
  'stripped',
  'token',
  'true',
  'unavailable',
  'undefined',
  'unknown',
  'withheld',
  'wrong',
]);

// A label, then something that points at a value ("is", "=", ":", "->", "=>"), then the value.
// Labels may be split ("pass word", "api key"). This is a safety net, not a guarantee:
// agents are also told never to post secrets.
const LABELED =
  /(?:^|[^A-Za-z0-9])(?:pass[\s_-]?word|passwd|pwd|pass[\s_-]?phrase|passcode|secret|credentials?|api[\s_-]?key|access[\s_-]?key|secret[\s_-]?key|auth[\s_-]?token|access[\s_-]?token|refresh[\s_-]?token|private[\s_-]?key|client[\s_-]?secret|database[\s_-]?url)\s*(?:\bis\b|=>|->|=|:)\s*['"`]?([^\s'"`]{6,})/gi;

function ordinary(value) {
  const word = value.replace(/[,.;]+$/, '').replace(/^['"`]+|['"`]+$/g, '');
  if (!word || word.length < 6) return true;
  if (/^(?:x{3,}|[*•.]+|<[^>]{1,40}>|\$\{[^}]{1,40}\})$/i.test(word)) return true;
  if (/^[a-z]+$/i.test(word) && ORDINARY.has(word.toLowerCase())) return true;
  return false;
}

// Returns a short category, never the secret itself.
export function findSecret(text) {
  const value = String(text || '');
  if (!value.trim()) return null;
  if (/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----/.test(value)) return 'private key';
  if (/\bos_live_[A-Za-z0-9_-]{16,}/.test(value)) return 'agent key';
  if (/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/.test(value)) return 'token';
  if (/\bgithub_pat_[A-Za-z0-9_]{20,}/.test(value)) return 'token';
  if (/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}/.test(value)) return 'api key';
  if (/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/.test(value)) return 'api key';
  if (/\bxox[baprs]-[A-Za-z0-9-]{10,}/.test(value)) return 'token';
  if (/\bAKIA[0-9A-Z]{16}\b/.test(value)) return 'access key';
  if (/\bAIza[0-9A-Za-z_-]{30,}/.test(value)) return 'api key';
  if (/\bglpat-[A-Za-z0-9_-]{16,}/.test(value)) return 'token';
  if (/\bnpm_[A-Za-z0-9]{30,}/.test(value)) return 'token';
  if (/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{8,}/.test(value)) return 'token';
  if (/\bbearer\s+[A-Za-z0-9._~+/-]{20,}/i.test(value)) return 'token';
  if (/[a-z][a-z0-9+.-]*:\/\/[^\s/@:]{1,80}:[^\s/@]{4,}@/i.test(value)) return 'connection string';
  LABELED.lastIndex = 0;
  let match;
  while ((match = LABELED.exec(value))) {
    if (!ordinary(match[1])) return 'secret';
  }
  return null;
}

export function assertNoSecrets(...parts) {
  for (const part of parts) {
    if (findSecret(part)) throw httpError(400, SECRET_REFUSAL);
  }
}

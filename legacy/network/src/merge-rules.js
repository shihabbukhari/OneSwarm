import { DEFAULT_PROTECTED } from './constants.js';

export function globMatch(pattern, file) {
  if (pattern.includes('**')) {
    const star = pattern.indexOf('**');
    const head = pattern.slice(0, star).replace(/\/$/, '');
    const tail = pattern.slice(star + 2);
    if (tail && tail !== '/' && tail !== '/**') return false;
    return file.startsWith(`${head}/`);
  }
  if (pattern.includes('*')) {
    const parts = pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`^${parts.join('[^/]*')}$`).test(file);
  }
  return pattern === file;
}

export function isProtected(file, patterns = DEFAULT_PROTECTED) {
  return patterns.some((pattern) => globMatch(pattern, file));
}

export function safeRelativePath(file) {
  if (typeof file !== 'string' || file.length === 0 || file.length > 240) return false;
  if (file.startsWith('/') || file.includes('\\') || file.includes('\0')) return false;
  const parts = file.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) return false;
  return true;
}

export function reviewDiff({ files, protectedPatterns, allowedPaths }) {
  const allowed = new Set(allowedPaths);
  const protectedHits = [];
  const disallowed = [];
  const names = [];
  for (const file of files || []) {
    const candidates = [file.filename, file.previous_filename].filter(Boolean);
    for (const name of candidates) {
      names.push(name);
      if (!safeRelativePath(name) || isProtected(name, protectedPatterns)) {
        protectedHits.push(name);
      } else if (!allowed.has(name)) {
        disallowed.push(name);
      }
    }
  }
  if (protectedHits.length) {
    return {
      ok: false,
      code: 'protected',
      reason: `This pull request edits protected files: ${[...new Set(protectedHits)].slice(0, 8).join(', ')}`,
    };
  }
  if (disallowed.length) {
    return {
      ok: false,
      code: 'paths',
      reason: `This pull request edits files outside the piece: ${[...new Set(disallowed)].slice(0, 8).join(', ')}`,
    };
  }
  const changedAllowed = (files || []).some((file) => allowed.has(file.filename));
  if (!changedAllowed) {
    return { ok: false, code: 'empty', reason: 'The pull request does not change the piece file.' };
  }
  return { ok: true, code: 'ok', reason: '' };
}

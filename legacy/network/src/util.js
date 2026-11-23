import crypto from 'node:crypto';

export function id() {
  return crypto.randomBytes(16).toString('hex');
}

export function randomHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.expose = true;
  return error;
}

export function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function readCookie(header, name) {
  if (!header) return '';
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === name) return decodeURIComponent(trimmed.slice(eq + 1));
  }
  return '';
}

export function signWebhook(secret, rawBody) {
  return `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
}

export function verifyWebhook(secret, rawBody, header) {
  if (!secret || !header) return false;
  const expected = signWebhook(secret, rawBody);
  return safeEqual(expected, String(header));
}

export function isUniqueError(error) {
  if (!error) return false;
  if (error.code === 'ER_DUP_ENTRY' || error.errno === 1062 || error.code === '23505') return true;
  return /UNIQUE constraint failed/i.test(error.message || '');
}

export function clampText(value, max) {
  const text = String(value ?? '');
  return text.length > max ? text.slice(0, max) : text;
}

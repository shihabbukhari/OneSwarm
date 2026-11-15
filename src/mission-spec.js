import yaml from 'js-yaml';
import { DEFAULT_PROTECTED, LICENSES } from './constants.js';
import { safeRelativePath } from './merge-rules.js';

const LICENSE_SET = new Set(LICENSES);

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanText(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, max);
}

export function validateMissionYaml(text) {
  const errors = [];
  if (typeof text !== 'string' || !text.trim()) {
    return { ok: false, errors: ['mission.yaml is empty.'] };
  }
  if (text.length > 100_000) {
    return { ok: false, errors: ['mission.yaml is too large.'] };
  }
  let doc;
  try {
    doc = yaml.load(text, { schema: yaml.JSON_SCHEMA });
  } catch {
    return { ok: false, errors: ['mission.yaml is not valid YAML.'] };
  }
  if (!isObject(doc)) return { ok: false, errors: ['mission.yaml must be a mapping.'] };
  if (doc.version !== 1) errors.push('version must be 1.');

  const title = cleanText(doc.title, 140);
  const goal = cleanText(doc.goal, 5000);
  const summary = cleanText(doc.summary, 240) || goal.slice(0, 180);
  const license = cleanText(doc.license, 40);
  const kind = cleanText(doc.kind, 16);
  if (!title) errors.push('title is required.');
  if (!goal) errors.push('goal is required.');
  if (!LICENSE_SET.has(license)) errors.push(`license must be one of: ${LICENSES.join(', ')}.`);
  if (kind !== 'team' && kind !== 'challenge') errors.push('kind must be team or challenge.');

  const checker = isObject(doc.checker) ? doc.checker : {};
  const workflow = cleanText(checker.workflow, 80);
  const checkerName = cleanText(checker.name, 80);
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(workflow)) {
    errors.push('checker.workflow must be a file name like check.yml.');
  }
  if (!checkerName) errors.push('checker.name is required.');

  const extraProtected = Array.isArray(doc.protected) ? doc.protected : [];
  const protectedPatterns = [...DEFAULT_PROTECTED];
  for (const pattern of extraProtected) {
    if (typeof pattern !== 'string' || pattern.length > 180 || pattern.includes('..') || pattern.startsWith('/')) {
      errors.push('protected entries must be relative globs.');
    } else if (!protectedPatterns.includes(pattern)) {
      protectedPatterns.push(pattern);
    }
  }

  const pieces = [];
  const seenPaths = new Set();
  const seenIds = new Set();
  if (kind === 'team') {
    if (!Array.isArray(doc.pieces) || doc.pieces.length < 1 || doc.pieces.length > 5000) {
      errors.push('team missions need between 1 and 5000 pieces.');
    } else {
      for (const piece of doc.pieces) {
        if (!isObject(piece)) {
          errors.push('each piece must be a mapping.');
          continue;
        }
        const id = cleanText(piece.id, 40);
        const pieceTitle = cleanText(piece.title, 140);
        const description = cleanText(piece.description, 1500);
        if (!/^[a-z][a-z0-9-]{1,40}$/.test(id)) errors.push(`piece id "${id || '?'}" is invalid.`);
        if (seenIds.has(id)) errors.push(`duplicate piece id ${id}.`);
        seenIds.add(id);
        if (!pieceTitle) errors.push(`piece ${id || '?'} needs a title.`);
        const paths = Array.isArray(piece.paths) ? piece.paths : [];
        if (paths.length < 1 || paths.length > 10) errors.push(`piece ${id || '?'} needs 1 to 10 paths.`);
        const cleanPaths = [];
        for (const file of paths) {
          if (!safeRelativePath(file)) {
            errors.push(`piece ${id || '?'} has an unsafe path.`);
            continue;
          }
          if (seenPaths.has(file)) errors.push(`path ${file} is used by more than one piece.`);
          seenPaths.add(file);
          cleanPaths.push(file);
        }
        pieces.push({ id, title: pieceTitle, description, paths: cleanPaths });
      }
    }
  }

  let deadline = '';
  let scoreOrder = 'higher';
  let problem = '';
  if (kind === 'challenge') {
    problem = cleanText(doc.problem, 5000);
    deadline = cleanText(doc.deadline, 40);
    scoreOrder = cleanText(doc.score_order, 8) || 'higher';
    if (!problem) errors.push('challenge missions need a problem.');
    if (!deadline || !Number.isFinite(Date.parse(deadline))) errors.push('challenge missions need an ISO deadline.');
    else deadline = new Date(deadline).toISOString();
    if (scoreOrder !== 'higher' && scoreOrder !== 'lower') errors.push('score_order must be higher or lower.');
  }

  return {
    ok: errors.length === 0,
    errors,
    spec: {
      version: 1,
      title,
      summary,
      goal,
      license,
      kind,
      checker: { workflow, name: checkerName },
      protected: protectedPatterns,
      pieces,
      problem,
      deadline,
      score_order: scoreOrder,
    },
  };
}

export function parseRepoUrl(value) {
  const match = String(value || '').trim().match(
    /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/,
  );
  if (!match) return null;
  return { owner: match[1].toLowerCase(), repo: match[2].toLowerCase() };
}

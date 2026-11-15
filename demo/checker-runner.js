import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DEFAULT_PROTECTED } from '../src/constants.js';
import { isProtected } from '../src/merge-rules.js';

export function runChecker({ tree, overlay, pieceKey, protectedPatterns = DEFAULT_PROTECTED }) {
  return (async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'oneswarm-check-'));
    try {
      for (const [file, content] of Object.entries(tree)) {
        const full = path.join(dir, file);
        await mkdir(path.dirname(full), { recursive: true });
        await writeFile(full, content);
      }
      for (const file of overlay) {
        if (isProtected(file.filename, protectedPatterns)) continue;
        const full = path.join(dir, file.filename);
        await mkdir(path.dirname(full), { recursive: true });
        await writeFile(full, file.content);
      }
      const result = await new Promise((resolve) => {
        const env = { ...process.env };
        for (const key of Object.keys(env)) {
          if (key === 'NODE_CHANNEL_FD' || key.startsWith('NODE_TEST')) delete env[key];
        }
        const child = spawn(process.execPath, ['checker/check.js', '--piece', pieceKey], { cwd: dir, env });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
          stdout += chunk;
        });
        child.stderr.on('data', (chunk) => {
          stderr += chunk;
        });
        child.on('close', (code) => {
          resolve({ ok: code === 0, log: `${stdout}\n${stderr}`.slice(-2000) });
        });
      });
      return result;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  })();
}

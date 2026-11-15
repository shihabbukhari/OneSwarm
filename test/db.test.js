import assert from 'node:assert/strict';
import test from 'node:test';
import { migrate, openDatabase, toPostgres } from '../src/db.js';

test('a second start skips the migration when the schema version matches', async () => {
  const db = await openDatabase(process.env.TEST_DATABASE_URL || 'sqlite::memory:');
  try {
    assert.equal((await migrate(db)).skipped, false);
    assert.equal((await migrate(db)).skipped, true);
    const tables = await db.get('SELECT COUNT(*) AS n FROM agents');
    assert.equal(Number(tables.n), 0);
  } finally {
    await db.close();
  }
});

test('placeholders become $n for Postgres, and quoted text is left alone', () => {
  assert.equal(
    toPostgres("SELECT * FROM t WHERE a = ? AND b LIKE ? ESCAPE '!' AND c = '?' AND d IN (?, ?)"),
    "SELECT * FROM t WHERE a = $1 AND b LIKE $2 ESCAPE '!' AND c = '?' AND d IN ($3, $4)",
  );
});
